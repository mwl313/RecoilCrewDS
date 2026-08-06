import type { EnemyGameplayRosterDefinition } from '../content/schemas/enemyGameplayRoster';
import type { SelectedMonsterRun } from './monsterRunSelection';

export type MonsterMatchPhase = 'FARMING' | 'BOSS_INTRO' | 'BOSS_ACTIVE' | 'RESULTS';

export interface MonsterRunState {
  phase: MonsterMatchPhase;
  farmingPhaseIndex: 0 | 1 | 2;
  currentMonsterLevel: number;
  nextWaveAt: number;
  bossIntroRemaining: number;
  activeEliteEnemyIds: number[];
  activeBossEnemyId?: number;
  selectedRun: SelectedMonsterRun;
  resultReason?: 'bossDefeated' | 'tankDestroyed';
}

export interface MonsterStageEvent {
  type: 'wave' | 'bossIntro' | 'bossActive' | 'results';
  at: number;
  waveIndex?: 1 | 2;
  bossEnemyId?: string;
  resultReason?: 'bossDefeated' | 'tankDestroyed';
}

export interface MonsterStageConfig {
  phaseDurationSeconds: number;
  bossIntroSeconds: number;
  bossPhaseLevel: number;
}

export const DEFAULT_MONSTER_STAGE_CONFIG: MonsterStageConfig = {
  phaseDurationSeconds: 60,
  bossIntroSeconds: 4,
  bossPhaseLevel: 13,
};

export function createMonsterRunState(
  roster: EnemyGameplayRosterDefinition,
  run: SelectedMonsterRun,
  time = 0,
  config: MonsterStageConfig = DEFAULT_MONSTER_STAGE_CONFIG,
): MonsterRunState {
  return {
    phase: 'FARMING',
    farmingPhaseIndex: 0,
    currentMonsterLevel: 1,
    nextWaveAt: config.phaseDurationSeconds,
    bossIntroRemaining: 0,
    activeEliteEnemyIds: [],
    selectedRun: run,
  };
}

/**
 * Advance the production stage from simulation time. Emits wave/boss events
 * exactly once per transition. The farming clock never pauses for waves.
 * Results only via explicit boss defeat or tank destruction.
 */
export function advanceMonsterStage(
  state: MonsterRunState,
  time: number,
  levelAtTime: (elapsed: number) => number,
  config: MonsterStageConfig = DEFAULT_MONSTER_STAGE_CONFIG,
  out: MonsterStageEvent[] = [],
): MonsterStageEvent[] {
  const pd = config.phaseDurationSeconds;
  state.currentMonsterLevel = levelAtTime(time);
  if (state.phase === 'RESULTS') return out;

  if (state.phase === 'FARMING') {
    const index = Math.min(2, Math.floor(time / pd)) as 0 | 1 | 2;
    state.farmingPhaseIndex = index;
    if (index >= 1 && state.nextWaveAt === pd) {
      state.nextWaveAt = pd * 2;
      out.push({ type: 'wave', at: time, waveIndex: 1 });
    } else if (index >= 2 && state.nextWaveAt === pd * 2) {
      state.nextWaveAt = pd * 3;
      out.push({ type: 'wave', at: time, waveIndex: 2 });
    }
    if (time >= pd * 3) {
      state.phase = 'BOSS_INTRO';
      state.bossIntroRemaining = config.bossIntroSeconds;
      state.nextWaveAt = Number.POSITIVE_INFINITY;
      out.push({ type: 'bossIntro', at: time });
    }
  }

  if (state.phase === 'BOSS_INTRO') {
    const startedAt = pd * 3;
    const elapsed = time - startedAt;
    state.bossIntroRemaining = Math.max(0, config.bossIntroSeconds - elapsed);
    if (state.bossIntroRemaining <= 0) {
      state.phase = 'BOSS_ACTIVE';
      state.bossIntroRemaining = 0;
      out.push({ type: 'bossActive', at: time, bossEnemyId: state.selectedRun.boss.enemyId });
    }
  }
  return out;
}

export function endMonsterStage(
  state: MonsterRunState,
  time: number,
  reason: 'bossDefeated' | 'tankDestroyed',
  out: MonsterStageEvent[] = [],
): MonsterStageEvent[] {
  if (state.phase === 'RESULTS') return out;
  state.phase = 'RESULTS';
  state.resultReason = reason;
  out.push({ type: 'results', at: time, resultReason: reason });
  return out;
}

/** Symbolic selected-slot resolution: spawn content never hardcodes monster IDs. */
export function resolveSelectedSlots(
  roster: EnemyGameplayRosterDefinition,
  run: SelectedMonsterRun,
): Record<string, string> {
  const slots: Record<string, string> = {
    'selected.phase1.closeFodder': run.phases[0].closeFodderEnemyId,
    'selected.phase1.rangedFodder': run.phases[0].rangedFodderEnemyId,
    'selected.phase1.specialist': run.phases[0].specialistEnemyId,
    'selected.phase2.closeFodder': run.phases[1].closeFodderEnemyId,
    'selected.phase2.rangedFodder': run.phases[1].rangedFodderEnemyId,
    'selected.phase2.specialist': run.phases[1].specialistEnemyId,
    'selected.phase3.closeFodder': run.phases[2].closeFodderEnemyId,
    'selected.phase3.rangedFodder': run.phases[2].rangedFodderEnemyId,
    'selected.phase3.specialist': run.phases[2].specialistEnemyId,
    'selected.boss': run.boss.enemyId,
  };
  for (let wave = 0; wave < run.eliteWaves.length; wave++) {
    run.eliteWaves[wave].forEach((elite, i) => {
      slots[`selected.wave${wave + 1}.elite${i}`] = elite.enemyId;
    });
  }
  return slots;
}
