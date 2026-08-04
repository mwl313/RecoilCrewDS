import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BASE_CONFIG } from '../src/shared/config';
import { ContentLoader } from '../src/shared/content/contentLoader';
import { DefinitionRegistry } from '../src/shared/content/definitionRegistry';
import { ContentValidationError } from '../src/shared/content/errors';
import { canonicalStringify, contentHash } from '../src/shared/content/hash';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_ROOT = path.join(ROOT, 'content');

function loadRealPackRecords(): { manifest: unknown; files: Record<string, unknown> } {
  const manifest = JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, 'manifest.json'), 'utf8'));
  const files: Record<string, unknown> = {};
  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, rel);
      else if (entry.name.endsWith('.json')) files[rel] = JSON.parse(fs.readFileSync(abs, 'utf8'));
    }
  };
  walk(CONTENT_ROOT, '');
  return { manifest, files };
}

function deepClone(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function loadExpectingError(manifest: unknown, files: Record<string, unknown>): ContentValidationError {
  try {
    new ContentLoader().loadFromRecords(manifest, files);
    throw new Error('expected content load to fail');
  } catch (err) {
    if (err instanceof ContentValidationError) return err;
    if (err instanceof Error && err.message === 'expected content load to fail') throw err;
    throw new Error(`expected ContentValidationError, got ${(err as Error).message}`);
  }
}

describe('content pack loading (valid Demo pack)', () => {
  it('loads the shipped Demo pack from disk with every category', () => {
    const pack = new ContentLoader().loadFromFilesystem(CONTENT_ROOT);
    expect(pack.id).toBe('demo');
    expect(pack.version).toBe('1.0.0');
    expect(pack.modeId).toBe('mode.demoScoreAttack');
    expect(pack.hash).toMatch(/^[0-9a-f]{64}$/);
    expect([...pack.ids('modes')].sort()).toEqual(['mode.demoScoreAttack', 'mode.truckHunter']);
    expect([...pack.ids('objectives')].sort()).toEqual(['objective.highScore', 'objective.truckEscort']);
    expect([...pack.ids('maps')].sort()).toEqual([
      'map.arena400Primary',
      'map.cliffArena',
      'map.dramaticHighlands',
      'map.fallbackLegacy',
      'map.megaBonkHighlands',
    ]);
    expect([...pack.ids('terrainProfiles')].sort()).toEqual([
      'terrainProfile.cliffArena',
      'terrainProfile.dramaticHighlands',
      'terrainProfile.fallback',
      'terrainProfile.megaBonkHighlands',
      'terrainProfile.primary',
    ]);
    expect([...pack.ids('validationProfiles')].sort()).toEqual([
      'validationProfile.cliffArena',
      'validationProfile.dramaticHighlands',
      'validationProfile.fallback',
      'validationProfile.megaBonkHighlands',
      'validationProfile.primary',
    ]);
    expect([...pack.ids('landmarks')].sort()).toEqual([
      'landmark.basinCenter',
      'landmark.openCombat',
      'landmark.rampPark',
      'landmark.resourcePlateau',
    ]);
    expect([...pack.ids('furnitureSets')].sort()).toEqual(['furnitureSet.fallback', 'furnitureSet.primary']);
    expect([...pack.ids('densityProfiles')].sort()).toEqual(['densityProfile.fallback', 'densityProfile.primary']);
    expect(pack.ids('tanks')).toEqual(['tank.default']);
    expect([...pack.ids('loadouts')].sort()).toEqual(['loadout.default', 'loadout.truckHunter']);
    expect([...pack.ids('weapons')].sort()).toEqual([
      'weapon.jackpotShell',
      'weapon.machineGun',
      'weapon.mainCannon',
      'weapon.rapidCannon',
    ]);
    expect(pack.ids('projectiles')).toHaveLength(3);
    expect([...pack.ids('enemies')].sort()).toEqual([
      'enemy.gunTower',
      'enemy.lootTruck',
      'enemy.rammer',
      'enemy.scrapBug',
      'enemy.testHound',
    ]);
    expect(pack.ids('items')).toEqual(['item.overdriveCannon']);
    expect(pack.ids('statusEffects')).toEqual([]);
    expect([...pack.ids('spawnDirectors')].sort()).toEqual(['spawn.director.demoScoreAttack', 'spawn.director.truckHunter']);
    expect(pack.ids('scoring')).toEqual(['scoring.demoScoreAttack']);
    expect(pack.ids('results')).toEqual(['results.demoScoreAttack']);
    expect(pack.ids('difficulties')).toHaveLength(7);
    expect(pack.ids('presentation')).toEqual(['presentation.demoScoreAttack']);
  });

  it('shipped values match the current config (spot checks)', () => {
    const pack = new ContentLoader().loadFromFilesystem(CONTENT_ROOT);
    const tank = pack.getTank('tank.default');
    expect(tank.forwardSpeed).toBe(BASE_CONFIG.tank.forwardSpeed);
    expect(tank.footprint).toEqual(BASE_CONFIG.tank.footprint);
    const mg = pack.getWeapon('weapon.machineGun');
    expect(mg.behaviorId).toBe('weapon.hitscan');
    expect(mg.fireMode).toBe('auto');
    expect(mg.statBlock['weapon.mgDamage']).toBe(BASE_CONFIG.weapons.mgDamage);
    expect(mg.statBlock['weapon.mgRate']).toBe(BASE_CONFIG.weapons.mgRate);
    const cannon = pack.getWeapon('weapon.mainCannon');
    expect(cannon.behaviorId).toBe('weapon.projectile');
    expect(cannon.cooldownSeconds).toBe(BASE_CONFIG.weapons.cannonCooldown);
    expect(cannon.projectileId).toBe('projectile.cannonShell');
    const jackpot = pack.getWeapon('weapon.jackpotShell');
    expect(jackpot.behaviorId).toBe('weapon.chargeProjectile');
    expect(jackpot.chargeSeconds).toBe(BASE_CONFIG.weapons.jackpotChargeTime);
    const rammer = pack.getEnemy('enemy.rammer');
    expect((rammer as { chargeSpeed: number }).chargeSpeed).toBe(BASE_CONFIG.enemies.rammerChargeSpeed);
    const truck = pack.getEnemy('enemy.lootTruck');
    expect((truck as { spawnTime: number }).spawnTime).toBe(BASE_CONFIG.enemies.truckSpawnTime);
    const scoring = pack.getScoring('scoring.demoScoreAttack');
    expect(scoring.enemyScores['enemy.scrapBug']).toBe(BASE_CONFIG.scoring.bugScore);
    expect(scoring.jackpotGains.normalScrap).toBe(BASE_CONFIG.jackpot.normalScrapGain);
    const spawn = pack.getSpawnDirector('spawn.director.demoScoreAttack');
    expect(spawn.rammerSpawns).toEqual([22, 34, 50]);
    expect(spawn.towerSpawns).toEqual([26, 58]);
  });

  it('accepts well-formed item and status-effect definitions (empty in the Demo pack)', () => {
    const { manifest, files } = loadRealPackRecords();
    const m = deepClone(manifest) as { pack: { files: Record<string, string[]> } };
    m.pack.files.items = ['items/repairKit.json'];
    m.pack.files.statusEffects = ['status-effects/overdrive.json'];
    files['items/repairKit.json'] = {
      id: 'item.repairKit',
      kind: 'repair',
      duration: 5,
      stackable: false,
    };
    files['status-effects/overdrive.json'] = {
      id: 'status.overdrive',
      kind: 'overdrive',
      duration: 8,
      magnitude: 1.5,
    };
    const pack = new ContentLoader().loadFromRecords(m, files);
    expect(pack.getItem('item.repairKit').kind).toBe('repair');
    expect(pack.getStatusEffect('status.overdrive').magnitude).toBe(1.5);
  });
});

describe('content validation failures', () => {
  it('rejects duplicate definition ids with file context', () => {
    const { manifest, files } = loadRealPackRecords();
    const m = deepClone(manifest) as { pack: { files: Record<string, string[]> } };
    m.pack.files.weapons.push('weapons/dupe.json');
    files['weapons/dupe.json'] = deepClone(files['weapons/machineGun.json']);
    const err = loadExpectingError(m, files);
    expect(err.message).toContain("duplicate definition id 'weapon.machineGun'");
    expect(err.issues.join('\n')).toContain('weapons/dupe.json');
  });

  it('rejects manifest entries whose files are missing', () => {
    const { manifest, files } = loadRealPackRecords();
    const m = deepClone(manifest) as { pack: { files: Record<string, string[]> } };
    m.pack.files.enemies.push('enemies/ghost.json');
    const err = loadExpectingError(m, files);
    expect(err.message).toContain("missing content file 'enemies/ghost.json'");
    expect(err.issues.join('\n')).toContain('manifest.json: pack.files.enemies');
  });

  it('rejects unknown references with file and JSON path', () => {
    const { manifest, files } = loadRealPackRecords();
    const mode = deepClone(files['modes/demoScoreAttack.json']) as { tank: string };
    mode.tank = 'tank.missing';
    files['modes/demoScoreAttack.json'] = mode;
    const err = loadExpectingError(manifest, files);
    expect(err.issues.some((i) => i.includes('modes/demoScoreAttack.json: tank — unknown reference'))).toBe(true);
  });

  it('rejects unknown behavior ids', () => {
    const { manifest, files } = loadRealPackRecords();
    const rammer = deepClone(files['enemies/rammer.json']) as {
      behaviors: Array<{ id: string; parameters?: Record<string, unknown> }>;
    };
    rammer.behaviors.push({ id: 'movement.nonexistent', parameters: {} });
    files['enemies/rammer.json'] = rammer;
    const err = loadExpectingError(manifest, files);
    expect(err.issues.some((i) => i.includes("enemies/rammer.json: behaviors[2].id — unknown enemy behavior 'movement.nonexistent'"))).toBe(true);
  });

  it('rejects unknown stat ids in stats records', () => {
    const { manifest, files } = loadRealPackRecords();
    const bug = deepClone(files['enemies/scrapBug.json']) as Record<string, unknown>;
    bug.stats = { 'tank.bogus': 1 };
    files['enemies/scrapBug.json'] = bug;
    const err = loadExpectingError(manifest, files);
    expect(err.issues.some((i) => i.includes("unknown stat id 'tank.bogus'"))).toBe(true);
  });

  it('rejects unknown difficulty override stat ids and accepts known tank.* ids', () => {
    const { manifest, files } = loadRealPackRecords();
    const originalSoap = deepClone(files['difficulties/soapTracks.json']) as { overrides: Record<string, number> };
    const originalMoon = deepClone(files['difficulties/moonYard.json']);
    const moon = deepClone(files['difficulties/moonYard.json']) as { overrides: Record<string, number> };
    moon.overrides['match.bogus'] = 1;
    files['difficulties/moonYard.json'] = moon;
    const err = loadExpectingError(manifest, files);
    expect(err.issues.some((i) => i.includes("unknown stat id 'match.bogus'"))).toBe(true);

    const soap = deepClone(files['difficulties/soapTracks.json']) as { overrides: Record<string, number> };
    soap.overrides['tank.bogus'] = 2;
    files['difficulties/soapTracks.json'] = soap;
    const err2 = loadExpectingError(manifest, files);
    expect(err2.issues.some((i) => i.includes("unknown stat id 'tank.bogus'"))).toBe(true);

    // tank.* overrides are valid when the stat exists (jump/dash tuning).
    const valid = deepClone(originalSoap) as { overrides: Record<string, number> };
    valid.overrides['tank.dashImpulse'] = 12;
    files['difficulties/soapTracks.json'] = valid;
    files['difficulties/moonYard.json'] = originalMoon;
    expect(() => new ContentLoader().loadFromRecords(manifest, files)).not.toThrow();
  });

  it('rejects invalid numeric values with file and JSON path', () => {
    const { manifest, files } = loadRealPackRecords();
    const tower = deepClone(files['enemies/gunTower.json']) as { shotCount: number };
    tower.shotCount = 2.5;
    files['enemies/gunTower.json'] = tower;
    const err = loadExpectingError(manifest, files);
    expect(err.issues.some((i) => i.includes('enemies/gunTower.json: shotCount'))).toBe(true);

    const tank = deepClone(files['tanks/default.json']) as { forwardSpeed: number };
    tank.forwardSpeed = -18;
    files['tanks/default.json'] = tank;
    const err2 = loadExpectingError(manifest, files);
    expect(err2.issues.some((i) => i.includes('tanks/default.json: forwardSpeed'))).toBe(true);
  });

  it('rejects malformed manifests with manifest.json context', () => {
    const { files } = loadRealPackRecords();
    const err = loadExpectingError({ pack: { id: 'Bad Pack', version: 'v1' } }, files);
    expect(err.file).toBe('manifest.json');
    expect(err.issues.length).toBeGreaterThan(0);
  });

  it('rejects content files that escape the content root', () => {
    const tmp = fs.mkdtempSync(path.join(ROOT, 'tests/fixtures/tmp-content-'));
    try {
      const manifest = {
        pack: {
          id: 'bad',
          version: '1.0.0',
          mode: 'mode.demoScoreAttack',
          files: {
            modes: [], objectives: [], maps: [], terrainProfiles: [], validationProfiles: [],
            landmarks: [], furnitureSets: [], densityProfiles: [], tanks: [], loadouts: [],
            weapons: ['../../package.json'], projectiles: [], enemies: [],
            dropTables: [], pickups: [],
            items: [], statusEffects: [], spawnDirectors: [], scoring: [],
            results: [], difficulties: [], presentation: [],
          },
        },
      };
      fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(manifest), 'utf8');
      expect(() => new ContentLoader().loadFromFilesystem(tmp)).toThrow(/escapes content root/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('deterministic content hash', () => {
  it('canonicalStringify is key-order invariant', () => {
    expect(canonicalStringify({ b: 1, a: { d: 4, c: 3 } })).toBe(canonicalStringify({ a: { c: 3, d: 4 }, b: 1 }));
    expect(canonicalStringify([2, 1])).toBe('[2,1]');
  });

  it('same content always hashes the same, independent of file order', () => {
    const { manifest, files } = loadRealPackRecords();
    const m = deepClone(manifest) as { pack: { files: Record<string, string[]> } };
    m.pack.files.weapons.reverse();
    m.pack.files.enemies.reverse();
    const a = new ContentLoader().loadFromRecords(manifest, files);
    const b = new ContentLoader().loadFromRecords(m, files);
    expect(a.hash).toBe(b.hash);
  });

  it('content changes change the hash', () => {
    const { manifest, files } = loadRealPackRecords();
    const changed = deepClone(files['tanks/default.json']) as { forwardSpeed: number };
    changed.forwardSpeed = 19;
    files['tanks/default.json'] = changed;
    const a = new ContentLoader().loadFromRecords(manifest, files);
    const { manifest: m2, files: f2 } = loadRealPackRecords();
    const b = new ContentLoader().loadFromRecords(m2, f2);
    expect(a.hash).not.toBe(b.hash);
  });

  it('hash is a stable sha256 over canonical content', () => {
    expect(contentHash({ a: 1, b: 'x' })).toBe(contentHash({ b: 'x', a: 1 }));
    expect(contentHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('frozen definitions and registry isolation', () => {
  it('freezes definitions, nested arrays, and pack maps', () => {
    const pack = new ContentLoader().loadFromFilesystem(CONTENT_ROOT);
    const tank = pack.getTank('tank.default');
    expect(Object.isFrozen(tank)).toBe(true);
    expect(Object.isFrozen(tank.footprint)).toBe(true);
    expect(Object.isFrozen(tank.footprint[0])).toBe(true);
    expect(() => {
      (tank as { forwardSpeed: number }).forwardSpeed = 99;
    }).toThrow();
    expect(() => {
      (tank.footprint as { offset: number; radius: number }[]).push({ offset: 0, radius: 1 });
    }).toThrow();
    const maps = (pack as unknown as { maps: Record<string, ReadonlyMap<string, unknown>> }).maps;
    for (const map of Object.values(maps)) {
      expect(Object.isFrozen(map)).toBe(true);
    }
  });

  it('freezes definitions at registry registration time', () => {
    const registry = new DefinitionRegistry<{ id: string }>();
    registry.register({ id: 'x.one' });
    expect(Object.isFrozen(registry.get('x.one'))).toBe(true);
    expect(() => registry.register({ id: 'x.one' })).toThrow(/duplicate/);
  });

  it('creates independent immutable packs per load (no shared mutable runtime state)', () => {
    const { manifest, files } = loadRealPackRecords();
    const a = new ContentLoader().loadFromRecords(manifest, files);
    const b = new ContentLoader().loadFromRecords(manifest, files);
    expect(a).not.toBe(b);
    expect(a.hash).toBe(b.hash);
    expect(a.getTank('tank.default')).not.toBe(b.getTank('tank.default'));
    const mapsA = (a as unknown as { maps: Record<string, unknown> }).maps;
    const mapsB = (b as unknown as { maps: Record<string, unknown> }).maps;
    expect(mapsA.tanks).not.toBe(mapsB.tanks);
    expect(() => {
      (a.getEnemy('enemy.scrapBug') as { hp: number }).hp = 99;
    }).toThrow();
    expect(b.getEnemy('enemy.scrapBug').hp).toBe(BASE_CONFIG.enemies.bugHp);
  });
});
