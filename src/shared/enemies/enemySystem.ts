import { dist2 } from '../math';
import type { SystemContext } from '../sim/systems/systemContext';
import type { EnemyDefinition } from '../content/schemas/enemy';
import type { EnemyState, EnemyType } from '../types';
import { createBuiltinEnemyBehaviors } from './enemyBehaviors';
import { EnemyBehaviorRegistry } from './enemyBehaviorRegistry';
import { EnemyRuntimeState } from './enemyRuntimeState';

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
    const def = this.ctx.rules.enemies.get(ENEMY_TYPE_TO_ID[enemy.type]);
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
  spawnEnemyDef(def: EnemyDefinition, x?: number, z?: number): EnemyState | null {
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
    };
    if (type === 'gunTower') {
      enemy.x = x ?? 0;
      enemy.z = z ?? 0;
    }
    s.enemies.push(enemy);
    this.runtimes.set(enemy.id, new EnemyRuntimeState());
    return enemy;
  }

  update(dt: number): void {
    const s = this.ctx.state;
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
        this.runtimes.set(e.id, runtime);
      }
      for (const behavior of def.behaviors) {
        this.behaviors.require(behavior.id).update(this.ctx, e, runtime, dt);
      }
    }
    s.enemies = s.enemies.filter((e) => e.alive || e.stateT <= 2.5);
    for (const id of [...this.runtimes.keys()]) {
      if (!s.enemies.some((e) => e.id === id)) this.runtimes.delete(id);
    }
  }
}
