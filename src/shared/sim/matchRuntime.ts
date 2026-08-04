import { ARENA, groundHeightAt, nearestSpawn, obstacleAt, resolveCircle } from '../arena';
import type { GameConfig } from '../config';
import { createStaticArenaWorld, type ArenaWorld } from './arenaWorld';
import { angleDiff, angleLerp, clamp, dist, dist2, lerp, pointInBox, wrapAngle } from '../math';
import { stepTankKinematics, type TankKinematicState } from './tankKinematics';
import type { ContentPack } from '../content/contentPack';
import { GameplayEventBus } from '../core/gameplayEventBus';
import type { DamageSource, EntityKilledEvent } from '../damage/damageTypes';
import { MatchRules } from '../rules/matchRules';
import { createLegacyDemoModeDefinition } from '../rules/legacyDemoRules';
import {
  DemoScoreAttackModeDefinition,
  DemoScoreAttackModeRuntime,
} from '../modes/demoScoreAttack';
import { createSystemContext, type SystemContext } from './systems/systemContext';
import { resolveHordeDirector, type ResolvedHordeDirector } from '../horde/hordeDirector';
import { LoadoutRuntime } from '../weapons/loadoutRuntime';
import { WeaponSystem } from '../weapons/weaponSystem';
import type { GunnerActionType } from '../net/protocol';
import { createNetcodeOpState, recordOp } from './opLog';
import type { TankImpulseWire } from '../effects/tankImpulseSystem';
import type { StageEvent } from '../stage/stageTypes';
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

function makeBarrels(world: ArenaWorld): BarrelState[] {
  return world.barrels.map((b) => ({ id: b.id, x: b.x, z: b.z, exploded: false, fuseT: 0, flash: 0, hp: 0 }));
}

function initialTank(rules: MatchRules, world: ArenaWorld): MatchState['tank'] {
  const spawn = world.spawnPoints[0];
  return {
    x: spawn.x,
    y: world.groundHeightAt(spawn.x, spawn.z),
    z: spawn.z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    yawVel: 0,
    pitch: 0,
    roll: 0,
    integrity: rules.config.tank.maxIntegrity,
    dashCooldown: 0,
    dashPresentationT: 0,
    dashDamageT: 0,
    shieldedT: rules.config.tank.shieldTime,
    deadT: 0,
    grounded: true,
    drift: false,
    landingGripT: 0,
  };
}

function initialState(matchId: string, rules: MatchRules, world: ArenaWorld): MatchState {
  return {
    matchId,
    time: 0,
    duration: rules.duration,
    phase: 'running',
    tank: initialTank(rules, world),
    turret: {
      yaw: Math.PI / 2,
      pitch: 0.05,
      cannonHeld: false,
      cannonHoldT: 0,
      cannonChargeRatio: 0,
      cannonChargeFull: false,
      cannonCooldown: 0,
      cannonFlash: 0,
      mgCooldown: 0,
      mgFiring: false,
    },
    combo: { multiplier: 1, points: 0, lastDriverT: -99, lastGunnerT: -99, lastAnyT: -99, best: 1 },
    build: { capabilities: [...(rules.mode?.defaultCapabilities ?? [])] },
    matchFlow: 'playing',
    teamProgression: {
      level: 1,
      currentXp: 0,
      xpForNextLevel: 20,
      totalXpCollected: 0,
      pendingLevelUps: 0,
      levelUpOffersCompleted: 0,
      treasureChestsOpened: 0,
      relicStacks: {},
      activeSelection: null,
      lastRelicResult: null,
    },
    chests: [],
    xpShards: [],
    stats: {
      score: 0,
      chargedCannonShots: 0,
      fullChargeShots: 0,
      kills: 0,
      scrapCollected: 0,
      links: 0,
      dashKills: 0,
      dodgeCount: 0,
      wipeouts: 0,
      bestCombo: 1,
      anyContribution: false,
    },
    enemies: [],
    pickups: [],
    shells: [],
    barrels: makeBarrels(world),
    truck: { active: false, x: 0, y: 0, z: 0, yaw: 0, hp: rules.config.enemies.truckHp, waypoint: 0, escaped: false, sirenT: 0 },
    respawnT: 0,
    countdown: 0,
    modifier: rules.modifier,
    nextEnemyId: 1,
    nextPickupId: 1,
    nextShellId: 1,
    nextXpShardId: 1,
    nextChestId: 1,
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
  readonly world: ArenaWorld;
  /** Unified netcode op/ack state (driver seq, gunner seq, impulses). */
  readonly opState = createNetcodeOpState();
  private readonly impulseEvents: TankImpulseWire[] = [];
  private lastGrounded = true;
  /** Authoritative simulation tick (increments per step). */
  simTick = 0;
  private modeDefinition: DemoScoreAttackModeDefinition | null = null;

  /** Legacy projections of the resolved match rules (frozen, per-match). */
  get cfg(): GameConfig {
    return this.rules.config;
  }

  get mcfg(): MatchConfig {
    return this.rules.matchConfig;
  }

  private driverInput: DriverInput = { throttle: 0, steer: 0, dashPressed: false, jumpPressed: false };
  /** Pending one-shot action edges from the newest sequenced Driver frame. */
  private driverEdgesPending: { dash: boolean; jump: boolean } = { dash: false, jump: false };
  private driverEdgesConsumed = true;
  private gunnerInput: GunnerInput = { aimYaw: Math.PI / 2, aimPitch: 0.05, primary: false, secondary: false };
  private gunnerEdgeLatches: { mgStart: boolean; mgStop: boolean; secondaryPressed: boolean; secondaryReleased: boolean } = {
    mgStart: false,
    mgStop: false,
    secondaryPressed: false,
    secondaryReleased: false,
  };
  constructor(
    matchId: string,
    modifier: ModifierId = 'none',
    rules?: MatchRules,
    definition?: DemoScoreAttackModeDefinition,
    world?: ArenaWorld,
    hordeDirector?: ResolvedHordeDirector | null,
  ) {
    this.rules = rules ?? MatchRules.fromLegacyConfig(modifier);
    this.world = world ?? createStaticArenaWorld();
    this.state = initialState(matchId, this.rules, this.world);
    this.eventBus = new GameplayEventBus();
    this.systems = createSystemContext(
      this.state,
      this.rules,
      this.events,
      this.eventBus,
      this.world,
      this.opState,
      this.impulseEvents,
      this.simTick,
      hordeDirector ?? null,
      this.rules.sessionPolicy.kind === 'singlePlayer' ? 'singlePlayer' : 'multiplayer',
    );
    this.modeDefinition = definition ?? null;
    this.mode = new DemoScoreAttackModeRuntime(this.modeDefinition ?? this.legacyModeDefinition(), this.systems);
    this.loadout = new LoadoutRuntime(this.rules.weapons, this.rules.loadout);
    this.weaponSystem = new WeaponSystem(this.systems, this.loadout);
    this.eventBus.subscribe('entity.killed', (payload) => this.onEntityKilled(payload as EntityKilledEvent));
    // Starter enemies come from the spawn director definition (content).
    for (const spawn of this.rules.spawnDirector.initialSpawns) {
      const def = this.rules.enemies.get(spawn.type);
      if (def) this.systems.enemies.spawnEnemyDef(def, spawn.x, spawn.z);
    }
    // Core Loop 06: the stage director tracks progression in every match
    // (telemetry); enforcement is enabled once a mode enables it through
    // the horde director, so the legacy Demo round stays byte-identical.
    this.systems.stage.start();
  }

  /** Authoritative path: rules resolved from the validated content pack. */
  static fromContentPack(pack: ContentPack, matchId: string, modifier: ModifierId = 'none', modeId?: string): MatchRuntime {
    const selectedModeId = modeId ?? pack.modeId;
    const definition = new DemoScoreAttackModeDefinition(pack.getMode(selectedModeId), pack);
    const rules = MatchRules.fromContentPack(pack, modifier, selectedModeId);
    const hordeDirector = rules.hordeDirector ? resolveHordeDirector(pack, rules.hordeDirector) : null;
    return new MatchRuntime(matchId, modifier, rules, definition, undefined, hordeDirector);
  }

  /** Phase 3: authoritative match on a specific arena world. */
  static fromContentPackWithWorld(
    pack: ContentPack,
    matchId: string,
    world: ArenaWorld,
    modifier: ModifierId = 'none',
    modeId?: string,
  ): MatchRuntime {
    const selectedModeId = modeId ?? pack.modeId;
    const definition = new DemoScoreAttackModeDefinition(pack.getMode(selectedModeId), pack);
    const rules = MatchRules.fromContentPack(pack, modifier, selectedModeId);
    const hordeDirector = rules.hordeDirector ? resolveHordeDirector(pack, rules.hordeDirector) : null;
    return new MatchRuntime(matchId, modifier, rules, definition, world, hordeDirector);
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

  /** Drain typed tank impulse wire events (broadcast by the room). */
  takeImpulseEvents(): TankImpulseWire[] {
    if (this.impulseEvents.length === 0) return [];
    const out = [...this.impulseEvents];
    this.impulseEvents.length = 0;
    return out;
  }

  setDriverInput(input: DriverInput, seq?: number) {
    if (this.systems.progression.isEnabled && this.state.matchFlow !== 'playing') return;
    if (seq !== undefined && seq > this.opState.lastDriverInputSeq) {
      this.opState.lastDriverInputSeq = seq;
      recordOp(this.opState, 'd', seq);
    }
    this.driverInput = input;
    if (!this.driverEdgesConsumed) {
      // A new sequenced frame arrived before the previous frame's edges were
      // stepped. Preserve the unconsumed edges so a quick press is never
      // dropped between network frames.
      this.driverEdgesPending = {
        dash: this.driverEdgesPending.dash || input.dashPressed,
        jump: this.driverEdgesPending.jump || input.jumpPressed,
      };
    } else {
      this.driverEdgesPending = { dash: input.dashPressed, jump: input.jumpPressed };
      this.driverEdgesConsumed = false;
    }
  }

  setGunnerInput(input: GunnerInput, seq?: number) {
    if (this.systems.progression.isEnabled && this.state.matchFlow !== 'playing') return;
    if (seq !== undefined && seq > this.opState.lastGunnerInputSeq) {
      this.opState.lastGunnerInputSeq = seq;
    }
    this.gunnerInput = input;
  }

  /**
   * Apply a discrete Gunner action edge immediately (before the next sim
   * step). The weapon system converts the held state into exact firings.
   */
  applyGunnerAction(
    action: GunnerActionType,
    seq?: number,
    aim?: { aimYaw?: number; aimPitch?: number },
  ): { accepted: boolean; reason?: string } {
    if (this.systems.progression.isEnabled && this.state.matchFlow !== 'playing') {
      return { accepted: false, reason: 'paused' };
    }
    const t = this.state.tank;
    const tur = this.state.turret;
    if (t.deadT > 0) return { accepted: false, reason: 'dead' };
    // Click-time aim: apply the action's own aim before processing so a
    // cannon press/release never fires along a stale periodic aim frame.
    const aimYaw = aim?.aimYaw;
    const aimPitch = aim?.aimPitch;
    if (
      typeof aimYaw === 'number' &&
      typeof aimPitch === 'number' &&
      Number.isFinite(aimYaw) &&
      Number.isFinite(aimPitch)
    ) {
      const limits = this.rules.loadout.turret;
      this.gunnerInput.aimYaw = wrapAngle(aimYaw);
      this.gunnerInput.aimPitch = clamp(aimPitch, limits.minPitch, limits.maxPitch);
    }
    switch (action) {
      case 'secondaryPressed':
        if (tur.cannonCooldown > 0) return { accepted: false, reason: 'cooldown' };
        this.gunnerInput.secondary = true;
        this.gunnerEdgeLatches.secondaryPressed = true;
        this.systems.pendingActionSeq = seq;
        return { accepted: true };
      case 'mgStart':
        this.gunnerInput.primary = true;
        this.gunnerEdgeLatches.mgStart = true;
        this.systems.pendingActionSeq = seq;
        return { accepted: true };
      case 'mgStop':
        this.gunnerInput.primary = false;
        this.gunnerEdgeLatches.mgStop = true;
        return { accepted: true };
      case 'secondaryReleased':
        if (!tur.cannonHeld) return { accepted: false, reason: 'not_held' };
        this.gunnerInput.secondary = false;
        this.gunnerEdgeLatches.secondaryReleased = true;
        this.systems.pendingActionSeq = seq;
        return { accepted: true };
    }
  }

  getDriverInput(): DriverInput {
    return { ...this.driverInput };
  }

  getGunnerInput(): GunnerInput {
    return { ...this.gunnerInput };
  }

  clearInputs() {
    this.clearDriverInput();
    this.gunnerInput = { aimYaw: this.gunnerInput.aimYaw, aimPitch: this.gunnerInput.aimPitch, primary: false, secondary: false };
    this.weaponSystem.clearActions();
  }

  clearDriverInput() {
    this.driverInput = { throttle: 0, steer: 0, dashPressed: false, jumpPressed: false };
    this.driverEdgesPending = { dash: false, jump: false };
    this.driverEdgesConsumed = true;
  }

  clearGunnerInput() {
    this.gunnerInput = { aimYaw: this.gunnerInput.aimYaw, aimPitch: this.gunnerInput.aimPitch, primary: false, secondary: false };
    this.gunnerEdgeLatches = { mgStart: false, mgStop: false, secondaryPressed: false, secondaryReleased: false };
    this.weaponSystem.clearActions();
  }

  step(dtRaw: number) {
    if (this.state.phase !== 'running' && this.state.phase !== 'countdown') return;
    // Progression08: authoritative pause during selection — gameplay steps
    // are skipped entirely; the wall-clock selection timeout drives resume.
    if (
      this.systems.progression.isEnabled &&
      (this.state.matchFlow === 'upgradeSelection' || this.state.matchFlow === 'relicSelection')
    ) {
      return;
    }
    const dt = this.systems.round.advance(dtRaw);
    if (dt === 0) return;
    this.simTick++;
    this.systems.simTick = this.simTick;
    const s = this.state;
    this.systems.stage.step({ dt, tankDead: s.tank.deadT > 0 });
    if (this.stageEnforced && (this.systems.stage.state.phase === 'clear' || this.systems.stage.state.phase === 'gameOver')) {
      s.phase = 'results';
      s.matchFlow = this.systems.stage.state.phase === 'clear' ? 'clear' : 'gameOver';
      this.results = this.results ?? this.mode.computeResults();
    }
    this.weaponSystem.applyEdges(this.gunnerEdgeLatches);
    this.gunnerEdgeLatches = { mgStart: false, mgStop: false, secondaryPressed: false, secondaryReleased: false };
    this.stepTank(dt);
    this.weaponSystem.update(dt, this.gunnerInput);
    this.systems.enemies.update(dt);
    this.systems.contact.update();
    if (this.stageEnforced && this.systems.flowField) {
      this.systems.flowField.update(s.tank.x, s.tank.z, dt);
    }
    this.systems.projectiles.update(dt);
    this.systems.pickups.update(dt);
    this.systems.xpShards.update(dt);
    if (this.systems.horde && this.stageEnforced) {
      this.systems.horde.step(dt);
      this.systems.hordeSectors.update(dt, s.tank.x, s.tank.z);
      this.systems.hordeSectors.materialize(s.tank.x, s.tank.z);
    } else {
      this.systems.spawnDirector.step(dt);
    }
    this.mode.stepAssistance();
    this.mode.stepCombo(dt);
    this.stepBarrels(dt);
    if (!this.stageEnforced) {
      this.results = this.mode.checkCompletion() ?? this.results;
    }
    // Deliver queued gameplay events (progression triggers, wave events).
    this.eventBus.drain();
  }

  // ---------------------------------------------------------------- tank
  private stepTank(dt: number) {
    const s = this.state;
    const t = s.tank;
    const tankCfg = this.cfg.tank;
    // Consume the sequenced frame's action edges exactly once. If the tank
    // is dead the edges are discarded with the frame (a dead tank cannot
    // jump or dash at the respawn moment).
    const edges = this.driverEdgesConsumed
      ? { dash: false, jump: false }
      : this.driverEdgesPending;
    this.driverEdgesConsumed = true;
    if (t.deadT > 0) {
      t.deadT -= dt;
      if (t.deadT <= 0) {
        this.respawn();
      }
      return;
    }
    if (t.shieldedT > 0) t.shieldedT -= dt;
    const speed = Math.hypot(t.vx, t.vz);
    const hits = stepTankKinematics(
      t as unknown as TankKinematicState,
      {
        throttle: this.driverInput.throttle,
        steer: this.driverInput.steer,
        dashPressed: edges.dash,
        jumpPressed: edges.jump,
      },
      this.cfg,
      this.mcfg,
      dt,
      {
      onRampLaunch: () => this.push('assist', t.x, t.y, t.z, { label: 'LAUNCHED' }),
        onJump: () => this.push('jump', t.x, t.y, t.z),
        onDash: () => {
          this.push('dash', t.x, t.y, t.z, { yaw: t.yaw });
          this.systems.progression.notifyDash();
        },
      },
      this.world,
    );
    this.systems.progression.notifyAirborneTick(dt, t.grounded);
    if (!this.lastGrounded && t.grounded) this.systems.progression.notifyLanded();
    this.lastGrounded = t.grounded;
    // Hard obstacle crash damage (crusher/factory/wall) at speed.
    if (speed > 10 && hits.length > 0) {
      const hardHit = hits.some((hit) => {
        const ob = hit.obstacleId ? this.world.obstacles.find((o) => o.id === hit.obstacleId) : undefined;
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
    const spawn = this.world.nearestSpawn(t.x, t.z);
    t.x = spawn.x;
    t.y = this.world.groundHeightAt(spawn.x, spawn.z);
    t.z = spawn.z;
    t.vx = 0;
    t.vy = 0;
    t.vz = 0;
    t.yawVel = 0;
    t.roll = 0;
    t.dashCooldown = 0;
    t.dashPresentationT = 0;
    t.dashDamageT = 0;
    t.landingGripT = 0;
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

  /** Wall-clock selection timeout (server room + Single Player authority). */
  checkProgressionTimeout(nowMs: number): boolean {
    return this.systems.progression.checkSelectionTimeout(nowMs);
  }

  submitProgressionSelection(
    role: 'driver' | 'gunner' | 'single',
    offerId: string,
    cardIndex: number,
  ): { accepted: boolean; reason?: string } {
    return this.systems.progression.submitSelection(role, offerId, cardIndex);
  }

  openProgressionChest(chestId: number, nowMs: number) {
    return this.systems.progression.openChest(chestId, nowMs);
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
    this.addContribution('gunner', 3);
    const nearby = this.systems.enemySpatial.queryCircle(b.x, b.z, radius + 4);
    for (const e of nearby) {
      if (!e.alive) continue;
      const d = dist(b.x, b.z, e.x, e.z);
      if (d < radius + this.systems.enemies.radiusFor(e)) {
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
    s.stats.kills++;
    if (source === 'dash') s.stats.dashKills++;
    let score = 0;
    let scrap: ScrapKind | null = null;
    let contributionRole: Role = 'gunner';
    let contributionPoints = 2;
    if (e.type === 'scrapBug') {
      score = sc.bugScore;
      scrap = 'normal';
    } else if (e.type === 'rammer') {
      score = sc.rammerScore;
      scrap = 'heavy';
    } else if (e.type === 'gunTower') {
      score = sc.towerScore;
      scrap = 'heavy';
      contributionPoints = 3;
    } else if (e.type === 'lootTruck') {
      score = sc.truckScore;
      contributionPoints = 4;
    }
    this.systems.score.addScore(score, e.type.toUpperCase());
    this.systems.combo.addContribution(contributionRole, contributionPoints);
    // Drops react to the kill through the enemy's validated drop table.
    this.systems.drops.resolveFor(e);
    this.systems.pickups.noteKill(s.time, scrap);
    this.push('kill', e.x, e.y + 1, e.z, { id: e.id, kind: e.type, value: score, label: `+${Math.floor(score * this.state.combo.multiplier)}` });
  }

  /** True once a mode references a horde director (Core Loop 06 M3+). */
  get stageEnforced(): boolean {
    return this.rules.hordeDirector?.enforceStage === true;
  }

  // ------------------------------------------------- score/combo (delegated)
  /** Public legacy API: role contribution + combo points (delegates). */
  addContribution(role: Role, points: number) {
    this.systems.combo.addContribution(role, points);
  }

  // ---------------------------------------------------------------- misc
  private push(type: SimEvent['type'], x?: number, y?: number, z?: number, extra?: Partial<SimEvent>) {
    this.events.push({ type, t: this.state.time, x, y, z, ...extra });
  }
}
