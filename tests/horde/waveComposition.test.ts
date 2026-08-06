import { describe, expect, it } from 'vitest';
import { loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';
import { Match } from '../../src/shared/sim/match';
import { selectArenaSession } from '../../src/shared/mapgen/arenaSession';
import { resolveMapBundle } from '../../src/shared/mapgen/profiles';

const pack = loadContentPackFromFilesystem('content');
const DT = 1 / 30;

function makeMatch(): Match {
  const bundle = resolveMapBundle(pack, 'map.rocketJumpHighlands');
  const session = selectArenaSession({ roomCode: 'WAVE', matchIndex: 0, bundle, fallbackBundle: bundle });
  return new Match('wave-comp', 'none', pack, session.world, 'mode.mainStage');
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

function stepUntilPhase(m: Match, phase: string, maxSeconds = 240): void {
  for (let i = 0; i < Math.round(maxSeconds / DT); i++) {
    if (m.state.phase === 'running') {
      m.state.tank.integrity = m.runtime.cfg.tank.maxIntegrity;
      m.state.tank.deadT = 0;
    }
    m.step(DT);
    if (m.state.phase === 'running') {
      m.state.tank.integrity = m.runtime.cfg.tank.maxIntegrity;
      m.state.tank.deadT = 0;
    }
    if (m.runtime.systems.stage.state.phase === phase) return;
  }
  throw new Error(
    `phase '${phase}' never reached (at ${m.state.time.toFixed(1)}s phase=${m.runtime.systems.stage.state.phase} rem=${m.runtime.systems.stage.state.farmingTimeRemaining.toFixed(1)})`,
  );
}

function killWaveLeader(m: Match): void {
  const horde = m.runtime.systems.horde!;
  const runtime = horde.currentWaveId !== null ? m.runtime.systems.waves.waves.get(horde.currentWaveId) : undefined;
  const leader = runtime ? m.state.enemies.find((e) => e.id === runtime.leaderId && e.alive) : undefined;
  if (!leader) throw new Error('no live wave leader');
  m.runtime.systems.damage.applyEnemy(leader, 99999999, 'test');
  m.step(DT);
}

function countByDefId(m: Match, waveId: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of m.state.enemies) {
    if (e.ownership?.waveId !== waveId) continue;
    const defId = e.defId ?? '';
    counts.set(defId, (counts.get(defId) ?? 0) + 1);
  }
  // Far enemies are demoted into aggregate sectors; authored counts must
  // survive there with the exact definition identity.
  for (const s of m.runtime.systems.hordeSectors.sectors.values()) {
    if (s.waveId !== waveId) continue;
    counts.set(s.enemyDefId, (counts.get(s.enemyDefId) ?? 0) + s.count);
  }
  return counts;
}

describe('production wave composition (bug-fix phase 1)', () => {
  it('opens wave 1 with every authored pack entry (waveCohort 2/1/1 + farmingCluster 3 close)', { timeout: 30_000 }, () => {
    const m = makeMatch();
    stepUntilPhase(m, 'wave1');
    const horde = m.runtime.systems.horde!;
    expect(horde.currentWaveId).not.toBeNull();
    const waveId = horde.currentWaveId!;
    const slots = m.runtime.systems.monsterSlots!;
    const close = slots['selected.phase.closeFodder'];
    const ranged = slots['selected.phase.rangedFodder'];
    const specialist = slots['selected.phase.specialist'];
    // waveCohort adds 2 close + 1 ranged + 1 specialist; farmingCluster
    // adds 3 close — every authored entry is preserved.
    const cohort = countByDefId(m, waveId);
    expect(cohort.get(close)).toBe(5);
    expect(cohort.get(ranged)).toBe(1);
    expect(cohort.get(specialist)).toBe(1);
    const closeEnemy = m.state.enemies.find((e) => e.defId === close && e.ownership?.waveId === waveId);
    expect(closeEnemy?.ownership?.formationRole).toBe('line');
    const rangedEnemy = m.state.enemies.find((e) => e.defId === ranged && e.ownership?.waveId === waveId);
    expect(rangedEnemy?.ownership?.formationRole).toBe('support');
  });

  it('spawns reinforcements with every authored entry, not only entries[0]', { timeout: 30_000 }, () => {
    const m = makeMatch();
    step(m, 61);
    const horde = m.runtime.systems.horde!;
    const waveId = horde.currentWaveId!;
    const before = countByDefId(m, waveId);
    step(m, 2);
    const after = countByDefId(m, waveId);
    const slots = m.runtime.systems.monsterSlots!;
    const close = slots['selected.phase.closeFodder'];
    const ranged = slots['selected.phase.rangedFodder'];
    expect((after.get(close) ?? 0)).toBeGreaterThan(before.get(close) ?? 0);
    expect((after.get(ranged) ?? 0)).toBeGreaterThan(before.get(ranged) ?? 0);
  });

  it('boss escorts preserve the Phase 3 close/ranged/specialist composition', { timeout: 30_000 }, () => {
    const m = makeMatch();
    step(m, 61);
    killWaveLeader(m);
    step(m, 61);
    killWaveLeader(m);
    stepUntilPhase(m, 'bossWave');
    step(m, 4.2);
    const stage = m.runtime.systems.stage.state;
    expect(stage.phase).toBe('bossWave');
    const horde = m.runtime.systems.horde!;
    const waveId = horde.currentWaveId!;
    const slots = m.runtime.systems.monsterSlots!;
    const close = slots['selected.phase3.closeFodder'];
    const ranged = slots['selected.phase3.rangedFodder'];
    const specialist = slots['selected.phase3.specialist'];
    const bossDefId = slots['selected.boss'];
    const counts = countByDefId(m, waveId);
    expect(counts.get(close)).toBe(2);
    expect(counts.get(ranged)).toBe(1);
    expect(counts.get(specialist)).toBe(1);
    expect(counts.get(bossDefId)).toBe(1);
    const escort = m.state.enemies.find((e) => e.defId === specialist && e.ownership?.waveId === waveId);
    expect(escort?.ownership?.formationRole).toBe('vanguard');
  });
});
