import { describe, expect, it } from 'vitest';
import {
  COMBAT_DISPLAY_SCALE,
  classifyCombatDamageMagnitude,
  formatCombatDamage,
  formatCombatDisplayValue,
  toCombatDisplayValue,
} from '../src/shared/presentation/combatDisplayUnits';
import {
  formatStatAdditive,
  formatUpgradeEffectValue,
  statPresentationMetadata,
} from '../src/shared/presentation/statPresentation';
import { encounterBar } from '../src/client/presentation/hudViewModel';
import { presentLevelUpgradeSummary } from '../src/client/tactical/statPresentation';
import { Match } from '../src/shared/sim/match';
import { CLIENT_CONTENT_PACK } from '../src/generated/contentPack.generated';
import { createStaticArenaWorld } from '../src/shared/sim/arenaWorld';

describe('combat display units', () => {
  it('converts and formats raw combat values once with separators', () => {
    expect(COMBAT_DISPLAY_SCALE).toBe(10);
    expect(toCombatDisplayValue(7)).toBe(70);
    expect(toCombatDisplayValue(10)).toBe(100);
    expect(formatCombatDisplayValue(850)).toBe('8,500');
    expect(formatCombatDamage(19)).toBe('-190');
    expect(formatCombatDamage(10)).toBe('-100');
  });

  it('classifies visual weight from internal HP loss', () => {
    expect(classifyCombatDamageMagnitude(2)).toBe('LIGHT');
    expect(classifyCombatDamageMagnitude(7)).toBe('STANDARD');
    expect(classifyCombatDamageMagnitude(12)).toBe('HEAVY');
    expect(classifyCombatDamageMagnitude(60)).toBe('MASSIVE');
  });
});

describe('combat health presentation', () => {
  const encounter = (kind: 'elite' | 'boss') => encounterBar({
    slotId: `selected.${kind}`,
    enemyId: `enemy.${kind}`,
    label: kind.toUpperCase(),
    hp: 623,
    maxHp: 850,
    alive: true,
    kind,
  });

  it.each(['boss', 'elite'] as const)('scales %s numbers but keeps its internal ratio', (kind) => {
    const bar = encounter(kind);
    expect(bar.displayHp).toBe(6_230);
    expect(bar.displayMaxHp).toBe(8_500);
    expect(bar.hpText).toBe('6,230 / 8,500');
    expect(bar.ratio).toBeCloseTo(623 / 850);
  });

  it('is role-agnostic for identical SP/MP internal values', () => {
    const internalValue = 19;
    const singlePlayer = formatCombatDamage(internalValue);
    const multiplayerDriver = formatCombatDamage(internalValue);
    const multiplayerGunner = formatCombatDamage(internalValue);
    expect([singlePlayer, multiplayerDriver, multiplayerGunner]).toEqual(['-190', '-190', '-190']);
  });
});

describe('upgrade and tactical stat units', () => {
  it('scales absolute combat additions and leaves percentages alone', () => {
    expect(statPresentationMetadata('weapon.cannonDamage').unit).toBe('combatDamage');
    expect(formatStatAdditive('weapon.cannonDamage', 5)).toBe('+50');
    expect(formatUpgradeEffectValue({ statId: 'weapon.cannonDamage', operation: 'add', value: 5 })).toBe('+50');
    expect(formatUpgradeEffectValue({ statId: 'weapon.cannonDamage', operation: 'multiply', value: 1.15 })).toBe('+15%');
    expect(formatUpgradeEffectValue({ statId: 'tank.dashCooldown', operation: 'add', value: .5 })).toBe('+0.5');
  });

  it('uses the same combat-unit metadata for tactical status', () => {
    const [row] = presentLevelUpgradeSummary([
      { statId: 'tank.maxIntegrity', additiveTotal: 40, multiplierProduct: 1.18, effectCount: 2 },
    ]);
    expect(row?.primary).toBe('+400 · ×1.18');
  });
});

describe('network and simulation authority', () => {
  it('keeps authoritative hit events in internal units', () => {
    const match = new Match('display-units-network', 'none', CLIENT_CONTENT_PACK, createStaticArenaWorld());
    const enemy = match.runtime.systems.enemies.spawnEnemy('scrapBug', 5, 5)!;
    enemy.hp = 100;
    enemy.maxHp = 100;
    match.runtime.systems.damage.applyEnemy(enemy, 19, 'cannon');
    const hit = match.takeEvents().find((event) => event.type === 'hit' && event.id === enemy.id);
    expect(hit?.value).toBe(19);
    expect(formatCombatDamage(hit?.value ?? 0)).toBe('-190');
  });
});
