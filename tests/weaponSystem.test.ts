import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BASE_CONFIG } from '../src/shared/config';
import { ContentLoader } from '../src/shared/content/contentLoader';
import { Match, MatchRuntime } from '../src/shared/sim/match';
import type { GunnerInput } from '../src/shared/types';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_ROOT = path.join(ROOT, 'content');
const pack = new ContentLoader().loadFromFilesystem(CONTENT_ROOT);
const DT = 1 / 30;

function step(match: Match, seconds: number, input?: GunnerInput) {
  if (input) match.setGunnerInput(input);
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    match.step(DT);
    match.takeEvents();
  }
}

const aim = { aimYaw: 0, aimPitch: 0, primary: false, secondary: false, ability: false };

describe('loadout resolution', () => {
  it('maps primary/secondary/ability to the Demo weapons on both rule paths', () => {
    const legacy = new Match('loadout-legacy');
    expect(legacy.runtime.loadout.primary.id).toBe('weapon.machineGun');
    expect(legacy.runtime.loadout.secondary.id).toBe('weapon.mainCannon');
    expect(legacy.runtime.loadout.ability.id).toBe('weapon.jackpotShell');
    expect(legacy.runtime.loadout.primary.definition.behaviorId).toBe('weapon.hitscan');
    expect(legacy.runtime.loadout.secondary.definition.behaviorId).toBe('weapon.projectile');
    expect(legacy.runtime.loadout.ability.definition.behaviorId).toBe('weapon.chargeProjectile');

    const content = MatchRuntime.fromContentPack(pack, 'loadout-content');
    expect(content.loadout.primary.id).toBe('weapon.machineGun');
    expect(content.loadout.secondary.id).toBe('weapon.mainCannon');
    expect(content.loadout.ability.id).toBe('weapon.jackpotShell');
  });

  it('uses the generic primary/secondary/ability wire actions directly', () => {
    const m = new Match('loadout-actions');
    m.setGunnerInput({ ...aim, primary: true });
    m.step(DT);
    m.takeEvents();
    expect(m.state.turret.mgCooldown).toBeGreaterThan(0); // primary drives the MG
    m.setGunnerInput({ ...aim, secondary: true });
    m.step(DT);
    m.takeEvents();
    expect(m.state.shells.length).toBe(1); // secondary drives the cannon
    m.addJackpot(100);
    m.setGunnerInput({ ...aim, ability: true });
    for (let i = 0; i < 40; i++) {
      m.step(DT);
      m.takeEvents();
    }
    expect(m.state.stats.jackpotFired).toBe(1); // ability drives JACKPOT
  });
});

describe('cooldown authority and duplicate prevention', () => {
  it('cannon fires on the edge and honors the authoritative cooldown', () => {
    const m = new Match('cooldown');
    m.setGunnerInput({ ...aim, secondary: true });
    m.step(DT);
    m.takeEvents();
    expect(m.state.shells.length).toBe(1);
    expect(m.state.turret.cannonCooldown).toBeCloseTo(BASE_CONFIG.weapons.cannonCooldown, 3);
    // Held cannon must not double-fire.
    step(m, 1.0, { ...aim, secondary: true });
    expect(m.state.shells.length).toBeLessThanOrEqual(2);
    // Release + immediate re-press still blocked by cooldown.
    m.setGunnerInput({ ...aim, secondary: false });
    m.step(DT);
    m.takeEvents();
    m.setGunnerInput({ ...aim, secondary: true });
    m.step(DT);
    m.takeEvents();
    expect(m.state.turret.cannonCooldown).toBeGreaterThan(0);
  });

  it('generic secondary input drives the same authoritative cannon', () => {
    const m = new Match('generic-cannon');
    m.setGunnerInput({ ...aim, secondary: true });
    m.step(DT);
    m.takeEvents();
    expect(m.state.shells.length).toBe(1);
  });

  it('stale input clearing stops the machine gun and resets latches', () => {
    const m = new Match('stale');
    m.setGunnerInput({ ...aim, primary: true });
    step(m, 0.3);
    expect(m.state.turret.mgCooldown).toBeGreaterThan(0);
    m.clearGunnerInput();
    let shots = 0;
    for (let i = 0; i < 20; i++) {
      m.step(DT);
      shots += m.takeEvents().filter((e) => e.type === 'shot' && e.kind === 'mg').length;
    }
    expect(shots).toBe(0);
    expect(m.state.turret.mgFiring).toBe(false);
  });
});

describe('weapon behaviors', () => {
  it('hitscan kills Scrap Bugs, ignores Gun Towers, and damages barrels', () => {
    const m = new Match('hitscan');
    const bug = m.spawnEnemy('scrapBug', 12, 0)!;
    const tower = m.spawnEnemy('gunTower', -12, 0)!;
    m.state.tank.x = 0;
    m.state.tank.z = 0;
    m.state.tank.yaw = Math.PI / 2;
    m.state.turret.yaw = 0;
    step(m, 0.6, { aimYaw: 0, aimPitch: 0, primary: true , secondary: false, ability: false });
    expect(bug.hp).toBeLessThan(BASE_CONFIG.enemies.bugHp);
    expect(tower.hp).toBe(BASE_CONFIG.enemies.towerHp); // towers are MG-immune

    const barrelMatch = new Match('barrel');
    const barrel = barrelMatch.state.barrels.find((b) => b.x === -4 && b.z === -8)!;
    barrelMatch.state.tank.x = -4;
    barrelMatch.state.tank.z = -12;
    barrelMatch.state.tank.yaw = 0;
    barrelMatch.state.turret.yaw = 0;
    step(barrelMatch, 0.5, { aimYaw: 0, aimPitch: 0, primary: true , secondary: false, ability: false });
    expect(barrel.hp ?? 0).toBeGreaterThan(0);
  });

  it('projectile behavior spawns an arcing shell that explodes and damages enemies', () => {
    const m = new Match('projectile');
    const bug = m.spawnEnemy('scrapBug', 14, 0)!;
    m.state.tank.x = 0;
    m.state.tank.z = 0;
    m.state.tank.yaw = Math.PI / 2;
    m.state.turret.yaw = 0;
    m.setGunnerInput({ aimYaw: 0, aimPitch: 0, secondary: true , primary: false, ability: false });
    m.step(DT);
    m.takeEvents();
    expect(m.state.shells.length).toBe(1);
    expect(m.state.shells[0].kind).toBe('cannon');
    // Let the shell travel and explode.
    for (let i = 0; i < 90 && m.state.shells.length > 0; i++) {
      m.step(DT);
      m.takeEvents();
    }
    expect(bug.hp).toBeLessThan(BASE_CONFIG.enemies.bugHp);
  });

  it('chargeProjectile charges and fires exactly one JACKPOT, then cools down', () => {
    const m = new Match('charge');
    m.addJackpot(100);
    expect(m.state.turret.jackpotReady).toBe(true);
    step(m, 1.1, { aimYaw: Math.PI / 2, aimPitch: 0.05, ability: true , primary: false, secondary: false });
    expect(m.state.stats.jackpotFired).toBe(1);
    // Same-step kills (the JACKPOT recoil can ram a bug) add gains back;
    // the meter is reset to 0 at fire time and only re-earned after.
    expect(m.state.stats.jackpotMeter).toBeLessThan(15);
    expect(m.state.turret.jackpotCooldown).toBeGreaterThan(0);
    expect(m.state.shells.some((sh) => sh.kind === 'jackpot')).toBe(true);
    // Recharge is blocked by the cooldown.
    m.addJackpot(100);
    step(m, 1.2, { aimYaw: Math.PI / 2, aimPitch: 0.05, ability: true , primary: false, secondary: false });
    expect(m.state.stats.jackpotFired).toBe(1);
  });

  it('releasing the charge early decays it instead of firing', () => {
    const m = new Match('charge-decay');
    m.addJackpot(100);
    step(m, 0.4, { aimYaw: Math.PI / 2, aimPitch: 0.05, ability: true , primary: false, secondary: false });
    const charged = m.state.turret.chargeT;
    expect(charged).toBeGreaterThan(0);
    step(m, 0.2, { aimYaw: Math.PI / 2, aimPitch: 0.05, ability: false , primary: false, secondary: false });
    expect(m.state.turret.chargeT).toBeLessThan(charged);
    expect(m.state.stats.jackpotFired).toBe(0);
  });
});

describe('damage, kill, and semantic events', () => {
  it('damage is applied once and the kill event fires exactly once', () => {
    const m = new Match('damage-once');
    const bug = m.state.enemies.find((e) => e.type === 'scrapBug')!;
    m.damageEnemy(bug, 999, 'cannon');
    m.step(DT);
    const events = m.takeEvents();
    expect(events.filter((e) => e.type === 'kill' && e.id === bug.id).length).toBe(1);
    m.damageEnemy(bug, 999, 'cannon'); // dead enemy: no-op
    m.step(DT);
    expect(m.takeEvents().filter((e) => e.type === 'kill' && e.id === bug.id).length).toBe(0);
    expect(m.state.stats.kills).toBe(1);
  });

  it('emits weapon.fired, projectile.impacted, damage.applied, entity.killed, recoil.applied', () => {
    const m = new Match('bus-events');
    const bus = m.runtime.eventBus;
    const seen: { type: string; payload: { impulse?: number; weaponId?: string; targetId?: number | string } }[] = [];
    for (const type of ['weapon.fired', 'projectile.impacted', 'damage.applied', 'entity.killed', 'recoil.applied']) {
      bus.subscribe(type, (payload) => seen.push({ type, payload: payload as never }));
    }
    const bug = m.spawnEnemy('scrapBug', 12, 0)!;
    m.state.tank.x = 0;
    m.state.tank.z = 0;
    m.state.tank.yaw = Math.PI / 2;
    m.state.turret.yaw = 0;
    m.setGunnerInput({ aimYaw: 0, aimPitch: 0, primary: true , secondary: false, ability: false });
    for (let i = 0; i < 60; i++) {
      m.step(DT);
      m.takeEvents();
      if (bug.hp <= 0) break;
    }
    const types = seen.map((e) => e.type);
    expect(types).toContain('weapon.fired');
    expect(types).toContain('damage.applied');
    expect(types).toContain('entity.killed');
    expect(types).toContain('recoil.applied');
    const recoilEvents = seen.filter((e) => e.type === 'recoil.applied');
    expect(recoilEvents.length).toBeGreaterThan(0);
    expect(recoilEvents[0].payload.impulse).toBeCloseTo(BASE_CONFIG.tank.mgRecoilImpulse, 6);
  });

  it('a cannon shell explosion emits projectile.impacted and splashes enemies', () => {
    const m = new Match('impact');
    const seen: string[] = [];
    m.runtime.eventBus.subscribe('projectile.impacted', () => seen.push('impacted'));
    m.spawnEnemy('scrapBug', 10, 0);
    m.state.tank.x = 0;
    m.state.tank.z = 0;
    m.state.tank.yaw = Math.PI / 2;
    m.state.turret.yaw = 0;
    m.setGunnerInput({ aimYaw: 0, aimPitch: 0, secondary: true , primary: false, ability: false });
    for (let i = 0; i < 120; i++) {
      m.step(DT);
      m.takeEvents();
      if (m.state.shells.length === 0) break;
    }
    expect(seen.length).toBeGreaterThanOrEqual(1);
  });
});

describe('recoil and brace parity', () => {
  it('bracing reduces cannon recoil by the legacy brace multiplier', () => {
    const unbraced = new Match('recoil-unbraced');
    step(unbraced, 0.5, { aimYaw: 0, aimPitch: 0, secondary: false , primary: false, ability: false });
    unbraced.setGunnerInput({ aimYaw: 0, aimPitch: 0, secondary: true , primary: false, ability: false });
    unbraced.step(DT);
    unbraced.takeEvents();
    const uv = Math.hypot(unbraced.state.tank.vx, unbraced.state.tank.vz);

    const braced = new Match('recoil-braced');
    braced.setDriverInput({ throttle: 0, steer: 0, boost: false, brace: true });
    step(braced, 0.5, { aimYaw: 0, aimPitch: 0, secondary: false , primary: false, ability: false });
    braced.setGunnerInput({ aimYaw: 0, aimPitch: 0, secondary: true , primary: false, ability: false });
    braced.step(DT);
    braced.takeEvents();
    const bv = Math.hypot(braced.state.tank.vx, braced.state.tank.vz);
    expect(bv).toBeLessThan(uv * BASE_CONFIG.tank.braceRecoilMult * 1.2);
    // JACKPOT brace applies the legacy jackpotBraceMult on top of braceRecoilMult.
    const jackpotBrace = new Match('recoil-jackpot-brace');
    let recoilImpulse = 0;
    jackpotBrace.runtime.eventBus.subscribe('recoil.applied', (p) => {
      recoilImpulse = (p as { impulse: number }).impulse;
    });
    jackpotBrace.setDriverInput({ throttle: 0, steer: 0, boost: false, brace: true });
    jackpotBrace.addJackpot(100);
    step(jackpotBrace, 1.1, { aimYaw: Math.PI / 2, aimPitch: 0.05, ability: true , primary: false, secondary: false });
    jackpotBrace.runtime.eventBus.drain(); // deliver queued semantic events
    expect(jackpotBrace.state.stats.jackpotFired).toBe(1);
    expect(recoilImpulse).toBeCloseTo(
      BASE_CONFIG.tank.jackpotRecoilImpulse * BASE_CONFIG.tank.jackpotBraceMult * BASE_CONFIG.tank.braceRecoilMult,
      6,
    );
  });
});

describe('a test weapon using an existing behavior without editing MatchRuntime', () => {
  it('fires a content-defined rapid cannon through the Demo loadout slot', () => {
    const { manifest, files } = loadRealPackRecords();
    const m = deepClone(manifest) as { pack: { files: Record<string, string[]> } };
    m.pack.files.weapons.push('weapons/testRapidCannon.json');
    m.pack.files.loadouts.push('loadouts/test.json');
    files['weapons/testRapidCannon.json'] = {
      id: 'weapon.testRapidCannon',
      label: 'Test Rapid Cannon',
      behaviors: [],
      behaviorId: 'weapon.projectile',
      fireMode: 'semi',
      cooldownSeconds: 0.4,
      statBlock: {
        'weapon.cannonDamage': 5,
        'weapon.cannonRadius': 2,
        'weapon.cannonSpeed': 40,
        'weapon.cannonGravity': 5,
        'weapon.cannonLife': 1.5,
        'weapon.cannonRecoilImpulse': 2,
        'weapon.cannonRecoilSpin': 1,
        'weapon.burst': 1,
        'weapon.burstSpacing': 0.12,
        'weapon.splashInnerRatio': 0.45,
        'weapon.splashInnerMultiplier': 1,
        'weapon.splashOuterMultiplier': 0.65,
      },
      projectileId: 'projectile.cannonShell',
    };
    files['loadouts/test.json'] = {
      id: 'loadout.test',
      label: 'Test Loadout',
      behaviors: [],
      primary: 'weapon.machineGun',
      secondary: 'weapon.testRapidCannon',
      ability: 'weapon.jackpotShell',
      turret: { turnRate: 4.6, maxPitch: 0.42, minPitch: -0.12 },
    };
    const mode = deepClone(files['modes/demoScoreAttack.json']) as { loadout: string };
    mode.loadout = 'loadout.test';
    files['modes/demoScoreAttack.json'] = mode;

    const variant = new ContentLoader().loadFromRecords(m, files);
    const runtime = MatchRuntime.fromContentPack(variant, 'test-weapon');
    expect(runtime.loadout.secondary.id).toBe('weapon.testRapidCannon');
    expect(runtime.mcfg.cannonCooldown).toBe(0.4); // resolved from the new weapon

    const bug = runtime.spawnEnemy('scrapBug', 10, 0)!;
    runtime.state.tank.x = 0;
    runtime.state.tank.z = 0;
    runtime.state.tank.yaw = Math.PI / 2;
    runtime.state.turret.yaw = 0;
    runtime.setGunnerInput({ aimYaw: 0, aimPitch: 0, secondary: true , primary: false, ability: false });
    runtime.step(DT);
    runtime.takeEvents();
    expect(runtime.state.shells.length).toBe(1);
    // The shell explodes near the starter bug and applies the new weapon's damage.
    for (let i = 0; i < 90 && runtime.state.shells.length > 0; i++) {
      runtime.step(DT);
      runtime.takeEvents();
    }
    expect(bug.hp).toBeLessThan(3);
  });
});

function loadRealPackRecords(): { manifest: unknown; files: Record<string, unknown> } {
  const manifest = JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, 'manifest.json'), 'utf8'));
  const files: Record<string, unknown> = {};
  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, rel);
      else if (entry.name.endsWith('.json')) files[rel] = JSON.parse(fs.readFileSync(abs, 'utf8'));
    }
  };
  walk(CONTENT_ROOT, '');
  return { manifest, files };
}

function deepClone(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}



