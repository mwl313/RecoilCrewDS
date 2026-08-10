import { clamp } from '../../shared/math';
import type { SimEvent } from '../../shared/types';

export interface GroundPoundVfx {
  spawnGroundRing(x: number, y: number, z: number, color: number, radius: number, life?: number, opacity?: number): void;
  spawnRadialDebris(x: number, y: number, z: number, color: number, count: number, speed: number, life: number): void;
  spawnFlash(x: number, y: number, z: number, color: number, size: number, life?: number): void;
}
/** Outer-edge radius throughout the pooled shockwave lifecycle. */
export function groundShockwaveRadiusAt(authoritativeRadius: number, progress: number): number {
  const radius = Math.max(0, Number.isFinite(authoritativeRadius) ? authoritativeRadius : 0);
  return 0.2 + (radius - 0.2) * clamp(progress, 0, 1);
}

export function presentGroundPoundImpact(event: SimEvent, vfx: GroundPoundVfx): boolean {
  if (
    event.type !== 'groundPoundImpact' ||
    event.x === undefined ||
    event.y === undefined ||
    event.z === undefined ||
    event.radius === undefined ||
    event.radius <= 0
  ) return false;

  const radius = event.radius;
  const intensity = clamp((event.fallDistance ?? 1.5) / 12, 0.25, 1);
  vfx.spawnGroundRing(event.x, event.y + 0.055, event.z, 0xffedbd, radius * 0.72, 0.42, 0.92);
  // This outer ring consumes the authoritative radius directly: no visual multiplier.
  vfx.spawnGroundRing(event.x, event.y + 0.035, event.z, 0xd89a43, radius, 0.68, 0.72);
  vfx.spawnRadialDebris(event.x, event.y + 0.08, event.z, 0x9a7a51, Math.round(18 + intensity * 26), 5 + intensity * 7, 0.48 + intensity * 0.22);
  vfx.spawnFlash(event.x, event.y + 0.32, event.z, 0xffe4a3, 2.4 + intensity * 2.2, 0.12);
  return true;
}
