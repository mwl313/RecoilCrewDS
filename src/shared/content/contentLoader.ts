import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { BehaviorRegistry, createBuiltinBehaviorRegistry } from './behaviorRegistry';
import { ContentPack, CONTENT_CATEGORIES, type CategoryRegistries, type ContentCategory } from './contentPack';
import { DefinitionRegistry, type ContentDefinition } from './definitionRegistry';
import { ContentValidationError, formatZodIssues } from './errors';
import { contentHash } from './hash';
import { ReferenceValidator } from './referenceValidator';
import type { PackManifest } from './schemas/pack';
import { packManifestSchema } from './schemas/pack';
import { densityProfileSchema } from './schemas/densityProfile';
import { difficultySchema } from './schemas/difficulty';
import { dropTableSchema } from './schemas/dropTable';
import { enemySchema } from './schemas/enemy';
import { furnitureSetSchema } from './schemas/furnitureSet';
import { itemSchema, statusEffectSchema } from './schemas/item';
import { landmarkSchema } from './schemas/landmark';
import { loadoutSchema } from './schemas/loadout';
import { mapSchema } from './schemas/map';
import { modeSchema } from './schemas/mode';
import { objectiveSchema } from './schemas/objective';
import { presentationSchema } from './schemas/presentation';
import { pickupSchema } from './schemas/pickup';
import { projectileSchema } from './schemas/projectile';
import { resultsSchema } from './schemas/results';
import { scoringSchema } from './schemas/scoring';
import { spawnDirectorSchema } from './schemas/spawnDirector';
import { tankSchema } from './schemas/tank';
import { terrainProfileSchema } from './schemas/terrainProfile';
import { validationProfileSchema } from './schemas/validationProfile';
import { weaponSchema } from './schemas/weapon';
import { defaultStatIds } from './statIds';

const CATEGORY_SCHEMAS: Record<ContentCategory, z.ZodType> = {
  modes: modeSchema,
  objectives: objectiveSchema,
  maps: mapSchema,
  terrainProfiles: terrainProfileSchema,
  validationProfiles: validationProfileSchema,
  landmarks: landmarkSchema,
  furnitureSets: furnitureSetSchema,
  densityProfiles: densityProfileSchema,
  tanks: tankSchema,
  loadouts: loadoutSchema,
  weapons: weaponSchema,
  projectiles: projectileSchema,
  enemies: enemySchema,
  dropTables: dropTableSchema,
  pickups: pickupSchema,
  items: itemSchema,
  statusEffects: statusEffectSchema,
  spawnDirectors: spawnDirectorSchema,
  scoring: scoringSchema,
  results: resultsSchema,
  difficulties: difficultySchema,
  presentation: presentationSchema,
};

export interface ContentLoaderOptions {
  behaviors?: BehaviorRegistry;
  statIds?: ReadonlySet<string>;
}

/**
 * Server-side authoritative content loader. Content is loaded from disk (or
 * from controlled records in tests), validated with Zod, cross-checked by
 * the ReferenceValidator, hashed deterministically, and frozen into a
 * ContentPack. Clients can never supply definitions through this path.
 */
export class ContentLoader {
  private readonly behaviors: BehaviorRegistry;
  private readonly statIds: ReadonlySet<string>;

  constructor(options: ContentLoaderOptions = {}) {
    this.behaviors = options.behaviors ?? createBuiltinBehaviorRegistry();
    this.statIds = options.statIds ?? defaultStatIds();
  }

  loadFromRecords(manifestRaw: unknown, files: Record<string, unknown>): ContentPack {
    const parsedManifest = packManifestSchema.safeParse(manifestRaw);
    if (!parsedManifest.success) {
      throw new ContentValidationError(
        'invalid content manifest',
        formatZodIssues('manifest.json', parsedManifest.error),
        'manifest.json',
      );
    }
    const manifest = parsedManifest.data;
    const registries = createEmptyRegistries();

    for (const category of CONTENT_CATEGORIES) {
      const schema = CATEGORY_SCHEMAS[category];
      const registry = (registries as unknown as Record<ContentCategory, DefinitionRegistry<ContentDefinition>>)[category];
      for (const relPath of manifest.pack.files[category]) {
        const raw = files[relPath];
        if (raw === undefined) {
          throw new ContentValidationError(
            `missing content file '${relPath}'`,
            [`manifest.json: pack.files.${category} — file '${relPath}' was not provided`],
            'manifest.json',
            `pack.files.${category}`,
          );
        }
        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          throw new ContentValidationError(
            `invalid definition in ${relPath}`,
            formatZodIssues(relPath, parsed.error),
            relPath,
          );
        }
        registry.register(parsed.data as ContentDefinition, relPath);
      }
    }

    new ReferenceValidator(registries, this.behaviors, this.statIds).validate(manifest);

    const hash = contentHash({
      packId: manifest.pack.id,
      version: manifest.pack.version,
      mode: manifest.pack.mode,
      definitions: hashableDefinitions(registries),
    });

    return new ContentPack({
      id: manifest.pack.id,
      version: manifest.pack.version,
      modeId: manifest.pack.mode,
      hash,
      registries,
    });
  }

  loadFromFilesystem(root: string): ContentPack {
    const rootResolved = path.resolve(root);
    const manifestRaw = readJson(path.join(rootResolved, 'manifest.json'), 'manifest.json');
    const parsedManifest = packManifestSchema.safeParse(manifestRaw);
    if (!parsedManifest.success) {
      throw new ContentValidationError(
        'invalid content manifest',
        formatZodIssues('manifest.json', parsedManifest.error),
        'manifest.json',
      );
    }
    const manifest = parsedManifest.data;
    const files: Record<string, unknown> = {};
    for (const category of CONTENT_CATEGORIES) {
      for (const relPath of manifest.pack.files[category]) {
        const absolute = resolveInsideRoot(rootResolved, relPath);
        files[relPath] = readJson(absolute, relPath);
      }
    }
    return this.loadFromRecords(manifestRaw, files);
  }
}

export function loadContentPackFromFilesystem(root = 'content'): ContentPack {
  return new ContentLoader().loadFromFilesystem(root);
}

function createEmptyRegistries(): CategoryRegistries {
  return {
    modes: new DefinitionRegistry(),
    objectives: new DefinitionRegistry(),
    maps: new DefinitionRegistry(),
    terrainProfiles: new DefinitionRegistry(),
    validationProfiles: new DefinitionRegistry(),
    landmarks: new DefinitionRegistry(),
    furnitureSets: new DefinitionRegistry(),
    densityProfiles: new DefinitionRegistry(),
    tanks: new DefinitionRegistry(),
    loadouts: new DefinitionRegistry(),
    weapons: new DefinitionRegistry(),
    projectiles: new DefinitionRegistry(),
    enemies: new DefinitionRegistry(),
    dropTables: new DefinitionRegistry(),
    pickups: new DefinitionRegistry(),
    items: new DefinitionRegistry(),
    statusEffects: new DefinitionRegistry(),
    spawnDirectors: new DefinitionRegistry(),
    scoring: new DefinitionRegistry(),
    results: new DefinitionRegistry(),
    difficulties: new DefinitionRegistry(),
    presentation: new DefinitionRegistry(),
  };
}

function hashableDefinitions(registries: CategoryRegistries): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const category of CONTENT_CATEGORIES) {
    const registry = (registries as unknown as Record<ContentCategory, DefinitionRegistry<ContentDefinition>>)[category];
    out[category] = [...registry.ids()]
      .sort()
      .map((id) => registry.require(id));
  }
  return out;
}

function readJson(filePath: string, label: string): unknown {
  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new ContentValidationError(
      `cannot read content file '${label}'`,
      [`${label}: ${(err as Error).message}`],
      label,
    );
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new ContentValidationError(
      `invalid JSON in '${label}'`,
      [`${label}: ${(err as Error).message}`],
      label,
    );
  }
}

function resolveInsideRoot(root: string, relPath: string): string {
  const resolved = path.resolve(root, relPath);
  if (!resolved.startsWith(root + path.sep)) {
    throw new ContentValidationError(
      `content file escapes content root: '${relPath}'`,
      [`manifest.json: '${relPath}' resolves outside ${root}`],
      'manifest.json',
    );
  }
  return resolved;
}

export type { PackManifest };
