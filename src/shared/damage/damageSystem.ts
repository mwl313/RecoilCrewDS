import { pushEvent, type SystemContext } from '../sim/systems/systemContext';
import type { BarrelState, EnemyState } from '../types';
import type {
  DamageAppliedEvent,
  DamageResult,
  DamageSource,
  EntityKilledEvent,
} from './damageTypes';

/**
 * Authoritative damage application. Enemies/tank/barrels receive damage
 * here; every application emits a `damage.applied` bus event and kills emit
 * `entity.killed`, which scoring/drops react to (the legacy kill reaction
 * subscribes in MatchRuntime). The wire `hit`/`wipeout` events and all state
 * mutations are byte-for-byte the legacy behavior.
 */
export class DamageSystem {
  constructor(private readonly ctx: SystemContext) {}

  applyEnemy(enemy: EnemyState, amount: number, source: DamageSource, weaponId?: string): DamageResult {
    const e = enemy;
    if (!e.alive) return { applied: false, killed: false, amount: 0, targetId: e.id };
    if (source === 'mg') this.ctx.combo.addContribution('gunner', 0.2);
    e.flash = 0.12;
    // Damage modifiers come from composed enemy traits/defenses (data).
    const vulnerable = this.ctx.enemies.traitParameters(enemy, 'trait.vulnerableRear');
    const rearBonus =
      vulnerable && enemy.state === (vulnerable.whenState ?? 'recovery')
        ? typeof vulnerable.rearBonus === 'number'
          ? vulnerable.rearBonus
          : 1.5
        : 1;
    e.hp -= amount * this.ctx.enemies.damageMultiplier(enemy, source);
    e.hp -= amount * (rearBonus - 1);
    pushEvent(this.ctx, 'hit', e.x, e.y + 0.8, e.z, { value: amount, id: e.id, kind: e.type });
    const applied: DamageAppliedEvent = { targetId: e.id, targetKind: 'enemy', amount, source, weaponId };
    this.ctx.eventBus.emit('damage.applied', applied);
    if (e.hp <= 0) {
      const killed: EntityKilledEvent = { enemy: { id: e.id, type: e.type, x: e.x, y: e.y, z: e.z }, source, weaponId };
      this.ctx.eventBus.emit('entity.killed', killed);
      // Deliver synchronously so the scoring/drop reaction runs in the exact
      // legacy position (before the next enemy is processed).
      this.ctx.eventBus.drain();
      return { applied: true, killed: true, amount, targetId: e.id };
    }
    return { applied: true, killed: false, amount, targetId: e.id };
  }

  applyTank(amount: number, source: DamageSource, weaponId?: string): DamageResult {
    const s = this.ctx.state;
    const t = s.tank;
    if (t.deadT > 0 || t.shieldedT > 0) return { applied: false, killed: false, amount: 0, targetId: 'tank' };
    t.integrity = Math.max(0, t.integrity - amount);
    pushEvent(this.ctx, 'hit', t.x, t.y, t.z, { value: amount, kind: source });
    this.ctx.eventBus.emit('damage.applied', { targetId: 'tank', targetKind: 'tank', amount, source, weaponId });
    if (t.integrity <= 0) {
      t.integrity = 0;
      t.deadT = this.ctx.rules.config.tank.respawnTime;
      s.stats.wipeouts++;
      this.ctx.score.applyWipeoutPenalty();
      pushEvent(this.ctx, 'wipeout', t.x, t.y, t.z);
    }
    return { applied: true, killed: t.integrity <= 0, amount, targetId: 'tank' };
  }

  applyBarrel(barrel: BarrelState, amount: number): void {
    if (barrel.exploded) return;
    barrel.hp = (barrel.hp ?? 0) + amount;
    if (barrel.hp >= this.ctx.rules.config.weapons.barrelHp) {
      barrel.exploded = true;
      barrel.fuseT = 0.14;
    }
  }
}
