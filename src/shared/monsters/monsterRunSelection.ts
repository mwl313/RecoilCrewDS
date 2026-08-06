import { forkSeed, mulberry32, type Rng } from '../mapgen/prng';
import type { EnemyGameplayRosterDefinition, OrdinaryRosterSlot } from '../content/schemas/enemyGameplayRoster';

export interface SelectedPhaseRoster {
  closeFodderEnemyId: string;
  rangedFodderEnemyId: string;
  specialistEnemyId: string;
}

export interface SelectedFeaturedEncounter {
  identityId: string;
  enemyId: string;
}

export interface SelectedMonsterRun {
  gameplayRosterId: string;
  seed: number;
  phases: [SelectedPhaseRoster, SelectedPhaseRoster, SelectedPhaseRoster];
  eliteWaves: SelectedFeaturedEncounter[][];
  boss: SelectedFeaturedEncounter;
}

/**
 * Deterministic production run selection.
 *
 * Named PRNG streams only (never Math.random):
 * monsterRoster.phase1/2/3, monsterRoster.eliteWave1/2, monsterRoster.boss.
 *
 * Rules:
 * - exactly three slots per phase
 * - no within-phase duplicate identity
 * - no ordinary identity in consecutive phases (Phase 1 may return in Phase 3)
 * - elite identities are unique across waves
 * - the boss is selected from remaining featured identities
 */
export function selectMonsterRun(
  roster: EnemyGameplayRosterDefinition,
  seed: number,
): SelectedMonsterRun {
  const phaseStreams = [
    mulberry32(forkSeed(seed, 'monsterRoster.phase1')),
    mulberry32(forkSeed(seed, 'monsterRoster.phase2')),
    mulberry32(forkSeed(seed, 'monsterRoster.phase3')),
  ];
  const phases: [SelectedPhaseRoster, SelectedPhaseRoster, SelectedPhaseRoster] = [
    { closeFodderEnemyId: '', rangedFodderEnemyId: '', specialistEnemyId: '' },
    { closeFodderEnemyId: '', rangedFodderEnemyId: '', specialistEnemyId: '' },
    { closeFodderEnemyId: '', rangedFodderEnemyId: '', specialistEnemyId: '' },
  ];
  const slots: OrdinaryRosterSlot[] = ['closeFodder', 'rangedFodder', 'specialist'];
  let previousPhase: Record<OrdinaryRosterSlot, string> | null = null;
  for (let phase = 0; phase < 3; phase++) {
    const rng = phaseStreams[phase];
    const current = {} as Record<OrdinaryRosterSlot, string>;
    for (const slot of slots) {
      const candidates = roster.ordinaryCandidates.filter(
        (c) =>
          c.slot === slot &&
          c.phaseWeights[phase] > 0 &&
          (previousPhase === null || c.enemyId !== previousPhase[slot]),
      );
      const selected = weightedPick(rng, candidates, (c) => c.phaseWeights[phase]);
      if (!selected) {
        throw new Error(
          `monster run selection failed: no eligible ${slot} candidate for phase ${phase + 1} (roster ${roster.id})`,
        );
      }
      current[slot] = selected.enemyId;
    }
    phases[phase] = {
      closeFodderEnemyId: current.closeFodder,
      rangedFodderEnemyId: current.rangedFodder,
      specialistEnemyId: current.specialist,
    };
    previousPhase = current;
  }

  const identities = [...roster.featuredIdentities].sort((a, b) =>
    a.identityId < b.identityId ? -1 : a.identityId > b.identityId ? 1 : 0,
  );
  const used = new Set<string>();
  const eliteWaves: SelectedFeaturedEncounter[][] = [];
  for (const wave of [...roster.featuredWaves].sort((a, b) => a.waveIndex - b.waveIndex)) {
    const stream = mulberry32(forkSeed(seed, `monsterRoster.eliteWave${wave.waveIndex}`));
    const waveElites: SelectedFeaturedEncounter[] = [];
    for (let i = 0; i < wave.eliteCount; i++) {
      const available = identities.filter((id) => !used.has(id.identityId));
      const pick = weightedPick(stream, available, (id) => id.selectionWeight);
      if (!pick) {
        throw new Error(`monster run selection failed: insufficient featured pool for wave ${wave.waveIndex} elite`);
      }
      used.add(pick.identityId);
      waveElites.push({ identityId: pick.identityId, enemyId: pick.eliteEnemyId });
    }
    eliteWaves.push(waveElites);
  }

  const bossPool = identities.filter((id) => !used.has(id.identityId));
  const bossStream = mulberry32(forkSeed(seed, 'monsterRoster.boss'));
  const boss = weightedPick(bossStream, bossPool, (id) => id.selectionWeight);
  if (!boss) {
    throw new Error(`monster run selection failed: no featured identity remaining for boss`);
  }

  return {
    gameplayRosterId: roster.id,
    seed,
    phases,
    eliteWaves,
    boss: { identityId: boss.identityId, enemyId: boss.bossEnemyId },
  };
}

function weightedPick<T>(
  rng: Rng,
  candidates: readonly T[],
  weight: (candidate: T) => number,
): T | undefined {
  const weighted = candidates.map((c) => ({ c, w: weight(c) })).filter((e) => e.w > 0);
  if (weighted.length === 0) return undefined;
  const total = weighted.reduce((sum, e) => sum + e.w, 0);
  let roll = rng() * total;
  for (const entry of weighted) {
    roll -= entry.w;
    if (roll <= 0) return entry.c;
  }
  return weighted[weighted.length - 1].c;
}
