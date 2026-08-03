import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BASE_CONFIG, buildMatchConfig } from '../src/shared/config';
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';
import { MatchRules } from '../src/shared/rules/matchRules';
import { statModifier } from '../src/shared/stats/statModifier';
import type { ModifierId } from '../src/shared/types';

const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../content');
const pack = loadContentPackFromFilesystem(CONTENT_ROOT);

const ALL_MODIFIERS: ModifierId[] = [
  'none',
  'doubleBarrel',
  'soapTracks',
  'moonYard',
  'volatileInventory',
  'scrapMagnet',
  'overclocked',
];

describe('MatchRules construction (content and legacy paths)', () => {
  it('content-derived rules deep-equal legacy-derived rules for every modifier', () => {
    for (const modifier of ALL_MODIFIERS) {
      const fromContent = MatchRules.fromContentPack(pack, modifier);
      const fromLegacy = MatchRules.fromLegacyConfig(modifier);
      expect(fromContent.config, modifier).toEqual(fromLegacy.config);
      expect(fromContent.matchConfig, modifier).toEqual(fromLegacy.matchConfig);
      expect(fromContent.duration, modifier).toBe(90);
      expect(fromContent.objective.durationSeconds, modifier).toBe(90);
    }
  });

  it('resolved rules equal the legacy config surface', () => {
    const rules = MatchRules.fromContentPack(pack, 'none');
    expect(rules.config).toEqual(BASE_CONFIG);
    expect(rules.matchConfig).toEqual(buildMatchConfig('none'));
    expect(rules.timeScale).toBe(1);
    expect(rules.difficultyId).toBe('difficulty.standard');
    expect(rules.modeId).toBe('mode.demoScoreAttack');
    expect(rules.packId).toBe('demo');
    expect(rules.contentHash).toBe(pack.hash);
  });

  it('difficulty overrides resolve through the stat service', () => {
    const doubleBarrel = MatchRules.fromContentPack(pack, 'doubleBarrel');
    expect(doubleBarrel.matchConfig.cannonBurst).toBe(2);
    expect(doubleBarrel.matchConfig.cannonCooldown).toBe(2.4);
    expect(doubleBarrel.matchConfig.recoilImpulse).toBe(9.5);
    expect(doubleBarrel.resolver.resolve('match.cannonBurst')).toBe(2);
    const moon = MatchRules.fromContentPack(pack, 'moonYard');
    expect(moon.matchConfig.gravity).toBe(6.5);
    expect(moon.resolver.resolve('match.gravity')).toBe(6.5);
  });
});

describe('MatchRules immutability and revisions', () => {
  it('freezes config, matchConfig, movement blocks, and resolver base', () => {
    const rules = MatchRules.fromContentPack(pack, 'none');
    expect(Object.isFrozen(rules.config)).toBe(true);
    expect(Object.isFrozen(rules.config.tank)).toBe(true);
    expect(Object.isFrozen(rules.matchConfig)).toBe(true);
    const block = rules.movementBlock();
    expect(Object.isFrozen(block)).toBe(true);
    expect(Object.isFrozen(block.tank)).toBe(true);
    expect(Object.isFrozen(rules.resolver.baseBlock)).toBe(true);
    expect(() => {
      (rules.config.tank as { forwardSpeed: number }).forwardSpeed = 99;
    }).toThrow();
  });

  it('modifier changes bump rulesRevision; movement stats bump movementRulesRevision', () => {
    const rules = MatchRules.fromContentPack(pack, 'none');
    const rev0 = rules.rulesRevision;
    const move0 = rules.movementRulesRevision;
    rules.addModifier(statModifier('test.speed', 'tank.forwardSpeed', 'multiply', 1.1, { source: 'test' }));
    expect(rules.rulesRevision).toBe(rev0 + 1);
    expect(rules.movementRulesRevision).toBe(move0 + 1);
    rules.addModifier(statModifier('test.damage', 'weapon.mgDamage', 'multiply', 2, { source: 'test' }));
    expect(rules.rulesRevision).toBe(rev0 + 2);
    expect(rules.movementRulesRevision).toBe(move0 + 1); // not movement-critical
    rules.removeModifier('test.speed');
    expect(rules.movementRulesRevision).toBe(move0 + 2);
  });

  it('config projection and movement block reflect live resolved stats', () => {
    const rules = MatchRules.fromContentPack(pack, 'none');
    const before = rules.config.tank.forwardSpeed;
    rules.addModifier(statModifier('test.speed', 'tank.forwardSpeed', 'multiply', 1.1, { source: 'test' }));
    expect(rules.config.tank.forwardSpeed).toBeCloseTo(before * 1.1, 6);
    const block = rules.movementBlock();
    expect(block.tank.forwardSpeed).toBeCloseTo(before * 1.1, 6);
    expect(block.match.grip).toBe(rules.matchConfig.grip);
    rules.removeModifier('test.speed');
    expect(rules.config.tank.forwardSpeed).toBe(before);
  });

  it('timed modifiers expire through the rules and move the revisions', () => {
    const rules = MatchRules.fromContentPack(pack, 'none');
    const move0 = rules.movementRulesRevision;
    rules.addModifier(statModifier('test.timed', 'tank.forwardSpeed', 'multiply', 2, { source: 'test', durationSeconds: 1 }));
    expect(rules.movementRulesRevision).toBe(move0 + 1);
    rules.updateTimedModifiers(1.1);
    expect(rules.movementRulesRevision).toBe(move0 + 2);
    expect(rules.config.tank.forwardSpeed).toBe(BASE_CONFIG.tank.forwardSpeed);
  });

  it('snapshot exposes pack/mode/revision metadata', () => {
    const rules = MatchRules.fromContentPack(pack, 'moonYard');
    const snapshot = rules.snapshot();
    expect(snapshot.packId).toBe('demo');
    expect(snapshot.packVersion).toBe('1.0.0');
    expect(snapshot.contentHash).toBe(pack.hash);
    expect(snapshot.modeId).toBe('mode.demoScoreAttack');
    expect(snapshot.rulesRevision).toBe(rules.rulesRevision);
    expect(snapshot.movementRulesRevision).toBe(rules.movementRulesRevision);
  });
});

describe('MatchRules per-match isolation', () => {
  it('two rules instances share no mutable state', () => {
    const a = MatchRules.fromContentPack(pack, 'none');
    const b = MatchRules.fromContentPack(pack, 'moonYard');
    expect(a.config).not.toBe(b.config);
    expect(a.matchConfig).not.toBe(b.matchConfig);
    expect(a.resolver).not.toBe(b.resolver);
    expect(a.resolver.baseBlock).not.toBe(b.resolver.baseBlock);
    expect(a.movementBlock().tank).not.toBe(b.movementBlock().tank);
    expect(a.movementBlock().match.gravity).toBe(16);
    expect(b.movementBlock().match.gravity).toBe(6.5);
  });

  it('a modifier added to one match never leaks into another', () => {
    const a = MatchRules.fromContentPack(pack, 'none');
    const b = MatchRules.fromContentPack(pack, 'none');
    const bRev = b.rulesRevision;
    a.addModifier(statModifier('test.speed', 'tank.forwardSpeed', 'multiply', 2, { source: 'test' }));
    expect(a.config.tank.forwardSpeed).toBeCloseTo(36, 6);
    expect(b.config.tank.forwardSpeed).toBe(18);
    expect(b.rulesRevision).toBe(bRev);
    expect(b.movementBlock().tank.forwardSpeed).toBe(18);
  });
});
