import { BASE_CONFIG, MODIFIER_OVERRIDES, buildMatchConfig, type GameConfig } from '../config';
import type { ContentPack } from '../content/contentPack';
import type { DropTableDefinition } from '../content/schemas/dropTable';
import type { EnemyDefinition } from '../content/schemas/enemy';
import type { LoadoutDefinition } from '../content/schemas/loadout';
import type { ObjectiveDefinition } from '../content/schemas/objective';
import type { PickupDefinition } from '../content/schemas/pickup';
import type { ResultsDefinition } from '../content/schemas/results';
import type { ScoringDefinition } from '../content/schemas/scoring';
import type { SpawnDirectorDefinition } from '../content/schemas/spawnDirector';
import type { WeaponDefinition } from '../content/schemas/weapon';
import { legacyGameConfigFromContent, legacyMatchConfigFromContent } from './contentConfig';
import { baseStatBlocksFromConfig, type StatBlock } from '../stats/statBlock';
import { ENEMY_STAT_IDS, MATCH_STAT_IDS, MOVEMENT_STAT_IDS, TANK_STAT_IDS, WEAPON_STAT_IDS } from '../stats/statIds';
import type { StatModifier } from '../stats/statModifier';
import { StatResolver } from '../stats/statResolver';
import type { MovementRulesBlock, RulesRevisionSnapshot } from '../stats/rulesRevision';
import type { MatchConfig, ModifierId } from '../types';
import { createLegacyDemoRulesBundle, type DemoRulesBundle } from './legacyDemoRules';
import { deepFreeze } from '../content/freeze';

/**
 * Immutable, match-scoped rules: ContentPack -> mode -> difficulty ->
 * MatchRules (or the equivalent legacy constants on the client-safe path).
 *
 * All gameplay values flow through a per-match StatResolver; the legacy
 * GameConfig/MatchConfig shapes are frozen projections of the resolved
 * stats, so the existing simulation code reads a fresh per-match object
 * instead of the shared BASE_CONFIG.
 */
export class MatchRules {
  readonly packId: string;
  readonly packVersion: string;
  readonly contentHash: string;
  readonly modeId: string;
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
  readonly dropTables: ReadonlyMap<string, DropTableDefinition>;
  readonly pickups: ReadonlyMap<string, PickupDefinition>;
  readonly resolver: StatResolver;

  private readonly baseConfig: GameConfig;
  private readonly baseMatchConfig: MatchConfig;
  private configCache: GameConfig | null = null;
  private matchConfigCache: MatchConfig | null = null;
  private rulesRev = 1;
  private movementRev = 1;
  private dirty = false;

  private constructor(options: {
    packId: string;
    packVersion: string;
    contentHash: string;
    modeId: string;
    modifier: ModifierId;
    difficultyId: string;
    difficultyLabel: string;
    difficultyDescription: string;
    timeScale: number;
    baseConfig: GameConfig;
    baseMatchConfig: MatchConfig;
    bundle: DemoRulesBundle;
    difficultyModifiers: StatModifier[];
  }) {
    this.packId = options.packId;
    this.packVersion = options.packVersion;
    this.contentHash = options.contentHash;
    this.modeId = options.modeId;
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
    this.dropTables = deepFreeze(new Map(Object.entries(options.bundle.dropTables)));
    this.pickups = deepFreeze(new Map(Object.entries(options.bundle.pickups)));

    const blocks = baseStatBlocksFromConfig(options.baseConfig, options.baseMatchConfig);
    blocks.weapon = { ...blocks.weapon, ...options.bundle.weaponStatBlocks };
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
        dropTables: packDropTables(pack),
        pickups: packPickups(pack),
      },
      difficultyModifiers,
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
      modifier,
      difficultyId: `difficulty.${modifier}`,
      difficultyLabel: legacyOverrides?.label ?? 'Standard Rules',
      difficultyDescription: legacyOverrides?.desc ?? '',
      timeScale: baseMatchConfig.timeScale,
      baseConfig,
      baseMatchConfig,
      bundle,
      difficultyModifiers,
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
        turnRate: this.resolver.resolve('weapon.turretTurnRate'),
        pitchFollowRate: this.loadout.turret.pitchFollowRate ?? 8,
        minPitch: this.resolver.resolve('weapon.turretMinPitch'),
        maxPitch: this.resolver.resolve('weapon.turretMaxPitch'),
      },
      weapon: {
        cannonCooldown: this.resolver.resolve('match.cannonCooldown'),
        jackpotChargeTime: this.resolver.resolve('weapon.jackpotChargeTime'),
      },
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

function loadoutWeaponStatBlocks(
  pack: ContentPack,
  loadout: { primary: string; secondary: string; ability: string },
): StatBlock {
  const merged: StatBlock = {};
  for (const id of [loadout.primary, loadout.secondary, loadout.ability]) {
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
