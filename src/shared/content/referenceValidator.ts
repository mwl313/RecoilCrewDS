import { isValidAssetId } from '../assetRegistry';
import type { PackManifest } from './schemas/pack';
import type { CategoryRegistries } from './contentPack';
import { BehaviorRegistry } from './behaviorRegistry';
import { ContentValidationError } from './errors';

const JACKPOT_GAIN_KEYS = new Set([
  'normalScrap',
  'heavyScrap',
  'jackpotScrap',
  'speedCollect',
  'ram',
  'dodge',
  'linkGain',
]);

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
      this.ref(issues, loadout.ability, this.registries.weapons, file, 'ability');
    }

    for (const map of this.registries.maps.all()) {
      const file = this.fileOf(map.id, this.registries.maps);
      this.checkCommon(issues, map, file);
      this.ref(issues, map.terrainProfileId, this.registries.terrainProfiles, file, 'terrainProfileId');
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
      this.checkCommon(issues, enemy, enemyFile);
      this.ref(issues, enemy.dropTableId, this.registries.dropTables, enemyFile, 'dropTableId');
      enemy.behaviors.forEach((behavior, i) => {
        if (!this.behaviors.has(behavior.id)) {
          issues.push(`${enemyFile}: behaviors[${i}].id — unknown enemy behavior '${behavior.id}'`);
        }
      });
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

    for (const scoring of this.registries.scoring.all()) {
      const file = this.fileOf(scoring.id, this.registries.scoring);
      this.checkCommon(issues, scoring, file);
      for (const enemyId of Object.keys(scoring.enemyScores)) {
        this.ref(issues, enemyId, this.registries.enemies, file, `enemyScores.${enemyId}`);
      }
      for (const key of Object.keys(scoring.jackpotGains)) {
        const isEnemyRef = key.startsWith('enemy.');
        if (isEnemyRef) {
          this.ref(issues, key, this.registries.enemies, file, `jackpotGains.${key}`);
        } else if (!JACKPOT_GAIN_KEYS.has(key)) {
          issues.push(`${file}: jackpotGains.${key} — unknown gain key '${key}'`);
        }
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
  ): void {
    const behaviors = def.behaviors;
    if (behaviors) {
      behaviors.forEach((entry, i) => {
        const id = typeof entry === 'string' ? entry : entry.id;
        if (!this.behaviors.has(id)) issues.push(`${file}: behaviors[${i}] — unknown behavior '${id}'`);
      });
    }
    const stats = def.stats;
    if (stats) {
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
