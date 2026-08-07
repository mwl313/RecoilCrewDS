export type EnemyAudioTier = 'fodder' | 'specialist' | 'elite' | 'boss';
export type EnemyAudioSizeClass = 'small' | 'medium' | 'large';

export type ProceduralSoundRecipe =
  | 'playerMg'
  | 'playerCannon'
  | 'cannonImpact'
  | 'enemyTelegraph'
  | 'enemyRangedFire'
  | 'enemySpecialistFire'
  | 'enemyEliteFire'
  | 'enemyProjectileImpact'
  | 'enemyMeleeImpact'
  | 'enemyDeathFodder'
  | 'enemyDeathSpecialist'
  | 'enemyDeathElite'
  | 'bossTelegraph'
  | 'bossFire'
  | 'bossDeath'
  | 'rammerTelegraph'
  | 'barrelExplosion'
  | 'barrelChainExplosion'
  | 'dash'
  | 'jump'
  | 'landingLight'
  | 'landingHeavy'
  | 'wallCollision'
  | 'monsterCollision'
  | 'truckCollision'
  | 'truckSiren'
  | 'wipeout';

export type ProceduralBusName =
  | 'playerWeapon'
  | 'enemyWeapon'
  | 'impact'
  | 'vehicle'
  | 'worldAmbience'
  | 'uiReward';

export type VoiceCategory =
  | 'playerWeapon'
  | 'enemyFire'
  | 'enemyTelegraph'
  | 'enemyDeath'
  | 'minorImpact'
  | 'majorExplosion'
  | 'vehicle'
  | 'uiReward'
  | 'horde';

export interface ListenerPose {
  x: number;
  y: number;
  z: number;
  /** Camera yaw in radians, with zero facing positive world Z. */
  yaw: number;
}

export interface SoundSourcePosition {
  x: number;
  y: number;
  z: number;
}

export interface SpatialMix {
  distance: number;
  gain: number;
  pan: number;
  lowpassHz: number;
  culled: boolean;
}

export interface SeededVariation {
  pitch: number;
  gain: number;
  filter: number;
  noiseOffset: number;
}

export interface ProceduralRecipeOptions {
  seed?: number;
  intensity?: number;
  tier?: EnemyAudioTier;
  sizeClass?: EnemyAudioSizeClass;
  chargeRatio?: number;
  damage?: number;
  splashRadius?: number;
  visualScale?: number;
  variant?: string;
}

export interface WorldRecipeOptions extends ProceduralRecipeOptions, SoundSourcePosition {
  priority?: number;
  maxDistance?: number;
}

export interface RecipeDescriptor {
  bus: ProceduralBusName;
  category: VoiceCategory;
  priority: number;
  duration: number;
  maxDistance: number;
  reverbSend: number;
}

export interface AudioDebugStats {
  activeVoices: number;
  voiceCounts: Record<VoiceCategory, number>;
  droppedVoices: number;
  maxActiveVoices: number;
  lastRecipe: ProceduralSoundRecipe | null;
  lastWorldDistance: number;
  lastPan: number;
  hordePresence: number;
  listener: ListenerPose;
}
