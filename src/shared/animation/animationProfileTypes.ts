import type { EnemyAnimationRole } from './animationRoles';

/** Animation presentation tier. Only hero/near/mid may own mixers. */
export type EnemyAnimationLodTier = 'hero' | 'near' | 'mid' | 'far' | 'aggregate';

export const ENEMY_ANIMATION_LOD_TIERS: readonly EnemyAnimationLodTier[] = [
  'hero',
  'near',
  'mid',
  'far',
  'aggregate',
];

export interface EnemyPresentationProfileDefinition {
  id: string;
  label: string;
  nearModelAssetId: string;
  farModelAssetId?: string;
  aggregateModelAssetId?: string;
  animationProfileId?: string;
  lodPolicyId: string;
  shadowPolicyId: string;
  transform?: {
    scale?: number | [number, number, number];
    position?: [number, number, number];
    rotation?: [number, number, number];
  };
  socketBindings?: Record<string, string>;
  materialPolicy?: {
    cloneForHitFlash: boolean;
    allowSharedMaterials: boolean;
  };
  tags?: string[];
}

export interface EnemyAnimationProfileDefinition {
  id: string;
  label: string;
  clips: Partial<Record<EnemyAnimationRole, string>>;
  fallbacks: Partial<Record<EnemyAnimationRole, EnemyAnimationRole>>;
  stateMap?: Record<string, EnemyAnimationRole>;
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
  playback?: Partial<
    Record<
      EnemyAnimationRole,
      {
        loop: 'repeat' | 'once' | 'pingPong';
        clampWhenFinished?: boolean;
        timeScale?: number;
        interruptPriority?: number;
      }
    >
  >;
  presentationEvents?: Partial<
    Record<
      EnemyAnimationRole,
      Array<{
        normalizedTime: number;
        eventId: string;
      }>
    >
  >;
  rootMotion: false;
}

export interface AnimationLodPolicyDefinition {
  id: string;
  heroAlwaysNear: boolean;
  nearEnter: number;
  nearLeave: number;
  midEnter: number;
  midLeave: number;
  farEnter: number;
  farLeave: number;
  nearUpdateHz: number;
  midUpdateHz: number;
  maximumNearMixers: number;
  maximumMidMixers: number;
  priorityWeights: {
    boss: number;
    elite: number;
    attacking: number;
    telegraphing: number;
    damagedRecently: number;
    distance: number;
  };
}

export interface AnimationShadowRules {
  castShadow: boolean;
  receiveShadow: boolean;
}

export interface AnimationShadowPolicyDefinition {
  id: string;
  tiers: Record<EnemyAnimationLodTier, AnimationShadowRules>;
}

/** Far-tier presentation record consumed by a future instanced renderer. */
export interface FarEnemyPresentationRecord {
  enemyId: number;
  presentationProfileId: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  phase: number;
  flash: number;
}

/** Generated, validated animation content bundle (plain data). */
export interface EnemyAnimationContentBundle {
  format: number;
  sourceHash: string;
  presentationProfiles: Record<string, EnemyPresentationProfileDefinition>;
  animationProfiles: Record<string, EnemyAnimationProfileDefinition>;
  lodPolicies: Record<string, AnimationLodPolicyDefinition>;
  shadowPolicies: Record<string, AnimationShadowPolicyDefinition>;
  /** Ordered presentation profile ids; index 0 is the legacy/type default. */
  presentationProfileOrder: readonly string[];
  /** Enemy wire type -> legacy presentation profile id (generated). */
  legacyTypePresentation: Record<string, string>;
}
