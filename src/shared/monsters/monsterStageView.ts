import type { MatchRuntime } from '../sim/matchRuntime';
import type { HordeEncounterView, HordeMonsterStageView, HordeStageView } from '../net/protocol';
import type { MonsterMatchPhase } from './monsterStage';
import { MAIN_STAGE_CURVE, monsterLevelAtTime } from './monsterDifficulty';
import type { StageRuntimeState } from '../stage/stageTypes';

/** Authoritative boss-intro presentation window (matches monsterPhase). */
const BOSS_INTRO_SECONDS = 4;

/**
 * Authoritative monster match phase derived from the runtime stage. Farming
 * includes both farming phases and elite waves; the boss wave begins with a
 * short intro before the encounter bar takes over.
 */
export function monsterPhaseForStage(stage: StageRuntimeState): MonsterMatchPhase {
  switch (stage.phase) {
    case 'bossWave':
      return stage.totalElapsedTime - stage.phaseStartedAt < BOSS_INTRO_SECONDS
        ? 'BOSS_INTRO'
        : 'BOSS_ACTIVE';
    case 'clear':
    case 'gameOver':
      return 'RESULTS';
    default:
      return 'FARMING';
  }
}

function encountersFor(match: MatchRuntime): HordeEncounterView[] {
  const slots = match.systems.monsterSlots;
  if (!slots) return [];
  const rows: HordeEncounterView[] = [];
  for (const [slotId, enemyId] of Object.entries(slots)) {
    if (!slotId.startsWith('selected.wave') && slotId !== 'selected.boss') continue;
    const def = match.rules.enemies.get(enemyId);
    if (!def) continue;
    const enemy = match.state.enemies.find((e) => e.defId === enemyId);
    rows.push({
      slotId,
      enemyId,
      label: def.label ?? enemyId,
      hp: enemy?.hp ?? 0,
      maxHp: enemy?.maxHp ?? 1,
      alive: enemy?.alive ?? false,
      kind: slotId === 'selected.boss' ? 'boss' : 'elite',
    });
  }
  rows.sort((a, b) =>
    a.kind === b.kind ? (a.slotId < b.slotId ? -1 : 1) : a.kind === 'elite' ? -1 : 1,
  );
  return rows;
}

function monsterBlockFor(
  match: MatchRuntime,
  stage: StageRuntimeState,
): HordeMonsterStageView | undefined {
  if (!match.systems.monsterRun) return undefined;
  const phase = monsterPhaseForStage(stage);
  const curve =
    match.rules.enemyLevelCurves.get('enemyLevelCurve.mainStage') ?? MAIN_STAGE_CURVE;
  const level =
    phase === 'FARMING' ? monsterLevelAtTime(match.state.time, curve) : curve.bossPhaseLevel;
  return { phase, level, encounters: encountersFor(match) };
}

/**
 * One authoritative HUD stage view for both the server (multiplayer
 * replication) and the local Single Player match. Demo matches omit the
 * monster block entirely.
 */
export function stageViewForMatch(match: MatchRuntime): HordeStageView {
  const stage = match.systems.stage.state;
  const horde = match.systems.horde;
  const runtime =
    horde && horde.currentWaveId !== null
      ? match.systems.waves.waves.get(horde.currentWaveId)
      : undefined;
  const leader = runtime ? match.state.enemies.find((e) => e.id === runtime.leaderId) : undefined;
  const monster = monsterBlockFor(match, stage);
  return {
    phase: stage.phase,
    farmingTimeRemaining: stage.farmingTimeRemaining,
    waveId: stage.activeWaveId,
    leaderHp: leader?.hp ?? 0,
    leaderMaxHp: leader?.maxHp ?? 0,
    ...(monster ? { monster } : {}),
  };
}
