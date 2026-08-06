/**
 * Headless Single Player core-loop qualification.
 *
 * Runs the production SP mode (`mode.singlePlayerMainStage`) on a fixed
 * match id and applies deterministic damage to wave leaders and the boss,
 * standing in for a competent player. Records phase/level timing, boss TTK,
 * and kill/XP outcomes. This qualifies the authoritative match flow; it is
 * not a substitute for interactive browser qualification.
 */
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';
import { MatchRuntime } from '../src/shared/sim/matchRuntime';
import { stageViewForMatch } from '../src/shared/monsters/monsterStageView';
import { MAIN_STAGE_CURVE, monsterLevelAtTime } from '../src/shared/monsters/monsterDifficulty';

const PACK = loadContentPackFromFilesystem('content');
const MATCH_ID = process.env.MONSTER_QUALIFY_MATCH_ID ?? 'qualify-fixed-seed';
const DT = 1 / 30;
const ELITE_DPS = 500;
const BOSS_DPS = 220;

interface PhaseMark {
  phase: string;
  at: number;
  level: number;
}

const marks: PhaseMark[] = [];
const levels: Array<{ at: number; level: number }> = [];
const xpByClass: Record<string, number> = {};
let bossWaveAt = -1;
let bossAliveAt = -1;
let bossDeadAt = -1;
const awardedIds = new Set<number>();

function currentLeader(m: MatchRuntime) {
  const horde = m.systems.horde;
  if (!horde || horde.currentWaveId === null) return undefined;
  const runtime = m.systems.waves.waves.get(horde.currentWaveId);
  if (!runtime) return undefined;
  return m.state.enemies.find((e) => e.id === runtime.leaderId && e.alive);
}

function currentBoss(m: MatchRuntime) {
  const bossId = m.systems.monsterSlots?.['selected.boss'];
  if (!bossId) return undefined;
  return m.state.enemies.find((e) => e.defId === bossId && e.alive);
}

const m = MatchRuntime.fromContentPack(PACK, MATCH_ID, 'none', 'mode.singlePlayerMainStage');
let lastPhase = m.systems.stage.state.phase;
let steps = 0;
let damageAccum = 0;

for (; steps < 400 / DT; steps++) {
  m.step(DT);
  const time = m.state.time;
  const stage = m.systems.stage.state;
  const view = stageViewForMatch(m);
  if (view.monster) {
    const at = Math.round(time);
    if (levels.length === 0 || levels[levels.length - 1].at !== at) {
      levels.push({ at, level: view.monster.level });
    }
  }
  if (stage.phase !== lastPhase) {
    marks.push({
      phase: stage.phase,
      at: Math.round(time * 10) / 10,
      level: view.monster?.level ?? 0,
    });
    lastPhase = stage.phase;
  }
  if (stage.phase === 'bossWave' && bossWaveAt < 0) bossWaveAt = time;
  const boss = currentBoss(m);
  if (boss && bossAliveAt < 0) bossAliveAt = time;
  if (boss) {
    damageAccum += BOSS_DPS * DT;
    if (damageAccum >= 1) {
      const dmg = Math.floor(damageAccum);
      damageAccum -= dmg;
      m.systems.damage.applyEnemy(boss, dmg, 'test');
    }
  }
  const leader = currentLeader(m);
  if (leader && stage.phase !== 'bossWave') {
    m.systems.damage.applyEnemy(leader, Math.ceil(ELITE_DPS * DT), 'test');
  }
  for (const e of m.state.enemies) {
    if (e.monster?.xpAwarded && e.monster.rewardClass && !awardedIds.has(e.id)) {
      awardedIds.add(e.id);
      const cls = e.monster.rewardClass;
      xpByClass[cls] = (xpByClass[cls] ?? 0) + e.monster.resolvedRewardXp;
    }
  }
  if (boss && !boss.alive && bossDeadAt < 0) bossDeadAt = time;
  if (m.state.phase === 'results') break;
}

const finalView = stageViewForMatch(m);
console.log(JSON.stringify(
  {
    matchId: MATCH_ID,
    outcome: m.state.matchFlow,
    phase: m.state.phase,
    simSeconds: Math.round(m.state.time * 10) / 10,
    marks,
    levelsAt: [0, 15, 60, 120, 180].map((at) => ({
      at,
      level: monsterLevelAtTime(at, MAIN_STAGE_CURVE),
    })),
    bossWaveAt: bossWaveAt >= 0 ? Math.round(bossWaveAt * 10) / 10 : null,
    bossAliveAt: bossAliveAt >= 0 ? Math.round(bossAliveAt * 10) / 10 : null,
    bossDeadAt: bossDeadAt >= 0 ? Math.round(bossDeadAt * 10) / 10 : null,
    bossTtkSeconds: bossAliveAt >= 0 && bossDeadAt >= 0 ? Math.round((bossDeadAt - bossAliveAt) * 10) / 10 : null,
    kills: m.state.stats.kills,
    xpByClass,
    finalMonster: finalView.monster,
    enemyCountAtEnd: m.state.enemies.length,
  },
  null,
  2,
));

if (m.state.phase !== 'results' || m.state.matchFlow !== 'clear') {
  process.exitCode = 1;
}
