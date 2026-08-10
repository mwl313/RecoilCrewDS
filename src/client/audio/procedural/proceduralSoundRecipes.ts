import {
  air,
  chirp,
  crack,
  metal,
  pulse,
  ring,
  rumble,
  thump,
  type PrimitiveRuntime,
} from './proceduralSoundPrimitives';
import { clamp01 } from './proceduralSoundMath';
import type {
  ProceduralRecipeOptions,
  ProceduralSoundRecipe,
  RecipeDescriptor,
  SeededVariation,
} from './proceduralSoundTypes';

const DESCRIPTORS: Record<ProceduralSoundRecipe, RecipeDescriptor> = {
  playerMg: { bus: 'playerWeapon', category: 'playerWeapon', priority: 88, duration: 0.09, maxDistance: 0, reverbSend: 0.025 },
  playerMgImpact: { bus: 'impact', category: 'minorImpact', priority: 38, duration: 0.075, maxDistance: 72, reverbSend: 0.035 },
  playerCannon: { bus: 'playerWeapon', category: 'playerWeapon', priority: 100, duration: 0.72, maxDistance: 0, reverbSend: 0.1 },
  cannonImpact: { bus: 'impact', category: 'majorExplosion', priority: 82, duration: 0.85, maxDistance: 130, reverbSend: 0.14 },
  enemyTelegraph: { bus: 'enemyWeapon', category: 'enemyTelegraph', priority: 72, duration: 0.4, maxDistance: 95, reverbSend: 0.05 },
  enemyRangedFire: { bus: 'enemyWeapon', category: 'enemyFire', priority: 64, duration: 0.14, maxDistance: 95, reverbSend: 0.07 },
  enemySpecialistFire: { bus: 'enemyWeapon', category: 'enemyFire', priority: 72, duration: 0.2, maxDistance: 110, reverbSend: 0.09 },
  enemyEliteFire: { bus: 'enemyWeapon', category: 'enemyFire', priority: 84, duration: 0.34, maxDistance: 125, reverbSend: 0.12 },
  enemyProjectileImpact: { bus: 'impact', category: 'minorImpact', priority: 76, duration: 0.38, maxDistance: 0, reverbSend: 0.08 },
  enemyMeleeImpact: { bus: 'impact', category: 'minorImpact', priority: 72, duration: 0.35, maxDistance: 0, reverbSend: 0.08 },
  enemyDeathFodder: { bus: 'impact', category: 'enemyDeath', priority: 42, duration: 0.2, maxDistance: 70, reverbSend: 0.06 },
  enemyDeathSpecialist: { bus: 'impact', category: 'enemyDeath', priority: 54, duration: 0.32, maxDistance: 85, reverbSend: 0.09 },
  enemyDeathElite: { bus: 'impact', category: 'enemyDeath', priority: 84, duration: 0.58, maxDistance: 115, reverbSend: 0.14 },
  bossTelegraph: { bus: 'enemyWeapon', category: 'enemyTelegraph', priority: 92, duration: 0.9, maxDistance: 160, reverbSend: 0.18 },
  bossFire: { bus: 'enemyWeapon', category: 'enemyFire', priority: 90, duration: 0.9, maxDistance: 160, reverbSend: 0.18 },
  bossDeath: { bus: 'impact', category: 'majorExplosion', priority: 98, duration: 1.5, maxDistance: 180, reverbSend: 0.2 },
  rammerTelegraph: { bus: 'enemyWeapon', category: 'enemyTelegraph', priority: 86, duration: 0.58, maxDistance: 120, reverbSend: 0.08 },
  barrelExplosion: { bus: 'impact', category: 'majorExplosion', priority: 70, duration: 0.75, maxDistance: 120, reverbSend: 0.16 },
  barrelChainExplosion: { bus: 'impact', category: 'majorExplosion', priority: 58, duration: 0.45, maxDistance: 90, reverbSend: 0.1 },
  dash: { bus: 'vehicle', category: 'vehicle', priority: 62, duration: 0.24, maxDistance: 0, reverbSend: 0.03 },
  jump: { bus: 'vehicle', category: 'vehicle', priority: 58, duration: 0.24, maxDistance: 0, reverbSend: 0.025 },
  landingLight: { bus: 'vehicle', category: 'minorImpact', priority: 45, duration: 0.22, maxDistance: 0, reverbSend: 0.035 },
  landingHeavy: { bus: 'vehicle', category: 'minorImpact', priority: 68, duration: 0.38, maxDistance: 0, reverbSend: 0.07 },
  landingMassive: { bus: 'vehicle', category: 'majorExplosion', priority: 82, duration: 0.72, maxDistance: 0, reverbSend: 0.12 },
  groundPoundImpact: { bus: 'vehicle', category: 'majorExplosion', priority: 90, duration: 0.82, maxDistance: 0, reverbSend: 0.14 },
  wallCollision: { bus: 'impact', category: 'minorImpact', priority: 48, duration: 0.34, maxDistance: 0, reverbSend: 0.06 },
  monsterCollision: { bus: 'impact', category: 'minorImpact', priority: 42, duration: 0.26, maxDistance: 0, reverbSend: 0.04 },
  truckCollision: { bus: 'impact', category: 'minorImpact', priority: 60, duration: 0.46, maxDistance: 0, reverbSend: 0.08 },
  truckSiren: { bus: 'vehicle', category: 'vehicle', priority: 58, duration: 0.42, maxDistance: 120, reverbSend: 0.04 },
  wipeout: { bus: 'impact', category: 'majorExplosion', priority: 96, duration: 1.35, maxDistance: 0, reverbSend: 0.18 },
};

export function describeRecipe(recipe: ProceduralSoundRecipe, options: ProceduralRecipeOptions = {}): RecipeDescriptor {
  const descriptor = DESCRIPTORS[recipe];
  if (recipe === 'playerCannon') {
    return { ...descriptor, duration: descriptor.duration + clamp01(options.chargeRatio ?? 0) * 0.35 };
  }
  if (recipe === 'cannonImpact') {
    return { ...descriptor, duration: descriptor.duration + clamp01(options.chargeRatio ?? 0) * 0.25 };
  }
  return { ...descriptor };
}

export interface RecipePlayback {
  stop(): void;
}

export function playProceduralRecipe(args: {
  ctx: AudioContext;
  destination: AudioNode;
  noiseBuffer: AudioBuffer;
  recipe: ProceduralSoundRecipe;
  options?: ProceduralRecipeOptions;
  variation: SeededVariation;
}): RecipePlayback {
  const cleanups: Array<() => void> = [];
  const runtime: PrimitiveRuntime = {
    ctx: args.ctx,
    destination: args.destination,
    noiseBuffer: args.noiseBuffer,
    variation: args.variation,
    registerCleanup: (cleanup) => cleanups.push(cleanup),
  };
  const options = args.options ?? {};
  const at = args.ctx.currentTime + 0.004;
  playRecipeLayers(runtime, args.recipe, at, options);
  return {
    stop: () => {
      for (const cleanup of cleanups.splice(0)) cleanup();
    },
  };
}

function playRecipeLayers(runtime: PrimitiveRuntime, recipe: ProceduralSoundRecipe, at: number, options: ProceduralRecipeOptions): void {
  const intensity = Math.max(0.35, Math.min(1.35, options.intensity ?? 1));
  switch (recipe) {
    case 'playerMg':
      crack(runtime, { at, frequencyStart: 2_450, duration: 0.03, gain: 0.32 * intensity, q: 0.95 });
      thump(runtime, { at, frequencyStart: 198, frequencyEnd: 88, duration: 0.062, gain: 0.18 * intensity, type: 'triangle' });
      metal(runtime, { at: at + 0.004, duration: 0.034, gain: 0.058 * intensity, frequencies: [720, 1_080, 1_520] });
      return;
    case 'playerMgImpact':
      crack(runtime, { at, frequencyStart: 1_750, frequencyEnd: 760, duration: 0.035, gain: 0.12 * intensity, q: 1.15 });
      metal(runtime, { at: at + 0.002, duration: 0.045, gain: 0.06 * intensity, frequencies: [560, 940, 1_380] });
      thump(runtime, { at, frequencyStart: 145, frequencyEnd: 92, duration: 0.05, gain: 0.055 * intensity, type: 'triangle' });
      return;
    case 'playerCannon': {
      const charge = clamp01(options.chargeRatio ?? 0);
      crack(runtime, { at, frequencyStart: 2_900 + charge * 850, duration: 0.03, gain: 0.64 + charge * 0.12, q: 0.8 });
      thump(runtime, { at, frequencyStart: 122 - charge * 10, frequencyEnd: 41 - charge * 5, duration: 0.4 + charge * 0.15, gain: 0.62 + charge * 0.28 });
      chirp(runtime, { at: at + 0.004, frequencyStart: 265, frequencyEnd: 92, duration: 0.14 + charge * 0.035, gain: 0.22 + charge * 0.08, type: 'triangle' });
      air(runtime, { at, frequencyStart: 1_080 + charge * 180, frequencyEnd: 125, duration: 0.48 + charge * 0.28, gain: 0.46 + charge * 0.18, type: 'lowpass' });
      if (charge >= 0.65) metal(runtime, { at: at + 0.008, duration: 0.16 + charge * 0.08, gain: 0.055 + charge * 0.05 });
      return;
    }
    case 'cannonImpact': {
      const charge = clamp01(options.chargeRatio ?? 0);
      const radius = Math.max(0.75, Math.min(1.35, (options.splashRadius ?? 4) / 4));
      crack(runtime, { at, frequencyStart: 3_100, duration: 0.045, gain: 0.48 * radius });
      crack(runtime, { at: at + 0.012, frequencyStart: 1_250, frequencyEnd: 520, duration: 0.18 + charge * 0.08, gain: 0.32 * radius, q: 0.65 });
      thump(runtime, { at, frequencyStart: 94, frequencyEnd: 42, duration: 0.42 + charge * 0.16, gain: (0.5 + charge * 0.2) * radius });
      air(runtime, { at: at + 0.01, frequencyStart: 1_400, frequencyEnd: 130, duration: 0.62 + charge * 0.2, gain: 0.34 * radius, type: 'lowpass' });
      if (charge > 0.45) metal(runtime, { at: at + 0.03, duration: 0.22, gain: 0.045 + charge * 0.04 });
      return;
    }
    case 'enemyTelegraph':
      pulse(runtime, { at, frequencyStart: 360, frequencyEnd: 920, duration: 0.32, gain: 0.11, type: 'sawtooth' });
      crack(runtime, { at: at + 0.28, frequencyStart: 2_400, duration: 0.035, gain: 0.07 });
      return;
    case 'enemyRangedFire':
      chirp(runtime, { at, frequencyStart: 1_480, frequencyEnd: 420, duration: 0.09, gain: 0.17, type: 'sawtooth' });
      crack(runtime, { at, frequencyStart: 3_050, duration: 0.026, gain: 0.16 });
      thump(runtime, { at, frequencyStart: 190, frequencyEnd: 125, duration: 0.068, gain: 0.12, type: 'triangle' });
      return;
    case 'enemySpecialistFire':
      chirp(runtime, { at, frequencyStart: 1_150, frequencyEnd: 275, duration: 0.13, gain: 0.2, type: 'sawtooth' });
      crack(runtime, { at, frequencyStart: 2_700, duration: 0.04, gain: 0.2, q: 0.7 });
      thump(runtime, { at, frequencyStart: 138, frequencyEnd: 78, duration: 0.12, gain: 0.18, type: 'triangle' });
      air(runtime, { at: at + 0.015, frequencyStart: 1_500, frequencyEnd: 360, duration: 0.16, gain: 0.08, type: 'bandpass' });
      return;
    case 'enemyEliteFire':
      chirp(runtime, { at, frequencyStart: 1_020, frequencyEnd: 225, duration: 0.18, gain: 0.23, type: 'sawtooth' });
      crack(runtime, { at, frequencyStart: 3_250, duration: 0.045, gain: 0.27 });
      thump(runtime, { at, frequencyStart: 86, frequencyEnd: 52, duration: 0.21, gain: 0.29 });
      metal(runtime, { at: at + 0.018, duration: 0.21, gain: 0.07, frequencies: [385, 735, 1_180] });
      air(runtime, { at: at + 0.02, frequencyStart: 900, frequencyEnd: 150, duration: 0.3, gain: 0.12, type: 'lowpass' });
      return;
    case 'bossTelegraph':
      thump(runtime, { at, frequencyStart: 76, frequencyEnd: 48, duration: 0.34, gain: 0.38 });
      pulse(runtime, { at: at + 0.05, frequencyStart: 190, frequencyEnd: 1_180, duration: 0.66, gain: 0.2, type: 'sawtooth' });
      ring(runtime, { at: at + 0.68, duration: 0.18, gain: 0.075, frequencies: [1_430, 1_960] });
      return;
    case 'bossFire':
      thump(runtime, { at, frequencyStart: 62, frequencyEnd: 34, duration: 0.58, gain: 0.58 });
      chirp(runtime, { at, frequencyStart: 1_150, frequencyEnd: 220, duration: 0.28, gain: 0.28, type: 'sawtooth' });
      crack(runtime, { at, frequencyStart: 3_500, duration: 0.055, gain: 0.42 });
      metal(runtime, { at: at + 0.018, duration: 0.34, gain: 0.1, frequencies: [330, 610, 1_020, 1_570] });
      rumble(runtime, { at: at + 0.02, duration: 0.78, gain: 0.35, frequencyStart: 58, frequencyEnd: 29 });
      return;
    case 'enemyProjectileImpact': {
      const damage = Math.max(0.75, Math.min(1.4, (options.damage ?? 8) / 10));
      crack(runtime, { at, frequencyStart: 1_850, duration: 0.052, gain: 0.3 * damage, q: 0.75 });
      thump(runtime, { at, frequencyStart: 112, frequencyEnd: 58, duration: 0.19, gain: 0.34 * damage });
      metal(runtime, { at: at + 0.01, duration: 0.22, gain: 0.09 * damage, frequencies: [440, 760, 1_240] });
      chirp(runtime, { at: at + 0.025, frequencyStart: 760, frequencyEnd: 290, duration: 0.15, gain: 0.07 * damage, type: 'sawtooth' });
      return;
    }
    case 'enemyMeleeImpact': {
      const scale = Math.max(0.7, Math.min(1.4, (options.damage ?? 8) / 10));
      thump(runtime, { at, frequencyStart: options.variant === 'rammer' ? 92 : 128, frequencyEnd: 48, duration: 0.2 * scale, gain: 0.38 * scale, type: 'triangle' });
      metal(runtime, { at: at + 0.008, duration: 0.16 * scale, gain: 0.08 * scale });
      crack(runtime, { at, frequencyStart: 1_200, duration: 0.045, gain: 0.13 * scale });
      return;
    }
    case 'rammerTelegraph':
      pulse(runtime, { at, frequencyStart: 210, frequencyEnd: 175, duration: 0.34, gain: 0.18, type: 'square' });
      thump(runtime, { at, frequencyStart: 84, frequencyEnd: 62, duration: 0.22, gain: 0.28 });
      air(runtime, { at: at + 0.06, frequencyStart: 420, frequencyEnd: 1_650, duration: 0.42, gain: 0.11, type: 'bandpass', q: 1.2 });
      crack(runtime, { at: at + 0.42, frequencyStart: 2_200, duration: 0.025, gain: 0.08 });
      return;
    case 'barrelExplosion':
    case 'barrelChainExplosion': {
      const chain = recipe === 'barrelChainExplosion';
      crack(runtime, { at, frequencyStart: 3_800, duration: chain ? 0.035 : 0.055, gain: chain ? 0.28 : 0.48 });
      air(runtime, { at, frequencyStart: 2_200, frequencyEnd: 180, duration: chain ? 0.38 : 0.68, gain: chain ? 0.22 : 0.42, type: 'lowpass' });
      thump(runtime, { at, frequencyStart: 82, frequencyEnd: 46, duration: chain ? 0.22 : 0.36, gain: chain ? 0.2 : 0.34 });
      metal(runtime, { at: at + 0.018, duration: chain ? 0.16 : 0.28, gain: chain ? 0.035 : 0.07 });
      return;
    }
    case 'enemyDeathFodder':
      crack(runtime, { at, frequencyStart: 1_350, frequencyEnd: 520, duration: 0.11, gain: 0.2 });
      thump(runtime, { at, frequencyStart: 150, frequencyEnd: 82, duration: 0.16, gain: 0.16, type: 'triangle' });
      return;
    case 'enemyDeathSpecialist':
      crack(runtime, { at, frequencyStart: 1_650, frequencyEnd: 360, duration: 0.2, gain: 0.28 });
      thump(runtime, { at, frequencyStart: 125, frequencyEnd: 58, duration: 0.26, gain: 0.26, type: 'triangle' });
      metal(runtime, { at: at + 0.014, duration: 0.22, gain: 0.06 });
      return;
    case 'enemyDeathElite':
      crack(runtime, { at, frequencyStart: 1_900, frequencyEnd: 250, duration: 0.32, gain: 0.4 });
      rumble(runtime, { at, duration: 0.52, gain: 0.38, frequencyStart: 78, frequencyEnd: 34 });
      metal(runtime, { at: at + 0.02, duration: 0.38, gain: 0.095 });
      return;
    case 'bossDeath':
      crack(runtime, { at, frequencyStart: 2_600, frequencyEnd: 250, duration: 0.38, gain: 0.52 });
      rumble(runtime, { at: at + 0.03, duration: 0.78, gain: 0.58, frequencyStart: 64, frequencyEnd: 28 });
      metal(runtime, { at: at + 0.08, duration: 0.55, gain: 0.11 });
      crack(runtime, { at: at + 0.48, frequencyStart: 1_250, frequencyEnd: 180, duration: 0.4, gain: 0.34 });
      thump(runtime, { at: at + 0.54, frequencyStart: 52, frequencyEnd: 25, duration: 0.72, gain: 0.55 });
      air(runtime, { at: at + 0.32, frequencyStart: 1_100, frequencyEnd: 85, duration: 1.12, gain: 0.34, type: 'lowpass' });
      return;
    case 'dash':
      air(runtime, { at, frequencyStart: 850, frequencyEnd: 2_450, duration: 0.18, gain: 0.25, type: 'bandpass', q: 1.5 });
      thump(runtime, { at, frequencyStart: 145, frequencyEnd: 72, duration: 0.13, gain: 0.19, type: 'triangle' });
      metal(runtime, { at: at + 0.012, duration: 0.07, gain: 0.035, frequencies: [520, 920] });
      return;
    case 'jump':
      thump(runtime, { at, frequencyStart: 118, frequencyEnd: 76, duration: 0.12, gain: 0.22, type: 'triangle' });
      chirp(runtime, { at, frequencyStart: 210, frequencyEnd: 410, duration: 0.11, gain: 0.08, type: 'triangle' });
      air(runtime, { at, frequencyStart: 360, frequencyEnd: 920, duration: 0.15, gain: 0.1, type: 'bandpass' });
      return;
    case 'landingLight':
      thump(runtime, { at, frequencyStart: 108, frequencyEnd: 62, duration: 0.16, gain: 0.2 });
      metal(runtime, { at: at + 0.008, duration: 0.1, gain: 0.04, frequencies: [430, 810] });
      return;
    case 'landingHeavy':
      thump(runtime, { at, frequencyStart: 92, frequencyEnd: 42, duration: 0.32, gain: 0.42 });
      metal(runtime, { at: at + 0.008, duration: 0.24, gain: 0.085 });
      crack(runtime, { at: at + 0.01, frequencyStart: 780, frequencyEnd: 260, duration: 0.18, gain: 0.16, q: 0.65 });
      return;
    case 'landingMassive':
      thump(runtime, { at, frequencyStart: 76, frequencyEnd: 34, duration: 0.48, gain: 0.5 * intensity });
      crack(runtime, { at: at + 0.008, frequencyStart: 1_450, frequencyEnd: 240, duration: 0.24, gain: 0.24 * intensity, q: 0.62 });
      metal(runtime, { at: at + 0.012, duration: 0.32, gain: 0.1 * intensity, frequencies: [310, 570, 930] });
      rumble(runtime, { at: at + 0.025, duration: 0.62, gain: 0.3 * intensity, frequencyStart: 62, frequencyEnd: 28 });
      air(runtime, { at: at + 0.02, frequencyStart: 720, frequencyEnd: 95, duration: 0.52, gain: 0.16 * intensity, type: 'lowpass' });
      return;
    case 'groundPoundImpact':
      thump(runtime, { at, frequencyStart: 68, frequencyEnd: 29, duration: 0.56, gain: 0.56 * intensity });
      crack(runtime, { at, frequencyStart: 2_100, frequencyEnd: 260, duration: 0.22, gain: 0.3 * intensity, q: 0.58 });
      metal(runtime, { at: at + 0.01, duration: 0.36, gain: 0.11 * intensity, frequencies: [285, 510, 860, 1_240] });
      rumble(runtime, { at: at + 0.02, duration: 0.72, gain: 0.36 * intensity, frequencyStart: 58, frequencyEnd: 25 });
      air(runtime, { at: at + 0.018, frequencyStart: 920, frequencyEnd: 80, duration: 0.65, gain: 0.2 * intensity, type: 'lowpass' });
      return;
    case 'wallCollision':
      thump(runtime, { at, frequencyStart: 105, frequencyEnd: 39, duration: 0.28, gain: 0.4 });
      metal(runtime, { at, duration: 0.25, gain: 0.09 });
      return;
    case 'monsterCollision':
      thump(runtime, { at, frequencyStart: 132, frequencyEnd: 58, duration: 0.2, gain: 0.3, type: 'triangle' });
      crack(runtime, { at, frequencyStart: 980, duration: 0.06, gain: 0.1 });
      return;
    case 'truckCollision':
      thump(runtime, { at, frequencyStart: 88, frequencyEnd: 34, duration: 0.4, gain: 0.5 });
      metal(runtime, { at, duration: 0.38, gain: 0.12, frequencies: [310, 570, 960, 1_420] });
      return;
    case 'truckSiren':
      pulse(runtime, { at, frequencyStart: 620, frequencyEnd: 470, duration: 0.36, gain: 0.13, type: 'sine' });
      pulse(runtime, { at: at + 0.18, frequencyStart: 470, frequencyEnd: 620, duration: 0.2, gain: 0.08, type: 'triangle' });
      return;
    case 'wipeout':
      rumble(runtime, { at, duration: 1.2, gain: 0.72, frequencyStart: 76, frequencyEnd: 26 });
      crack(runtime, { at, frequencyStart: 2_400, frequencyEnd: 180, duration: 0.65, gain: 0.58 });
      metal(runtime, { at: at + 0.05, duration: 0.68, gain: 0.12 });
      return;
  }
}
