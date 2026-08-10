import { isValidAssetId } from '../assetRegistry';
import { isKnownStat } from '../stats/statIds';
import {
  RELIC_EFFECT_TYPES,
  type FirstTreasureRuleDefinition,
  type ProgressionDefinition,
  type ProgressionModePolicyDefinition,
  type RelicDefinition,
  type RelicEffectTemplateDefinition,
  type RelicPoolDefinition,
  type TreasureRarityTableDefinition,
  type UpgradeCategoryDefinition,
  type UpgradeFirstExperienceDefinition,
  type UpgradeRarityTableDefinition,
} from './schemas/progression';
import type { PackManifest } from './schemas/pack';
import type { CategoryRegistries } from './contentPack';
import { BehaviorRegistry } from './behaviorRegistry';
import { ContentValidationError } from './errors';

/**
 * Cross-file reference, behavior, stat, and asset validation. Collects every
 * issue it can find instead of stopping at the first, so error messages are
 * actionable: `file: json.path — reason`.
 */
export class ReferenceValidator {
  constructor(
    private readonly registries: CategoryRegistries,
    private readonly behaviors: BehaviorRegistry,
    private readonly statIds: ReadonlySet<string>,
  ) {}

  validate(manifest: PackManifest): void {
    const issues: string[] = [];

    this.ref(issues, manifest.pack.mode, this.registries.modes, 'manifest.json', 'pack.mode');

    for (const mode of this.registries.modes.all()) {
      const file = this.fileOf(mode.id, this.registries.modes);
      this.checkCommon(issues, mode, file);
      this.ref(issues, mode.difficulty, this.registries.difficulties, file, 'difficulty');
      this.ref(issues, mode.tank, this.registries.tanks, file, 'tank');
      this.ref(issues, mode.loadout, this.registries.loadouts, file, 'loadout');
      this.ref(issues, mode.spawnDirector, this.registries.spawnDirectors, file, 'spawnDirector');
      if (mode.hordeDirector) {
        this.ref(issues, mode.hordeDirector, this.registries.hordeDirectors, file, 'hordeDirector');
      }
      this.ref(issues, mode.scoring, this.registries.scoring, file, 'scoring');
      this.ref(issues, mode.results, this.registries.results, file, 'results');
      this.ref(issues, mode.presentation, this.registries.presentation, file, 'presentation');
      mode.objectives.forEach((id, i) => this.ref(issues, id, this.registries.objectives, file, `objectives[${i}]`));
      mode.rematch?.modifiers.forEach((id, i) => this.ref(issues, id, this.registries.difficulties, file, `rematch.modifiers[${i}]`));
    }

    for (const objective of this.registries.objectives.all()) {
      const file = this.fileOf(objective.id, this.registries.objectives);
      this.checkCommon(issues, objective, file);
      if (objective.scoring) this.ref(issues, objective.scoring, this.registries.scoring, file, 'scoring');
      if (objective.results) this.ref(issues, objective.results, this.registries.results, file, 'results');
      if (objective.spawnDirector) this.ref(issues, objective.spawnDirector, this.registries.spawnDirectors, file, 'spawnDirector');
    }

    for (const loadout of this.registries.loadouts.all()) {
      const file = this.fileOf(loadout.id, this.registries.loadouts);
      this.checkCommon(issues, loadout, file);
      this.ref(issues, loadout.primary, this.registries.weapons, file, 'primary');
      this.ref(issues, loadout.secondary, this.registries.weapons, file, 'secondary');
      if (loadout.ability) {
        this.ref(issues, loadout.ability, this.registries.weapons, file, 'ability');
      }
    }

    for (const map of this.registries.maps.all()) {
      const file = this.fileOf(map.id, this.registries.maps);
      this.checkCommon(issues, map, file);
      this.ref(issues, map.terrainProfileId, this.registries.terrainProfiles, file, 'terrainProfileId');
      this.ref(issues, map.terrainMaterialProfileId, this.registries.terrainMaterialProfiles, file, 'terrainMaterialProfileId');
      this.ref(issues, map.validationProfileId, this.registries.validationProfiles, file, 'validationProfileId');
      this.ref(issues, map.furnitureSetId, this.registries.furnitureSets, file, 'furnitureSetId');
      this.ref(issues, map.densityProfileId, this.registries.densityProfiles, file, 'densityProfileId');
      if (map.fallbackMapId) {
        this.ref(issues, map.fallbackMapId, this.registries.maps, file, 'fallbackMapId');
      }
    }
    for (const terrain of this.registries.terrainProfiles.all()) {
      this.checkCommon(issues, terrain, this.fileOf(terrain.id, this.registries.terrainProfiles));
    }
    for (const material of this.registries.terrainMaterialProfiles.all()) {
      this.checkCommon(issues, material, this.fileOf(material.id, this.registries.terrainMaterialProfiles));
    }
    for (const validation of this.registries.validationProfiles.all()) {
      this.checkCommon(issues, validation, this.fileOf(validation.id, this.registries.validationProfiles));
    }
    for (const set of this.registries.furnitureSets.all()) {
      const file = this.fileOf(set.id, this.registries.furnitureSets);
      this.checkCommon(issues, set, file);
      set.landmarks.forEach((id, i) => this.ref(issues, id, this.registries.landmarks, file, `landmarks[${i}]`));
    }
    for (const landmark of this.registries.landmarks.all()) {
      this.checkCommon(issues, landmark, this.fileOf(landmark.id, this.registries.landmarks));
    }
    for (const density of this.registries.densityProfiles.all()) {
      this.checkCommon(issues, density, this.fileOf(density.id, this.registries.densityProfiles));
    }

    for (const enemy of this.registries.enemies.all()) {
      const enemyFile = this.fileOf(enemy.id, this.registries.enemies);
      if (enemy.type === 'monster') {
        this.checkCommon(issues, enemy, enemyFile, { skipStats: true });
        if (!enemy.presentationProfileId.startsWith('enemyPresentation.')) {
          issues.push(`${enemyFile}: presentationProfileId — must start with enemyPresentation.`);
        }
        if (!enemy.animationProfileId.startsWith('enemyAnimation.')) {
          issues.push(`${enemyFile}: animationProfileId — must start with enemyAnimation.`);
        }
        if (enemy.attack.type === 'ranged') {
          this.ref(issues, enemy.attack.projectileId, this.registries.projectiles, enemyFile, 'attack.projectileId');
        }
        if (enemy.attack.type === 'melee') {
          this.ref(
            issues,
            enemy.attack.engagementProfileId,
            this.registries.meleeEngagementProfiles,
            enemyFile,
            'attack.engagementProfileId',
          );
        }
        if (enemy.attack.type === 'mixed') {
          for (const pattern of enemy.attack.patterns) {
            if (pattern.type === 'ranged') {
              this.ref(
                issues,
                pattern.projectileId,
                this.registries.projectiles,
                enemyFile,
                `attack.patterns.${pattern.id}.projectileId`,
              );
            }
          }
        }
      } else {
        this.checkCommon(issues, enemy, enemyFile);
      }
      if (enemy.dropTableId) {
        this.ref(issues, enemy.dropTableId, this.registries.dropTables, enemyFile, 'dropTableId');
      }
      enemy.behaviors.forEach((behavior, i) => {
        if (!this.behaviors.has(behavior.id)) {
          issues.push(`${enemyFile}: behaviors[${i}].id — unknown enemy behavior '${behavior.id}'`);
        }
      });
    }
    for (const curve of this.registries.enemyLevelCurves.all()) {
      this.checkCommon(issues, curve, this.fileOf(curve.id, this.registries.enemyLevelCurves));
      if (curve.maximumLevel < curve.minimumLevel) {
        issues.push(`${this.fileOf(curve.id, this.registries.enemyLevelCurves)}: maximumLevel below minimumLevel`);
      }
    }
    for (const rewards of this.registries.enemyXpRewards.all()) {
      this.checkCommon(issues, rewards, this.fileOf(rewards.id, this.registries.enemyXpRewards));
    }
    for (const roster of this.registries.enemyGameplayRosters.all()) {
      const file = this.fileOf(roster.id, this.registries.enemyGameplayRosters);
      this.checkCommon(issues, roster, file);
      for (const candidate of roster.ordinaryCandidates) {
        const def = this.registries.enemies.get(candidate.enemyId);
        if (!def) {
          issues.push(`${file}: ordinaryCandidates.${candidate.enemyId} — unknown enemy reference`);
          continue;
        }
        if (def.type !== 'monster') {
          issues.push(`${file}: ordinaryCandidates.${candidate.enemyId} — must be a generalized monster`);
          continue;
        }
        const okSlot =
          candidate.slot === 'closeFodder'
            ? def.tier === 'fodder' && def.attack.type === 'melee'
            : candidate.slot === 'rangedFodder'
              ? def.tier === 'fodder' && def.attack.type === 'ranged'
              : def.tier === 'specialist';
        if (!okSlot) {
          issues.push(`${file}: ordinaryCandidates.${candidate.enemyId} — tier/attack does not match slot '${candidate.slot}'`);
        }
      }
      for (const identity of roster.featuredIdentities) {
        const elite = this.registries.enemies.get(identity.eliteEnemyId);
        if (!elite || elite.type !== 'monster' || elite.tier !== 'elite') {
          issues.push(`${file}: featuredIdentities.${identity.identityId}.eliteEnemyId — must reference an elite monster`);
        }
        const boss = this.registries.enemies.get(identity.bossEnemyId);
        if (!boss || boss.type !== 'monster' || boss.tier !== 'boss') {
          issues.push(`${file}: featuredIdentities.${identity.identityId}.bossEnemyId — must reference a boss monster`);
        }
      }
    }
    for (const profile of this.registries.meleeEngagementProfiles.all()) {
      this.checkCommon(issues, profile, this.fileOf(profile.id, this.registries.meleeEngagementProfiles));
      if (profile.maximumSlots < profile.minimumSlots) {
        issues.push(`${this.fileOf(profile.id, this.registries.meleeEngagementProfiles)}: maximumSlots below minimumSlots`);
      }
    }

    for (const dropTable of this.registries.dropTables.all()) {
      this.checkCommon(issues, dropTable, this.fileOf(dropTable.id, this.registries.dropTables));
    }
    for (const pickup of this.registries.pickups.all()) {
      this.checkCommon(issues, pickup, this.fileOf(pickup.id, this.registries.pickups));
    }

    for (const spawn of this.registries.spawnDirectors.all()) {
      const file = this.fileOf(spawn.id, this.registries.spawnDirectors);
      this.checkCommon(issues, spawn, file);
      spawn.initialSpawns.forEach((s, i) => this.ref(issues, s.type, this.registries.enemies, file, `initialSpawns[${i}].type`));
    }

    for (const director of this.registries.hordeDirectors.all()) {
      const file = this.fileOf(director.id, this.registries.hordeDirectors);
      this.checkCommon(issues, director, file);
      this.ref(issues, director.stageSequenceId, this.registries.stageSequences, file, 'stageSequenceId');
      this.ref(issues, director.limitsId, this.registries.populationLimits, file, 'limitsId');
      this.ref(issues, director.lodPolicyId, this.registries.enemyLodPolicies, file, 'lodPolicyId');
      this.ref(issues, director.replicationPolicyId, this.registries.hordeReplicationPolicies, file, 'replicationPolicyId');
      this.ref(issues, director.navigationPolicyId, this.registries.hordeNavigationPolicies, file, 'navigationPolicyId');
      this.ref(issues, director.spawnAnchorPolicyId, this.registries.spawnAnchorPolicies, file, 'spawnAnchorPolicyId');
      this.ref(issues, director.bossWaveId, this.registries.bossWaves, file, 'bossWaveId');
      if (director.gameplayRosterId) {
        this.ref(issues, director.gameplayRosterId, this.registries.enemyGameplayRosters, file, 'gameplayRosterId');
      }
      director.farmingPhaseIds.forEach((id, i) => this.ref(issues, id, this.registries.farmingPhases, file, `farmingPhaseIds[${i}]`));
      director.waveIds.forEach((id, i) => this.ref(issues, id, this.registries.waves, file, `waveIds[${i}]`));
      director.packIds.forEach((id, i) => this.ref(issues, id, this.registries.spawnPacks, file, `packIds[${i}]`));
      if (director.gameplayRosterId) {
        this.ref(issues, director.gameplayRosterId, this.registries.enemyGameplayRosters, file, 'gameplayRosterId');
      }
    }
    for (const phase of this.registries.farmingPhases.all()) {
      this.checkCommon(issues, phase, this.fileOf(phase.id, this.registries.farmingPhases));
    }
    for (const pack of this.registries.spawnPacks.all()) {
      const file = this.fileOf(pack.id, this.registries.spawnPacks);
      this.checkCommon(issues, pack, file);
      pack.entries.forEach((entry, i) => {
        if (entry.enemyId) {
          this.ref(issues, entry.enemyId, this.registries.enemies, file, `entries[${i}].enemyId`);
        }
      });
    }
    for (const wave of this.registries.waves.all()) {
      const file = this.fileOf(wave.id, this.registries.waves);
      this.checkCommon(issues, wave, file);
      if (wave.leaderEnemyId) {
        this.ref(issues, wave.leaderEnemyId, this.registries.enemies, file, 'leaderEnemyId');
      }
      this.ref(issues, wave.approachPolicyId, this.registries.hordeNavigationPolicies, file, 'approachPolicyId');
      this.ref(issues, wave.rewardTableId, this.registries.rewardTables, file, 'rewardTableId');
      wave.openingPackIds.forEach((id, i) => this.ref(issues, id, this.registries.spawnPacks, file, `openingPackIds[${i}]`));
      wave.reinforcementPackIds.forEach((id, i) => this.ref(issues, id, this.registries.spawnPacks, file, `reinforcementPackIds[${i}]`));
    }
    for (const boss of this.registries.bossWaves.all()) {
      const file = this.fileOf(boss.id, this.registries.bossWaves);
      this.checkCommon(issues, boss, file);
      if (boss.leaderEnemyId) {
        this.ref(issues, boss.leaderEnemyId, this.registries.enemies, file, 'leaderEnemyId');
      }
      if (boss.bossEnemyId) {
        this.ref(issues, boss.bossEnemyId, this.registries.enemies, file, 'bossEnemyId');
      }
      this.ref(issues, boss.approachPolicyId, this.registries.hordeNavigationPolicies, file, 'approachPolicyId');
      this.ref(issues, boss.rewardTableId, this.registries.rewardTables, file, 'rewardTableId');
      boss.openingPackIds.forEach((id, i) => this.ref(issues, id, this.registries.spawnPacks, file, `openingPackIds[${i}]`));
      boss.reinforcementPackIds.forEach((id, i) => this.ref(issues, id, this.registries.spawnPacks, file, `reinforcementPackIds[${i}]`));
    }
    for (const policy of [
      ...this.registries.spawnAnchorPolicies.all(),
      ...this.registries.hordeNavigationPolicies.all(),
      ...this.registries.enemyLodPolicies.all(),
      ...this.registries.hordeReplicationPolicies.all(),
      ...this.registries.populationLimits.all(),
      ...this.registries.stageSequences.all(),
      ...this.registries.rewardTables.all(),
    ]) {
      const registryFor =
        this.registries.spawnAnchorPolicies.has(policy.id)
          ? this.registries.spawnAnchorPolicies
          : this.registries.hordeNavigationPolicies.has(policy.id)
            ? this.registries.hordeNavigationPolicies
            : this.registries.enemyLodPolicies.has(policy.id)
              ? this.registries.enemyLodPolicies
              : this.registries.hordeReplicationPolicies.has(policy.id)
                ? this.registries.hordeReplicationPolicies
                : this.registries.populationLimits.has(policy.id)
                  ? this.registries.populationLimits
                  : this.registries.stageSequences.has(policy.id)
                    ? this.registries.stageSequences
                    : this.registries.rewardTables;
      this.checkCommon(issues, policy, this.fileOf(policy.id, registryFor));
    }

    for (const scoring of this.registries.scoring.all()) {
      const file = this.fileOf(scoring.id, this.registries.scoring);
      this.checkCommon(issues, scoring, file);
      for (const enemyId of Object.keys(scoring.enemyScores)) {
        this.ref(issues, enemyId, this.registries.enemies, file, `enemyScores.${enemyId}`);
      }
    }

    for (const results of this.registries.results.all()) {
      const file = this.fileOf(results.id, this.registries.results);
      this.checkCommon(issues, results, file);
    }

    for (const difficulty of this.registries.difficulties.all()) {
      const file = this.fileOf(difficulty.id, this.registries.difficulties);
      this.checkCommon(issues, difficulty, file);
      if (difficulty.overrides) {
        for (const key of Object.keys(difficulty.overrides)) {
          if (!key.startsWith('match.') && !key.startsWith('tank.')) {
            issues.push(`${file}: overrides.${key} — override keys must be match.* or tank.* stat ids`);
          } else if (!this.statIds.has(key)) {
            issues.push(`${file}: overrides.${key} — unknown stat id '${key}'`);
          }
        }
      }
    }

    for (const presentation of this.registries.presentation.all()) {
      const file = this.fileOf(presentation.id, this.registries.presentation);
      this.checkCommon(issues, presentation, file);
      const assetRefs = (path: string, ids: readonly string[]) => {
        ids.forEach((id, i) => {
          if (!isValidAssetId(id)) {
            issues.push(`${file}: ${path}[${i}] — unknown semantic asset id '${id}'`);
          }
        });
      };
      assetRefs('assets.models', presentation.assets.models);
      assetRefs('assets.vfx', presentation.assets.vfx.map((v) => v.id));
      assetRefs('assets.ui', presentation.assets.ui.map((u) => u.id));
      assetRefs('assets.audio', presentation.assets.audio.map((a) => a.id));
    }

    // Progression08: cross-file reference and probability validation.
    for (const def of this.registries.progressionDefinitions.all()) {
      const file = this.fileOf(def.id, this.registries.progressionDefinitions);
      this.checkCommon(issues, def, file);
      this.ref(issues, def.levelCurveId, this.registries.levelCurves, file, 'levelCurveId');
      this.ref(issues, def.xpPickupDefinitionId, this.registries.xpPickupDefinitions, file, 'xpPickupDefinitionId');
      this.ref(issues, def.upgradeRarityTableId, this.registries.upgradeRarityTables, file, 'upgradeRarityTableId');
      this.ref(issues, def.upgradeFirstExperienceRuleId, this.registries.upgradeFirstExperiences, file, 'upgradeFirstExperienceRuleId');
      this.ref(issues, def.treasureRarityTableId, this.registries.treasureRarityTables, file, 'treasureRarityTableId');
      this.ref(issues, def.firstTreasureRuleId, this.registries.firstTreasureRules, file, 'firstTreasureRuleId');
      this.ref(issues, def.relicPoolId, this.registries.relicPools, file, 'relicPoolId');
      this.ref(issues, def.multiplayerPolicyId, this.registries.progressionModePolicies, file, 'multiplayerPolicyId');
      this.ref(issues, def.singlePlayerPolicyId, this.registries.progressionModePolicies, file, 'singlePlayerPolicyId');
      this.ref(issues, def.relicChestSpawnPolicyId, this.registries.relicChestSpawnPolicies, file, 'relicChestSpawnPolicyId');
    }
    for (const table of this.registries.upgradeRarityTables.all()) {
      const file = this.fileOf(table.id, this.registries.upgradeRarityTables);
      this.checkCommon(issues, table, file);
      checkProbabilitySum(issues, Object.values(table.rarities), file, 'rarities');
    }
    for (const table of this.registries.treasureRarityTables.all()) {
      const file = this.fileOf(table.id, this.registries.treasureRarityTables);
      this.checkCommon(issues, table, file);
      checkProbabilitySum(issues, Object.values(table.rarities), file, 'rarities');
    }
    for (const rule of this.registries.firstTreasureRules.all()) {
      const file = this.fileOf(rule.id, this.registries.firstTreasureRules);
      this.checkCommon(issues, rule, file);
      checkProbabilitySum(issues, Object.values(rule.rarities), file, 'rarities');
    }
    for (const category of this.registries.upgradeCategories.all()) {
      const file = this.fileOf(category.id, this.registries.upgradeCategories);
      this.checkCommon(issues, category, file);
      category.effects.forEach((effect, i) => {
        if (!isKnownStat(effect.statId)) {
          issues.push(`${file}: effects[${i}].statId — unknown stat id '${effect.statId}'`);
        }
      });
      for (const [rarity, range] of Object.entries(category.rarityRanges)) {
        const percent = range.minPercent !== undefined || range.maxPercent !== undefined;
        const flat = range.minFlat !== undefined || range.maxFlat !== undefined;
        if (percent && flat) {
          issues.push(`${file}: rarityRanges.${rarity} — cannot mix percent and flat ranges`);
        }
        if (range.minPercent !== undefined && range.maxPercent !== undefined && range.minPercent > range.maxPercent) {
          issues.push(`${file}: rarityRanges.${rarity} — minPercent exceeds maxPercent`);
        }
        if (range.minFlat !== undefined && range.maxFlat !== undefined && range.minFlat > range.maxFlat) {
          issues.push(`${file}: rarityRanges.${rarity} — minFlat exceeds maxFlat`);
        }
      }
    }
    for (const rule of this.registries.upgradeFirstExperiences.all()) {
      const file = this.fileOf(rule.id, this.registries.upgradeFirstExperiences);
      this.checkCommon(issues, rule, file);
      rule.cardRules.forEach((card, i) => {
        if (card.kind === 'branch') {
          checkProbabilitySum(
            issues,
            card.branches.map((b) => b.probability),
            file,
            `cardRules[${i}].branches`,
          );
        }
      });
    }
    for (const relic of this.registries.relics.all()) {
      const file = this.fileOf(relic.id, this.registries.relics);
      this.checkCommon(issues, relic, file);
      relic.effects.forEach((effect, i) => {
        if (!this.registries.relicEffectTemplates.has(effect.templateId)) {
          issues.push(`${file}: effects[${i}].templateId — unknown relic effect template '${effect.templateId}'`);
        }
      });
    }
    for (const pool of this.registries.relicPools.all()) {
      const file = this.fileOf(pool.id, this.registries.relicPools);
      this.checkCommon(issues, pool, file);
      pool.relicIds.forEach((id, i) => this.ref(issues, id, this.registries.relics, file, `relicIds[${i}]`));
    }
    for (const template of this.registries.relicEffectTemplates.all()) {
      const file = this.fileOf(template.id, this.registries.relicEffectTemplates);
      this.checkCommon(issues, template, file);
      if (!RELIC_EFFECT_TYPES.includes(template.effectType as never)) {
        issues.push(`${file}: effectType — unknown effect type '${template.effectType}'`);
      }
    }
    for (const policy of this.registries.progressionModePolicies.all()) {
      const file = this.fileOf(policy.id, this.registries.progressionModePolicies);
      this.checkCommon(issues, policy, file);
    }

    // Items/status effects: generic behavior/stat checks only (empty in Demo).
    for (const item of this.registries.items.all()) {
      this.checkCommon(issues, item, this.fileOf(item.id, this.registries.items));
    }
    for (const effect of this.registries.statusEffects.all()) {
      this.checkCommon(issues, effect, this.fileOf(effect.id, this.registries.statusEffects));
    }
    for (const weapon of this.registries.weapons.all()) {
      const weaponFile = this.fileOf(weapon.id, this.registries.weapons);
      this.checkCommon(issues, weapon, weaponFile);
      if (!this.behaviors.has(weapon.behaviorId)) {
        issues.push(`${weaponFile}: behaviorId — unknown weapon behavior '${weapon.behaviorId}'`);
      }
      if (weapon.projectileId && !this.registries.projectiles.has(weapon.projectileId)) {
        issues.push(`${weaponFile}: projectileId — unknown projectile reference '${weapon.projectileId}'`);
      }
    }
    for (const projectile of this.registries.projectiles.all()) {
      this.checkCommon(issues, projectile, this.fileOf(projectile.id, this.registries.projectiles));
    }
    for (const tank of this.registries.tanks.all()) {
      this.checkCommon(issues, tank, this.fileOf(tank.id, this.registries.tanks));
    }

    if (issues.length > 0) {
      throw new ContentValidationError(`content validation failed with ${issues.length} issue(s)`, issues);
    }
  }

  private checkCommon(
    issues: string[],
    def: { id: string; behaviors?: string[] | Array<{ id: string }>; stats?: Record<string, number> },
    file: string,
    options: { skipStats?: boolean } = {},
  ): void {
    const behaviors = def.behaviors;
    if (behaviors) {
      behaviors.forEach((entry, i) => {
        const id = typeof entry === 'string' ? entry : entry.id;
        if (!this.behaviors.has(id)) issues.push(`${file}: behaviors[${i}] — unknown behavior '${id}'`);
      });
    }
    const stats = def.stats;
    if (stats && !options.skipStats) {
      for (const key of Object.keys(stats)) {
        if (!this.statIds.has(key)) issues.push(`${file}: stats.${key} — unknown stat id '${key}'`);
      }
    }
  }

  private ref(
    issues: string[],
    id: string,
    registry: { has(id: string): boolean },
    file: string,
    jsonPath: string,
  ): void {
    if (!registry.has(id)) issues.push(`${file}: ${jsonPath} — unknown reference '${id}'`);
  }

  private fileOf(id: string, registry: { sourceOf(id: string): string | undefined }): string {
    return registry.sourceOf(id) ?? `${id}.json`;
  }
}

function checkProbabilitySum(issues: string[], values: number[], file: string, jsonPath: string): void {
  const sum = values.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 1e-6) {
    issues.push(`${file}: ${jsonPath} — probabilities sum to ${sum.toFixed(6)}, expected 1`);
  }
}
