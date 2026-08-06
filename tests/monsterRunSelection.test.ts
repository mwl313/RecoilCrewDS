import { describe, expect, it } from 'vitest';
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';
import { selectMonsterRun } from '../src/shared/monsters/monsterRunSelection';
import { enemyGameplayRosterSchema } from '../src/shared/content/schemas/enemyGameplayRoster';

const pack = loadContentPackFromFilesystem('content');
const roster = pack.getEnemyGameplayRoster('enemyGameplayRoster.quaternius.mainStage');

function flatten(phase: ReturnType<typeof selectMonsterRun>['phases'][number]) {
  return [phase.closeFodderEnemyId, phase.rangedFodderEnemyId, phase.specialistEnemyId];
}

describe('monster run selection', () => {
  it('same seed reproduces the same run; different seeds vary', () => {
    const a = selectMonsterRun(roster, 1234);
    const b = selectMonsterRun(roster, 1234);
    const c = selectMonsterRun(roster, 9876);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it('selects exactly three slots per phase with no within-phase duplicates', () => {
    for (const seed of [1, 42, 777, 20260802]) {
      const run = selectMonsterRun(roster, seed);
      for (const phase of run.phases) {
        expect(new Set([phase.closeFodderEnemyId, phase.rangedFodderEnemyId, phase.specialistEnemyId]).size).toBe(3);
        expect(pack.has('enemies', phase.closeFodderEnemyId)).toBe(true);
        expect(pack.has('enemies', phase.rangedFodderEnemyId)).toBe(true);
        expect(pack.has('enemies', phase.specialistEnemyId)).toBe(true);
      }
    }
  });

  it('never repeats an ordinary identity in consecutive phases', () => {
    for (let seed = 0; seed < 40; seed++) {
      const run = selectMonsterRun(roster, seed);
      const p1 = flatten(run.phases[0]);
      const p2 = flatten(run.phases[1]);
      const p3 = flatten(run.phases[2]);
      expect(p1.some((id) => p2.includes(id))).toBe(false);
      expect(p2.some((id) => p3.includes(id))).toBe(false);
    }
  });

  it('allows a Phase 1 identity to return in Phase 3 when feasible', () => {
    let found = false;
    for (let seed = 0; seed < 500 && !found; seed++) {
      const run = selectMonsterRun(roster, seed);
      const p1 = flatten(run.phases[0]);
      const p3 = flatten(run.phases[2]);
      if (p1.some((id) => p3.includes(id))) found = true;
    }
    expect(found).toBe(true);
  });

  it('elites are unique and the boss never matches an elite', () => {
    for (let seed = 0; seed < 40; seed++) {
      const run = selectMonsterRun(roster, seed);
      const eliteIds = run.eliteWaves.flat().map((e) => e.identityId);
      expect(new Set(eliteIds).size).toBe(eliteIds.length);
      expect(eliteIds).not.toContain(run.boss.identityId);
      expect(pack.has('enemies', run.boss.enemyId)).toBe(true);
      for (const wave of run.eliteWaves) {
        for (const elite of wave) expect(pack.has('enemies', elite.enemyId)).toBe(true);
      }
    }
  });

  it('uses the one-elite default and supports two elites via JSON only', () => {
    expect(roster.featuredWaves.map((w) => w.eliteCount)).toEqual([1, 1]);
    const two = {
      ...roster,
      featuredWaves: [
        { waveIndex: 1, eliteCount: 2 },
        { waveIndex: 2, eliteCount: 1 },
      ] as { waveIndex: 1 | 2; eliteCount: number }[],
    };
    const run = selectMonsterRun(two, 42);
    expect(run.eliteWaves[0]).toHaveLength(2);
    expect(run.eliteWaves[1]).toHaveLength(1);
    const allElites = run.eliteWaves.flat().map((e) => e.identityId);
    expect(new Set(allElites).size).toBe(3);
    expect(allElites).not.toContain(run.boss.identityId);
  });

  it('zero-weight candidates are never selected', () => {
    const narrow = {
      ...roster,
      ordinaryCandidates: roster.ordinaryCandidates.map((c) =>
        c.enemyId === 'enemy.quaternius.ninja'
          ? { ...c, phaseWeights: [0, 0, 0] as [number, number, number] }
          : c,
      ),
    };
    for (let seed = 0; seed < 30; seed++) {
      const run = selectMonsterRun(narrow, seed);
      const all = [...flatten(run.phases[0]), ...flatten(run.phases[1]), ...flatten(run.phases[2])];
      expect(all).not.toContain('enemy.quaternius.ninja');
    }
  });

  it('rejects an insufficient featured pool at schema time', () => {
    const bad = {
      ...roster,
      featuredIdentities: roster.featuredIdentities.slice(0, 2),
      featuredWaves: [
        { waveIndex: 1, eliteCount: 2 },
        { waveIndex: 2, eliteCount: 2 },
      ],
    };
    expect(enemyGameplayRosterSchema.safeParse(bad).success).toBe(false);
  });
});
