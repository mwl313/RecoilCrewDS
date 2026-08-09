export interface VerticalCollisionBody {
  x: number;
  groundY: number;
  z: number;
  radius: number;
  height: number;
}

/** First ray contact with an upright physical enemy cylinder. */
export function rayVerticalBodyHitDistance(
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  body: VerticalCollisionBody,
  maxDistance: number,
): number | null {
  let best = Number.POSITIVE_INFINITY;
  const ox = origin.x - body.x;
  const oz = origin.z - body.z;
  const minY = body.groundY;
  const maxY = body.groundY + body.height;
  const a = direction.x * direction.x + direction.z * direction.z;
  if (a > 1e-10) {
    const b = 2 * (ox * direction.x + oz * direction.z);
    const c = ox * ox + oz * oz - body.radius * body.radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
        const y = origin.y + direction.y * t;
        if (t >= 0 && t <= maxDistance && y >= minY && y <= maxY) best = Math.min(best, t);
      }
    }
  }
  if (Math.abs(direction.y) > 1e-10) {
    for (const y of [minY, maxY]) {
      const t = (y - origin.y) / direction.y;
      const x = ox + direction.x * t;
      const z = oz + direction.z * t;
      if (t >= 0 && t <= maxDistance && x * x + z * z <= body.radius * body.radius) {
        best = Math.min(best, t);
      }
    }
  }
  return Number.isFinite(best) ? best : null;
}

/** Projectile sphere against the vertical extent of the same body. */
export function projectileWithinVerticalBody(
  projectileY: number,
  projectileRadius: number,
  groundY: number,
  collisionHeight: number,
): boolean {
  return projectileY >= groundY - projectileRadius
    && projectileY <= groundY + collisionHeight + projectileRadius;
}
