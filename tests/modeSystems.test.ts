import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';
import type { ModeDefinition } from '../src/shared/content/schemas/mode';
import { GameModeRegistry } from '../src/shared/core';
import {
  DemoScoreAttackModeDefinition,
  DemoScoreAttackModeRuntime,
  registerDemoScoreAttackMode,
} from '../src/shared/modes/demoScoreAttack';
import { MatchRules } from '../src/shared/rules/matchRules';
import { Match, MatchRuntime } from '../src/shared/sim/match';
import { computeResults } from '../src/shared/sim/results';
import { createSystemContext } from '../src/shared/sim/systems';
import { GAME } from '../src/shared/config';
import { withSeededRandom } from './helpers/demoFixture';

const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../content');
const pack = loadContentPackFromFilesystem(CONTENT_ROOT);

describe('DemoScoreAttackModeDefinition', () => {
  it('reads all mode selections from the content pack', () => {
    const def = new DemoScoreAttackModeDefinition(pack.getMode(pack.modeId), pack);
    expect(def.id).toBe('mode.demoScoreAttack');
    expect(def.objectiveId).toBe('objective.highScore');
    expect(def.scoringId).toBe('scoring.demoScoreAttack');
    expect(def.resultsId).toBe('results.demoScoreAttack');
    expect(def.spawnDirectorId).toBe('spawn.director.demoScoreAttack');
    expect(def.tankId).toBe('tank.default');
    expect(def.loadoutId).toBe('loadout.default');
    expect(def.difficultyId).toBe('difficulty.standard');
  });

  it('registers in a GameModeRegistry and loads through its factory', () => {
    const registry = new GameModeRegistry<ModeDefinition>();
    registerDemoScoreAttackMode(registry, pack);
    expect(registry.has('mode.demoScoreAttack')).toBe(true);
    const loaded = registry.load('mode.demoScoreAttack') as DemoScoreAttackModeDefinition;
    expect(loaded).toBeInstanceOf(DemoScoreAttackModeDefinition);
    expect(loaded.objectiveId).toBe('objective.highScore');
  });
});

describe('DemoScoreAttackModeRuntime', () => {
  it('is selected by MatchRuntime on both content and legacy paths', () => {
    const contentMatch = MatchRuntime.fromContentPack(pack, 'mode-test');
    const legacyMatch = MatchRuntime.fromLegacy('mode-test');
    expect(contentMatch.mode).toBeInstanceOf(DemoScoreAttackModeRuntime);
    expect(legacyMatch.mode).toBeInstanceOf(DemoScoreAttackModeRuntime);
    expect(contentMatch.mode.durationSeconds).toBe(GAME.roundDuration);
    expect(legacyMatch.mode.durationSeconds).toBe(GAME.roundDuration);
    // Match facade exposes the same runtime.
    const m = new Match('mode-test');
    expect(m.runtime.mode).toBeInstanceOf(DemoScoreAttackModeRuntime);
  });

  it('systems behave identically to the pre-extraction Match logic', () => {
    const rules = MatchRules.fromContentPack(pack, 'none');
    const state = new Match('mode-systems').state;
    const ctx = createSystemContext(state, rules, []);

    // ScoreSystem multiplies by the current combo.
    ctx.combo.addContribution('gunner', 3);
    ctx.score.addScore(50, 'KILL');
    expect(state.stats.score).toBe(100); // 50 * 2

    // CapabilitySystem grants and replicates.
    ctx.capabilities.grant('cannon.charge', 'test');
    expect(ctx.capabilities.has('cannon.charge')).toBe(true);
    expect(state.build.capabilities).toEqual(['cannon.charge']);

    // ComboSystem decay resets after the window.
    state.time = rules.scoring.combo.decayTime + 1;
    ctx.combo.step(1 / 30);
    expect(state.combo.multiplier).toBe(1);
    expect(state.combo.points).toBe(0);
  });

  it('round completion transitions to results and computes them via the mode', () => {
    const match = new Match('round-test');
    withSeededRandom(3, () => {
      for (let i = 0; i < 30 * 90 + 5; i++) {
        match.step(1 / 30);
        match.takeEvents();
      }
    });
    expect(match.state.phase).toBe('results');
    expect(match.results).not.toBeNull();
    expect(match.results).toEqual(computeResults(match.state));
    // ResultSystem produced it through the content-driven rules path.
    expect(match.results!.grade).toBe(match.runtime.mode.computeResults().grade);
  });

  it('results select from the content definition and equal computeResults', () => {
    const match = new Match('results-test');
    match.state.stats.score = 9000;
    match.state.stats.kills = 20;
    match.state.stats.chargedCannonShots = 1;
    match.state.stats.fullChargeShots = 1;
    match.state.combo.best = 5;
    match.state.stats.links = 3;
    const fromMode = match.runtime.mode.computeResults();
    expect(fromMode).toEqual(computeResults(match.state));
    expect(fromMode.grade).toBe('A');
    expect(fromMode.title).toBe('Perfectly Coordinated Accident');
  });
});
