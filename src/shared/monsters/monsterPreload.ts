import { ENEMY_ANIMATION_PRESENTATION_PROFILES } from '../../generated/enemyAnimationContent.generated';
import type { ContentPack } from '../content/contentPack';
import { hash32 } from '../mapgen/seed';
import { selectMonsterRun, type SelectedMonsterRun } from './monsterRunSelection';

/**
 * Stage-selective monster asset preload.
 *
 * Only the assets used by the deterministic selected run are resolved:
 * three phase rosters, the selected elites, and the selected boss. Each
 * enemy's presentation profile contributes its near/far/aggregate model
 * asset ids. No optional monster is ever preloaded at generic startup.
 */
export function resolveSelectedPreloadAssetIds(
  pack: ContentPack,
  run: SelectedMonsterRun,
): string[] {
  const ids = new Set<string>();
  const addEnemy = (enemyId: string): void => {
    if (!pack.has('enemies', enemyId)) {
      throw new Error(`selected preload: unknown enemy '${enemyId}'`);
    }
    const def = pack.getEnemy(enemyId);
    const profileId = def.presentationProfileId;
    if (!profileId) {
      throw new Error(`selected preload: enemy '${enemyId}' has no presentation profile`);
    }
    const profile = ENEMY_ANIMATION_PRESENTATION_PROFILES[profileId];
    if (!profile) {
      throw new Error(
        `selected preload: presentation profile '${profileId}' missing from generated animation content`,
      );
    }
    ids.add(profile.nearModelAssetId);
    if (profile.farModelAssetId) ids.add(profile.farModelAssetId);
    if (profile.aggregateModelAssetId) ids.add(profile.aggregateModelAssetId);
  };

  for (const phase of run.phases) {
    addEnemy(phase.closeFodderEnemyId);
    addEnemy(phase.rangedFodderEnemyId);
    addEnemy(phase.specialistEnemyId);
  }
  for (const wave of run.eliteWaves) {
    for (const elite of wave) addEnemy(elite.enemyId);
  }
  addEnemy(run.boss.enemyId);

  return [...ids].sort();
}

/**
 * Deterministically resolve the selected run for a match id without
 * constructing a full MatchRuntime. Returns null for modes without a
 * gameplay roster (Demo stays untouched).
 */
export function resolveSelectedMonsterRun(
  pack: ContentPack,
  matchId: string,
  modeId?: string,
): SelectedMonsterRun | null {
  const selectedModeId = modeId ?? pack.modeId;
  const mode = pack.getMode(selectedModeId);
  const directorId = mode.hordeDirector;
  if (!directorId) return null;
  const director = pack.getHordeDirector(directorId);
  const rosterId = director.gameplayRosterId;
  if (!rosterId) return null;
  const roster = pack.getEnemyGameplayRoster(rosterId);
  return selectMonsterRun(roster, hash32('monster-run', matchId));
}
