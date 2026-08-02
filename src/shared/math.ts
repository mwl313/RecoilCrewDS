export const TAU = Math.PI * 2;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function invLerp(a: number, b: number, v: number): number {
  if (b === a) return 0;
  return (v - a) / (b - a);
}

export function approach(v: number, target: number, delta: number): number {
  if (v < target) return Math.min(v + delta, target);
  return Math.max(v - delta, target);
}

export function wrapAngle(a: number): number {
  a = a % TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
}

/** Shortest signed difference from a to b. */
export function angleDiff(a: number, b: number): number {
  return wrapAngle(b - a);
}

export function angleLerp(a: number, b: number, t: number): number {
  return a + angleDiff(a, b) * t;
}

export function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  return dx * dx + dz * dz;
}

export function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.sqrt(dist2(ax, az, bx, bz));
}

export function len3(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

export function pointInBox(
  x: number,
  z: number,
  bx: number,
  bz: number,
  w: number,
  d: number,
): boolean {
  return Math.abs(x - bx) <= w / 2 && Math.abs(z - bz) <= d / 2;
}

/**
 * Coordinate convention (single project-wide convention):
 *   +Y world up, +Z chassis forward at yaw 0, +X chassis right at yaw 0.
 *   forward = (sin yaw, 0, cos yaw); positive yaw turns +Z toward +X.
 */

export interface CollisionContact {
  hit: boolean;
  x: number;
  z: number;
  normalX: number;
  normalZ: number;
  penetration: number;
  obstacleId?: string;
}

/**
 * Resolve a circle against an axis-aligned box to exact separation.
 * Outside case: push the circle center out along the outward normal by the
 * penetration depth. Inside case: push along the smallest penetration axis.
 */
export function resolveCircleBox(
  x: number,
  z: number,
  r: number,
  bx: number,
  bz: number,
  w: number,
  d: number,
  obstacleId?: string,
): CollisionContact {
  const halfW = w / 2;
  const halfD = d / 2;
  const minX = bx - halfW;
  const maxX = bx + halfW;
  const minZ = bz - halfD;
  const maxZ = bz + halfD;
  const nx = clamp(x, minX, maxX);
  const nz = clamp(z, minZ, maxZ);
  const dx = x - nx;
  const dz = z - nz;
  const d2 = dx * dx + dz * dz;
  if (d2 > r * r + 1e-12) {
    return { hit: false, x, z, normalX: 0, normalZ: 0, penetration: 0, obstacleId };
  }
  if (d2 > 1e-12) {
    // Outside (or touching): move from the current center along the outward
    // normal by the penetration depth.
    const dLen = Math.sqrt(d2);
    const normalX = dx / dLen;
    const normalZ = dz / dLen;
    const penetration = r - dLen;
    return {
      hit: true,
      x: x + normalX * penetration,
      z: z + normalZ * penetration,
      normalX,
      normalZ,
      penetration: Math.max(0, penetration),
      obstacleId,
    };
  }
  // Center inside the box: push out along the smallest penetration axis.
  const left = x - minX;
  const right = maxX - x;
  const top = z - minZ;
  const bottom = maxZ - z;
  const minPen = Math.min(left, right, top, bottom);
  if (minPen === left) {
    return { hit: true, x: minX - r, z, normalX: -1, normalZ: 0, penetration: r + left, obstacleId };
  }
  if (minPen === right) {
    return { hit: true, x: maxX + r, z, normalX: 1, normalZ: 0, penetration: r + right, obstacleId };
  }
  if (minPen === top) {
    return { hit: true, x, z: minZ - r, normalX: 0, normalZ: -1, penetration: r + top, obstacleId };
  }
  return { hit: true, x, z: maxZ + r, normalX: 0, normalZ: 1, penetration: r + bottom, obstacleId };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}
