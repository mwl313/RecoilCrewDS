export type MonsterMatchPhase = 'FARMING' | 'BOSS_INTRO' | 'BOSS_ACTIVE' | 'RESULTS';

export interface MonsterPhaseConfig {
  farmingSeconds: number;
  bossIntroSeconds: number;
  bossPhaseLevel: number;
}

export interface MonsterPhaseState {
  phase: MonsterMatchPhase;
  /** Time the boss phase began (undefined until BOSS_ACTIVE). */
  bossActiveAt?: number;
  /** Time of victory/defeat (undefined until RESULTS). */
  endedAt?: number;
  victory?: boolean;
}

/**
 * Explicit match flow: FARMING → BOSS_INTRO → BOSS_ACTIVE → RESULTS.
 * Farming ends at `farmingSeconds`; the match does not end there.
 */
export function monsterPhaseAt(
  time: number,
  config: MonsterPhaseConfig,
  state: MonsterPhaseState,
): MonsterMatchPhase {
  if (state.phase === 'RESULTS') return 'RESULTS';
  if (time < config.farmingSeconds) return 'FARMING';
  if (state.phase === 'FARMING' || state.phase === 'BOSS_INTRO') {
    if (time < config.farmingSeconds + config.bossIntroSeconds) return 'BOSS_INTRO';
    return 'BOSS_ACTIVE';
  }
  return state.phase;
}

/** Current monster level: time-driven during farming, boss level thereafter. */
export function monsterLevelForPhase(
  time: number,
  config: MonsterPhaseConfig,
  levelAtTime: (elapsed: number) => number,
): number {
  const phase = monsterPhaseAt(time, config, { phase: 'FARMING' });
  if (phase === 'FARMING') return levelAtTime(time);
  return config.bossPhaseLevel;
}

export function beginBossPhase(state: MonsterPhaseState, time: number): MonsterPhaseState {
  return { ...state, phase: 'BOSS_ACTIVE', bossActiveAt: time };
}

export function endMatch(state: MonsterPhaseState, time: number, victory: boolean): MonsterPhaseState {
  return { ...state, phase: 'RESULTS', endedAt: time, victory };
}

export function resetMonsterPhase(config: MonsterPhaseConfig): MonsterPhaseState {
  return { phase: 'FARMING' };
}
