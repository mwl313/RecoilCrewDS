import { DefinitionRegistry, type ContentDefinition } from './definitionRegistry';
import { deepFreeze } from './freeze';
import type { DifficultyDefinition } from './schemas/difficulty';
import type { EnemyDefinition } from './schemas/enemy';
import type { ItemDefinition, StatusEffectDefinition } from './schemas/item';
import type { LoadoutDefinition } from './schemas/loadout';
import type { ModeDefinition } from './schemas/mode';
import type { ObjectiveDefinition } from './schemas/objective';
import type { PresentationDefinition } from './schemas/presentation';
import type { ProjectileDefinition } from './schemas/projectile';
import type { ResultsDefinition } from './schemas/results';
import type { ScoringDefinition } from './schemas/scoring';
import type { SpawnDirectorDefinition } from './schemas/spawnDirector';
import type { TankDefinition } from './schemas/tank';
import type { WeaponDefinition } from './schemas/weapon';

export const CONTENT_CATEGORIES = [
  'modes',
  'objectives',
  'tanks',
  'loadouts',
  'weapons',
  'projectiles',
  'enemies',
  'items',
  'statusEffects',
  'spawnDirectors',
  'scoring',
  'results',
  'difficulties',
  'presentation',
] as const;

export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];

export interface CategoryRegistries {
  modes: DefinitionRegistry<ModeDefinition>;
  objectives: DefinitionRegistry<ObjectiveDefinition>;
  tanks: DefinitionRegistry<TankDefinition>;
  loadouts: DefinitionRegistry<LoadoutDefinition>;
  weapons: DefinitionRegistry<WeaponDefinition>;
  projectiles: DefinitionRegistry<ProjectileDefinition>;
  enemies: DefinitionRegistry<EnemyDefinition>;
  items: DefinitionRegistry<ItemDefinition>;
  statusEffects: DefinitionRegistry<StatusEffectDefinition>;
  spawnDirectors: DefinitionRegistry<SpawnDirectorDefinition>;
  scoring: DefinitionRegistry<ScoringDefinition>;
  results: DefinitionRegistry<ResultsDefinition>;
  difficulties: DefinitionRegistry<DifficultyDefinition>;
  presentation: DefinitionRegistry<PresentationDefinition>;
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
  getItem(id: string): ItemDefinition {
    return this.require('items', id);
  }
  getStatusEffect(id: string): StatusEffectDefinition {
    return this.require('statusEffects', id);
  }
  getSpawnDirector(id: string): SpawnDirectorDefinition {
    return this.require('spawnDirectors', id);
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

  /** The mode selected by the manifest — the Demo loop for this pack. */
  get selectedMode(): ModeDefinition {
    return this.getMode(this.modeId);
  }
}
