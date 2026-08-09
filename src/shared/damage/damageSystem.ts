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
    const modified =
      this.ctx.progression?.modifyEnemyDamage(amount, source, {
        enemy,
        weaponId,
      }) ?? amount;
    const hpBefore = Math.max(0, e.hp);
    e.hp -= modified * this.ctx.enemies.damageMultiplier(enemy, source);
    e.hp -= modified * (rearBonus - 1);
    const hpAfter = Math.max(0, e.hp);
    const actualHpLoss = Math.max(0, hpBefore - hpAfter);
    pushEvent(this.ctx, 'hit', e.x, e.y + 0.8, e.z, {
      value: actualHpLoss,
      id: e.id,
      kind: e.type,
      source,
    });
    const applied: DamageAppliedEvent = { targetId: e.id, targetKind: 'enemy', amount: modified, source, weaponId };
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

  applyTank(
    amount: number,
    source: DamageSource,
    weaponId?: string,
    impact: {
      sourcePosition?: { x: number; y: number; z: number };
      kind?: 'melee' | 'projectile' | 'collision' | 'explosive' | 'unknown';
      tier?: 'fodder' | 'specialist' | 'elite' | 'boss';
    } = {},
  ): DamageResult {
    const s = this.ctx.state;
    const t = s.tank;
    if (t.deadT > 0 || t.shieldedT > 0) return { applied: false, killed: false, amount: 0, targetId: 'tank' };
    const modified = this.ctx.progression?.modifyTankDamage(amount, source) ?? amount;
    if (modified <= 0) return { applied: false, killed: false, amount: 0, targetId: 'tank' };
    const integrityBefore = Math.max(0, t.integrity);
    t.integrity = Math.max(0, t.integrity - modified);
    const actualDamage = Math.max(0, integrityBefore - t.integrity);
    if (actualDamage <= 0) return { applied: false, killed: false, amount: 0, targetId: 'tank' };
    pushEvent(this.ctx, 'tankDamageTaken', t.x, t.y + 1.2, t.z, {
      value: actualDamage,
      source,
      tx: impact.sourcePosition?.x,
      ty: impact.sourcePosition?.y,
      tz: impact.sourcePosition?.z,
      impactKind: impact.kind ?? 'unknown',
      tier: impact.tier,
      maxIntegrity: Math.max(1, this.ctx.rules.resolver.resolve('tank.maxIntegrity')),
    });
    pushEvent(this.ctx, 'hit', t.x, t.y, t.z, { value: modified, kind: source });
    this.ctx.eventBus.emit('damage.applied', { targetId: 'tank', targetKind: 'tank', amount: modified, source, weaponId });
    if (t.integrity <= 0) {
      this.ctx.progression?.notifyWipeout();
      // PHOENIX CORE revive may have reset death state; skip the wipeout
      // penalty when the tank was revived by the relic.
      if (t.deadT <= 0 && t.integrity > 0) {
        return { applied: true, killed: false, amount: modified, targetId: 'tank' };
      }
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
