import { BASE_CONFIG, MODIFIER_OVERRIDES, buildMatchConfig, type GameConfig } from '../config';
import type { ContentPack } from '../content/contentPack';
import type { DropTableDefinition } from '../content/schemas/dropTable';
import type { EnemyDefinition } from '../content/schemas/enemy';
import type { EnemyLevelCurveDefinition } from '../content/schemas/enemyLevelCurve';
import type { EnemyXpRewardsDefinition } from '../content/schemas/enemyXpRewards';
import type { MeleeEngagementProfileDefinition } from '../content/schemas/meleeEngagementProfile';
import type { ProjectileDefinition } from '../content/schemas/projectile';
import type { LoadoutDefinition } from '../content/schemas/loadout';
import type { ModeDefinition, ModeSessionPolicy } from '../content/schemas/mode';
import type { ObjectiveDefinition } from '../content/schemas/objective';
import type { PickupDefinition } from '../content/schemas/pickup';
import type { ResultsDefinition } from '../content/schemas/results';
import type { ScoringDefinition } from '../content/schemas/scoring';
import type { SpawnDirectorDefinition } from '../content/schemas/spawnDirector';
import type { TankDefinition } from '../content/schemas/tank';
import type { WeaponDefinition } from '../content/schemas/weapon';
import type { HordeDirectorDefinition } from '../content/schemas/horde';
import { legacyGameConfigFromContent, legacyMatchConfigFromContent } from './contentConfig';
import { baseStatBlocksFromConfig, type StatBlock } from '../stats/statBlock';
import { ENEMY_STAT_IDS, MATCH_STAT_IDS, MOVEMENT_STAT_IDS, TANK_STAT_IDS, WEAPON_STAT_IDS } from '../stats/statIds';
import type { StatModifier } from '../stats/statModifier';
import { StatResolver } from '../stats/statResolver';
import type { MovementRulesBlock, RulesRevisionSnapshot, TankRigRulesBlock } from '../stats/rulesRevision';
import type { MatchConfig, ModifierId } from '../types';
import { createLegacyDefaultTankDefinition, createLegacyDemoRulesBundle, createLegacyDemoModeDefinition, type DemoRulesBundle } from './legacyDemoRules';
import { deepFreeze } from '../content/freeze';
import type {
  FirstTreasureRuleDefinition,
  LevelCurveDefinition,
  ProgressionDefinition,
  ProgressionModePolicyDefinition,
  RelicDefinition,
  RelicEffectTemplateDefinition,
  TreasureRarityTableDefinition,
  UpgradeCategoryDefinition,
  UpgradeFirstExperienceDefinition,
  UpgradeRarityTableDefinition,
  XpPickupDefinition,
} from '../content/schemas/progression';

/**
 * Immutable, match-scoped rules: ContentPack -> mode -> difficulty ->
 * MatchRules (or the equivalent legacy constants on the client-safe path).
 *
 * All gameplay values flow through a per-match StatResolver; the legacy
 * GameConfig/MatchConfig shapes are frozen projections of the resolved
 * stats, so the existing simulation code reads a fresh per-match object
 * instead of the shared BASE_CONFIG.
 */
export interface MatchRulesProgressionContent {
  content: ProgressionDefinition;
  levelCurve: LevelCurveDefinition;
  xpPickup: XpPickupDefinition;
  upgradeRarityTable: UpgradeRarityTableDefinition;
  upgradeFirstExperience: UpgradeFirstExperienceDefinition;
  treasureRarityTable: TreasureRarityTableDefinition;
  firstTreasure: FirstTreasureRuleDefinition;
  relicPoolIds: string[];
  relicsById: Map<string, RelicDefinition>;
  relicEffectTemplatesById: Map<string, RelicEffectTemplateDefinition>;
  upgradeCategories: Map<string, UpgradeCategoryDefinition>;
  multiplayerPolicy: ProgressionModePolicyDefinition;
  singlePlayerPolicy: ProgressionModePolicyDefinition;
}

export class MatchRules {
  readonly packId: string;
  readonly packVersion: string;
  readonly contentHash: string;
  readonly modeId: string;
  readonly mode: ModeDefinition | null;
  readonly modifier: ModifierId;
  readonly difficultyId: string;
  readonly difficultyLabel: string;
  readonly difficultyDescription: string;
  readonly timeScale: number;
  readonly objective: ObjectiveDefinition;
  readonly scoring: ScoringDefinition;
  readonly results: ResultsDefinition;
  readonly spawnDirector: SpawnDirectorDefinition;
  readonly loadout: LoadoutDefinition;
  readonly weapons: ReadonlyMap<string, WeaponDefinition>;
  readonly enemies: ReadonlyMap<string, EnemyDefinition>;
  readonly projectiles: ReadonlyMap<string, ProjectileDefinition>;
  readonly enemyLevelCurves: ReadonlyMap<string, EnemyLevelCurveDefinition>;
  readonly enemyXpRewards: ReadonlyMap<string, EnemyXpRewardsDefinition>;
  readonly meleeEngagementProfiles: ReadonlyMap<string, MeleeEngagementProfileDefinition>;
  readonly dropTables: ReadonlyMap<string, DropTableDefinition>;
  readonly pickups: ReadonlyMap<string, PickupDefinition>;
  readonly tank: TankDefinition;
  readonly hordeDirector: HordeDirectorDefinition | null;
  readonly resolver: StatResolver;
  readonly progressionContent: ProgressionDefinition | null;
  readonly progressionEnabled: boolean;
  readonly levelCurveContent: LevelCurveDefinition | null;
  readonly xpPickupContent: XpPickupDefinition | null;
  readonly upgradeRarityTableContent: UpgradeRarityTableDefinition | null;
  readonly upgradeFirstExperienceContent: UpgradeFirstExperienceDefinition | null;
  readonly treasureRarityTableContent: TreasureRarityTableDefinition | null;
  readonly firstTreasureContent: FirstTreasureRuleDefinition | null;
  readonly relicPoolIds: readonly string[];
  readonly relicsById: ReadonlyMap<string, RelicDefinition>;
  readonly relicEffectTemplatesById: ReadonlyMap<string, RelicEffectTemplateDefinition>;
  readonly upgradeCategories: ReadonlyMap<string, UpgradeCategoryDefinition>;
  readonly multiplayerProgressionPolicy: ProgressionModePolicyDefinition | null;
  readonly singlePlayerProgressionPolicy: ProgressionModePolicyDefinition | null;

  private readonly baseConfig: GameConfig;
  private readonly baseMatchConfig: MatchConfig;
  private configCache: GameConfig | null = null;
  private matchConfigCache: MatchConfig | null = null;
  private rulesRev = 1;
  private movementRev = 1;
  private tankRigRev = 1;
  private dirty = false;

  private constructor(options: {
    packId: string;
    packVersion: string;
    contentHash: string;
    modeId: string;
    mode?: ModeDefinition | null;
    modifier: ModifierId;
    difficultyId: string;
    difficultyLabel: string;
    difficultyDescription: string;
    timeScale: number;
    baseConfig: GameConfig;
    baseMatchConfig: MatchConfig;
    bundle: DemoRulesBundle;
    difficultyModifiers: StatModifier[];
    tank: TankDefinition;
    hordeDirector?: HordeDirectorDefinition | null;
    progression?: MatchRulesProgressionContent;
  }) {
    this.packId = options.packId;
    this.packVersion = options.packVersion;
    this.contentHash = options.contentHash;
    this.modeId = options.modeId;
    this.mode = options.mode ?? null;
    this.modifier = options.modifier;
    this.difficultyId = options.difficultyId;
    this.difficultyLabel = options.difficultyLabel;
    this.difficultyDescription = options.difficultyDescription;
    this.timeScale = options.timeScale;
    this.baseConfig = options.baseConfig;
    this.baseMatchConfig = options.baseMatchConfig;
    this.objective = deepFreeze(options.bundle.objective);
    this.scoring = deepFreeze(options.bundle.scoring);
    this.results = deepFreeze(options.bundle.results);
    this.spawnDirector = deepFreeze(options.bundle.spawnDirector);
    this.loadout = deepFreeze(options.bundle.loadout);
    this.weapons = deepFreeze(new Map(Object.entries(options.bundle.weapons)));
    this.enemies = deepFreeze(new Map(Object.entries(options.bundle.enemies)));
    this.projectiles = deepFreeze(new Map(Object.entries(options.bundle.projectiles)));
    this.enemyLevelCurves = deepFreeze(new Map(Object.entries(options.bundle.enemyLevelCurves)));
    this.enemyXpRewards = deepFreeze(new Map(Object.entries(options.bundle.enemyXpRewards)));
    this.meleeEngagementProfiles = deepFreeze(new Map(Object.entries(options.bundle.meleeEngagementProfiles)));
    this.dropTables = deepFreeze(new Map(Object.entries(options.bundle.dropTables)));
    this.pickups = deepFreeze(new Map(Object.entries(options.bundle.pickups)));
    this.tank = deepFreeze(options.tank);
    this.hordeDirector = options.hordeDirector ?? null;
    this.progressionContent = options.progression?.content ?? null;
    this.progressionEnabled = (options.mode?.progression === true) && this.progressionContent !== null;
    this.levelCurveContent = options.progression?.levelCurve ?? null;
    this.xpPickupContent = options.progression?.xpPickup ?? null;
    this.upgradeRarityTableContent = options.progression?.upgradeRarityTable ?? null;
    this.upgradeFirstExperienceContent = options.progression?.upgradeFirstExperience ?? null;
    this.treasureRarityTableContent = options.progression?.treasureRarityTable ?? null;
    this.firstTreasureContent = options.progression?.firstTreasure ?? null;
    this.relicPoolIds = Object.freeze([...(options.progression?.relicPoolIds ?? [])]);
    this.relicsById = deepFreeze(new Map(options.progression?.relicsById ?? []));
    this.relicEffectTemplatesById = deepFreeze(new Map(options.progression?.relicEffectTemplatesById ?? []));
    this.upgradeCategories = deepFreeze(new Map(options.progression?.upgradeCategories ?? []));
    this.multiplayerProgressionPolicy = options.progression?.multiplayerPolicy ?? null;
    this.singlePlayerProgressionPolicy = options.progression?.singlePlayerPolicy ?? null;

    const blocks = baseStatBlocksFromConfig(options.baseConfig, options.baseMatchConfig);
    blocks.weapon = { ...blocks.weapon, ...options.bundle.weaponStatBlocks };
    blocks.match = {
      ...blocks.match,
      'progression.magnetRadius': 5,
      'progression.xpMultiplier': 1,
    };
    blocks.tank = {
      ...blocks.tank,
      'tank.extraJumps': 0,
      'tank.airDashCharges': 0,
    };
    const flat: StatBlock = { ...blocks.match, ...blocks.tank, ...blocks.weapon, ...blocks.enemy };
    this.resolver = new StatResolver(flat);
    this.resolver.onChange = (stat) => {
      this.rulesRev++;
      if (MOVEMENT_STAT_IDS.has(stat)) this.movementRev++;
      this.dirty = true;
      this.configCache = null;
      this.matchConfigCache = null;
    };
    for (const modifier of options.difficultyModifiers) this.resolver.addModifier(modifier);
    this.refreshProjections();
  }

  static fromContentPack(pack: ContentPack, modifier: ModifierId, modeId = pack.modeId): MatchRules {
    const mode = pack.getMode(modeId);
    const difficultyId = modifier === 'none' ? mode.difficulty : `difficulty.${modifier}`;
    const difficulty = pack.getDifficulty(difficultyId);
    const baseConfig = legacyGameConfigFromContent(pack, modeId);
    const baseMatchConfig = legacyMatchConfigFromContent(pack, 'none', modeId);
    const difficultyModifiers: StatModifier[] = [];
    if (difficulty.overrides) {
      for (const [stat, value] of Object.entries(difficulty.overrides)) {
        difficultyModifiers.push({
          id: `difficulty.${difficultyId}`,
          stat,
          operation: 'override',
          value,
          source: 'difficulty',
          priority: 10,
          stacking: 'replace',
        });
      }
    }
    return new MatchRules({
      packId: pack.id,
      packVersion: pack.version,
      contentHash: pack.hash,
      modeId,
      mode,
      modifier,
      difficultyId,
      difficultyLabel: difficulty.label ?? difficulty.id,
      difficultyDescription: difficulty.description ?? '',
      timeScale: difficulty.timeScale,
      baseConfig,
      baseMatchConfig,
      bundle: {
        objective: pack.getObjective(mode.objectives[0]),
        scoring: pack.getScoring(mode.scoring),
        results: pack.getResults(mode.results),
        spawnDirector: pack.getSpawnDirector(mode.spawnDirector),
        weaponStatBlocks: loadoutWeaponStatBlocks(pack, pack.getLoadout(mode.loadout)),
        loadout: pack.getLoadout(mode.loadout),
        weapons: packWeapons(pack),
        enemies: packEnemies(pack),
        projectiles: packProjectiles(pack),
        enemyLevelCurves: packEnemyLevelCurves(pack),
        enemyXpRewards: packEnemyXpRewards(pack),
        meleeEngagementProfiles: packMeleeEngagementProfiles(pack),
        dropTables: packDropTables(pack),
        pickups: packPickups(pack),
      },
      difficultyModifiers,
      tank: pack.getTank(mode.tank),
      ...(mode.hordeDirector ? { hordeDirector: pack.getHordeDirector(mode.hordeDirector) } : {}),
      ...(pack.has('progressionDefinitions', 'progression.mainStage')
        ? { progression: buildProgressionContent(pack) }
        : {}),
    });
  }

  /** Client-safe path: identical values built from legacy constants. */
  static fromLegacyConfig(modifier: ModifierId): MatchRules {
    const baseConfig = JSON.parse(JSON.stringify(BASE_CONFIG)) as GameConfig;
    const baseMatchConfig = buildMatchConfig('none');
    const bundle = createLegacyDemoRulesBundle();
    const legacyOverrides = MODIFIER_OVERRIDES[modifier];
    const difficultyModifiers: StatModifier[] = [];
    const overrides = MODIFIER_OVERRIDES[modifier];
    if (overrides) {
      for (const [key, value] of Object.entries(overrides)) {
        if (key === 'label' || key === 'desc' || typeof value !== 'number') continue;
        difficultyModifiers.push({
          id: `difficulty.${modifier}`,
          stat: `match.${key}`,
          operation: 'override',
          value,
          source: 'difficulty',
          priority: 10,
          stacking: 'replace',
        });
      }
    }
    return new MatchRules({
      packId: 'legacy',
      packVersion: '0',
      contentHash: 'legacy-config',
      modeId: 'mode.demoScoreAttack',
      mode: createLegacyDemoModeDefinition(),
      modifier,
      difficultyId: `difficulty.${modifier}`,
      difficultyLabel: legacyOverrides?.label ?? 'Standard Rules',
      difficultyDescription: legacyOverrides?.desc ?? '',
      timeScale: baseMatchConfig.timeScale,
      baseConfig,
      baseMatchConfig,
      bundle,
      difficultyModifiers,
      tank: createLegacyDefaultTankDefinition(),
    });
  }

  /** Frozen GameConfig projection of the resolved stats. */
  get config(): GameConfig {
    if (this.dirty || !this.configCache) this.refreshProjections();
    return this.configCache!;
  }

  /** Frozen MatchConfig projection of the resolved match stats. */
  get matchConfig(): MatchConfig {
    if (this.dirty || !this.matchConfigCache) this.refreshProjections();
    return this.matchConfigCache!;
  }

  get duration(): number {
    return this.objective.durationSeconds;
  }

  get rulesRevision(): number {
    return this.rulesRev;
  }

  get movementRulesRevision(): number {
    return this.movementRev;
  }

  /** Resolved tank rig block (gameplay04 M4); revision mirrors rules. */
  tankRigBlock(): TankRigRulesBlock {
    return deepFreeze({
      revision: this.tankRigRev,
      tankId: this.tank.id,
      rig: this.tank.rig,
    });
  }

  addModifier(modifier: StatModifier): void {
    this.resolver.addModifier(modifier);
  }

  removeModifier(id: string): boolean {
    return this.resolver.removeModifier(id);
  }

  removeModifiersBySource(source: string): void {
    this.resolver.removeModifiersBySource(source);
  }

  clearModifiers(): void {
    this.resolver.clearModifiers();
  }

  /** Expire timed modifiers; advances revisions for any stat that changed. */
  updateTimedModifiers(dt: number): void {
    this.resolver.update(dt);
  }

  /** Compact resolved movement block for client prediction (frozen). */
  movementBlock(): MovementRulesBlock {
    const tank = {} as GameConfig['tank'];
    for (const id of TANK_STAT_IDS) {
      (tank as unknown as Record<string, number>)[id.slice('tank.'.length)] = this.resolver.resolve(id);
    }
    tank.footprint = this.baseConfig.tank.footprint;
    return deepFreeze({
      tank,
      match: {
        timeScale: this.timeScale,
        grip: this.resolver.resolve('match.grip'),
        gravity: this.resolver.resolve('match.gravity'),
      },
      turret: {
        responseMode: this.loadout.turret.responseMode ?? 'instant',
        turnRate: this.resolver.resolve('weapon.turretTurnRate'),
        pitchFollowRate: this.loadout.turret.pitchFollowRate ?? 8,
        minPitch: this.resolver.resolve('weapon.turretMinPitch'),
        maxPitch: this.resolver.resolve('weapon.turretMaxPitch'),
      },
      weapon: {
        cannonCooldown: this.resolver.resolve('match.cannonCooldown'),
        chargeTapMaxSeconds: this.resolver.resolve('weapon.chargeTapMaxSeconds'),
        chargeFullSeconds: this.resolver.resolve('weapon.chargeFullSeconds'),
      },
      tankRig: this.tankRigBlock(),
    });
  }

  snapshot(): RulesRevisionSnapshot {
    return deepFreeze({
      packId: this.packId,
      packVersion: this.packVersion,
      contentHash: this.contentHash,
      modeId: this.modeId,
      rulesRevision: this.rulesRev,
      movementRulesRevision: this.movementRev,
    });
  }

  /** Resolved mode session policy (legacy/default = multiplayer). */
  get sessionPolicy(): ModeSessionPolicy {
    return (
      this.mode?.session ?? {
        kind: 'multiplayer',
        networkRequired: true,
        controlScheme: 'assignedRole',
        showRoleIdentity: true,
        showPeerStatus: true,
        allowRoleSwap: false,
        resultsFlow: 'crewRematchVote',
      }
    );
  }

  private refreshProjections(): void {
    const resolver = this.resolver;
    const config: GameConfig = { ...this.baseConfig };
    config.tank = { ...this.baseConfig.tank };
    for (const id of TANK_STAT_IDS) {
      if (!(id.slice('tank.'.length) in config.tank)) continue;
      (config.tank as unknown as Record<string, number>)[id.slice('tank.'.length)] = resolver.resolve(id);
    }
    config.weapons = { ...this.baseConfig.weapons };
    for (const id of WEAPON_STAT_IDS) {
      if (!(id.slice('weapon.'.length) in config.weapons)) continue;
      (config.weapons as Record<string, number>)[id.slice('weapon.'.length)] = resolver.resolve(id);
    }
    config.enemies = { ...this.baseConfig.enemies };
    for (const id of ENEMY_STAT_IDS) {
      if (!(id.slice('enemy.'.length) in config.enemies)) continue;
      (config.enemies as Record<string, number>)[id.slice('enemy.'.length)] = resolver.resolve(id);
    }

    const matchConfig: MatchConfig = { ...this.baseMatchConfig };
    for (const id of MATCH_STAT_IDS) {
      const key = id.slice('match.'.length);
      if (key === 'timeScale') continue;
      if (!(key in matchConfig)) continue;
      (matchConfig as unknown as Record<string, number>)[key] = resolver.resolve(id);
    }
    matchConfig.timeScale = this.timeScale;
    matchConfig.modifier = this.modifier;
    (matchConfig as unknown as { label: string }).label = this.difficultyLabel;
    (matchConfig as unknown as { desc: string }).desc = this.difficultyDescription;

    this.configCache = deepFreeze(config);
    this.matchConfigCache = deepFreeze(matchConfig);
    this.dirty = false;
  }
}

function buildProgressionContent(pack: ContentPack): MatchRulesProgressionContent {
  const content = pack.getProgressionDefinition('progression.mainStage');
  const relicPool = pack.getRelicPool(content.relicPoolId);
  const relicsById = new Map<string, RelicDefinition>();
  for (const id of relicPool.relicIds) relicsById.set(id, pack.getRelic(id));
  const relicEffectTemplatesById = new Map<string, RelicEffectTemplateDefinition>();
  for (const id of pack.ids('relicEffectTemplates')) {
    relicEffectTemplatesById.set(id, pack.getRelicEffectTemplate(id));
  }
  const upgradeCategories = new Map<string, UpgradeCategoryDefinition>();
  for (const id of pack.ids('upgradeCategories')) {
    upgradeCategories.set(id, pack.getUpgradeCategory(id));
  }
  return {
    content,
    levelCurve: pack.getLevelCurve(content.levelCurveId),
    xpPickup: pack.getXpPickupDefinition(content.xpPickupDefinitionId),
    upgradeRarityTable: pack.getUpgradeRarityTable(content.upgradeRarityTableId),
    upgradeFirstExperience: pack.getUpgradeFirstExperience(content.upgradeFirstExperienceRuleId),
    treasureRarityTable: pack.getTreasureRarityTable(content.treasureRarityTableId),
    firstTreasure: pack.getFirstTreasureRule(content.firstTreasureRuleId),
    relicPoolIds: [...relicPool.relicIds],
    relicsById,
    relicEffectTemplatesById,
    upgradeCategories,
    multiplayerPolicy: pack.getProgressionModePolicy(content.multiplayerPolicyId),
    singlePlayerPolicy: pack.getProgressionModePolicy(content.singlePlayerPolicyId),
  };
}

function loadoutWeaponStatBlocks(
  pack: ContentPack,
  loadout: { primary: string; secondary: string; ability?: string | null },
): StatBlock {
  const merged: StatBlock = {};
  // Secondary (cannon) statBlock wins shared keys so the cannon charge
  // profile resolves its own knockback/splash values (Combat 05 M6).
  for (const id of [loadout.primary, ...(loadout.ability ? [loadout.ability] : []), loadout.secondary]) {
    Object.assign(merged, pack.getWeapon(id).statBlock);
  }
  return merged;
}

function packWeapons(pack: ContentPack): Record<string, WeaponDefinition> {
  const out: Record<string, WeaponDefinition> = {};
  for (const id of pack.ids('weapons')) out[id] = pack.getWeapon(id);
  return out;
}

function packEnemies(pack: ContentPack): Record<string, EnemyDefinition> {
  const out: Record<string, EnemyDefinition> = {};
  for (const id of pack.ids('enemies')) out[id] = pack.getEnemy(id);
  return out;
}

function packProjectiles(pack: ContentPack): Record<string, ProjectileDefinition> {
  const out: Record<string, ProjectileDefinition> = {};
  for (const id of pack.ids('projectiles')) out[id] = pack.getProjectile(id);
  return out;
}

function packEnemyLevelCurves(pack: ContentPack): Record<string, EnemyLevelCurveDefinition> {
  const out: Record<string, EnemyLevelCurveDefinition> = {};
  for (const id of pack.ids('enemyLevelCurves')) out[id] = pack.getEnemyLevelCurve(id);
  return out;
}

function packEnemyXpRewards(pack: ContentPack): Record<string, EnemyXpRewardsDefinition> {
  const out: Record<string, EnemyXpRewardsDefinition> = {};
  for (const id of pack.ids('enemyXpRewards')) out[id] = pack.getEnemyXpRewards(id);
  return out;
}

function packMeleeEngagementProfiles(pack: ContentPack): Record<string, MeleeEngagementProfileDefinition> {
  const out: Record<string, MeleeEngagementProfileDefinition> = {};
  for (const id of pack.ids('meleeEngagementProfiles')) out[id] = pack.getMeleeEngagementProfile(id);
  return out;
}

function packDropTables(pack: ContentPack): Record<string, DropTableDefinition> {
  const out: Record<string, DropTableDefinition> = {};
  for (const id of pack.ids('dropTables')) out[id] = pack.getDropTable(id);
  return out;
}

function packPickups(pack: ContentPack): Record<string, PickupDefinition> {
  const out: Record<string, PickupDefinition> = {};
  for (const id of pack.ids('pickups')) out[id] = pack.getPickup(id);
  return out;
}
