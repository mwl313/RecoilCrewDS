import { dist2 } from '../math';
import type { SystemContext } from '../sim/systems/systemContext';
import type { EnemyDefinition } from '../content/schemas/enemy';
import type { EnemyState, EnemyType } from '../types';
import { createBuiltinEnemyBehaviors } from './enemyBehaviors';
import { EnemyBehaviorRegistry } from './enemyBehaviorRegistry';
import { EnemyRuntimeState } from './enemyRuntimeState';
import { enemyHp, enemyRadius, enemyThreat, isMonster } from './monsterCompat';
import {
  DEFAULT_MELEE_ENGAGEMENT_PROFILE,
  MeleeReservationManager,
  type MeleeCandidate,
} from '../monsters/meleeReservations';
import {
  MAIN_STAGE_CURVE,
  MAIN_STAGE_XP_REWARDS,
  monsterLevelAtTime,
  resolveMonsterSpawnLock,
} from '../monsters/monsterDifficulty';
import { monsterLevelForPhase, type MonsterPhaseConfig } from '../monsters/monsterPhase';
import { resolveMonsterDimensions } from '../monsters/monsterNormalization';
import { resolveMonsterEngagementGeometry } from '../monsters/engagementGeometry';
import { updateEnemySemantics } from '../monsters/monsterSemantics';
import { mulberry32, type Rng } from '../mapgen/prng';
import { hash32 } from '../mapgen/seed';
import type { SpawnOwnership } from '../horde/spawnOwnership';
import type { EnemyLodPolicyDefinition } from '../content/schemas/horde';
import { cancelAttackCycle } from '../monsters/monsterAttack';
import type { StageEvent } from '../stage/stageTypes';

/** Wire type -> definition id (documented engine default mapping). */
const ENEMY_TYPE_TO_ID: Record<EnemyType, string> = {
  scrapBug: 'enemy.scrapBug',
  rammer: 'enemy.rammer',
  gunTower: 'enemy.gunTower',
  lootTruck: 'enemy.lootTruck',
  monster: '',
};

/**
 * Authoritative enemy system. Enemies are data: each definition lists an
 * ordered composition of registered behavior primitives. There is no
 * per-type switch here — behavior ids dispatch through the registry, so new
 * ordinary enemies are JSON-only (plus a registered primitive when novel).
 */
export class EnemySystem {
  readonly behaviors: EnemyBehaviorRegistry;
  /** Legacy-compatible shared dodge credit flag (one per match, as before). */
  sharedDodgeAwarded = false;
  /** Production: deterministic melee engagement reservations (match-scoped). */
  readonly meleeReservations: MeleeReservationManager;
  private readonly runtimes = new Map<number, EnemyRuntimeState>();
  private readonly spawnRng: Rng;

  constructor(private readonly ctx: SystemContext) {
    this.behaviors = createBuiltinEnemyBehaviors();
    this.spawnRng = mulberry32(hash32('monsterSpawn', this.ctx.state.matchId));
    const profile =
      this.ctx.rules.meleeEngagementProfiles.get('meleeEngagement.default') ??
      DEFAULT_MELEE_ENGAGEMENT_PROFILE;
    this.meleeReservations = new MeleeReservationManager(profile);
    this.ctx.eventBus.subscribe('stageEvent', (payload) => {
      const event = payload as StageEvent;
      if (event.type === 'phaseChanged' || event.type === 'stageCleared' || event.type === 'gameOver') {
        this.releaseAllCombatState();
      }
    });
  }

  /** Reservation ownership for a living melee monster (public for tests/HUD). */
  meleeReservedFor(enemyId: number): boolean {
    return this.meleeReservations.hasReservation(enemyId);
  }

  hasActiveAttackCycle(enemyId: number): boolean {
    return this.runtimes.get(enemyId)?.attackRuntime?.active === true;
  }

  /** Immediate death/purge cleanup; pending cues can never survive removal. */
  releaseEnemyCombatState(enemyId: number): void {
    const runtime = this.runtimes.get(enemyId);
    if (runtime?.attackRuntime) cancelAttackCycle(runtime.attackRuntime);
    if (runtime) {
      runtime.attackRuntime = undefined;
      runtime.meleeReserved = false;
    }
    this.meleeReservations.release(enemyId);
    const enemy = this.ctx.state.enemies.find((candidate) => candidate.id === enemyId);
    if (enemy) enemy.telegraph = 0;
  }

  /** Phase/rematch terminal cleanup for all match-scoped combat ownership. */
  releaseAllCombatState(): void {
    for (const id of this.runtimes.keys()) this.releaseEnemyCombatState(id);
    this.meleeReservations.releaseAll();
  }

  /** Authoritative semantic action + stable sequence (presentation/HUD). */
  semanticFor(enemyId: number): { action: string; sequence: number } {
    const runtime = this.runtimes.get(enemyId);
    return runtime
      ? { action: runtime.semanticAction, sequence: runtime.semanticSequence }
      : { action: 'Idle', sequence: 0 };
  }

  defFor(enemy: EnemyState): EnemyDefinition {
    const def =
      this.ctx.rules.enemies.get(enemy.defId ?? '') ??
      this.ctx.rules.enemies.get(ENEMY_TYPE_TO_ID[enemy.type]);
    if (!def) throw new Error(`no enemy definition for type '${enemy.type}'`);
    return def;
  }

  defById(id: string): EnemyDefinition | undefined {
    return this.ctx.rules.enemies.get(id);
  }

  radiusFor(enemy: EnemyState): number {
    const def = this.defFor(enemy);
    if (isMonster(def)) {
      return resolveMonsterDimensions(def.id, def.sizeClass, def.tier).collisionRadius;
    }
    return enemyRadius(def);
  }

  /** Threat contribution used by population budgets (monster-aware). */
  threatFor(enemy: EnemyState): number {
    return enemyThreat(this.defFor(enemy));
  }

  traitParameters(enemy: EnemyState, traitId: string): Record<string, number | string | boolean> | null {
    const entry = this.defFor(enemy).behaviors.find((b) => b.id === traitId);
    return entry?.parameters ?? null;
  }

  /** Defense behaviors (e.g. armoredFront) reduce incoming damage. */
  damageMultiplier(enemy: EnemyState, _source: string): number {
    const armor = this.traitParameters(enemy, 'defense.armoredFront');
    const value = armor?.damageMultiplier;
    return typeof value === 'number' ? value : 1;
  }

  spawnEnemy(type: EnemyType, x?: number, z?: number): EnemyState | null {
    const def = this.ctx.rules.enemies.get(ENEMY_TYPE_TO_ID[type]);
    if (!def) throw new Error(`no enemy definition for type '${type}'`);
    return this.spawnEnemyDef(def, x, z);
  }

  /** Spawn by validated definition id (used by content-composed enemies). */
  spawnEnemyDef(def: EnemyDefinition, x?: number, z?: number, ownership?: SpawnOwnership): EnemyState | null {
    const s = this.ctx.state;
    const type = def.type;
    const spawnLock =
      def.type === 'monster'
        ? this.resolveMonsterSpawnLock(def)
        : undefined;
    let sx = x;
    let sz = z;
    if (sx === undefined || sz === undefined) {
      const gates = this.ctx.world.bugSpawns;
      const rng = isMonster(def) ? this.spawnRng : Math.random;
      for (let i = 0; i < 12; i++) {
        const g = gates[Math.floor(rng() * gates.length)];
        const px = g.x + (rng() - 0.5) * 4;
        const pz = g.z + (rng() - 0.5) * 4;
        if (dist2(px, pz, s.tank.x, s.tank.z) > 10 * 10) {
          sx = px;
          sz = pz;
          break;
        }
      }
      if (sx === undefined) {
        sx = -30;
        sz = -30;
      }
    }
    const enemy: EnemyState = {
      id: s.nextEnemyId++,
      type,
      defId: def.id,
      x: sx!,
      y: this.ctx.world.groundHeightAt(sx!, sz!),
      z: sz!,
      yaw: Math.atan2(s.tank.x - sx!, s.tank.z - sz!),
      hp: spawnLock?.maxHpAtSpawn ?? enemyHp(def),
      maxHp: spawnLock?.maxHpAtSpawn ?? enemyHp(def),
      state: type === 'rammer' ? 'approach' : type === 'gunTower' ? 'idle' : 'hunt',
      stateT: 0,
      aimYaw: 0,
      speed: 0,
      alive: true,
      telegraph: 0,
      flash: 0,
      spawnT: s.time,
      hitCd: 0,
      impulseVx: 0,
      impulseVy: 0,
      impulseVz: 0,
      impulseGrounded: true,
      lastImpulseT: 0,
      ...(def.presentationProfileId ? { presentationProfileId: def.presentationProfileId } : {}),
      ...(spawnLock
        ? {
            monster: {
              spawnLevel: spawnLock.level,
              healthMultiplierAtSpawn: spawnLock.healthMultiplierAtSpawn,
              damageMultiplierAtSpawn: spawnLock.damageMultiplierAtSpawn,
              maxHpAtSpawn: spawnLock.maxHpAtSpawn,
              resolvedRewardXp: spawnLock.resolvedRewardXp,
              scaledContactDps: spawnLock.scaledContactDps,
              scaledProjectileDamage: spawnLock.scaledProjectileDamage,
              rewardClass: isMonster(def)
                ? ownership?.populationClass === 'special'
                  ? 'elite'
                  : ownership?.populationClass === 'wave' || ownership?.populationClass === 'boss'
                    ? ownership.populationClass
                    : def.rewardClass
                : 'ambient',
            },
          }
        : {}),
      ...(ownership ? { ownership } : {}),
    };
    if (type === 'gunTower') {
      enemy.x = x ?? 0;
      enemy.z = z ?? 0;
    }
    s.enemies.push(enemy);
    const runtime = new EnemyRuntimeState();
    runtime.lastUpdateT = s.time;
    runtime.phaseOffset = (enemy.id % 16) / 16;
    this.runtimes.set(enemy.id, runtime);
    return enemy;
  }

  /**
   * Spawn-time lock for generalized monsters: level, HP multiplier, damage
   * multiplier (boss exception), and resolved XP are frozen at spawn.
   * Content-backed defaults mirror `enemyLevelCurve.mainStage` /
   * `enemyXpRewards.mainStage`; the same content is validated separately.
   */
  private resolveMonsterSpawnLock(def: Extract<EnemyDefinition, { type: 'monster' }>) {
    const curve = this.ctx.rules.enemyLevelCurves.get('enemyLevelCurve.mainStage') ?? MAIN_STAGE_CURVE;
    const rewards = this.ctx.rules.enemyXpRewards.get('enemyXpRewards.mainStage') ?? MAIN_STAGE_XP_REWARDS;
    const phaseConfig: MonsterPhaseConfig = {
      farmingSeconds: 180,
      bossIntroSeconds: 4,
      bossPhaseLevel: curve.bossPhaseLevel,
    };
    // One authoritative active-farming clock: elite-wave time pauses
    // `stage.activeFarmingElapsed`, so spawn-locked HP/damage/XP never
    // advance while a wave is held. The boss phase locks to the authored
    // boss level (activeFarmingElapsed reaches 180 at boss start).
    const activeFarmingTime = this.ctx.stage.state.activeFarmingElapsed;
    const level = monsterLevelForPhase(activeFarmingTime, phaseConfig, (t) =>
      monsterLevelAtTime(t, curve),
    );
    const singlePlayerMultiplier = this.ctx.sessionKind === 'singlePlayer' ? 2 : 1;
    return resolveMonsterSpawnLock({
      tier: def.tier,
      baseHp: def.stats.hp,
      baseDamage: def.attack.type === 'mixed' ? undefined : def.attack.type === 'melee' ? def.attack.contactDps : def.attack.damage,
      rewardClass: def.rewardClass,
      level,
      curve,
      rewards,
      singlePlayerMultiplier,
    });
  }

  update(dt: number): void {
    const s = this.ctx.state;
    this.ctx.enemySpatial.rebuild(s.enemies);
    const meleeCandidates: MeleeCandidate[] = [];
    for (const e of s.enemies) {
      if (!e.alive) continue;
      const def = this.defFor(e);
      if (!isMonster(def) || def.attack.type !== 'melee') continue;
      const dx = s.tank.x - e.x;
      const dz = s.tank.z - e.z;
      const d = Math.hypot(dx, dz) || 1;
      const monsterDims = resolveMonsterDimensions(def.id, def.sizeClass, def.tier);
      const geometry = resolveMonsterEngagementGeometry({
        enemyRadius: monsterDims.collisionRadius,
        tankRadius: this.ctx.rules.config.arena.tankRadius,
        authoredAttackReach: def.attack.range,
      });
      meleeCandidates.push({
        id: e.id,
        x: e.x,
        z: e.z,
        collisionDiameter: monsterDims.collisionRadius * 2,
        threat: enemyThreat(def),
        alive: e.alive,
        attackRange: geometry.effectiveAttackDistance,
        distanceToTank: d,
        // Reservation angles are tank->enemy bearings so a reserved enemy
        // physically approaches its own side of the attack ring.
        angleToTank: Math.atan2(e.x - s.tank.x, e.z - s.tank.z),
        lastDamageAt: 0,
      });
    }
    this.meleeReservations.update(s.tank.x, s.tank.z, meleeCandidates, s.time);
    const policy = this.lodPolicy();
    for (const e of s.enemies) {
      let runtime = this.runtimes.get(e.id);
      if (!runtime) {
        runtime = new EnemyRuntimeState();
        runtime.lastUpdateT = s.time;
        runtime.phaseOffset = (e.id % 16) / 16;
        this.runtimes.set(e.id, runtime);
      }
      if (!e.alive) {
        this.releaseEnemyCombatState(e.id);
        // Death lock: semantic action is evaluated after behavior state,
        // but death always overrides everything.
        updateEnemySemantics(runtime, { alive: false, moving: false, attacking: false });
        if (e.monster) this.syncSemanticCue(e, runtime);
        e.stateT += dt;
        continue;
      }
      e.stateT += dt;
      e.flash = Math.max(0, e.flash - dt);
      e.telegraph = Math.max(0, e.telegraph - dt);
      e.hitCd = Math.max(0, (e.hitCd ?? 0) - dt);
      const def = this.defFor(e);
      const tier = this.tierFor(e, runtime);
      runtime.tier = tier;
      runtime.meleeReserved = this.meleeReservations.hasReservation(e.id);
      if (policy) {
        const freq = tierFrequency(policy, tier);
        if (s.time < runtime.nextUpdateAt) {
          this.ctx.enemyImpulses.update(e, def, dt);
          continue;
        }
        const elapsed = Math.min(0.75, Math.max(0, s.time - runtime.lastUpdateT));
        runtime.lastUpdateT = s.time;
        runtime.nextUpdateAt = s.time + 1 / freq;
        for (const behavior of def.behaviors) {
          this.behaviors.require(behavior.id).update(this.ctx, e, runtime, elapsed);
        }
      } else {
        for (const behavior of def.behaviors) {
          this.behaviors.require(behavior.id).update(this.ctx, e, runtime, dt);
        }
      }
      this.ctx.enemyImpulses.update(e, def, dt);
      // Semantic action reflects the current frame's final movement,
      // attack, and death state (bug-fix ordering).
      updateEnemySemantics(runtime, {
        alive: true,
        moving: runtime.speed > 0.2 && runtime.distToTank > 0.5,
        attacking: runtime.attackRuntime?.active === true,
      });
      if (e.monster) this.syncSemanticCue(e, runtime);
    }
    s.enemies = s.enemies.filter((e) => e.alive || e.stateT <= 2.5);
    const live = new Set<number>();
    for (const e of s.enemies) live.add(e.id);
    for (const id of [...this.runtimes.keys()]) {
      if (!live.has(id)) {
        this.releaseEnemyCombatState(id);
        this.runtimes.delete(id);
      }
    }
  }

  /**
   * Authoritative compact semantic cue for client presentation. Written
   * only for generalized monsters; legacy enemies keep legacy inference.
   * Attack cues refresh per attack cycle so each swing is a distinct
   * presentation event. Animation never decides gameplay.
   */
  private syncSemanticCue(e: EnemyState, runtime: EnemyRuntimeState): void {
    const action = runtime.semanticAction;
    const cycle = runtime.attackRuntime?.active === true ? runtime.attackSequence + 1 : 0;
    const sequence = runtime.semanticSequence * 1000 + cycle;
    if (e.actionCue?.sequence === sequence) return;
    const durationSeconds =
      action === 'Attack'
        ? runtime.attackRuntime?.cycleDuration ?? 1
        : action === 'Death'
          ? 1.2
          : 0;
    e.actionCue = {
      sequence,
      actionId: `enemy.semantic.${action.toLowerCase()}`,
      startedAtTick: Math.round(this.ctx.state.time * 30),
      durationTicks: Math.max(0, Math.round(durationSeconds * 30)),
    };
  }

  /** Current LOD tier for an enemy (public for tests and debug overlays). */
  tierFor(
    e: EnemyState,
    runtime: EnemyRuntimeState = this.runtimes.get(e.id) ?? new EnemyRuntimeState(),
  ): 0 | 1 | 2 | 3 {
    const policy = this.lodPolicy();
    if (!policy) return 0;
    const t = this.ctx.state.tank;
    const d = Math.hypot(e.x - t.x, e.z - t.z);
    let tier = runtime.tier;
    if (tier === 0) {
      if (d > policy.tier0Leave) tier = 1;
    } else if (tier === 1) {
      if (d < policy.tier0Enter) tier = 0;
      else if (d > policy.tier1Leave) tier = 2;
    } else if (tier === 2) {
      if (d < policy.tier1Enter) tier = 1;
      else if (d > policy.tier2Leave) tier = 3;
    } else if (d < policy.tier2Enter) {
      tier = 2;
    }
    // Promotion overrides: gameplay-relevant enemies always run at full rate.
    if (e.ownership?.populationClass === 'boss' || e.ownership?.leaderId === e.id) return 0;
    if (e.telegraph > 0 || e.flash > 0) return 0;
    if (e.state === 'lock' || e.state === 'telegraph' || e.state === 'charge' || e.state === 'fire') return 0;
    const lastImpulse = e.lastImpulseT ?? -9;
    if (lastImpulse > 0 && lastImpulse > this.ctx.state.time - 0.5) return 0;
    runtime.tier = tier as 0 | 1 | 2 | 3;
    return runtime.tier;
  }

  /** LOD is only active when a mode enforces the horde stage. */
  get lodEnabled(): boolean {
    return this.lodPolicy() !== null;
  }

  private lodPolicy(): EnemyLodPolicyDefinition | null {
    if (this.ctx.rules.hordeDirector?.enforceStage !== true) return null;
    return this.ctx.horde?.resolved.policies.lod ?? null;
  }

  /** Remove enemies directly (cohort purge): no kill hooks, XP, or drops. */
  purge(predicate: (e: EnemyState) => boolean): EnemyState[] {
    const removed: EnemyState[] = [];
    const keep: EnemyState[] = [];
    for (const e of this.ctx.state.enemies) {
      if (predicate(e)) removed.push(e);
      else keep.push(e);
    }
    this.ctx.state.enemies = keep;
    for (const e of removed) {
      this.releaseEnemyCombatState(e.id);
      this.runtimes.delete(e.id);
    }
    return removed;
  }
}

function tierFrequency(policy: EnemyLodPolicyDefinition, tier: 0 | 1 | 2 | 3): number {
  switch (tier) {
    case 0:
      return 30;
    case 1:
      return policy.tier1Hz;
    case 2:
      return policy.tier2Hz;
    case 3:
      return policy.tier3Hz;
  }
}
