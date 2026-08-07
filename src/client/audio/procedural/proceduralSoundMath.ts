import type {
  ListenerPose,
  SeededVariation,
  SoundSourcePosition,
  SpatialMix,
} from './proceduralSoundTypes';

const TAU = Math.PI * 2;

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

/** Fast, deterministic integer mixer suitable for subtle presentation variation. */
export function mixSeed(seed: number): number {
  let value = (seed | 0) ^ 0x9e3779b9;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return (value ^ (value >>> 15)) >>> 0;
}

export function seededUnit(seed: number, lane = 0): number {
  return mixSeed(seed + Math.imul(lane + 1, 0x6d2b79f5)) / 0x1_0000_0000;
}

export function seededVariation(seed: number): SeededVariation {
  return {
    pitch: 0.96 + seededUnit(seed, 0) * 0.08,
    gain: 0.97 + seededUnit(seed, 1) * 0.06,
    filter: 0.94 + seededUnit(seed, 2) * 0.12,
    noiseOffset: seededUnit(seed, 3),
  };
}

function wrapRadians(value: number): number {
  let wrapped = value % TAU;
  if (wrapped > Math.PI) wrapped -= TAU;
  if (wrapped < -Math.PI) wrapped += TAU;
  return wrapped;
}

export function distanceGain(distance: number, maxDistance = 100): number {
  const d = Math.max(0, distance);
  const max = Math.max(20.01, maxDistance);
  if (d <= 20) return 1;
  if (d <= 60) return 1 - ((d - 20) / 40) * 0.48;
  if (d >= max) return 0.035;
  return 0.52 - ((d - 60) / Math.max(1, max - 60)) * 0.485;
}

export function distanceLowpassHz(distance: number): number {
  const d = Math.max(0, distance);
  if (d <= 20) return 20_000;
  if (d <= 40) return 20_000 - ((d - 20) / 20) * 10_000;
  if (d <= 70) return 10_000 - ((d - 40) / 30) * 5_000;
  if (d <= 100) return 5_000 - ((d - 70) / 30) * 2_500;
  return 2_200;
}

export function spatialize(
  listener: ListenerPose,
  source: SoundSourcePosition,
  maxDistance = 100,
  priority = 50,
): SpatialMix {
  const dx = source.x - listener.x;
  const dy = source.y - listener.y;
  const dz = source.z - listener.z;
  const distance = Math.hypot(dx, dy, dz);
  const sourceYaw = Math.atan2(dx, dz);
  const relativeYaw = wrapRadians(sourceYaw - listener.yaw);
  const rearReduction = Math.cos(relativeYaw) < 0 ? 0.78 : 1;
  return {
    distance,
    gain: distanceGain(distance, maxDistance),
    pan: Math.max(-1, Math.min(1, Math.sin(relativeYaw) * rearReduction)),
    lowpassHz: distanceLowpassHz(distance),
    culled: distance > maxDistance && priority < 84,
  };
}

export function stableEventSeed(id = 0, sequence = 0, time = 0): number {
  return mixSeed((id | 0) ^ Math.imul(sequence | 0, 0x45d9f3b) ^ Math.round(time * 1000));
}
