/** Typed views of the standalone Monster Pack 10 source manifests. */

export type MonsterVariant = 'hero' | 'commonNear' | 'commonFar' | 'aggregate';

export interface MonsterRuntimeVariant {
  id: string;
  variant: MonsterVariant;
  sourceModelId: string;
  pipelineVersion: string;
  outputFile: string;
  outputSha256: string;
  outputFileBytes: number;
  measured: {
    clipNames: string[];
    armatureCount: number;
    materialCount: number;
    triangleCount: number;
    meshCount: number;
  };
}

export interface MonsterCatalogModel {
  id: string;
  slug: string;
  sourceFile: string;
  classification: {
    rigFamilyId: string;
    roleCandidates: string[];
    commonEligibility: string;
    eliteEligibility: string;
    bossEligibility: string;
  };
  semanticAnimations: Record<string, string>;
}

export interface AnimationProfileSource {
  profileId: string;
  sourceModelId: string;
  semanticClipMap: Record<string, string>;
}

export interface ScaleProfileSource {
  normalizedHeight: number;
  groundOffset: number;
  hoverOffset: number;
  recommendedCommonHeight: number;
  recommendedEliteHeight: number;
  recommendedBossHeight: number;
  suggestedCollisionRadius: number;
  suggestedCollisionHeight: number;
}

export interface SocketProfileSource {
  center: string;
  head: string;
  weapon: string;
  projectile: string;
  hitVfx: string;
  deathVfx: string;
  shadow: string;
}

export interface RigFamilySource {
  id: string;
  sourceModelIds: string[];
  expectedBoneRange: [number, number];
  expectedClipNames: string[];
  commonEligible: boolean;
  compatibilityFingerprints: string[];
}

export interface MonsterPackSourceManifests {
  catalog: { models: MonsterCatalogModel[] };
  runtimeVariants: { variants: Record<string, MonsterRuntimeVariant> };
  animationProfiles: { profiles: Record<string, AnimationProfileSource> };
  scaleProfiles: { profiles: Record<string, ScaleProfileSource> };
  socketProfiles: { profiles: Record<string, SocketProfileSource> };
  rigFamilies: {
    families: Record<string, RigFamilySource>;
    exactCompatibilityGroups: unknown;
  };
}

export interface NativeAssetEntry {
  id: string;
  kind: 'model';
  namespace: 'custom';
  file: string;
  fallbackAssetId: string;
  tags: string[];
  optional: boolean;
}

export interface NativeAnimationProfile {
  id: string;
  label: string;
  clips: Record<string, string>;
  fallbacks: Record<string, string>;
  locomotion: {
    idleSpeedMax: number;
    walkSpeedMax: number;
    walkSpeedReference: number;
    runSpeedReference: number;
    playbackMin: number;
    playbackMax: number;
    randomStartPhase: boolean;
  };
  transitions: {
    defaultCrossFadeSeconds: number;
    locomotionCrossFadeSeconds: number;
    attackCrossFadeSeconds: number;
    hitCrossFadeSeconds: number;
    deathCrossFadeSeconds: number;
  };
  playback?: Record<
    string,
    { loop: 'repeat' | 'once' | 'pingPong'; clampWhenFinished?: boolean; timeScale?: number; interruptPriority?: number }
  >;
  rootMotion: false;
}

export interface NativePresentationProfile {
  id: string;
  label: string;
  nearModelAssetId: string;
  farModelAssetId?: string;
  aggregateModelAssetId?: string;
  animationProfileId?: string;
  lodPolicyId: string;
  shadowPolicyId: string;
  transform?: { scale?: number | [number, number, number]; position?: [number, number, number]; rotation?: [number, number, number] };
  socketBindings?: Record<string, string>;
  tags?: string[];
}

export interface NativeArtRoster {
  id: string;
  commonPresentationProfileIds: string[];
  elitePresentationProfileIds: string[];
  bossPresentationProfileIds: string[];
  preloadAssetIds: string[];
}

export interface ScaleMappingRecord {
  sourceModelId: string;
  nativeAssetIds: string[];
  presentationTransform: { scale: number; position: [number, number, number] };
  recommendedCollision: { radius: number; height: number };
  flyingOffsetApplied: boolean;
}

export interface SocketMappingRecord {
  sourceModelId: string;
  nativeAssetId: string;
  socketBindings: Record<string, string>;
}

export interface NativeMonsterPackRecord {
  sourceModelId: string;
  slug: string;
  heroAssetId: string;
  commonNearAssetId?: string;
  commonFarAssetId?: string;
  aggregateAssetId?: string;
  heroAnimationProfileId: string;
  commonAnimationProfileId?: string;
  heroPresentationProfileId: string;
  commonPresentationProfileId?: string;
  scaleMappingId: string;
  socketMappingId: string;
  roleCandidates: string[];
  rigFamilyId: string;
  importedHashes: Record<string, string>;
}
