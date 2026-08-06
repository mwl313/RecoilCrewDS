import { describe, expect, it } from 'vitest';
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';
import { selectMonsterRun } from '../src/shared/monsters/monsterRunSelection';
import {
  resolveSelectedMonsterRun,
  resolveSelectedPreloadAssetIds,
} from '../src/shared/monsters/monsterPreload';
import { PRESENTATION_ASSET_CATALOG } from '../src/generated/presentationContent.generated';
import { ENEMY_ANIMATION_PRESENTATION_PROFILES } from '../src/generated/enemyAnimationContent.generated';

const pack = loadContentPackFromFilesystem('content');
const roster = pack.getEnemyGameplayRoster('enemyGameplayRoster.quaternius.mainStage');

describe('selected monster asset preload', () => {
  it('resolves the near/far/aggregate assets for every selected enemy', () => {
    const run = selectMonsterRun(roster, 42);
    const ids = resolveSelectedPreloadAssetIds(pack, run);
    expect(ids.length).toBeGreaterThan(0);
    const projectIds = new Set(
      PRESENTATION_ASSET_CATALOG.project.filter((a) => a.kind === 'model').map((a) => a.id),
    );
    for (const id of ids) {
      expect(projectIds.has(id), `asset '${id}' must be a registered project model`).toBe(true);
    }
    // The run resolves at least one presentation profile per selected enemy.
    const expectedEnemies = new Set<string>();
    for (const phase of run.phases) {
      expectedEnemies.add(phase.closeFodderEnemyId);
      expectedEnemies.add(phase.rangedFodderEnemyId);
      expectedEnemies.add(phase.specialistEnemyId);
    }
    for (const wave of run.eliteWaves) for (const e of wave) expectedEnemies.add(e.enemyId);
    expectedEnemies.add(run.boss.enemyId);
    for (const enemyId of expectedEnemies) {
      const profileId = pack.getEnemy(enemyId).presentationProfileId!;
      const profile = ENEMY_ANIMATION_PRESENTATION_PROFILES[profileId];
      expect(ids).toContain(profile.nearModelAssetId);
    }
  });

  it('is deterministic per seed and does not preload the entire roster', () => {
    const a = resolveSelectedPreloadAssetIds(pack, selectMonsterRun(roster, 42));
    const b = resolveSelectedPreloadAssetIds(pack, selectMonsterRun(roster, 42));
    expect(b).toEqual(a);
    const other = resolveSelectedPreloadAssetIds(pack, selectMonsterRun(roster, 4242));
    const allOptional = PRESENTATION_ASSET_CATALOG.project.filter(
      (x) => x.kind === 'model' && x.optional === true,
    );
    expect(a.length).toBeLessThan(allOptional.length);
    expect(other.length).toBeLessThan(allOptional.length);
  });

  it('derives the same run as MatchRuntime from the match id', () => {
    const resolved = resolveSelectedMonsterRun(pack, 'prod-preload', 'mode.mainStage');
    expect(resolved).not.toBeNull();
    const again = resolveSelectedMonsterRun(pack, 'prod-preload', 'mode.mainStage');
    expect(again).toEqual(resolved);
    const other = resolveSelectedMonsterRun(pack, 'prod-preload-2', 'mode.mainStage');
    expect(other).not.toBeNull();
  });

  it('returns null for demo modes without a gameplay roster', () => {
    expect(resolveSelectedMonsterRun(pack, 'demo-match', 'mode.demoScoreAttack')).toBeNull();
    expect(resolveSelectedMonsterRun(pack, 'demo-match', 'mode.singlePlayerScoreAttack')).toBeNull();
  });
});
