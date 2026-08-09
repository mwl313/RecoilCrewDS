import { describe, expect, it } from 'vitest';
import { CLIENT_CONTENT_PACK } from '../../src/generated/contentPack.generated';
import { resolveRelicEffectParameters } from '../../src/shared/progression/relicEffectParameters';
import { RelicStatProjector } from '../../src/shared/progression/relicStatProjector';
import { makeMatch, spawnEnemy } from './helpers';

describe('relic framework hardening', () => {
  it('merges template defaults first and relic overrides second', () => {
    const template = {
      ...CLIENT_CONTENT_PACK.getRelicEffectTemplate('relicEffect.roadkill'),
      parameters: { minimumSpeedRatio: 0.8, baseDamageCoefficient: 0.5, inherited: 7 },
    };
    const effect = {
      templateId: template.id,
      parameters: { baseDamageCoefficient: 1.25 },
    };
    expect(resolveRelicEffectParameters(template, effect)).toEqual({
      minimumSpeedRatio: 0.8,
      baseDamageCoefficient: 1.25,
      inherited: 7,
    });
  });

  it('reset removes the complete projected relic source family', () => {
    const m = makeMatch();
    const projector = new RelicStatProjector(
      m.rules,
      m.rules.relicsById,
      m.rules.relicEffectTemplatesById,
    );
    m.state.teamProgression.relicStacks['relic.hearty_tank'] = 2;
    m.state.teamProgression.relicStacks['relic.magnet_core'] = 1;
    const baseMagnetRadius = m.rules.xpPickupContent!.magnet.baseRadius;
    projector.reproject(m.state.teamProgression);
    expect(m.rules.resolver.resolve('tank.maxIntegrity')).toBe(140);
    expect(m.rules.resolver.resolve('progression.magnetRadius')).toBe(baseMagnetRadius * 1.5);
    projector.reset();
    expect(m.rules.resolver.resolve('tank.maxIntegrity')).toBe(100);
    expect(m.rules.resolver.resolve('progression.magnetRadius')).toBe(baseMagnetRadius);
  });

  it('COVERING FIRE clamps at zero and expired per-enemy state is bounded', () => {
    const m = makeMatch();
    m.state.teamProgression.relicStacks['relic.covering_fire'] = 21;
    for (let id = 1; id <= 2_000; id++) {
      m.systems.progression.registry.markSpeedDebuff(id, 105, 0.5, 0);
    }
    expect(m.systems.progression.enemySpeedMultiplier({ id: 1 } as never)).toBe(0);
    expect(m.systems.progression.registry.size()).toBe(2_000);
    m.systems.progression.registry.prune(1);
    expect(m.systems.progression.registry.size()).toBe(0);
  });

  it('killed enemies are removed from per-target debuff state immediately', () => {
    const m = makeMatch();
    m.state.teamProgression.relicStacks['relic.armor_shred'] = 1;
    const enemy = spawnEnemy(m);
    m.systems.damage.applyEnemy(enemy, 1, 'mg');
    m.eventBus.drain();
    expect(m.systems.progression.registry.size()).toBe(1);
    m.systems.damage.applyEnemy(enemy, 9_999, 'cannon');
    expect(m.systems.progression.registry.size()).toBe(0);
  });

  it('damage trigger handlers receive the authoritative applied amount', () => {
    const m = makeMatch();
    let seen = -1;
    m.systems.progression.registry.register({
      trigger: 'enemySpeedDebuffOnMgHit',
      handle(event) {
        if (event.type === 'damageApplied') seen = event.amount;
      },
    });
    m.state.teamProgression.relicStacks['relic.covering_fire'] = 1;
    const enemy = spawnEnemy(m, 'enemy.scrapBug');
    m.systems.damage.applyEnemy(enemy, 7, 'mg');
    m.eventBus.drain();
    expect(seen).toBe(7);
  });
});
