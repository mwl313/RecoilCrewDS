import type { RelicDefinition, RelicEffectType } from '../content/schemas/progression';
import { statModifier } from '../stats/statModifier';
import type { SystemContext } from '../sim/systems/systemContext';
import type { ProgressionTelemetry } from './progressionTelemetry';

export type RelicTriggerEvent =
  | { type: 'cannonFired' }
  | { type: 'damageApplied'; targetId: number | string; targetKind: string; amount: number; source: string; weaponId?: string }
  | { type: 'enemyKilled'; enemyId: number; source: string; weaponId?: string }
  | { type: 'dashHit'; enemyId: number }
  | { type: 'landed' }
  | { type: 'airborneTick'; dt: number }
  | { type: 'waveCleared'; waveId: number }
  | { type: 'wipeout' }
  | { type: 'cannonHit'; enemyId: number };

export interface RelicEffectHandler {
  trigger: string;
  handle(
    event: RelicTriggerEvent,
    ctx: SystemContext,
    relic: RelicDefinition,
    stacks: number,
    params: Record<string, unknown>,
    telemetry: ProgressionTelemetry,
  ): void;
}

/**
 * Expandable trigger registry. New behaviors register a handler here;
 * relics reference handlers through content templates.
 */
export class RelicEffectRegistry {
  private readonly byType = new Map<string, RelicEffectHandler>();
  private readonly enemyDebuffs = new Map<number, { speedUntil: number; speedPercent: number; vulnUntil: number; vulnPercent: number }>();
  private readonly usedOnce = new Set<string>();

  register(handler: RelicEffectHandler): void {
    this.byType.set(handler.trigger, handler);
  }

  resolve(effectType: string): RelicEffectHandler | undefined {
    return this.byType.get(effectType);
  }

  /** Armor-shred / covering-fire debuff lookup for damage/speed hooks. */
  debuffFor(enemyId: number, now: number) {
    const d = this.enemyDebuffs.get(enemyId);
    if (!d) return { speedPercent: 0, vulnPercent: 0 };
    return {
      speedPercent: now < d.speedUntil ? d.speedPercent : 0,
      vulnPercent: now < d.vulnUntil ? d.vulnPercent : 0,
    };
  }

  markSpeedDebuff(enemyId: number, percent: number, durationSeconds: number, now: number): void {
    const d = this.enemyDebuffs.get(enemyId) ?? { speedUntil: 0, speedPercent: 0, vulnUntil: 0, vulnPercent: 0 };
    d.speedUntil = now + durationSeconds;
    d.speedPercent = percent;
    this.enemyDebuffs.set(enemyId, d);
  }

  markVulnerability(enemyId: number, percent: number, durationSeconds: number, now: number): void {
    const d = this.enemyDebuffs.get(enemyId) ?? { speedUntil: 0, speedPercent: 0, vulnUntil: 0, vulnPercent: 0 };
    d.vulnUntil = now + durationSeconds;
    d.vulnPercent = percent;
    this.enemyDebuffs.set(enemyId, d);
  }

  prune(now: number): void {
    for (const [id, d] of [...this.enemyDebuffs]) {
      if (now > d.speedUntil && now > d.vulnUntil) this.enemyDebuffs.delete(id);
    }
  }

  removeEnemy(enemyId: number): void {
    this.enemyDebuffs.delete(enemyId);
  }

  clear(): void {
    this.enemyDebuffs.clear();
    this.usedOnce.clear();
  }

  size(): number {
    return this.enemyDebuffs.size;
  }

  consumeOnce(key: string): boolean {
    if (this.usedOnce.has(key)) return false;
    this.usedOnce.add(key);
    return true;
  }

  wasConsumed(key: string): boolean {
    return this.usedOnce.has(key);
  }
}

export function createRelicEffectRegistry(): RelicEffectRegistry {
  const registry = new RelicEffectRegistry();
  const num = (params: Record<string, unknown>, key: string): number =>
    typeof params[key] === 'number' ? (params[key] as number) : 0;

  const healTank = (ctx: SystemContext, amount: number): void => {
    const t = ctx.state.tank;
    const max = ctx.rules.resolver.resolve('tank.maxIntegrity');
    t.integrity = Math.min(max, t.integrity + amount);
  };

  registry.register({
    trigger: 'mgBuffOnCannonFire',
    handle(event, ctx, relic, stacks, params, telemetry) {
      if (event.type !== 'cannonFired') return;
      const percent = num(params, 'percentPerStack') * stacks;
      const duration = num(params, 'durationSeconds');
      ctx.rules.addModifier(
        statModifier(`relic.${relic.id}.mgBuff`, 'weapon.mgDamage', 'multiply', 1 + percent / 100, {
          source: `relic:${relic.id}`,
          priority: 55,
          stacking: 'refresh',
          durationSeconds: duration,
          tags: ['relicTrigger', relic.id],
        }),
      );
      count(telemetry, relic.id);
    },
  });

  registry.register({
    trigger: 'enemySpeedDebuffOnMgHit',
    handle(event, ctx, relic, stacks, params, telemetry) {
      if (event.type !== 'damageApplied' || event.source !== 'mg' || event.targetKind !== 'enemy') return;
      if (typeof event.targetId !== 'number') return;
      registry.markSpeedDebuff(
        event.targetId,
        num(params, 'percentPerStack') * stacks,
        num(params, 'durationSeconds'),
        ctx.state.time,
      );
      count(telemetry, relic.id);
    },
  });

  registry.register({
    trigger: 'enemyVulnerabilityOnMgHit',
    handle(event, ctx, relic, stacks, params, telemetry) {
      if (event.type !== 'damageApplied' || event.source !== 'mg' || event.targetKind !== 'enemy') return;
      if (typeof event.targetId !== 'number') return;
      registry.markVulnerability(
        event.targetId,
        num(params, 'percentPerStack') * stacks,
        num(params, 'durationSeconds'),
        ctx.state.time,
      );
      count(telemetry, relic.id);
    },
  });

  registry.register({
    trigger: 'cannonKillHeal',
    handle(event, ctx, relic, stacks, params, telemetry) {
      if (event.type !== 'enemyKilled' || event.source !== 'cannon') return;
      healTank(ctx, num(params, 'amountPerStack') * stacks);
      count(telemetry, relic.id);
    },
  });

  registry.register({
    trigger: 'cannonKillExplosion',
    handle(event, ctx, relic, stacks, params, telemetry) {
      if (event.type !== 'enemyKilled' || event.source !== 'cannon') return;
      const enemy = ctx.state.enemies.find((e) => e.id === event.enemyId);
      if (!enemy) return;
      const radius = num(params, 'radius');
      const damage = num(params, 'damageBase') + num(params, 'damagePerStack') * (stacks - 1);
      const nearby = ctx.enemySpatial.queryCircle(enemy.x, enemy.z, radius + 4);
      for (const e of nearby) {
        if (!e.alive || e.id === event.enemyId) continue;
        if (Math.hypot(e.x - enemy.x, e.z - enemy.z) <= radius + ctx.enemies.radiusFor(e)) {
          ctx.damage.applyEnemy(e, damage, 'relic');
        }
      }
      count(telemetry, relic.id);
    },
  });

  registry.register({
    trigger: 'cannonHitCooldownReduction',
    handle(event, ctx, relic, stacks, params, telemetry) {
      // ProjectileSystem emits this once per shell impact, even when its
      // splash damages several enemies. This prevents multiplicative
      // cooldown refunds from one area hit.
      if (event.type !== 'cannonHit') return;
      ctx.state.turret.cannonCooldown = Math.max(
        0,
        ctx.state.turret.cannonCooldown * (1 - (num(params, 'percentPerStack') * stacks) / 100),
      );
      count(telemetry, relic.id);
    },
  });

  registry.register({
    trigger: 'dashHitCooldownReduction',
    handle(event, ctx, relic, stacks, params, telemetry) {
      if (event.type !== 'dashHit') return;
      ctx.state.tank.dashCooldown = Math.max(
        0,
        ctx.state.tank.dashCooldown * (1 - (num(params, 'percentPerStack') * stacks) / 100),
      );
      count(telemetry, relic.id);
    },
  });

  registry.register({
    trigger: 'airCooldownRecovery',
    handle(event, ctx, relic, stacks, params, telemetry) {
      if (event.type !== 'airborneTick' || event.dt <= 0) return;
      const extra = (num(params, 'recoveryMultiplierPerStack') - 1) * stacks;
      ctx.state.tank.dashCooldown = Math.max(0, ctx.state.tank.dashCooldown - event.dt * extra);
      count(telemetry, relic.id);
    },
  });

  registry.register({
    trigger: 'groundPound',
    handle(event, ctx, relic, stacks, params, telemetry) {
      if (event.type !== 'landed') return;
      const t = ctx.state.tank;
      const radius = num(params, 'radius');
      const damage = num(params, 'damageBase') + num(params, 'damagePerStack') * (stacks - 1);
      const knockback = num(params, 'knockback');
      const nearby = ctx.enemySpatial.queryCircle(t.x, t.z, radius + 4);
      for (const e of nearby) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - t.x, e.z - t.z);
        if (d <= radius + ctx.enemies.radiusFor(e)) {
          ctx.damage.applyEnemy(e, damage, 'relic');
          const def = ctx.enemies.defFor(e);
          ctx.enemyImpulses.apply(e, def, d > 0.001 ? (e.x - t.x) / d : 0, d > 0.001 ? (e.z - t.z) / d : 0, knockback, 1.4, 'relic');
        }
      }
      count(telemetry, relic.id);
    },
  });

  registry.register({
    trigger: 'waveClearHeal',
    handle(event, ctx, relic, stacks, params, telemetry) {
      if (event.type !== 'waveCleared') return;
      healTank(ctx, num(params, 'amountPerStack') * stacks);
      count(telemetry, relic.id);
    },
  });

  registry.register({
    trigger: 'revive',
    handle(event, ctx, relic, _stacks, params, telemetry) {
      if (event.type !== 'wipeout') return;
      if (!registry.consumeOnce(relic.id)) return;
      const t = ctx.state.tank;
      const max = ctx.rules.resolver.resolve('tank.maxIntegrity');
      t.integrity = Math.max(1, max * (num(params, 'integrityPercent') / 100));
      t.deadT = 0;
      t.shieldedT = Math.max(t.shieldedT, 1);
      const radius = num(params, 'shockwaveRadius');
      const shockwaveDamage = num(params, 'shockwaveDamage');
      const nearby = ctx.enemySpatial.queryCircle(t.x, t.z, radius + 4);
      for (const e of nearby) {
        if (!e.alive) continue;
        if (Math.hypot(e.x - t.x, e.z - t.z) <= radius + ctx.enemies.radiusFor(e)) {
          ctx.damage.applyEnemy(e, shockwaveDamage, 'relic');
        }
      }
      count(telemetry, relic.id);
    },
  });

  registry.register({ trigger: 'roadkill', handle: () => undefined });
  registry.register({ trigger: 'phaseDash', handle: () => undefined });
  registry.register({ trigger: 'twinShell', handle: () => undefined });
  registry.register({ trigger: 'capability', handle: () => undefined });
  registry.register({ trigger: 'heal', handle: () => undefined });
  registry.register({ trigger: 'statPercent', handle: () => undefined });
  registry.register({ trigger: 'statFlat', handle: () => undefined });
  registry.register({ trigger: 'magnetMultiplier', handle: () => undefined });
  registry.register({ trigger: 'xpMultiplier', handle: () => undefined });
  registry.register({ trigger: 'incomingDamageReduction', handle: () => undefined });
  registry.register({ trigger: 'outgoingDamageMultiplier', handle: () => undefined });
  registry.register({ trigger: 'conditionalIncomingReduction', handle: () => undefined });
  registry.register({ trigger: 'conditionalOutgoingIncrease', handle: () => undefined });
  registry.register({ trigger: 'dashDamagePercent', handle: () => undefined });
  registry.register({ trigger: 'dashCooldownPercent', handle: () => undefined });
  registry.register({ trigger: 'airControlPercent', handle: () => undefined });
  registry.register({ trigger: 'extraJumps', handle: () => undefined });
  registry.register({ trigger: 'airDashCharges', handle: () => undefined });
  registry.register({ trigger: 'zeroDashCooldown', handle: () => undefined });
  registry.register({ trigger: 'cannonRadiusAndKnockbackPercent', handle: () => undefined });

  return registry;
}

function count(telemetry: ProgressionTelemetry, relicId: string): void {
  telemetry.triggerActivations[relicId] = (telemetry.triggerActivations[relicId] ?? 0) + 1;
}

export type { RelicEffectType };
