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

/** Push a circle out of an axis-aligned box. Returns new x,z. */
export function resolveCircleBox(
  x: number,
  z: number,
  r: number,
  bx: number,
  bz: number,
  w: number,
  d: number,
): { x: number; z: number; hit: boolean } {
  const halfW = w / 2;
  const halfD = d / 2;
  const nx = clamp(x, bx - halfW, bx + halfW);
  const nz = clamp(z, bz - halfD, bz + halfD);
  let dx = x - nx;
  let dz = z - nz;
  const d2 = dx * dx + dz * dz;
  if (d2 > r * r) return { x, z, hit: false };
  if (d2 > 1e-9) {
    const dLen = Math.sqrt(d2);
    const push = (r - dLen) / dLen;
    return { x: nx + dx * push, z: nz + dz * push, hit: true };
  }
  // Center inside the box: push out along the smallest penetration axis.
  const left = x - (bx - halfW);
  const right = bx + halfW - x;
  const top = z - (bz - halfD);
  const bottom = bz + halfD - z;
  const minPen = Math.min(left, right, top, bottom);
  if (minPen === left) return { x: bx - halfW - r, z, hit: true };
  if (minPen === right) return { x: bx + halfW + r, z, hit: true };
  if (minPen === top) return { x, z: bz - halfD - r, hit: true };
  return { x, z: bz + halfD + r, hit: true };
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
