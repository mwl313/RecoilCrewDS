import { describe, expect, it } from 'vitest';
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';
import { selectMonsterRun } from '../src/shared/monsters/monsterRunSelection';
import {
  advanceMonsterStage,
  createMonsterRunState,
  endMonsterStage,
  resolveSelectedSlots,
  DEFAULT_MONSTER_STAGE_CONFIG,
  type MonsterStageEvent,
} from '../src/shared/monsters/monsterStage';
import { monsterLevelAtTime } from '../src/shared/monsters/monsterDifficulty';

const pack = loadContentPackFromFilesystem('content');
const roster = pack.getEnemyGameplayRoster('enemyGameplayRoster.quaternius.mainStage');
const run = selectMonsterRun(roster, 42);
const curve = {
  levelIntervalSeconds: 15,
  minimumLevel: 1,
  maximumLevel: 13,
  healthMultiplierPerLevel: 1.2,
  damageMultiplierPerLevel: 1.18,
  bossPhaseLevel: 13,
};
const levelAt = (t: number) => monsterLevelAtTime(t, curve);

describe('monster stage timeline', () => {
  it('starts in FARMING phase 0 with the first wave at 60', () => {
    const state = createMonsterRunState(roster, run, 0);
    expect(state.phase).toBe('FARMING');
    expect(state.farmingPhaseIndex).toBe(0);
    expect(state.nextWaveAt).toBe(60);
  });

  it('fires waves at 60 and 120 and never ends at 180', () => {
    const state = createMonsterRunState(roster, run, 0);
    const events: MonsterStageEvent[] = [];
    advanceMonsterStage(state, 59.999, levelAt, DEFAULT_MONSTER_STAGE_CONFIG, events);
    expect(state.phase).toBe('FARMING');
    expect(events).toHaveLength(0);
    advanceMonsterStage(state, 60, levelAt, DEFAULT_MONSTER_STAGE_CONFIG, events);
    expect(events.some((e) => e.type === 'wave' && e.waveIndex === 1)).toBe(true);
    expect(state.phase).toBe('FARMING');
    advanceMonsterStage(state, 120, levelAt, DEFAULT_MONSTER_STAGE_CONFIG, events);
    expect(events.some((e) => e.type === 'wave' && e.waveIndex === 2)).toBe(true);
    expect(state.phase).toBe('FARMING');
    advanceMonsterStage(state, 180, levelAt, DEFAULT_MONSTER_STAGE_CONFIG, events);
    expect(state.phase).toBe('BOSS_INTRO');
    expect(events.some((e) => e.type === 'bossIntro')).toBe(true);
  });

  it('enters boss active after the intro and only ends via explicit result', () => {
    const state = createMonsterRunState(roster, run, 0);
    const events: MonsterStageEvent[] = [];
    advanceMonsterStage(state, 184, levelAt, DEFAULT_MONSTER_STAGE_CONFIG, events);
    expect(state.phase).toBe('BOSS_ACTIVE');
    expect(events.some((e) => e.type === 'bossActive')).toBe(true);
    endMonsterStage(state, 220, 'bossDefeated', events);
    expect(state.phase).toBe('RESULTS');
    expect(state.resultReason).toBe('bossDefeated');
    const defeat = createMonsterRunState(roster, run, 0);
    endMonsterStage(defeat, 45, 'tankDestroyed');
    expect(defeat.phase).toBe('RESULTS');
    expect(defeat.resultReason).toBe('tankDestroyed');
  });

  it('resolves symbolic slots for all phases, elites, and the boss', () => {
    const slots = resolveSelectedSlots(roster, run);
    expect(slots['selected.phase1.closeFodder']).toBe(run.phases[0].closeFodderEnemyId);
    expect(slots['selected.phase3.specialist']).toBe(run.phases[2].specialistEnemyId);
    expect(slots['selected.boss']).toBe(run.boss.enemyId);
    expect(slots['selected.wave1.elite0']).toBe(run.eliteWaves[0][0].enemyId);
    expect(slots['selected.wave2.elite0']).toBe(run.eliteWaves[1][0].enemyId);
    for (const id of Object.values(slots)) expect(pack.has('enemies', id)).toBe(true);
  });

  it('production horde references the gameplay roster', () => {
    const director = pack.getHordeDirector('horde.mainStage.production');
    expect(director.enforceStage).toBe(true);
    expect(director.gameplayRosterId).toBe('enemyGameplayRoster.quaternius.mainStage');
  });
});
