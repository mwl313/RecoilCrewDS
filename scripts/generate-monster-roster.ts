/**
 * Generates the launch monster roster content:
 * - 51 monster definitions (39 ordinary + 6 elites + 6 bosses)
 * - enemy projectile definitions
 * - the production art roster `enemyArtRoster.quaternius.mainStage`
 *
 * Values are authored here as the single source table (design examples
 * anchor ninja/wizard/demon/yeti; the canonical category table referenced by
 * the binding design is not present in the repository, so remaining values
 * follow the design's archetype rules and are flagged in the content report).
 * Output files are committed; the script is re-runnable.
 */
import fs from 'node:fs';
import path from 'node:path';

interface MonsterRow {
  slug: string;
  tier: 'fodder' | 'specialist' | 'elite' | 'boss';
  sizeClass: 'small' | 'medium' | 'large';
  hp: number;
  speed: number;
  threat: number;
  rewardClass: 'ambient' | 'wave' | 'elite' | 'boss';
  attack: 'melee' | 'ranged' | 'mixed';
  contactDps?: number;
  damage?: number;
  rate: number;
  range: number;
  preferredRange?: number;
  projectileId?: string;
  telegraphTime?: number;
  /** Cross-role suffix: '.boss' or '.elite' (featured identity roles). */
  roleSuffix?: string;
  /** Featured identity whose tier-specific mixed repertoire is authored below. */
  patternKey?: FeaturedIdentity;
}

type FeaturedIdentity = 'alien' | 'cactoro' | 'fish' | 'ninja' | 'demon' | 'yeti';

// 15 families with common-near/far/aggregate presentation.
const COMMON_SLUGS = new Set([
  'alien', 'alpaking', 'armabee', 'cactoro', 'cat', 'chicken', 'glub',
  'green-blob', 'mushnub', 'ninja', 'orc-enemy', 'pigeon', 'pink-blob',
  'wizard', 'yeti',
]);

const ELITE_SLUGS = ['alien-high-detail', 'cactoro-high-detail', 'fish-high-detail', 'ninja-high-detail'];
const BOSS_SLUGS = ['demon-high-detail', 'yeti-high-detail'];

function melee(slug: string, tier: 'fodder' | 'specialist' | 'elite', sizeClass: 'small' | 'medium' | 'large', hp: number, speed: number, threat: number, contactDps: number, rate: number, range: number, rewardClass: 'ambient' | 'wave' | 'elite'): MonsterRow {
  return { slug, tier, sizeClass, hp, speed, threat, rewardClass, attack: 'melee', contactDps, rate, range };
}

function ranged(slug: string, tier: 'fodder' | 'specialist' | 'elite', sizeClass: 'small' | 'medium' | 'large', hp: number, speed: number, threat: number, damage: number, rate: number, range: number, projectileId: string, telegraphTime: number, preferredRange = 14): MonsterRow {
  return { slug, tier, sizeClass, hp, speed, threat, rewardClass: tier === 'elite' ? 'elite' : 'ambient', attack: 'ranged', damage, rate, range, preferredRange, projectileId, telegraphTime };
}

const ORDINARY: MonsterRow[] = [
  // Melee fodder.
  melee('alien', 'fodder', 'small', 4, 4.2, 1, 4, 2.2, 2, 'ambient'),
  melee('birb', 'fodder', 'small', 3, 4.0, 1, 3, 2.0, 2, 'ambient'),
  melee('bunny', 'fodder', 'small', 3, 4.5, 1, 3, 2.2, 2, 'ambient'),
  melee('cat', 'fodder', 'small', 4, 4.0, 1, 4, 2.0, 2, 'ambient'),
  melee('chicken', 'fodder', 'small', 3, 4.2, 1, 3, 2.4, 2, 'ambient'),
  melee('frog', 'fodder', 'small', 4, 3.6, 1, 4, 2.0, 2, 'ambient'),
  melee('glub', 'fodder', 'small', 5, 3.2, 1, 5, 1.8, 2, 'ambient'),
  melee('green-blob', 'fodder', 'small', 5, 3.0, 1, 5, 1.8, 2, 'ambient'),
  melee('mushnub', 'fodder', 'small', 4, 3.4, 1, 4, 2.0, 2, 'ambient'),
  melee('ninja', 'fodder', 'small', 4, 4.5, 1, 4, 2.2, 2, 'ambient'),
  melee('pink-blob', 'fodder', 'small', 5, 3.0, 1, 5, 1.8, 2, 'ambient'),
  melee('squidle', 'fodder', 'small', 4, 3.6, 1, 4, 2.0, 2, 'ambient'),
  // Ranged fodder.
  ranged('wizard', 'fodder', 'medium', 3, 2.6, 2, 6, 0.5, 36, 'projectile.enemyWizardShot', 0.8),
  ranged('pigeon', 'fodder', 'small', 2, 3.0, 2, 5, 0.6, 32, 'projectile.enemyBoneShot', 0.7, 12),
  ranged('ghost', 'fodder', 'medium', 4, 2.4, 2, 6, 0.5, 34, 'projectile.enemyGhostShot', 0.8),
  ranged('ghost-skull', 'fodder', 'medium', 4, 2.4, 2, 7, 0.5, 36, 'projectile.enemyGhostShot', 0.8),
  ranged('armabee', 'fodder', 'small', 3, 2.8, 2, 5, 0.6, 32, 'projectile.enemySpitShot', 0.7, 12),
  ranged('hywirl', 'fodder', 'medium', 4, 2.6, 2, 6, 0.5, 34, 'projectile.enemySpitShot', 0.8),
  ranged('alpaking', 'fodder', 'medium', 4, 2.6, 2, 6, 0.5, 34, 'projectile.enemySpitShot', 0.8),
  ranged('cactoro', 'fodder', 'medium', 4, 2.4, 2, 7, 0.5, 36, 'projectile.enemySpitShot', 0.9),
  ranged('yeti', 'fodder', 'medium', 5, 2.8, 2, 6, 0.5, 34, 'projectile.enemyIceShot', 0.9),
  // Specialists.
  melee('blue-demon', 'specialist', 'medium', 10, 3.2, 3, 7, 2.0, 2.5, 'wave'),
  melee('mushroom-king', 'specialist', 'medium', 12, 2.8, 3, 8, 1.8, 2.5, 'wave'),
  melee('monkroose', 'specialist', 'medium', 12, 3.0, 3, 8, 1.8, 2.5, 'wave'),
  melee('tribal', 'specialist', 'medium', 10, 3.4, 3, 7, 2.0, 2.5, 'wave'),
  melee('orc', 'specialist', 'medium', 12, 3.0, 3, 8, 1.8, 2.5, 'wave'),
  melee('orc-enemy', 'specialist', 'medium', 10, 3.2, 3, 7, 2.0, 2.5, 'wave'),
  melee('demon', 'specialist', 'medium', 12, 3.0, 3, 8, 1.8, 2.5, 'wave'),
  melee('fish', 'specialist', 'medium', 10, 3.0, 3, 7, 2.0, 2.5, 'wave'),
  melee('dino', 'specialist', 'large', 14, 3.2, 4, 9, 1.7, 3, 'wave'),
  melee('dragon', 'specialist', 'large', 14, 2.8, 4, 9, 1.7, 3, 'wave'),
  melee('dragon-evolved', 'specialist', 'large', 16, 3.0, 4, 10, 1.7, 3, 'wave'),
  melee('goleling', 'specialist', 'medium', 12, 2.8, 3, 8, 1.8, 2.5, 'wave'),
  melee('goleling-evolved', 'specialist', 'medium', 14, 2.8, 4, 9, 1.8, 2.5, 'wave'),
  ranged('armabee-evolved', 'specialist', 'medium', 10, 3.0, 3, 9, 0.55, 36, 'projectile.enemySpitShot', 0.9, 16),
  ranged('alpaking-evolved', 'specialist', 'medium', 10, 3.0, 3, 9, 0.55, 36, 'projectile.enemySpitShot', 0.9, 16),
  ranged('mushnub-evolved', 'specialist', 'medium', 10, 2.8, 3, 8, 0.5, 34, 'projectile.enemySpitShot', 0.9, 16),
  ranged('glub-evolved', 'specialist', 'medium', 12, 2.6, 3, 9, 0.5, 36, 'projectile.enemySpitShot', 0.9, 16),
  ranged('green-spiky-blob', 'specialist', 'medium', 12, 2.6, 3, 9, 0.5, 36, 'projectile.enemySpitShot', 0.9, 16),
];

const ELITES: MonsterRow[] = [
  { slug: 'alien-high-detail', tier: 'elite', sizeClass: 'medium', hp: 60, speed: 7.2, threat: 8, rewardClass: 'elite', attack: 'mixed', rate: 1.8, range: 2.5, patternKey: 'alien' },
  { slug: 'fish-high-detail', tier: 'elite', sizeClass: 'medium', hp: 55, speed: 7.6, threat: 8, rewardClass: 'elite', attack: 'mixed', rate: 2.0, range: 2.5, patternKey: 'fish' },
  { slug: 'ninja-high-detail', tier: 'elite', sizeClass: 'medium', hp: 50, speed: 9.2, threat: 8, rewardClass: 'elite', attack: 'mixed', rate: 2.2, range: 2.5, patternKey: 'ninja' },
  { slug: 'cactoro-high-detail', tier: 'elite', sizeClass: 'medium', hp: 70, speed: 5.2, threat: 8, rewardClass: 'elite', attack: 'mixed', rate: 0.45, range: 40, patternKey: 'cactoro' },
];

const BOSSES: MonsterRow[] = [
  {
    slug: 'demon-high-detail', tier: 'boss', sizeClass: 'large', hp: 250, speed: 9.6, threat: 50,
    rewardClass: 'boss', attack: 'mixed', rate: 0.8, range: 4, patternKey: 'demon',
  },
  {
    slug: 'yeti-high-detail', tier: 'boss', sizeClass: 'large', hp: 280, speed: 8.4, threat: 50,
    rewardClass: 'boss', attack: 'mixed', rate: 0.6, range: 4, patternKey: 'yeti',
  },
];

const BOSS_PATTERNS: Record<FeaturedIdentity, unknown> = {
  alien: {
    type: 'mixed',
    selection: { mode: 'orderedCycle' },
    patterns: [
      { id: 'punch', type: 'melee', damage: 28, rate: 0.9, range: 4 },
      { id: 'spit', type: 'ranged', damage: 20, rate: 0.45, range: 40, projectileId: 'projectile.enemySpitShot', visualColor: '#7CFF6B', telegraphTime: 1.0 },
    ],
  },
  cactoro: {
    type: 'mixed',
    selection: { mode: 'orderedCycle' },
    patterns: [
      { id: 'slam', type: 'melee', damage: 26, rate: 0.8, range: 4 },
      { id: 'needle', type: 'ranged', damage: 24, rate: 0.4, range: 40, projectileId: 'projectile.enemySpitShot', visualColor: '#B8FF3D', telegraphTime: 1.1 },
    ],
  },
  fish: {
    type: 'mixed',
    selection: { mode: 'orderedCycle' },
    patterns: [
      { id: 'bite', type: 'melee', damage: 30, rate: 0.9, range: 4 },
      { id: 'bubble', type: 'ranged', damage: 18, rate: 0.5, range: 38, projectileId: 'projectile.enemyBoneShot', visualColor: '#F5E6C8', telegraphTime: 0.9 },
    ],
  },
  ninja: {
    type: 'mixed',
    selection: { mode: 'orderedCycle' },
    patterns: [
      { id: 'slash', type: 'melee', damage: 26, rate: 1.0, range: 4 },
      { id: 'shuriken', type: 'ranged', damage: 18, rate: 0.5, range: 36, projectileId: 'projectile.enemyBoneShot', visualColor: '#BFC7D5', telegraphTime: 0.9 },
    ],
  },
  demon: {
    type: 'mixed', selection: { mode: 'orderedCycle' }, patterns: [
      { id: 'punch', type: 'melee', damage: 30, rate: 0.8, range: 4 },
      { id: 'fireball', type: 'ranged', damage: 22, rate: 0.4, range: 40, projectileId: 'projectile.enemyFireball', visualColor: '#FF3B30', telegraphTime: 1.0 },
    ],
  },
  yeti: {
    type: 'mixed', selection: { mode: 'orderedCycle' }, patterns: [
      { id: 'heavyStrike', type: 'melee', damage: 34, rate: 0.6, range: 4 },
      { id: 'iceBolt', type: 'ranged', damage: 26, rate: 0.3, range: 40, projectileId: 'projectile.enemyIceBolt', visualColor: '#C4F1FF', telegraphTime: 1.2 },
    ],
  },
};

const ELITE_PATTERNS: Record<FeaturedIdentity, unknown> = {
  alien: {
    type: 'mixed', selection: { mode: 'orderedCycle' }, patterns: [
      { id: 'punch', type: 'melee', damage: 10 / 1.8, rate: 1.8, range: 2.5 },
      { id: 'spit', type: 'ranged', damage: 10, rate: 1.0, range: 40, projectileId: 'projectile.enemySpitShot', visualColor: '#7CFF6B', telegraphTime: 1.0 },
    ],
  },
  cactoro: {
    type: 'mixed', selection: { mode: 'orderedCycle' }, patterns: [
      { id: 'slam', type: 'melee', damage: 8, rate: 0.9, range: 2.5 },
      { id: 'needle', type: 'ranged', damage: 16, rate: 0.45, range: 40, projectileId: 'projectile.enemySpitShot', visualColor: '#B8FF3D', telegraphTime: 1.0 },
    ],
  },
  fish: {
    type: 'mixed', selection: { mode: 'orderedCycle' }, patterns: [
      { id: 'bite', type: 'melee', damage: 12 / 2.0, rate: 2.0, range: 2.5 },
      { id: 'bubble', type: 'ranged', damage: 12, rate: 1.0, range: 38, projectileId: 'projectile.enemyBoneShot', visualColor: '#F5E6C8', telegraphTime: 0.9 },
    ],
  },
  ninja: {
    type: 'mixed', selection: { mode: 'orderedCycle' }, patterns: [
      { id: 'slash', type: 'melee', damage: 11 / 2.2, rate: 2.2, range: 2.5 },
      { id: 'shuriken', type: 'ranged', damage: 11, rate: 1.0, range: 36, projectileId: 'projectile.enemyBoneShot', visualColor: '#BFC7D5', telegraphTime: 0.9 },
    ],
  },
  demon: {
    type: 'mixed', selection: { mode: 'orderedCycle' }, patterns: [
      { id: 'punch', type: 'melee', damage: 11 / 1.9, rate: 1.9, range: 2.5 },
      { id: 'fireball', type: 'ranged', damage: 11, rate: 1.0, range: 40, projectileId: 'projectile.enemyFireball', visualColor: '#FF3B30', telegraphTime: 1.0 },
    ],
  },
  yeti: {
    type: 'mixed', selection: { mode: 'orderedCycle' }, patterns: [
      { id: 'heavyStrike', type: 'melee', damage: 10, rate: 0.75, range: 2.5 },
      { id: 'iceBolt', type: 'ranged', damage: 15, rate: 0.5, range: 38, projectileId: 'projectile.enemyIceBolt', visualColor: '#C4F1FF', telegraphTime: 1.0 },
    ],
  },
};

const CROSS_ROLES: MonsterRow[] = [
  { slug: 'alien-high-detail', roleSuffix: 'boss', tier: 'boss', sizeClass: 'large', hp: 220, speed: 10.2, threat: 45, rewardClass: 'boss', attack: 'mixed', rate: 0.9, range: 4, patternKey: 'alien' },
  { slug: 'cactoro-high-detail', roleSuffix: 'boss', tier: 'boss', sizeClass: 'large', hp: 240, speed: 8.4, threat: 45, rewardClass: 'boss', attack: 'mixed', rate: 0.8, range: 4, patternKey: 'cactoro' },
  { slug: 'fish-high-detail', roleSuffix: 'boss', tier: 'boss', sizeClass: 'large', hp: 210, speed: 11.4, threat: 45, rewardClass: 'boss', attack: 'mixed', rate: 0.9, range: 4, patternKey: 'fish' },
  { slug: 'ninja-high-detail', roleSuffix: 'boss', tier: 'boss', sizeClass: 'large', hp: 200, speed: 14.4, threat: 45, rewardClass: 'boss', attack: 'mixed', rate: 1.0, range: 4, patternKey: 'ninja' },
  { slug: 'demon-high-detail', roleSuffix: 'elite', tier: 'elite', sizeClass: 'medium', hp: 65, speed: 6.4, threat: 8, rewardClass: 'elite', attack: 'mixed', rate: 1.9, range: 2.5, patternKey: 'demon' },
  { slug: 'yeti-high-detail', roleSuffix: 'elite', tier: 'elite', sizeClass: 'medium', hp: 75, speed: 5.2, threat: 8, rewardClass: 'elite', attack: 'mixed', rate: 0.5, range: 38, patternKey: 'yeti' },
];

const RANGED_VISUAL_COLORS: Record<string, string> = {
  'alpaking-evolved': '#4B7BFF', alpaking: '#35D9FF',
  'armabee-evolved': '#FF8A3D', armabee: '#FFD23F', cactoro: '#42E37D',
  'ghost-skull': '#8A5CFF', ghost: '#B58CFF', 'glub-evolved': '#FF4FD8',
  'green-spiky-blob': '#20F28B', hywirl: '#00F0E0', 'mushnub-evolved': '#FF6FB1',
  pigeon: '#E6C78A', wizard: '#A855F7', yeti: '#69D2FF',
};

const PROJECTILES: Array<{ id: string; label: string; speed: number; life: number; hitRadius: number; tankHitRadius: number }> = [
  { id: 'projectile.enemyWizardShot', label: 'Wizard Shot', speed: 9, life: 6, hitRadius: 0.6, tankHitRadius: 1.2 },
  { id: 'projectile.enemyBoneShot', label: 'Bone Shot', speed: 7, life: 5, hitRadius: 0.5, tankHitRadius: 1.1 },
  { id: 'projectile.enemyGhostShot', label: 'Ghost Bolt', speed: 8, life: 7, hitRadius: 0.6, tankHitRadius: 1.2 },
  { id: 'projectile.enemySpitShot', label: 'Spit Shot', speed: 10, life: 6, hitRadius: 0.55, tankHitRadius: 1.2 },
  { id: 'projectile.enemyIceShot', label: 'Ice Shot', speed: 10, life: 8, hitRadius: 0.7, tankHitRadius: 1.3 },
  { id: 'projectile.enemyFireball', label: 'Demon Fireball', speed: 12, life: 8, hitRadius: 0.7, tankHitRadius: 1.3 },
  { id: 'projectile.enemyIceBolt', label: 'Yeti Ice Bolt', speed: 10, life: 8, hitRadius: 0.7, tankHitRadius: 1.3 },
];

function labelFor(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function behaviorsFor(row: MonsterRow): Array<{ id: string; parameters?: Record<string, number | string | boolean> }> {
  if (row.attack === 'melee') {
    return [
      { id: 'movement.trackTank', parameters: {} },
      { id: 'movement.densitySteering', parameters: {} },
      { id: 'movement.meleeEngagement', parameters: { profileId: 'meleeEngagement.default' } },
      { id: 'movement.integrate', parameters: {} },
      { id: 'attack.meleeCue', parameters: {} },
    ];
  }
  if (row.attack === 'ranged') {
    return [
      { id: 'movement.trackTank', parameters: { preferredRange: row.preferredRange ?? 14 } },
      { id: 'movement.densitySteering', parameters: {} },
      { id: 'movement.integrate', parameters: {} },
      { id: 'attack.projectileCue', parameters: { shotCount: 1 } },
    ];
  }
  return [
    { id: 'movement.trackTank', parameters: {} },
    { id: 'movement.densitySteering', parameters: {} },
    { id: 'attack.mixedCue', parameters: {} },
    { id: 'movement.integrate', parameters: {} },
  ];
}

function attackFor(row: MonsterRow): unknown {
  if (row.attack === 'melee') {
    return {
      type: 'melee',
      damageModel: 'contactDps',
      contactDps: row.contactDps,
      rate: row.rate,
      range: row.range,
      engagementProfileId: 'meleeEngagement.default',
    };
  }
  if (row.attack === 'ranged') {
    return {
      type: 'ranged',
      damage: row.damage,
      rate: row.rate,
      range: row.range,
      preferredRange: row.preferredRange,
      projectileId: row.projectileId,
      visualColor: RANGED_VISUAL_COLORS[row.slug],
      telegraphTime: row.telegraphTime,
      shotCount: 1,
    };
  }
  if (!row.patternKey) throw new Error(`mixed monster '${row.slug}' has no featured identity pattern key`);
  return row.tier === 'elite' ? ELITE_PATTERNS[row.patternKey] : BOSS_PATTERNS[row.patternKey];
}

function definitionFor(row: MonsterRow): Record<string, unknown> {
  const common = COMMON_SLUGS.has(row.slug);
  const variant = common && !row.roleSuffix ? 'common' : 'hero';
  const attack = attackFor(row) as { type: string };
  const suffix = row.roleSuffix ? `.${row.roleSuffix}` : '';
  const roleLabel =
    row.roleSuffix === 'boss' || (row.tier === 'boss' && !row.roleSuffix)
      ? ' Boss'
      : row.roleSuffix === 'elite' || (row.tier === 'elite' && !row.roleSuffix)
        ? ' Elite'
        : '';
  return {
    id: `enemy.quaternius.${row.slug}${suffix}`,
    label: `${labelFor(row.slug)}${roleLabel}`,
    type: 'monster',
    tier: row.tier,
    sizeClass: row.sizeClass,
    tierScale: row.tier === 'boss' ? 5 : row.tier === 'elite' ? 3 : 1,
    presentationProfileId: `enemyPresentation.quaternius.${row.slug}.${variant}`,
    animationProfileId: `enemyAnimation.quaternius.${row.slug}.${variant}`,
    stats: { hp: row.hp, speed: row.speed, threat: row.threat },
    rewardClass: row.rewardClass,
    levelScaling: { health: true, damage: row.tier !== 'boss' },
    attack,
    behaviors: behaviorsFor(row),
    spawnTags: [row.tier, attack.type, row.sizeClass],
  };
}

const allRows = [...ORDINARY, ...ELITES, ...BOSSES, ...CROSS_ROLES];
const slugs = new Set(allRows.map((r) => r.slug));
const catalog = JSON.parse(fs.readFileSync('docs/monsterpack10/source-manifests/monster_catalog.json', 'utf8')) as {
  models: Array<{ slug: string }>;
};
const missing = catalog.models.filter((m) => !slugs.has(m.slug)).map((m) => m.slug);
if (missing.length > 0) {
  throw new Error(`roster table missing monsters: ${missing.join(', ')}`);
}

const enemyDir = 'content/enemies';
fs.mkdirSync(enemyDir, { recursive: true });
for (const row of allRows) {
  fs.writeFileSync(
    path.join(enemyDir, `enemy.quaternius.${row.slug}${row.roleSuffix ? `.${row.roleSuffix}` : ''}.json`),
    JSON.stringify(definitionFor(row), null, 2) + '\n',
  );
}

const projectileDir = 'content/projectiles';
fs.mkdirSync(projectileDir, { recursive: true });
for (const p of PROJECTILES) {
  fs.writeFileSync(
    path.join(projectileDir, `${p.id.replace('projectile.', 'enemy_')}.json`),
    JSON.stringify(
      {
        id: p.id,
        label: p.label,
        kind: 'enemy',
        speed: p.speed,
        gravity: 0,
        life: p.life,
        hitRadius: p.hitRadius,
        tankHitRadius: p.tankHitRadius,
      },
      null,
      2,
    ) + '\n',
  );
}

const commonProfiles = [...COMMON_SLUGS].sort().map((s) => `enemyPresentation.quaternius.${s}.common`);
const eliteProfiles = [...ELITE_SLUGS].sort().map((s) => `enemyPresentation.quaternius.${s}.hero`);
const bossProfiles = [...BOSS_SLUGS].sort().map((s) => `enemyPresentation.quaternius.${s}.hero`);
const preload: string[] = [];
for (const m of catalog.models) {
  const camel = m.slug.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  preload.push(`custom.enemy.quaternius.${camel}.hero`);
  if (COMMON_SLUGS.has(m.slug)) {
    preload.push(`custom.enemy.quaternius.${camel}.commonNear`);
    preload.push(`custom.enemy.quaternius.${camel}.commonFar`);
    preload.push(`custom.enemy.quaternius.${camel}.aggregate`);
  }
}
fs.writeFileSync(
  'content/enemy-art-rosters/quaternius.mainStage.json',
  JSON.stringify(
    {
      id: 'enemyArtRoster.quaternius.mainStage',
      commonPresentationProfileIds: commonProfiles,
      elitePresentationProfileIds: eliteProfiles,
      bossPresentationProfileIds: bossProfiles,
      preloadAssetIds: preload.sort(),
    },
    null,
    2,
  ) + '\n',
);

console.log(`generated ${allRows.length} monsters (${ORDINARY.length} ordinary, 6 elites, 6 bosses), ${PROJECTILES.length} projectiles, production roster`);
