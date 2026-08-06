import { DefinitionRegistry, type ContentDefinition } from './definitionRegistry';
import { deepFreeze } from './freeze';
import type { DensityProfileDefinition } from './schemas/densityProfile';
import type { DifficultyDefinition } from './schemas/difficulty';
import type { DropTableDefinition } from './schemas/dropTable';
import type { EnemyDefinition } from './schemas/enemy';
import type { EnemyLevelCurveDefinition } from './schemas/enemyLevelCurve';
import type { EnemyXpRewardsDefinition } from './schemas/enemyXpRewards';
import type { EnemyGameplayRosterDefinition } from './schemas/enemyGameplayRoster';
import type { MeleeEngagementProfileDefinition } from './schemas/meleeEngagementProfile';
import type { FurnitureSetDefinition } from './schemas/furnitureSet';
import type { ItemDefinition, StatusEffectDefinition } from './schemas/item';
import type { LandmarkDefinition } from './schemas/landmark';
import type { LoadoutDefinition } from './schemas/loadout';
import type { MapDefinition } from './schemas/map';
import type { ModeDefinition } from './schemas/mode';
import type { ObjectiveDefinition } from './schemas/objective';
import type { PresentationDefinition } from './schemas/presentation';
import type { PickupDefinition } from './schemas/pickup';
import type { ProjectileDefinition } from './schemas/projectile';
import type { ResultsDefinition } from './schemas/results';
import type { ScoringDefinition } from './schemas/scoring';
import type { SpawnDirectorDefinition } from './schemas/spawnDirector';
import type { TankDefinition } from './schemas/tank';
import type { TerrainProfileDefinition } from './schemas/terrainProfile';
import type { ValidationProfileDefinition } from './schemas/validationProfile';
import type { EnemyArtRosterDefinition } from './schemas/enemyArtRoster';
import type { TerrainMaterialProfileSchema } from './schemas/terrainMaterialProfile';
import type { WeaponDefinition } from './schemas/weapon';
import type {
  FirstTreasureRuleDefinition,
  LevelCurveDefinition,
  ProgressionDefinition,
  ProgressionModePolicyDefinition,
  RelicDefinition,
  RelicEffectTemplateDefinition,
  RelicPoolDefinition,
  TreasureRarityTableDefinition,
  UpgradeCategoryDefinition,
  UpgradeFirstExperienceDefinition,
  UpgradeRarityTableDefinition,
  XpPickupDefinition,
} from './schemas/progression';
import type {
  BossWaveDefinition,
  EnemyLodPolicyDefinition,
  FarmingPhaseDefinition,
  HordeDirectorDefinition,
  HordeNavigationPolicyDefinition,
  HordeReplicationPolicyDefinition,
  PopulationLimitsDefinition,
  RewardTableDefinition,
  SpawnAnchorPolicyDefinition,
  SpawnPackDefinition,
  StageSequenceDefinition,
  WaveDefinition,
} from './schemas/horde';

export const CONTENT_CATEGORIES = [
  'modes',
  'objectives',
  'maps',
  'terrainProfiles',
  'terrainMaterialProfiles',
  'validationProfiles',
  'landmarks',
  'furnitureSets',
  'densityProfiles',
  'tanks',
  'loadouts',
  'weapons',
  'projectiles',
  'enemies',
  'enemyLevelCurves',
  'enemyXpRewards',
  'enemyGameplayRosters',
  'meleeEngagementProfiles',
  'dropTables',
  'pickups',
  'items',
  'statusEffects',
  'spawnDirectors',
  'stageSequences',
  'farmingPhases',
  'hordeDirectors',
  'populationLimits',
  'spawnPacks',
  'waves',
  'bossWaves',
  'spawnAnchorPolicies',
  'hordeNavigationPolicies',
  'enemyLodPolicies',
  'hordeReplicationPolicies',
  'rewardTables',
  'scoring',
  'results',
  'difficulties',
  'presentation',
  'progressionDefinitions',
  'levelCurves',
  'xpPickupDefinitions',
  'upgradeRarityTables',
  'upgradeCategories',
  'upgradeFirstExperiences',
  'enemyArtRosters',
  'treasureRarityTables',
  'firstTreasureRules',
  'relics',
  'relicPools',
  'relicEffectTemplates',
  'progressionModePolicies',
] as const;

export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];

export interface CategoryRegistries {
  modes: DefinitionRegistry<ModeDefinition>;
  objectives: DefinitionRegistry<ObjectiveDefinition>;
  maps: DefinitionRegistry<MapDefinition>;
  terrainProfiles: DefinitionRegistry<TerrainProfileDefinition>;
  terrainMaterialProfiles: DefinitionRegistry<TerrainMaterialProfileSchema>;
  validationProfiles: DefinitionRegistry<ValidationProfileDefinition>;
  landmarks: DefinitionRegistry<LandmarkDefinition>;
  furnitureSets: DefinitionRegistry<FurnitureSetDefinition>;
  densityProfiles: DefinitionRegistry<DensityProfileDefinition>;
  tanks: DefinitionRegistry<TankDefinition>;
  loadouts: DefinitionRegistry<LoadoutDefinition>;
  weapons: DefinitionRegistry<WeaponDefinition>;
  projectiles: DefinitionRegistry<ProjectileDefinition>;
  enemies: DefinitionRegistry<EnemyDefinition>;
  enemyLevelCurves: DefinitionRegistry<EnemyLevelCurveDefinition>;
  enemyXpRewards: DefinitionRegistry<EnemyXpRewardsDefinition>;
  enemyGameplayRosters: DefinitionRegistry<EnemyGameplayRosterDefinition>;
  meleeEngagementProfiles: DefinitionRegistry<MeleeEngagementProfileDefinition>;
  dropTables: DefinitionRegistry<DropTableDefinition>;
  pickups: DefinitionRegistry<PickupDefinition>;
  items: DefinitionRegistry<ItemDefinition>;
  statusEffects: DefinitionRegistry<StatusEffectDefinition>;
  spawnDirectors: DefinitionRegistry<SpawnDirectorDefinition>;
  stageSequences: DefinitionRegistry<StageSequenceDefinition>;
  farmingPhases: DefinitionRegistry<FarmingPhaseDefinition>;
  hordeDirectors: DefinitionRegistry<HordeDirectorDefinition>;
  populationLimits: DefinitionRegistry<PopulationLimitsDefinition>;
  spawnPacks: DefinitionRegistry<SpawnPackDefinition>;
  waves: DefinitionRegistry<WaveDefinition>;
  bossWaves: DefinitionRegistry<BossWaveDefinition>;
  spawnAnchorPolicies: DefinitionRegistry<SpawnAnchorPolicyDefinition>;
  hordeNavigationPolicies: DefinitionRegistry<HordeNavigationPolicyDefinition>;
  enemyLodPolicies: DefinitionRegistry<EnemyLodPolicyDefinition>;
  hordeReplicationPolicies: DefinitionRegistry<HordeReplicationPolicyDefinition>;
  rewardTables: DefinitionRegistry<RewardTableDefinition>;
  scoring: DefinitionRegistry<ScoringDefinition>;
  results: DefinitionRegistry<ResultsDefinition>;
  difficulties: DefinitionRegistry<DifficultyDefinition>;
  presentation: DefinitionRegistry<PresentationDefinition>;
  progressionDefinitions: DefinitionRegistry<ProgressionDefinition>;
  levelCurves: DefinitionRegistry<LevelCurveDefinition>;
  xpPickupDefinitions: DefinitionRegistry<XpPickupDefinition>;
  upgradeRarityTables: DefinitionRegistry<UpgradeRarityTableDefinition>;
  upgradeCategories: DefinitionRegistry<UpgradeCategoryDefinition>;
  upgradeFirstExperiences: DefinitionRegistry<UpgradeFirstExperienceDefinition>;
  enemyArtRosters: DefinitionRegistry<EnemyArtRosterDefinition>;
  treasureRarityTables: DefinitionRegistry<TreasureRarityTableDefinition>;
  firstTreasureRules: DefinitionRegistry<FirstTreasureRuleDefinition>;
  relics: DefinitionRegistry<RelicDefinition>;
  relicPools: DefinitionRegistry<RelicPoolDefinition>;
  relicEffectTemplates: DefinitionRegistry<RelicEffectTemplateDefinition>;
  progressionModePolicies: DefinitionRegistry<ProgressionModePolicyDefinition>;
}

export interface ContentPackBundle {
  id: string;
  version: string;
  modeId: string;
  hash: string;
  registries: CategoryRegistries;
}

type ReadonlyRegistries = {
  [K in ContentCategory]: ReadonlyMap<string, ContentDefinition>;
};

/**
 * Immutable validated content pack. Definitions are deep-frozen at registry
 * time and the pack snapshots its maps, so later registry mutation can never
 * leak into an already-loaded pack.
 */
export class ContentPack {
  readonly id: string;
  readonly version: string;
  readonly modeId: string;
  readonly hash: string;
  private readonly maps: ReadonlyRegistries;

  constructor(bundle: ContentPackBundle) {
    this.id = bundle.id;
    this.version = bundle.version;
    this.modeId = bundle.modeId;
    this.hash = bundle.hash;
    const maps = {} as ReadonlyRegistries;
    for (const category of CONTENT_CATEGORIES) {
      const registry = (bundle.registries as unknown as Record<ContentCategory, DefinitionRegistry<ContentDefinition>>)[category];
      const map = new Map<string, ContentDefinition>();
      for (const id of registry.ids()) map.set(id, registry.require(id));
      maps[category] = Object.freeze(map);
    }
    this.maps = deepFreeze(maps);
  }

  has(category: ContentCategory, id: string): boolean {
    return this.maps[category].has(id);
  }

  get<T extends ContentDefinition>(category: ContentCategory, id: string): T | undefined {
    return this.maps[category].get(id) as T | undefined;
  }

  require<T extends ContentDefinition>(category: ContentCategory, id: string, context?: string): T {
    const def = this.maps[category].get(id) as T | undefined;
    if (!def) {
      throw new Error(`content pack ${this.id}: missing ${category} definition '${id}'${context ? ` (referenced by ${context})` : ''}`);
    }
    return def;
  }

  ids(category: ContentCategory): readonly string[] {
    return Object.freeze([...this.maps[category].keys()]);
  }

  all<T extends ContentDefinition>(category: ContentCategory): readonly T[] {
    return Object.freeze([...this.maps[category].values()] as T[]);
  }

  getMode(id: string): ModeDefinition {
    return this.require('modes', id);
  }
  getObjective(id: string): ObjectiveDefinition {
    return this.require('objectives', id);
  }
  getMap(id: string): MapDefinition {
    return this.require('maps', id);
  }
  getTerrainProfile(id: string): TerrainProfileDefinition {
    return this.require('terrainProfiles', id);
  }
  getTerrainMaterialProfile(id: string): TerrainMaterialProfileSchema {
    return this.require('terrainMaterialProfiles', id);
  }
  getValidationProfile(id: string): ValidationProfileDefinition {
    return this.require('validationProfiles', id);
  }
  getLandmark(id: string): LandmarkDefinition {
    return this.require('landmarks', id);
  }
  getFurnitureSet(id: string): FurnitureSetDefinition {
    return this.require('furnitureSets', id);
  }
  getDensityProfile(id: string): DensityProfileDefinition {
    return this.require('densityProfiles', id);
  }
  getTank(id: string): TankDefinition {
    return this.require('tanks', id);
  }
  getLoadout(id: string): LoadoutDefinition {
    return this.require('loadouts', id);
  }
  getWeapon(id: string): WeaponDefinition {
    return this.require('weapons', id);
  }
  getProjectile(id: string): ProjectileDefinition {
    return this.require('projectiles', id);
  }
  getEnemy(id: string): EnemyDefinition {
    return this.require('enemies', id);
  }
  getEnemyLevelCurve(id: string): EnemyLevelCurveDefinition {
    return this.require('enemyLevelCurves', id);
  }
  getEnemyXpRewards(id: string): EnemyXpRewardsDefinition {
    return this.require('enemyXpRewards', id);
  }
  getEnemyGameplayRoster(id: string): EnemyGameplayRosterDefinition {
    return this.require('enemyGameplayRosters', id);
  }
  getMeleeEngagementProfile(id: string): MeleeEngagementProfileDefinition {
    return this.require('meleeEngagementProfiles', id);
  }
  getDropTable(id: string): DropTableDefinition {
    return this.require('dropTables', id);
  }
  getPickup(id: string): PickupDefinition {
    return this.require('pickups', id);
  }
  getItem(id: string): ItemDefinition {
    return this.require('items', id);
  }
  getStatusEffect(id: string): StatusEffectDefinition {
    return this.require('statusEffects', id);
  }
  getSpawnDirector(id: string): SpawnDirectorDefinition {
    return this.require('spawnDirectors', id);
  }
  getStageSequence(id: string): StageSequenceDefinition {
    return this.require('stageSequences', id);
  }
  getFarmingPhase(id: string): FarmingPhaseDefinition {
    return this.require('farmingPhases', id);
  }
  getHordeDirector(id: string): HordeDirectorDefinition {
    return this.require('hordeDirectors', id);
  }
  getPopulationLimits(id: string): PopulationLimitsDefinition {
    return this.require('populationLimits', id);
  }
  getSpawnPack(id: string): SpawnPackDefinition {
    return this.require('spawnPacks', id);
  }
  getWave(id: string): WaveDefinition {
    return this.require('waves', id);
  }
  getBossWave(id: string): BossWaveDefinition {
    return this.require('bossWaves', id);
  }
  getSpawnAnchorPolicy(id: string): SpawnAnchorPolicyDefinition {
    return this.require('spawnAnchorPolicies', id);
  }
  getHordeNavigationPolicy(id: string): HordeNavigationPolicyDefinition {
    return this.require('hordeNavigationPolicies', id);
  }
  getEnemyLodPolicy(id: string): EnemyLodPolicyDefinition {
    return this.require('enemyLodPolicies', id);
  }
  getHordeReplicationPolicy(id: string): HordeReplicationPolicyDefinition {
    return this.require('hordeReplicationPolicies', id);
  }
  getRewardTable(id: string): RewardTableDefinition {
    return this.require('rewardTables', id);
  }
  getScoring(id: string): ScoringDefinition {
    return this.require('scoring', id);
  }
  getResults(id: string): ResultsDefinition {
    return this.require('results', id);
  }
  getDifficulty(id: string): DifficultyDefinition {
    return this.require('difficulties', id);
  }
  getPresentation(id: string): PresentationDefinition {
    return this.require('presentation', id);
  }
  getProgressionDefinition(id: string): ProgressionDefinition {
    return this.require('progressionDefinitions', id);
  }
  getLevelCurve(id: string): LevelCurveDefinition {
    return this.require('levelCurves', id);
  }
  getXpPickupDefinition(id: string): XpPickupDefinition {
    return this.require('xpPickupDefinitions', id);
  }
  getUpgradeRarityTable(id: string): UpgradeRarityTableDefinition {
    return this.require('upgradeRarityTables', id);
  }
  getUpgradeCategory(id: string): UpgradeCategoryDefinition {
    return this.require('upgradeCategories', id);
  }
  getUpgradeFirstExperience(id: string): UpgradeFirstExperienceDefinition {
    return this.require('upgradeFirstExperiences', id);
  }
  getEnemyArtRoster(id: string): EnemyArtRosterDefinition {
    return this.require('enemyArtRosters', id);
  }
  getTreasureRarityTable(id: string): TreasureRarityTableDefinition {
    return this.require('treasureRarityTables', id);
  }
  getFirstTreasureRule(id: string): FirstTreasureRuleDefinition {
    return this.require('firstTreasureRules', id);
  }
  getRelic(id: string): RelicDefinition {
    return this.require('relics', id);
  }
  getRelicPool(id: string): RelicPoolDefinition {
    return this.require('relicPools', id);
  }
  getRelicEffectTemplate(id: string): RelicEffectTemplateDefinition {
    return this.require('relicEffectTemplates', id);
  }
  getProgressionModePolicy(id: string): ProgressionModePolicyDefinition {
    return this.require('progressionModePolicies', id);
  }

  /** The mode selected by the manifest — the Demo loop for this pack. */
  get selectedMode(): ModeDefinition {
    return this.getMode(this.modeId);
  }
}
