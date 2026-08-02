import { ARENA, groundHeightAt, nearestSpawn, obstacleAt, resolveCircle } from '../arena';
import type { GameConfig } from '../config';
import { angleDiff, angleLerp, clamp, dist, dist2, lerp, pointInBox, wrapAngle } from '../math';
import { stepTankKinematics, type TankKinematicState } from './tankKinematics';
import type { ContentPack } from '../content/contentPack';
import { GameplayEventBus } from '../core/gameplayEventBus';
import type { DamageSource, EntityKilledEvent } from '../damage/damageTypes';
import { MatchRules } from '../rules/matchRules';
export { enemyRadius } from './enemyRadius';
import { enemyRadius } from './enemyRadius';
import { createLegacyDemoModeDefinition } from '../rules/legacyDemoRules';
import {
  DemoScoreAttackModeDefinition,
  DemoScoreAttackModeRuntime,
} from '../modes/demoScoreAttack';
import { createSystemContext, type SystemContext } from './systems/systemContext';
import { LoadoutRuntime } from '../weapons/loadoutRuntime';
import { WeaponSystem } from '../weapons/weaponSystem';
import type {
  BarrelState,
  DriverInput,
  EnemyState,
  EnemyType,
  GunnerInput,
  MatchConfig,
  MatchResults,
  MatchState,
  ModifierId,
  PickupState,
  Role,
  ScrapKind,
  ShellState,
  SimEvent,
  TruckState,
} from '../types';

let globalEnemyId = 1;

function nextEnemyId() {
  return globalEnemyId++;
}

function makeBarrels(): BarrelState[] {
  return ARENA.barrels.map((b) => ({ id: b.id, x: b.x, z: b.z, exploded: false, fuseT: 0, flash: 0, hp: 0 }));
}

function initialTank(rules: MatchRules): MatchState['tank'] {
  const spawn = ARENA.spawnPoints[0];
  return {
    x: spawn.x,
    y: groundHeightAt(spawn.x, spawn.z),
    z: spawn.z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    yawVel: 0,
    pitch: 0,
    roll: 0,
    integrity: rules.config.tank.maxIntegrity,
    brace: false,
    boosting: false,
    shieldedT: rules.config.tank.shieldTime,
    deadT: 0,
    grounded: true,
    drift: false,
  };
}

function initialState(matchId: string, rules: MatchRules): MatchState {
  return {
    matchId,
    time: 0,
    duration: rules.duration,
    phase: 'running',
    tank: initialTank(rules),
    turret: {
      yaw: Math.PI / 2,
      pitch: 0.05,
      chargeT: 0,
      cannonCooldown: 0,
      cannonFlash: 0,
      mgCooldown: 0,
      mgFiring: false,
      jackpotReady: false,
      jackpotCooldown: 0,
    },
    combo: { multiplier: 1, points: 0, lastDriverT: -99, lastGunnerT: -99, lastAnyT: -99, best: 1 },
    stats: {
      score: 0,
      jackpotMeter: 0,
      jackpotFired: 0,
      kills: 0,
      scrapCollected: 0,
      links: 0,
      ramKills: 0,
      dodgeCount: 0,
      wipeouts: 0,
      bestCombo: 1,
      anyContribution: false,
    },
    enemies: [],
    pickups: [],
    shells: [],
    barrels: makeBarrels(),
    truck: { active: false, x: 0, y: 0, z: 0, yaw: 0, hp: rules.config.enemies.truckHp, waypoint: 0, escaped: false, sirenT: 0 },
    respawnT: 0,
    countdown: 0,
    modifier: rules.modifier,
    nextEnemyId: 1,
    nextPickupId: 1,
    nextShellId: 1,
  };
}

export class MatchRuntime {
  state: MatchState;
  readonly rules: MatchRules;
  events: SimEvent[] = [];
  results: MatchResults | null = null;
  readonly systems: SystemContext;
  readonly mode: DemoScoreAttackModeRuntime;
  readonly eventBus: GameplayEventBus;
  readonly loadout: LoadoutRuntime;
  readonly weaponSystem: WeaponSystem;
  private modeDefinition: DemoScoreAttackModeDefinition | null = null;

  /** Legacy projections of the resolved match rules (frozen, per-match). */
  get cfg(): GameConfig {
    return this.rules.config;
  }

  get mcfg(): MatchConfig {
    return this.rules.matchConfig;
  }

  private driverInput: DriverInput = { throttle: 0, steer: 0, boost: false, brace: false };
  private gunnerInput: GunnerInput = { aimYaw: Math.PI / 2, aimPitch: 0.05, mg: false, cannon: false, charge: false };
  constructor(
    matchId: string,
    modifier: ModifierId = 'none',
    rules?: MatchRules,
    definition?: DemoScoreAttackModeDefinition,
  ) {
    this.rules = rules ?? MatchRules.fromLegacyConfig(modifier);
    this.state = initialState(matchId, this.rules);
    this.eventBus = new GameplayEventBus();
    this.systems = createSystemContext(this.state, this.rules, this.events, this.eventBus);
    this.modeDefinition = definition ?? null;
    this.mode = new DemoScoreAttackModeRuntime(this.modeDefinition ?? this.legacyModeDefinition(), this.systems);
    this.loadout = new LoadoutRuntime(this.rules.weapons, this.rules.loadout);
    this.weaponSystem = new WeaponSystem(this.systems, this.loadout);
    this.eventBus.subscribe('entity.killed', (payload) => this.onEntityKilled(payload as EntityKilledEvent));
    // First two Scrap Bugs are placed directly ahead so the first kill lands
    // within seconds.
    this.systems.enemies.spawnEnemy('scrapBug', -7, 6);
    this.systems.enemies.spawnEnemy('scrapBug', 8, -4);
  }

  /** Authoritative path: rules resolved from the validated content pack. */
  static fromContentPack(pack: ContentPack, matchId: string, modifier: ModifierId = 'none'): MatchRuntime {
    const definition = new DemoScoreAttackModeDefinition(pack.getMode(pack.modeId), pack);
    return new MatchRuntime(matchId, modifier, MatchRules.fromContentPack(pack, modifier), definition);
  }

  /** Client-safe path: rules resolved from legacy constants (same values). */
  static fromLegacy(matchId: string, modifier: ModifierId = 'none'): MatchRuntime {
    return new MatchRuntime(matchId, modifier, MatchRules.fromLegacyConfig(modifier));
  }

  private legacyModeDefinition(): DemoScoreAttackModeDefinition {
    if (!this.modeDefinition) {
      this.modeDefinition = new DemoScoreAttackModeDefinition(createLegacyDemoModeDefinition());
    }
    return this.modeDefinition;
  }

  takeEvents(): SimEvent[] {
    if (this.events.length === 0) return [];
    const out = [...this.events];
    this.events.length = 0;
    return out;
  }

  setDriverInput(input: DriverInput) {
    this.driverInput = input;
  }

  setGunnerInput(input: GunnerInput) {
    this.gunnerInput = input;
  }

  getDriverInput(): DriverInput {
    return { ...this.driverInput };
  }

  getGunnerInput(): GunnerInput {
    return { ...this.gunnerInput };
  }

  clearInputs() {
    this.driverInput = { throttle: 0, steer: 0, boost: false, brace: false };
    this.gunnerInput = { aimYaw: this.gunnerInput.aimYaw, aimPitch: this.gunnerInput.aimPitch, mg: false, cannon: false, charge: false };
    this.weaponSystem.clearActions();
  }

  clearDriverInput() {
    this.driverInput = { throttle: 0, steer: 0, boost: false, brace: false };
  }

  clearGunnerInput() {
    this.gunnerInput = { aimYaw: this.gunnerInput.aimYaw, aimPitch: this.gunnerInput.aimPitch, mg: false, cannon: false, charge: false };
    this.weaponSystem.clearActions();
  }

  step(dtRaw: number) {
    if (this.state.phase !== 'running' && this.state.phase !== 'countdown') return;
    const dt = this.systems.round.advance(dtRaw);
    if (dt === 0) return;
    const s = this.state;
    this.stepTank(dt);
    this.weaponSystem.update(dt, this.gunnerInput);
    this.systems.enemies.update(dt);
    this.systems.projectiles.update(dt);
    this.systems.pickups.update(dt);
    this.systems.spawnDirector.step(dt);
    this.mode.stepAssistance();
    this.mode.stepCombo(dt);
    this.stepBarrels(dt);
    this.results = this.mode.checkCompletion() ?? this.results;
  }

  // ---------------------------------------------------------------- tank
  private stepTank(dt: number) {
    const s = this.state;
    const t = s.tank;
    const tankCfg = this.cfg.tank;
    if (t.deadT > 0) {
      t.deadT -= dt;
      if (t.deadT <= 0) {
        this.respawn();
      }
      return;
    }
    if (t.shieldedT > 0) t.shieldedT -= dt;
    const speed = Math.hypot(t.vx, t.vz);
    const hits = stepTankKinematics(t as unknown as TankKinematicState, this.driverInput, this.cfg, this.mcfg, dt, {
      onRampLaunch: () => this.push('assist', t.x, t.y, t.z, { label: 'LAUNCHED' }),
      onHardFall: () => {
        this.damageTank(tankCfg.fallDamage, 'fall');
        this.push('crash', t.x, t.y, t.z, { value: tankCfg.fallDamage });
      },
    });
    // Hard obstacle crash damage (crusher/factory/wall) at speed.
    if (speed > 10 && hits.length > 0) {
      const hardHit = hits.some((hit) => {
        const ob = hit.obstacleId ? ARENA.obstacles.find((o) => o.id === hit.obstacleId) : undefined;
        return !!ob && (ob.type === 'crusher' || ob.type === 'factory' || ob.type === 'wall');
      });
      if (hardHit) {
        this.damageTank(4, 'crash');
        this.push('crash', t.x, t.y, t.z, { value: 4 });
      }
    }
  }

  private respawn() {
    const t = this.state.tank;
    const spawn = nearestSpawn(t.x, t.z);
    t.x = spawn.x;
    t.y = groundHeightAt(spawn.x, spawn.z);
    t.z = spawn.z;
    t.vx = 0;
    t.vy = 0;
    t.vz = 0;
    t.yawVel = 0;
    t.roll = 0;
    t.deadT = 0;
    t.shieldedT = this.cfg.tank.shieldTime;
    t.integrity = this.cfg.tank.maxIntegrity;
    // Face nearest threat.
    let best: EnemyState | null = null;
    let bestD = Infinity;
    for (const e of this.state.enemies) {
      if (!e.alive) continue;
      const d = dist2(t.x, t.z, e.x, e.z);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (best) t.yaw = Math.atan2(best.x - t.x, best.z - t.z);
    this.push('respawn', t.x, t.y, t.z);
  }

  damageTank(amount: number, source: string) {
    this.systems.damage.applyTank(amount, source as DamageSource);
  }

  // -------------------------------------------------------------- enemies
  spawnEnemy(type: EnemyType, x?: number, z?: number): EnemyState | null {
    return this.systems.enemies.spawnEnemy(type, x, z);
  }

  // -------------------------------------------------------------- barrels
  private damageBarrel(b: BarrelState, dmg: number) {
    this.systems.damage.applyBarrel(b, dmg);
  }

  private stepBarrels(dt: number) {
    const s = this.state;
    const w = this.cfg.weapons;
    for (const b of s.barrels) {
      if (b.exploded && b.fuseT > 0) {
        b.fuseT -= dt;
        if (b.fuseT <= 0) {
          this.explodeBarrel(b);
        }
      }
      b.flash = Math.max(0, b.flash - dt);
    }
  }

  private explodeBarrel(b: BarrelState) {
    const s = this.state;
    const w = this.cfg.weapons;
    const radius = this.mcfg.barrelRadius;
    const dmg = 26;
    b.flash = 0.3;
    this.push('barrelExplode', b.x, 0.8, b.z, { value: radius });
    this.addContribution('gunner', 3, 0);
    for (const e of s.enemies) {
      if (!e.alive) continue;
      const d = dist(b.x, b.z, e.x, e.z);
      if (d < radius + enemyRadius(e.type, this.cfg)) {
        this.systems.damage.applyEnemy(e, dmg, 'barrel');
      }
    }
    const tankD = dist(b.x, b.z, s.tank.x, s.tank.z);
    if (tankD < radius + 1.6) {
      this.systems.damage.applyTank(10, 'barrel');
    }
    // Chain reaction.
    for (const other of s.barrels) {
      if (other.exploded || other === b) continue;
      if (dist(b.x, b.z, other.x, other.z) < w.barrelChainRadius) {
        this.systems.damage.applyBarrel(other, 999);
        this.push('chainExplode', other.x, 0.8, other.z, { id: other.id });
      }
    }
  }

  // --------------------------------------------------------------- damage
  damageEnemy(e: EnemyState, dmg: number, source: string) {
    this.systems.damage.applyEnemy(e, dmg, source as DamageSource);
  }

  /** Scoring/drops react to the entity.killed bus event (legacy kill flow). */
  private onEntityKilled(payload: EntityKilledEvent) {
    const e = this.state.enemies.find((candidate) => candidate.id === payload.enemy.id);
    if (!e) return;
    const source = payload.source;
    const s = this.state;
    e.alive = false;
    e.state = 'dead';
    e.stateT = 0;
    if (e.type === 'lootTruck') {
      s.truck.active = false;
    }
    const sc = this.cfg.scoring;
    const j = this.cfg.jackpot;
    s.stats.kills++;
    const chaosMult = s.time > j.finalChaosStart ? j.finalChaosMult : 1;
    let score = 0;
    let jackpot = 0;
    let scrap: ScrapKind | null = null;
    let contributionRole: Role = 'gunner';
    let contributionPoints = 2;
    if (e.type === 'scrapBug') {
      score = sc.bugScore;
      jackpot = j.bugGain;
      scrap = 'normal';
    } else if (e.type === 'rammer') {
      score = sc.rammerScore;
      jackpot = j.rammerGain;
      scrap = 'heavy';
      if (source === 'ram') s.stats.ramKills++;
    } else if (e.type === 'gunTower') {
      score = sc.towerScore;
      jackpot = j.towerGain;
      scrap = 'heavy';
      contributionPoints = 3;
    } else if (e.type === 'lootTruck') {
      score = sc.truckScore;
      jackpot = j.truckGain;
      contributionPoints = 4;
    }
    this.systems.score.addScore(score, e.type.toUpperCase());
    this.systems.jackpot.addGain(jackpot * chaosMult);
    this.systems.combo.addContribution(contributionRole, contributionPoints);
    // Drops react to the kill through the enemy's validated drop table.
    this.systems.drops.resolveFor(e);
    this.systems.pickups.noteKill(s.time, scrap);
    this.push('kill', e.x, e.y + 1, e.z, { id: e.id, kind: e.type, value: score, label: `+${Math.floor(score * this.state.combo.multiplier)}` });
    if (source === 'ram') {
      this.systems.combo.addDriverContribution(2, j.ramGain, 'RAMPAGE');
    }
  }

  // ------------------------------------------------- score/combo (delegated)
  /** Public legacy API: JACKPOT meter gain (delegates to JackpotSystem). */
  addJackpot(amount: number) {
    this.systems.jackpot.addGain(amount);
  }

  /** Public legacy API: role contribution + combo points (delegates). */
  addContribution(role: Role, points: number, _jackpotExtra?: number) {
    this.systems.combo.addContribution(role, points);
  }

  // ---------------------------------------------------------------- misc
  private push(type: SimEvent['type'], x?: number, y?: number, z?: number, extra?: Partial<SimEvent>) {
    this.events.push({ type, t: this.state.time, x, y, z, ...extra });
  }
}
