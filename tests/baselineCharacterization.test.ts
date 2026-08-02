/**
 * Phase 0 characterization tests. These pin down current behavior so later
 * refactor phases can prove parity. They are deliberately descriptive, not
 * aspirational: they record what the code does today.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AssetService } from '../src/client/assets';
import { DriverPredictor } from '../src/client/predictor';
import { isValidAssetId, REQUIRED_ASSET_IDS } from '../src/shared/assetRegistry';
import { BASE_CONFIG, GAME, buildMatchConfig } from '../src/shared/config';
import { Match, enemyRadius } from '../src/shared/sim/match';
import { RoomManager, type SocketLike } from '../src/server/room';
import type { DriverInput, ModifierId, TankState } from '../src/shared/types';
import { canonicalizeState, stepScriptedMatch, withSeededRandom } from './helpers/demoFixture';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

class FakeSocket implements SocketLike {
  sent: Record<string, unknown>[] = [];
  send(msg: unknown) {
    this.sent.push(msg as Record<string, unknown>);
  }
  close() {}
  last(t: string) {
    return [...this.sent].reverse().find((m) => m.t === t);
  }
}

function makeManager() {
  let now = 1000000;
  const manager = new RoomManager({ now: () => now });
  return {
    manager,
    advance(ms: number) {
      now += ms;
    },
  };
}

function stepSeconds(manager: RoomManager, seconds: number) {
  const ticks = Math.round(seconds * 30);
  for (let i = 0; i < ticks; i++) manager.tick(1 / 30);
}

function startCrew(manager: RoomManager) {
  const a = new FakeSocket();
  const b = new FakeSocket();
  manager.handle(a, { t: 'create' });
  const code = a.last('created')!.code as string;
  manager.handle(b, { t: 'join', code });
  manager.handle(a, { t: 'ready', ready: true });
  manager.handle(b, { t: 'ready', ready: true });
  // Countdown is 3.4 s; stop exactly at the start tick so the fresh match has
  // not been stepped yet (the start tick itself never steps the match).
  stepSeconds(manager, 3.4);
  const room = manager.getClient(a)!.room!;
  if (room.phase === 'countdown') manager.tick(1 / 30);
  expect(room.phase).toBe('running');
  expect(room.match!.state.time).toBe(0);
  return { a, b, code, room };
}

function tankState(over: Partial<TankState> = {}): TankState {
  return {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, yawVel: 0,
    pitch: 0, roll: 0, integrity: 100, brace: false, boosting: false,
    shieldedT: 0, deadT: 0, grounded: true, drift: false,
    ...over,
  };
}

function holdDriver(over: Partial<DriverInput> = {}): DriverInput {
  return { throttle: 0, steer: 0, boost: false, brace: false, ...over };
}

const neutralGunner = { aimYaw: Math.PI / 2, aimPitch: 0.05, mg: false, cannon: false, charge: false };

// ---------------------------------------------------------------- 1. duration
describe('Demo duration source', () => {
  it('match duration comes from GAME.roundDuration (90)', () => {
    expect(GAME.roundDuration).toBe(90);
    expect(new Match('dur').state.duration).toBe(GAME.roundDuration);
  });

  it('no modifier changes the round duration', () => {
    expect(new Match('a', 'doubleBarrel').state.duration).toBe(90);
    expect(new Match('b', 'moonYard').state.duration).toBe(90);
    expect(new Match('c', 'overclocked').state.duration).toBe(90);
  });

  it('the running phase ends and results are produced when time reaches duration', () => {
    const m = new Match('dur2');
    withSeededRandom(7, () => {
      for (let i = 0; i < 30 * 90 + 5; i++) {
        m.step(1 / 30);
        m.takeEvents();
      }
    });
    expect(m.state.phase).toBe('results');
    expect(m.state.time).toBeGreaterThanOrEqual(90);
    expect(m.results).toBeDefined();
  });
});

// ------------------------------------------------------------ 2. weapon input
describe('weapon input fields (wire contract)', () => {
  it('the server reads aimYaw/aimPitch + legacy and generic action fields and ignores unknown gunner fields', () => {
    const { manager } = makeManager();
    const { a, b, room } = startCrew(manager);
    manager.handle(b, {
      t: 'input',
      seq: 1,
      gunner: {
        aimYaw: 1.2,
        aimPitch: 0.3,
        mg: true,
        cannon: false,
        charge: false,
        primary: true,
        secondary: 'cannon',
        weaponId: 'weapon.mainCannon',
        aimX: 99,
      },
    });
    manager.tick(1 / 30);
    expect(room.match!.getGunnerInput()).toEqual({
      aimYaw: 1.2,
      aimPitch: 0.3,
      mg: true,
      cannon: false,
      charge: false,
      primary: true,
    });
    // Unknown fields must not have triggered a weapon.
    expect(room.match!.state.shells.length).toBe(0);
    void a;
  });

  it('sanitization clamps gunner aim pitch and coerces weapon booleans', () => {
    const { manager } = makeManager();
    const { b, room } = startCrew(manager);
    manager.handle(b, {
      t: 'input',
      seq: 1,
      gunner: { aimYaw: 999, aimPitch: 99, mg: 1, cannon: 'yes' as unknown as boolean, charge: null as unknown as boolean },
    });
    manager.tick(1 / 30);
    const input = room.match!.getGunnerInput();
    expect(input.aimPitch).toBe(1.5); // clamped to [-1.5, 1.5]
    expect(input.mg).toBe(true);
    expect(input.cannon).toBe(true);
    expect(input.charge).toBe(false);
  });

  it('driver input fields are exactly throttle/steer/boost/brace and are clamped', () => {
    const { manager } = makeManager();
    const { a, room } = startCrew(manager);
    manager.handle(a, {
      t: 'input',
      seq: 1,
      driver: { throttle: 5, steer: -9, boost: 1, brace: 0, nitro: true },
    });
    manager.tick(1 / 30);
    expect(room.match!.getDriverInput()).toEqual({
      throttle: 1,
      steer: -1,
      boost: true,
      brace: false,
    });
  });

  it('cannon is edge-triggered, mg is held state, and charge drives JACKPOT', () => {
    const { manager } = makeManager();
    const { b, room } = startCrew(manager);
    const match = room.match!;
    // MG hold.
    manager.handle(b, { t: 'input', seq: 1, gunner: { ...neutralGunner, mg: true } });
    manager.tick(1 / 30);
    expect(match.state.turret.mgCooldown).toBeGreaterThan(0);
    // Cannon edge fires exactly one shell.
    manager.handle(b, { t: 'input', seq: 2, gunner: { ...neutralGunner, cannon: true } });
    manager.tick(1 / 30);
    const shells = match.state.shells.length;
    expect(shells).toBeGreaterThan(0);
    manager.tick(1 / 30); // same held cannon state must not double-fire
    expect(match.state.shells.length).toBe(shells);
    // Charge only matters when the meter is ready.
    match.addJackpot(100);
    manager.handle(b, { t: 'input', seq: 3, gunner: { ...neutralGunner, cannon: false, charge: true } });
    for (let i = 0; i < 40; i++) manager.tick(1 / 30);
    expect(match.state.stats.jackpotFired).toBe(1);
  });
});

// ----------------------------------------------------------- 3. enemy mapping
describe('enemy mapping', () => {
  it('enemyRadius maps each type to its configured arena radius', () => {
    expect(enemyRadius('scrapBug', BASE_CONFIG)).toBe(BASE_CONFIG.arena.bugRadius);
    expect(enemyRadius('rammer', BASE_CONFIG)).toBe(BASE_CONFIG.arena.rammerRadius);
    expect(enemyRadius('gunTower', BASE_CONFIG)).toBe(BASE_CONFIG.arena.towerRadius);
    expect(enemyRadius('lootTruck', BASE_CONFIG)).toBe(BASE_CONFIG.arena.truckRadius);
  });

  it('spawnEnemy maps each type to its configured hp, maxHp, and initial state', () => {
    const m = new Match('enemy-map');
    const cases: Array<[string, number, string]> = [
      ['scrapBug', BASE_CONFIG.enemies.bugHp, 'hunt'],
      ['rammer', BASE_CONFIG.enemies.rammerHp, 'approach'],
      ['gunTower', BASE_CONFIG.enemies.towerHp, 'idle'],
      ['lootTruck', BASE_CONFIG.enemies.truckHp, 'hunt'], // 'route' is assigned by stepSpawns
    ];
    for (const [type, hp, state] of cases) {
      const e = m.spawnEnemy(type as 'scrapBug', 20, 20)!;
      expect(e.hp).toBe(hp);
      expect(e.maxHp).toBe(hp);
      expect(e.state).toBe(state);
      expect(e.alive).toBe(true);
    }
  });

  it('killEnemy maps each type to its score, jackpot gain, contribution, and scrap drops', () => {
    const expectations: Array<{
      type: string;
      score: number;
      jackpot: number;
      contribution: number;
      scrapKinds: string[];
    }> = [
      { type: 'scrapBug', score: BASE_CONFIG.scoring.bugScore, jackpot: BASE_CONFIG.jackpot.bugGain, contribution: 2, scrapKinds: ['normal'] },
      { type: 'rammer', score: BASE_CONFIG.scoring.rammerScore, jackpot: BASE_CONFIG.jackpot.rammerGain, contribution: 2, scrapKinds: ['heavy', 'normal'] },
      { type: 'gunTower', score: BASE_CONFIG.scoring.towerScore, jackpot: BASE_CONFIG.jackpot.towerGain, contribution: 3, scrapKinds: ['heavy', 'normal', 'normal'] },
      { type: 'lootTruck', score: BASE_CONFIG.scoring.truckScore, jackpot: BASE_CONFIG.jackpot.truckGain, contribution: 4, scrapKinds: ['jackpot', 'jackpot', 'jackpot', 'jackpot', 'jackpot'] },
    ];
    for (const exp of expectations) {
      const m = new Match(`kill-${exp.type}`);
      const e = m.spawnEnemy(exp.type as 'scrapBug', 20, 20)!;
      m.damageEnemy(e, 999, 'cannon');
      m.step(1 / 30);
      m.takeEvents();
      expect(m.state.stats.score, exp.type).toBe(exp.score);
      expect(m.state.stats.jackpotMeter, exp.type).toBeCloseTo(exp.jackpot, 6);
      expect(m.state.combo.points, exp.type).toBe(exp.contribution);
      const drops = m.state.pickups.filter((p) => !p.collected).map((p) => p.kind).sort();
      expect(drops, exp.type).toEqual([...exp.scrapKinds].sort());
      expect(m.state.stats.kills, exp.type).toBe(1);
    }
  });

  it('ram kills count separately and tower kills drop heavy + two normal scraps', () => {
    const m = new Match('kill-ram');
    const rammer = m.spawnEnemy('rammer', 20, 20)!;
    m.damageEnemy(rammer, 999, 'ram');
    m.step(1 / 30);
    m.takeEvents();
    expect(m.state.stats.ramKills).toBe(1);
  });
});

// ------------------------------------------------------- 4. asset manifest
describe('asset manifest behavior', () => {
  it('the shipped manifest is valid and ships an empty override list', () => {
    const manifest = JSON.parse(readFileSync(path.join(ROOT, 'public/assets/manifest.json'), 'utf8')) as { assets: unknown[] };
    expect(Array.isArray(manifest.assets)).toBe(true);
    expect(manifest.assets).toEqual([]);
  });

  it('the example manifest only references required semantic ids and known categories', () => {
    const example = JSON.parse(readFileSync(path.join(ROOT, 'public/assets/manifest.example.json'), 'utf8')) as {
      assets: Array<{ id: string; category?: string; file?: string }>;
    };
    for (const entry of example.assets) {
      expect(isValidAssetId(entry.id), entry.id).toBe(true);
      expect(['model', 'vfx', 'ui'].includes(entry.category ?? 'model'), entry.category).toBe(true);
      if (entry.category === 'model') expect(typeof entry.file).toBe('string');
    }
    expect(REQUIRED_ASSET_IDS.length).toBeGreaterThanOrEqual(43);
  });

  it('AssetService awaits the manifest, registers model files, and ignores unknown ids', async () => {
    const originalFetch = globalThis.fetch;
    const loadedUrls: string[] = [];
    const fakeGltfLoader = async () => ({
      load(url: string, onLoad: (gltf: { scene: unknown }) => void) {
        loadedUrls.push(url);
        const scene = new THREE.Object3D();
        (scene as unknown as { isFake: boolean }).isFake = true;
        onLoad({ scene });
      },
    });
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({
        assets: [
          { id: 'playerTank.chassis', category: 'model', file: '/assets/models/tank-chassis.glb' },
          { id: 'bogus.id', category: 'model', file: '/assets/models/bogus.glb' },
        ],
      }),
    })) as unknown as typeof fetch;
    try {
      const assets = await AssetService.load({ gltfLoaderFactory: fakeGltfLoader as never });
      expect(assets.manifestLoaded).toBe(true);
      expect(assets.models.getFile('playerTank.chassis')).toBe('/assets/models/tank-chassis.glb');
      expect(loadedUrls).toEqual(['/assets/models/tank-chassis.glb']);
      // The GLB is cached as a prototype and cloned per instance.
      const proto = assets.models.getPrototypeSync('playerTank.chassis')!;
      expect((proto as unknown as { isFake: boolean }).isFake).toBe(true);
      const instance = assets.model('playerTank.chassis');
      expect(instance).toBeInstanceOf(THREE.Object3D);
      expect(instance).not.toBe(assets.model('playerTank.chassis'));
      expect(assets.models.getFile('bogus.id')).toBeNull();
      // All presentation models are preloaded and resolvable as instances.
      expect(assets.model('playerTank.turret')).toBeDefined();
      expect(assets.model('enemy.scrapBug')).toBeDefined();
      // Semantic presentation routing resolves through the catalog.
      expect(assets.vfx('vfx.cannonImpact').count).toBeGreaterThan(0);
      expect(assets.ui('ui.driverTheme').primary).toBe('#35d7e8');
      expect(assets.audio('audio.cannon').kind).toBe('cannon');
      expect(assets.icon('icon.jackpot').color).toBe('#ffe98a');
      expect(assets.cameraImpulse('cameraImpulse.cannon').shake).toBe(0.45);
      expect(() => assets.vfx('vfx.bogus')).toThrow(/unknown vfx/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('a missing manifest leaves generated fallbacks active without throwing', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: false })) as unknown as typeof fetch;
    try {
      const assets = await AssetService.load();
      expect(assets.manifestLoaded).toBe(false);
      expect(assets.models.getFile('audio.cannon')).toBeNull();
      expect(assets.model('playerTank.chassis')).toBeDefined();
      expect(assets.vfx('vfx.jackpot')).toBeDefined();
      expect(assets.ui('ui.gunnerTheme').name).toBe('GUNNER');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ---------------------------------------------- 5. practice/online rule parity
describe('practice/online rule parity', () => {
  it('the server creates the same Match class that Practice runs locally', () => {
    const { manager } = makeManager();
    const { room } = startCrew(manager);
    expect(room.match).toBeInstanceOf(Match);
  });

  it('an online room match and a direct local Match stay in lockstep under identical inputs', () => {
    const { manager } = makeManager();
    const { room } = startCrew(manager);
    expect(room.match!.state.time).toBe(0);
    const roomCanonical = withSeededRandom(77, () => {
      stepSeconds(manager, 10);
      return canonicalizeState(room.match!.state);
    });
    const directCanonical = withSeededRandom(77, () => {
      const m = new Match('online-parity', 'none');
      for (let i = 0; i < 30 * 10; i++) {
        m.step(1 / 30);
        m.takeEvents();
      }
      return canonicalizeState(m.state);
    });
    expect(roomCanonical).toEqual(directCanonical);
  });

  it('two identically scripted local matches produce identical canonical results', () => {
    const a = withSeededRandom(99, () => {
      const m = new Match('parity-a', 'none');
      stepScriptedMatch(m, 30);
      return canonicalizeState(m.state);
    });
    const b = withSeededRandom(99, () => {
      const m = new Match('parity-b', 'none');
      stepScriptedMatch(m, 30);
      return canonicalizeState(m.state);
    });
    expect(a).toEqual(b);
  });
});

// ------------------------------------------------ 6. per-room config isolation
describe('per-room config isolation', () => {
  it('two rooms can rematch into different modifiers without contamination', () => {
    const { manager } = makeManager();
    const crewA = startCrew(manager);
    const crewB = startCrew(manager);
    const roomA = crewA.room;
    const roomB = crewB.room;
    expect(roomA.code).not.toBe(roomB.code);

    // Play both rounds out to results.
    stepSeconds(manager, 91);
    expect(roomA.phase).toBe('results');
    expect(roomB.phase).toBe('results');

    // Rematch A into Double Barrel, B into Moon Yard.
    manager.handle(crewA.a, { t: 'rematch', modifier: 'doubleBarrel' });
    manager.handle(crewA.b, { t: 'rematch', modifier: 'doubleBarrel' });
    manager.handle(crewB.a, { t: 'rematch', modifier: 'moonYard' });
    manager.handle(crewB.b, { t: 'rematch', modifier: 'moonYard' });
    stepSeconds(manager, 3.5);
    expect(roomA.phase).toBe('running');
    expect(roomB.phase).toBe('running');

    const matchA = roomA.match!;
    const matchB = roomB.match!;
    expect(matchA.mcfg.modifier).toBe('doubleBarrel');
    expect(matchB.mcfg.modifier).toBe('moonYard');
    expect(matchA.mcfg.cannonCooldown).toBe(2.4);
    expect(matchB.mcfg.cannonCooldown).toBe(BASE_CONFIG.weapons.cannonCooldown);
    expect(matchB.mcfg.gravity).toBe(6.5);
    expect(matchA.mcfg.gravity).toBe(BASE_CONFIG.tank.gravity);

    // Driver input in room A must not reach room B.
    const zB = matchB.state.tank.z;
    manager.handle(crewA.a, { t: 'input', seq: 1, driver: holdDriver({ throttle: 1 }) });
    stepSeconds(manager, 0.5);
    expect(matchA.state.tank.z).not.toBeCloseTo(0, 1);
    expect(matchB.getDriverInput().throttle).toBe(0);
    expect(Math.abs(matchB.state.tank.z - zB)).toBeLessThan(0.001);
  });

  it('cfg is a per-match immutable projection of the resolved rules (shared reference removed)', () => {
    const a = new Match('iso-a');
    const b = new Match('iso-b', 'soapTracks');
    expect(a.cfg).not.toBe(BASE_CONFIG);
    expect(a.cfg).toEqual(BASE_CONFIG);
    expect(a.cfg).not.toBe(b.cfg);
    expect(Object.isFrozen(a.cfg)).toBe(true);
    expect(Object.isFrozen(a.cfg.tank)).toBe(true);
    // mcfg is per-match and already isolated.
    expect(a.mcfg).not.toBe(b.mcfg);
    expect(a.mcfg.grip).toBe(BASE_CONFIG.tank.normalGrip);
    expect(b.mcfg.grip).toBe(0.35);
  });
});

// ------------------------------------------ 7. Driver predictor config source
describe('Driver predictor config source', () => {
  it('the predictor runs on the shared BASE_CONFIG tank stats', () => {
    const p = new DriverPredictor(BASE_CONFIG, 'none');
    p.resetFromAuthority(tankState());
    for (let i = 0; i < 30; i++) {
      p.sampleInput({ throttle: 1, steer: 0, boost: false, brace: false }, 1 / 30);
    }
    const speed = Math.hypot(p.predicted.vx, p.predicted.vz);
    expect(speed).toBeGreaterThan(13.5);
    expect(speed).toBeLessThanOrEqual(BASE_CONFIG.tank.forwardSpeed * 1.01);
  });

  it('the predictor modifier is resolved through buildMatchConfig and changes gravity', () => {
    const fallAfter = (modifier: ModifierId) => {
      const p = new DriverPredictor(BASE_CONFIG, modifier);
      p.resetFromAuthority(tankState({ y: 10, grounded: false, vy: 0 }));
      for (let i = 0; i < 30; i++) {
        p.sampleInput({ throttle: 0, steer: 0, boost: false, brace: false }, 1 / 30);
      }
      return p.predicted.y;
    };
    const moonY = fallAfter('moonYard');
    const normalY = fallAfter('none');
    expect(moonY).toBeGreaterThan(normalY + 1);
    const p = new DriverPredictor(BASE_CONFIG, 'moonYard');
    expect((p as unknown as { mcfg: ReturnType<typeof buildMatchConfig> }).mcfg).toEqual(buildMatchConfig('moonYard'));
  });

  it('the predictor is wired from BASE_CONFIG and the snapshot movement block', () => {
    const controller = readFileSync(path.join(ROOT, 'src/client/app/predictionController.ts'), 'utf8');
    expect(controller).toContain('new DriverPredictor(BASE_CONFIG, modifier');
    const presenter = readFileSync(path.join(ROOT, 'src/client/app/networkStatePresenter.ts'), 'utf8');
    expect(presenter).toContain('applyMovementRules(msg.movement, msg.movementRulesRevision, msg.state.modifier)');
  });
});
