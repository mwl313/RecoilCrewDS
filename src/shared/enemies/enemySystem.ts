import { dist2 } from '../math';
import type { SystemContext } from '../sim/systems/systemContext';
import type { EnemyDefinition } from '../content/schemas/enemy';
import type { EnemyState, EnemyType } from '../types';
import { createBuiltinEnemyBehaviors } from './enemyBehaviors';
import { EnemyBehaviorRegistry } from './enemyBehaviorRegistry';
import { EnemyRuntimeState } from './enemyRuntimeState';
import type { SpawnOwnership } from '../horde/spawnOwnership';
import type { EnemyLodPolicyDefinition } from '../content/schemas/horde';

/** Wire type -> definition id (documented engine default mapping). */
const ENEMY_TYPE_TO_ID: Record<EnemyType, string> = {
  scrapBug: 'enemy.scrapBug',
  rammer: 'enemy.rammer',
  gunTower: 'enemy.gunTower',
  lootTruck: 'enemy.lootTruck',
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
  private readonly runtimes = new Map<number, EnemyRuntimeState>();

  constructor(private readonly ctx: SystemContext) {
    this.behaviors = createBuiltinEnemyBehaviors();
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
    return this.defFor(enemy).radius;
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
    let sx = x;
    let sz = z;
    if (sx === undefined || sz === undefined) {
      const gates = this.ctx.world.bugSpawns;
      for (let i = 0; i < 12; i++) {
        const g = gates[Math.floor(Math.random() * gates.length)];
        const px = g.x + (Math.random() - 0.5) * 4;
        const pz = g.z + (Math.random() - 0.5) * 4;
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
      hp: def.hp,
      maxHp: def.hp,
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

  update(dt: number): void {
    const s = this.ctx.state;
    this.ctx.enemySpatial.rebuild(s.enemies);
    const policy = this.lodPolicy();
    for (const e of s.enemies) {
      if (!e.alive) {
        e.stateT += dt;
        continue;
      }
      e.stateT += dt;
      e.flash = Math.max(0, e.flash - dt);
      e.telegraph = Math.max(0, e.telegraph - dt);
      e.hitCd = Math.max(0, (e.hitCd ?? 0) - dt);
      const def = this.defFor(e);
      let runtime = this.runtimes.get(e.id);
      if (!runtime) {
        runtime = new EnemyRuntimeState();
        runtime.lastUpdateT = s.time;
        runtime.phaseOffset = (e.id % 16) / 16;
        this.runtimes.set(e.id, runtime);
      }
      const tier = this.tierFor(e, runtime);
      runtime.tier = tier;
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
    }
    s.enemies = s.enemies.filter((e) => e.alive || e.stateT <= 2.5);
    const live = new Set<number>();
    for (const e of s.enemies) live.add(e.id);
    for (const id of [...this.runtimes.keys()]) {
      if (!live.has(id)) this.runtimes.delete(id);
    }
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
    for (const e of removed) this.runtimes.delete(e.id);
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
