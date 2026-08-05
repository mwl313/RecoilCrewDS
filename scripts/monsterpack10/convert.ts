/**
 * Pure conversion from standalone Monster Pack 10 source manifests to
 * native Recoil Crew content. No filesystem access: tests can drive this
 * with fixture manifests.
 */
import type {
  MonsterPackSourceManifests,
  MonsterRuntimeVariant,
  NativeAnimationProfile,
  NativeArtRoster,
  NativeAssetEntry,
  NativeMonsterPackRecord,
  NativePresentationProfile,
  ScaleMappingRecord,
  SocketMappingRecord,
} from './types';

export const TIER_FOLDERS = {
  hero: 'hero',
  commonNear: 'common-near',
  commonFar: 'common-far',
  aggregate: 'aggregate',
} as const;

export const VARIANT_COUNTS: Record<string, number> = {
  hero: 45,
  commonNear: 15,
  commonFar: 15,
  aggregate: 15,
};

/** Deterministic slug -> camelCase id segment (injective for the pack). */
export function slugToCamel(slug: string): string {
  const parts = slug.split('-');
  const head = parts[0] ?? '';
  const rest = parts.slice(1).map((p) => p ? p[0].toUpperCase() + p.slice(1) : '');
  return head + rest.join('');
}

export function nativeIdsFor(slug: string): {
  heroAssetId: string;
  commonNearAssetId: string;
  commonFarAssetId: string;
  aggregateAssetId: string;
} {
  const camel = slugToCamel(slug);
  return {
    heroAssetId: `custom.enemy.quaternius.${camel}.hero`,
    commonNearAssetId: `custom.enemy.quaternius.${camel}.commonNear`,
    commonFarAssetId: `custom.enemy.quaternius.${camel}.commonFar`,
    aggregateAssetId: `custom.enemy.quaternius.${camel}.aggregate`,
  };
}

/** Asset-failure fallback by role class; never determines gameplay. */
export function fallbackFor(model: MonsterPackSourceManifests['catalog']['models'][number]): string {
  const roles = new Set(model.classification.roleCandidates ?? []);
  if (roles.has('ranged') || roles.has('static') || roles.has('tower') || roles.has('gunner')) {
    return 'enemy.gunTower';
  }
  if (roles.has('charger') || roles.has('bruiser') || roles.has('ram') || roles.has('heavy')) {
    return 'enemy.rammer';
  }
  if (
    model.classification.commonEligibility === 'candidate' ||
    roles.has('fodder') ||
    roles.has('swarm') ||
    roles.has('ground')
  ) {
    return 'enemy.scrapBug';
  }
  return 'enemy.witch';
}

const SOURCE_ROLE_TO_NATIVE: Record<string, string> = {
  idle: 'idle',
  walk: 'walk',
  run: 'run',
  move: 'walk',
  hover: 'hoverMove',
  fastHover: 'fastHover',
  attackPrimary: 'attackPrimary',
  attackSecondary: 'attackSecondary',
  hit: 'hit',
  stagger: 'stagger',
  land: 'land',
  spawn: 'spawn',
  entrance: 'entrance',
  death: 'death',
  recovery: 'recovery',
};

const LOOP_ROLES = new Set(['idle', 'walk', 'run', 'hoverMove', 'fastHover']);

function nativeClips(semanticClipMap: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [sourceRole, clip] of Object.entries(semanticClipMap)) {
    const native = SOURCE_ROLE_TO_NATIVE[sourceRole];
    if (native && typeof clip === 'string' && clip.length > 0) out[native] = clip;
  }
  return out;
}

function playbackFor(clips: Record<string, string>): NonNullable<NativeAnimationProfile['playback']> {
  const playback: NonNullable<NativeAnimationProfile['playback']> = {};
  for (const role of Object.keys(clips)) {
    if (LOOP_ROLES.has(role)) {
      playback[role] = { loop: 'repeat' };
    } else if (role === 'death') {
      playback[role] = { loop: 'once', clampWhenFinished: true, interruptPriority: 100 };
    } else if (role === 'hit' || role === 'stagger' || role === 'knockback') {
      playback[role] = { loop: 'once', clampWhenFinished: true, interruptPriority: 3 };
    } else if (
      role === 'attackPrimary' ||
      role === 'attackSecondary' ||
      role === 'attackSpecial'
    ) {
      playback[role] = { loop: 'once', clampWhenFinished: true, interruptPriority: 2 };
    } else {
      playback[role] = { loop: 'once', clampWhenFinished: true, interruptPriority: 1 };
    }
  }
  return playback;
}

const COMMON_FALLBACKS: Record<string, string> = {
  run: 'walk',
  fastHover: 'hoverMove',
  attackSecondary: 'attackPrimary',
  attackSpecial: 'attackPrimary',
  spawn: 'idle',
  entrance: 'idle',
  recovery: 'idle',
  land: 'idle',
  knockback: 'hit',
  stagger: 'hit',
  hit: 'idle',
  walk: 'idle',
  hoverMove: 'idle',
};

function baseLocomotion() {
  return {
    idleSpeedMax: 0.2,
    walkSpeedMax: 4,
    walkSpeedReference: 3.5,
    runSpeedReference: 8,
    playbackMin: 0.5,
    playbackMax: 1.5,
    randomStartPhase: true,
  };
}

function baseTransitions() {
  return {
    defaultCrossFadeSeconds: 0.2,
    locomotionCrossFadeSeconds: 0.25,
    attackCrossFadeSeconds: 0.08,
    hitCrossFadeSeconds: 0.06,
    deathCrossFadeSeconds: 0.35,
  };
}

export function buildHeroAnimationProfile(
  sourceModelId: string,
  slug: string,
  semanticClipMap: Record<string, string>,
): NativeAnimationProfile {
  const clips = nativeClips(semanticClipMap);
  return {
    id: `enemyAnimation.quaternius.${slug}.hero`,
    label: `Quaternius ${slug} Hero`,
    clips,
    fallbacks: {},
    locomotion: baseLocomotion(),
    transitions: baseTransitions(),
    playback: playbackFor(clips),
    rootMotion: false,
  };
}

/**
 * Common profile: only clips that exist in the commonNear GLB are mapped;
 * stripped roles fall back through semantic chains (never missing clips).
 */
export function buildCommonAnimationProfile(
  sourceModelId: string,
  slug: string,
  semanticClipMap: Record<string, string>,
  commonNearClips: readonly string[],
): NativeAnimationProfile {
  const available = new Set(commonNearClips);
  const clips: Record<string, string> = {};
  for (const [role, clip] of Object.entries(nativeClips(semanticClipMap))) {
    if (available.has(clip)) clips[role] = clip;
  }
  const fallbacks: Record<string, string> = {};
  for (const role of Object.keys(COMMON_FALLBACKS)) {
    if (clips[role] === undefined) fallbacks[role] = COMMON_FALLBACKS[role];
  }
  return {
    id: `enemyAnimation.quaternius.${slug}.common`,
    label: `Quaternius ${slug} Common`,
    clips,
    fallbacks,
    locomotion: baseLocomotion(),
    transitions: baseTransitions(),
    playback: playbackFor(clips),
    rootMotion: false,
  };
}

export function buildHeroPresentationProfile(
  slug: string,
  ids: ReturnType<typeof nativeIdsFor>,
  scale: { hoverOffset: number },
): NativePresentationProfile {
  return {
    id: `enemyPresentation.quaternius.${slug}.hero`,
    label: `Quaternius ${slug} Hero`,
    nearModelAssetId: ids.heroAssetId,
    animationProfileId: `enemyAnimation.quaternius.${slug}.hero`,
    lodPolicyId: 'animationLod.hero',
    shadowPolicyId: 'animationShadow.hero',
    transform: {
      scale: 1,
      position: [0, scale.hoverOffset, 0],
    },
    tags: ['quaternius', slug, 'hero'],
  };
}

export function buildCommonPresentationProfile(
  slug: string,
  ids: ReturnType<typeof nativeIdsFor>,
  scale: { hoverOffset: number },
): NativePresentationProfile {
  return {
    id: `enemyPresentation.quaternius.${slug}.common`,
    label: `Quaternius ${slug} Common`,
    nearModelAssetId: ids.commonNearAssetId,
    farModelAssetId: ids.commonFarAssetId,
    aggregateModelAssetId: ids.aggregateAssetId,
    animationProfileId: `enemyAnimation.quaternius.${slug}.common`,
    lodPolicyId: 'animationLod.defaultHorde',
    shadowPolicyId: 'animationShadow.defaultHorde',
    transform: {
      scale: 1,
      position: [0, scale.hoverOffset, 0],
    },
    tags: ['quaternius', slug, 'common'],
  };
}

export function buildAssetEntry(
  id: string,
  file: string,
  fallbackAssetId: string,
  slug: string,
  tier: string,
  skinned: boolean,
): NativeAssetEntry {
  return {
    id,
    kind: 'model',
    namespace: 'custom',
    file,
    fallbackAssetId,
    tags: ['enemy', 'quaternius', slug, tier, skinned ? 'skinned' : 'rigid'],
    optional: true,
  };
}

export interface MonsterPackConversionInput {
  manifests: MonsterPackSourceManifests;
  variants: Record<string, MonsterRuntimeVariant>;
  hashes: Record<string, string>;
}

export interface MonsterPackConversionOutput {
  assetEntries: NativeAssetEntry[];
  heroAnimationProfiles: NativeAnimationProfile[];
  commonAnimationProfiles: NativeAnimationProfile[];
  heroPresentationProfiles: NativePresentationProfile[];
  commonPresentationProfiles: NativePresentationProfile[];
  roster: NativeArtRoster;
  scaleMappings: Record<string, ScaleMappingRecord>;
  socketMappings: Record<string, SocketMappingRecord>;
  nativeIndex: Record<string, NativeMonsterPackRecord>;
  assetCatalogEntries: Record<string, NativeAssetEntry>;
}

export function convertMonsterPack(input: MonsterPackConversionInput): MonsterPackConversionOutput {
  const { manifests, variants, hashes } = input;
  const models = manifests.catalog.models;
  const bySlug = new Map(models.map((m) => [m.slug, m]));
  const commonSlugs = new Set<string>();
  for (const v of Object.values(variants)) {
    if (v.variant === 'commonNear') {
      commonSlugs.add(v.sourceModelId.replace('monster.quaternius.', ''));
    }
  }

  const assetEntries: NativeAssetEntry[] = [];
  const heroAnimationProfiles: NativeAnimationProfile[] = [];
  const commonAnimationProfiles: NativeAnimationProfile[] = [];
  const heroPresentationProfiles: NativePresentationProfile[] = [];
  const commonPresentationProfiles: NativePresentationProfile[] = [];
  const scaleMappings: Record<string, ScaleMappingRecord> = {};
  const socketMappings: Record<string, SocketMappingRecord> = {};
  const nativeIndex: Record<string, NativeMonsterPackRecord> = {};

  for (const model of models) {
    const slug = model.slug;
    const ids = nativeIdsFor(slug);
    const fallback = fallbackFor(model);
    const anim = manifests.animationProfiles.profiles[model.id]?.semanticClipMap ?? {};
    const rawScale = manifests.scaleProfiles.profiles[model.id];
    const normalizedHeight = rawScale?.normalizedHeight ?? 1.2;
    const scale = {
      normalizedHeight,
      groundOffset: rawScale?.groundOffset ?? 0,
      hoverOffset: rawScale?.hoverOffset ?? 0,
      recommendedCommonHeight: rawScale?.recommendedCommonHeight ?? normalizedHeight,
      recommendedEliteHeight: rawScale?.recommendedEliteHeight ?? normalizedHeight * 1.5,
      recommendedBossHeight: rawScale?.recommendedBossHeight ?? normalizedHeight * 2.75,
      suggestedCollisionRadius: rawScale?.suggestedCollisionRadius ?? 0.5,
      suggestedCollisionHeight: rawScale?.suggestedCollisionHeight ?? 1.0,
    };
    const socket = manifests.socketProfiles.profiles[model.id] ?? {
      center: 'socket.center',
      head: 'socket.head',
      weapon: 'socket.weapon',
      projectile: 'socket.projectile',
      hitVfx: 'socket.hitVfx',
      deathVfx: 'socket.deathVfx',
      shadow: 'socket.shadow',
    };

    const heroVariant = variants[`model.quaternius.${slug}.hero`];
    if (!heroVariant) throw new Error(`missing hero variant for '${slug}'`);
    assetEntries.push(
      buildAssetEntry(
        ids.heroAssetId,
        `/assets/models/enemies/quaternius/hero/${heroVariant.outputFile.split('/').pop()}`,
        fallback,
        slug,
        'hero',
        true,
      ),
    );

    const heroAnim = buildHeroAnimationProfile(model.id, slug, anim);
    heroAnimationProfiles.push(heroAnim);
    heroPresentationProfiles.push(buildHeroPresentationProfile(slug, ids, scale));

    let commonNearAssetId: string | undefined;
    let commonFarAssetId: string | undefined;
    let aggregateAssetId: string | undefined;
    let commonAnim: NativeAnimationProfile | undefined;
    let commonPres: NativePresentationProfile | undefined;

    if (commonSlugs.has(slug)) {
      const near = variants[`model.quaternius.${slug}.commonNear`];
      const far = variants[`model.quaternius.${slug}.commonFar`];
      const agg = variants[`model.quaternius.${slug}.aggregate`];
      if (!near || !far || !agg) throw new Error(`missing common variants for '${slug}'`);
      assetEntries.push(
        buildAssetEntry(
          ids.commonNearAssetId,
          `/assets/models/enemies/quaternius/common-near/${near.outputFile.split('/').pop()}`,
          fallback,
          slug,
          'common',
          true,
        ),
      );
      assetEntries.push(
        buildAssetEntry(
          ids.commonFarAssetId,
          `/assets/models/enemies/quaternius/common-far/${far.outputFile.split('/').pop()}`,
          fallback,
          slug,
          'far',
          false,
        ),
      );
      assetEntries.push(
        buildAssetEntry(
          ids.aggregateAssetId,
          `/assets/models/enemies/quaternius/aggregate/${agg.outputFile.split('/').pop()}`,
          fallback,
          slug,
          'aggregate',
          false,
        ),
      );
      commonNearAssetId = ids.commonNearAssetId;
      commonFarAssetId = ids.commonFarAssetId;
      aggregateAssetId = ids.aggregateAssetId;
      commonAnim = buildCommonAnimationProfile(model.id, slug, anim, near.measured.clipNames);
      commonAnimationProfiles.push(commonAnim);
      commonPres = buildCommonPresentationProfile(slug, ids, scale);
      commonPresentationProfiles.push(commonPres);
    }

    const importedHashes: Record<string, string> = {};
    for (const v of Object.values(variants)) {
      if (v.sourceModelId === model.id) {
        importedHashes[v.variant] = v.outputSha256;
      }
    }
    const hashesForModel: Record<string, string> = {};
    for (const [variant, hash] of Object.entries(importedHashes)) {
      hashesForModel[variant] = hashes[variant] ?? hash;
    }

    scaleMappings[`scale.quaternius.${slug}`] = {
      sourceModelId: model.id,
      nativeAssetIds: [
        ids.heroAssetId,
        ...(commonNearAssetId ? [ids.commonNearAssetId] : []),
        ...(commonFarAssetId ? [ids.commonFarAssetId] : []),
        ...(aggregateAssetId ? [ids.aggregateAssetId] : []),
      ],
      presentationTransform: { scale: 1, position: [0, scale.hoverOffset, 0] },
      recommendedCollision: {
        radius: scale.suggestedCollisionRadius,
        height: scale.suggestedCollisionHeight,
      },
      flyingOffsetApplied: scale.hoverOffset !== 0,
    };
    socketMappings[`socket.quaternius.${slug}`] = {
      sourceModelId: model.id,
      nativeAssetId: ids.heroAssetId,
      socketBindings: {
        center: socket.center,
        head: socket.head,
        weapon: socket.weapon,
        projectile: socket.projectile,
        hitVfx: socket.hitVfx,
        deathVfx: socket.deathVfx,
        shadow: socket.shadow,
      },
    };
    nativeIndex[model.id] = {
      sourceModelId: model.id,
      slug,
      heroAssetId: ids.heroAssetId,
      commonNearAssetId,
      commonFarAssetId,
      aggregateAssetId,
      heroAnimationProfileId: heroAnim.id,
      commonAnimationProfileId: commonAnim?.id,
      heroPresentationProfileId: heroPresentationProfiles[heroPresentationProfiles.length - 1].id,
      commonPresentationProfileId: commonPres?.id,
      scaleMappingId: `scale.quaternius.${slug}`,
      socketMappingId: `socket.quaternius.${slug}`,
      roleCandidates: model.classification.roleCandidates ?? [],
      rigFamilyId: model.classification.rigFamilyId,
      importedHashes: hashesForModel,
    };
  }

  const previewSlugs = [
    'mushnub',
    'wizard',
    'orc-enemy',
    'armabee',
    'glub',
    'blue-demon',
    'mushroom-king',
    'dragon-evolved',
  ];
  const roster: NativeArtRoster = {
    id: 'enemyArtRoster.quaternius.integrationPreview',
    commonPresentationProfileIds: previewSlugs
      .filter((s) => commonSlugs.has(s))
      .map((s) => `enemyPresentation.quaternius.${s}.common`),
    elitePresentationProfileIds: ['blue-demon', 'mushroom-king'].map(
      (s) => `enemyPresentation.quaternius.${s}.hero`,
    ),
    bossPresentationProfileIds: ['dragon-evolved'].map(
      (s) => `enemyPresentation.quaternius.${s}.hero`,
    ),
    preloadAssetIds: previewSlugs.flatMap((s) => {
      const ids = nativeIdsFor(s);
      const out = [ids.heroAssetId];
      if (commonSlugs.has(s)) out.push(ids.commonNearAssetId, ids.commonFarAssetId, ids.aggregateAssetId);
      return out;
    }),
  };

  const assetCatalogEntries: Record<string, NativeAssetEntry> = {};
  for (const e of assetEntries) assetCatalogEntries[e.id] = e;
  return {
    assetEntries,
    heroAnimationProfiles,
    commonAnimationProfiles,
    heroPresentationProfiles,
    commonPresentationProfiles,
    roster,
    scaleMappings,
    socketMappings,
    nativeIndex,
    assetCatalogEntries,
  };
}
