import { describe, expect, it } from 'vitest';
import { loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';
import { Match } from '../../src/shared/sim/match';
import { selectArenaSession } from '../../src/shared/mapgen/arenaSession';
import { resolveMapBundle } from '../../src/shared/mapgen/profiles';
import { phaseFarmingProgress, type StageRuntimeState } from '../../src/shared/stage/stageTypes';
import { stageViewForMatch } from '../../src/shared/monsters/monsterStageView';
import { MAIN_STAGE_CURVE, monsterLevelAtTime } from '../../src/shared/monsters/monsterDifficulty';

const pack = loadContentPackFromFilesystem('content');
const DT = 1 / 30;

function makeMatch(): Match {
  const bundle = resolveMapBundle(pack, 'map.rocketJumpHighlands');
  const session = selectArenaSession({ roomCode: 'PACE', matchIndex: 0, bundle, fallbackBundle: bundle });
  return new Match('timer-pace', 'none', pack, session.world, 'mode.mainStage');
}

function step(m: Match, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    if (m.state.phase === 'running') {
      m.state.tank.integrity = m.runtime.cfg.tank.maxIntegrity;
      m.state.tank.deadT = 0;
    }
    m.step(DT);
    if (m.state.phase === 'running') {
      m.state.tank.integrity = m.runtime.cfg.tank.maxIntegrity;
      m.state.tank.deadT = 0;
    }
  }
}

function killWaveLeader(m: Match): void {
  const horde = m.runtime.systems.horde!;
  const runtime = horde.currentWaveId !== null ? m.runtime.systems.waves.waves.get(horde.currentWaveId) : undefined;
  const leader = runtime ? m.state.enemies.find((e) => e.id === runtime.leaderId && e.alive) : undefined;
  if (!leader) throw new Error('no live wave leader');
  m.runtime.systems.damage.applyEnemy(leader, 99999999, 'test');
  m.step(DT);
}

function stageState(m: Match): StageRuntimeState {
  return m.runtime.systems.stage.state;
}

describe('timer pause, phase pacing, and boss intro (bug-fix phase 4)', () => {
  it('freezes the farming clock at 120 during a 90-second wave 1 and resumes exactly', { timeout: 30_000 }, () => {
    const m = makeMatch();
    step(m, 61);
    const horde = m.runtime.systems.horde!;
    const waveId = horde.currentWaveId!;
    expect(stageState(m).farmingTimeRemaining).toBeCloseTo(120, 4);
    // Keep the elite alive for 90 seconds of wave time.
    step(m, 90);
    expect(stageState(m).phase).toBe('wave1');
    expect(stageState(m).farmingTimeRemaining).toBeCloseTo(120, 4);
    expect(horde.currentWaveId).toBe(waveId);
    // No queued threshold is consumed while the wave is active.
    expect(stageState(m).phase).toBe('wave1');
    killWaveLeader(m);
    expect(stageState(m).phase).toBe('farming2');
    step(m, 1);
    expect(stageState(m).farmingTimeRemaining).toBeLessThan(120);
    expect(stageState(m).farmingTimeRemaining).toBeGreaterThan(118.5);
  });

  it('a 90-second elite wave never advances the monster level and post-wave spawns use the frozen level', { timeout: 30_000 }, () => {
    const m = makeMatch();
    step(m, 61);
    const levelAtWaveStart = stageViewForMatch(m.runtime).monster!.level;
    expect(levelAtWaveStart).toBe(monsterLevelAtTime(61, MAIN_STAGE_CURVE));
    // Hold the elite alive for 90 seconds of wave time.
    step(m, 90);
    expect(stageViewForMatch(m.runtime).monster!.level).toBe(levelAtWaveStart);
    killWaveLeader(m);
    step(m, 0.5);
    // A newly spawned monster locks the same level the HUD reports.
    const def = pack.getEnemy('enemy.quaternius.ninja');
    const e = m.runtime.systems.enemies.spawnEnemyDef(def, m.state.tank.x + 25, m.state.tank.z)!;
    expect(e.monster?.spawnLevel).toBe(levelAtWaveStart);
    expect(stageViewForMatch(m.runtime).monster!.level).toBe(levelAtWaveStart);
  });

  it('HUD monster level equals the authoritative spawn-lock level in farming', { timeout: 30_000 }, () => {
    const m = makeMatch();
    step(m, 20);
    const view = stageViewForMatch(m.runtime);
    const def = pack.getEnemy('enemy.quaternius.ninja');
    const e = m.runtime.systems.enemies.spawnEnemyDef(def, m.state.tank.x + 25, m.state.tank.z)!;
    expect(e.monster?.spawnLevel).toBe(view.monster!.level);
    expect(view.monster!.level).toBe(
      monsterLevelAtTime(m.runtime.systems.stage.state.activeFarmingElapsed, MAIN_STAGE_CURVE),
    );
  });

  it('boss phase stays locked to the authored boss level for HUD and spawns', { timeout: 30_000 }, () => {
    const m = makeMatch();
    step(m, 61);
    killWaveLeader(m);
    step(m, 61);
    killWaveLeader(m);
    stepUntilBossWave(m);
    step(m, 5);
    expect(stageViewForMatch(m.runtime).monster!.level).toBe(MAIN_STAGE_CURVE.bossPhaseLevel);
    const bossDef = pack.getEnemy('enemy.quaternius.ninja-high-detail.boss');
    const e = m.runtime.systems.enemies.spawnEnemyDef(bossDef, m.state.tank.x + 30, m.state.tank.z)!;
    expect(e.monster?.spawnLevel).toBe(MAIN_STAGE_CURVE.bossPhaseLevel);
  });

  it('emits BOSS INCOMING exactly once and BOSS ENGAGED exactly once', { timeout: 30_000 }, () => {
    const m = makeMatch();
    step(m, 61);
    killWaveLeader(m);
    step(m, 61);
    killWaveLeader(m);
    stepUntilBossWave(m);
    const introEvents = m.takeEvents().filter((e) => e.label === 'BOSS INCOMING');
    expect(introEvents.length).toBe(1);
    step(m, 5);
    const engagedEvents = m.takeEvents().filter((e) => e.label === 'BOSS ENGAGED');
    expect(engagedEvents.length).toBe(1);
    // No second BOSS INCOMING at activation.
    expect(m.takeEvents().filter((e) => e.label === 'BOSS INCOMING').length).toBe(0);
  });

  it('freezes the farming clock at 60 during a long wave 2', { timeout: 30_000 }, () => {
    const m = makeMatch();
    step(m, 61);
    killWaveLeader(m);
    step(m, 61);
    expect(stageState(m).phase).toBe('wave2');
    expect(stageState(m).farmingTimeRemaining).toBeCloseTo(60, 4);
    step(m, 90);
    expect(stageState(m).phase).toBe('wave2');
    expect(stageState(m).farmingTimeRemaining).toBeCloseTo(60, 4);
  });

  it('uses active phase-local farming progress (start/mid/end, wave time excluded)', { timeout: 30_000 }, () => {
    const base: StageRuntimeState = {
      phase: 'farming1',
      farmingTimeRemaining: 180,
      totalElapsedTime: 0,
      activeFarmingElapsed: 0,
      phaseActiveFarmingStartedAt: 0,
      bossIntroRemaining: 0,
      activeWaveId: null,
      activeLeaderId: null,
      phaseStartedAt: 0,
      phaseSequence: 0,
    };
    expect(phaseFarmingProgress({ ...base, activeFarmingElapsed: 0 }, 60)).toBe(0);
    expect(phaseFarmingProgress({ ...base, activeFarmingElapsed: 30 }, 60)).toBeCloseTo(0.5, 5);
    expect(phaseFarmingProgress({ ...base, activeFarmingElapsed: 60 }, 60)).toBe(1);
    // Wave time must not count: elapsed frozen while total time advances.
    expect(phaseFarmingProgress({ ...base, activeFarmingElapsed: 30, totalElapsedTime: 120 }, 60)).toBeCloseTo(0.5, 5);
    // Phase 2 starts its own clock at the phase boundary.
    expect(
      phaseFarmingProgress({ ...base, phase: 'farming2', activeFarmingElapsed: 90, phaseActiveFarmingStartedAt: 60 }, 60),
    ).toBeCloseTo(0.5, 5);
  });

  it('defers the boss and escorts until the authoritative intro completes, then spawns exactly once', { timeout: 30_000 }, () => {
    const m = makeMatch();
    step(m, 61);
    killWaveLeader(m);
    step(m, 61);
    killWaveLeader(m);
    stepUntilBossWave(m);
    const stage = stageState(m);
    expect(stage.phase).toBe('bossWave');
    expect(stage.bossIntroRemaining).toBeGreaterThan(0);
    const slots = m.runtime.systems.monsterSlots!;
    const bossDefId = slots['selected.boss'];
    const close = slots['selected.phase3.closeFodder'];
    const ranged = slots['selected.phase3.rangedFodder'];
    const specialist = slots['selected.phase3.specialist'];
    // During the intro: no boss, no escorts, no active wave.
    expect(m.state.enemies.some((e) => e.defId === bossDefId)).toBe(false);
    expect(m.runtime.systems.horde!.currentWaveId).toBeNull();
    // Let the intro expire.
    step(m, 4.5);
    expect(stage.bossIntroRemaining).toBe(0);
    const bossCount = () => m.state.enemies.filter((e) => e.defId === bossDefId && e.alive).length;
    expect(bossCount()).toBe(1);
    const waveId = m.runtime.systems.horde!.currentWaveId;
    const countDef = (defId: string): number => {
      let n = 0;
      for (const e of m.state.enemies) {
        if (e.defId === defId && e.ownership?.waveId === waveId) n++;
      }
      for (const s of m.runtime.systems.hordeSectors.sectors.values()) {
        if (s.enemyDefId === defId && s.waveId === waveId) n += s.count;
      }
      return n;
    };
    const closeCount = countDef(close);
    const rangedCount = countDef(ranged);
    const specialistCount = countDef(specialist);
    expect(closeCount).toBeGreaterThanOrEqual(2);
    expect(rangedCount).toBeGreaterThanOrEqual(1);
    expect(specialistCount).toBeGreaterThanOrEqual(1);
    step(m, 3);
    expect(bossCount()).toBe(1);
  });
});

function stepUntilBossWave(m: Match): void {
  for (let i = 0; i < Math.round(180 / DT); i++) {
    if (m.state.phase === 'running') {
      m.state.tank.integrity = m.runtime.cfg.tank.maxIntegrity;
      m.state.tank.deadT = 0;
    }
    m.step(DT);
    if (m.runtime.systems.stage.state.phase === 'bossWave') return;
  }
  throw new Error('boss wave never reached');
}
