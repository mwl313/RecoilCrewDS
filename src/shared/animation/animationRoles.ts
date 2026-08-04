/**
 * Shared semantic animation role vocabulary. Gameplay and content never
 * reference Blender clip names; they reference these roles, and profiles map
 * roles to clip names through content.
 */
export const ENEMY_ANIMATION_ROLES = [
  'idle',
  'walk',
  'run',
  'hoverMove',
  'fastHover',
  'attackPrimary',
  'attackSecondary',
  'attackSpecial',
  'pounce',
  'webCast',
  'summon',
  'charge',
  'leap',
  'roar',
  'castStart',
  'castLoop',
  'castRelease',
  'hit',
  'stagger',
  'knockback',
  'land',
  'spawn',
  'entrance',
  'death',
  'phaseTransition',
  'recovery',
] as const;

export type EnemyAnimationRole = (typeof ENEMY_ANIMATION_ROLES)[number];

const ROLE_SET = new Set<string>(ENEMY_ANIMATION_ROLES);

export function isAnimationRole(value: string): value is EnemyAnimationRole {
  return ROLE_SET.has(value);
}

/**
 * Walk a fallback chain cycle-safely. `resolve` returns true when the role
 * itself is usable; the fallback chain is only consulted when it is not.
 */
export function walkFallbackChain(
  role: EnemyAnimationRole,
  fallbacks: Partial<Record<EnemyAnimationRole, EnemyAnimationRole>>,
  resolve: (role: EnemyAnimationRole) => boolean,
): EnemyAnimationRole | null {
  let current: EnemyAnimationRole | null = role;
  const seen = new Set<EnemyAnimationRole>();
  while (current) {
    if (seen.has(current)) return null;
    seen.add(current);
    if (resolve(current)) return current;
    const next: EnemyAnimationRole | undefined = fallbacks[current];
    current = next && isAnimationRole(next) ? next : null;
  }
  return null;
}

/** Reject fallback cycles at content-generation time (throws with role). */
export function assertNoFallbackCycles(
  fallbacks: Partial<Record<EnemyAnimationRole, EnemyAnimationRole>> | undefined,
  context: string,
): void {
  if (!fallbacks) return;
  for (const role of ENEMY_ANIMATION_ROLES) {
    const seen = new Set<EnemyAnimationRole>([role]);
    let next: EnemyAnimationRole | undefined = fallbacks[role];
    while (next) {
      if (!isAnimationRole(next)) {
        throw new Error(`${context}: fallback for '${role}' is not a valid role: '${String(next)}'`);
      }
      if (seen.has(next)) {
        throw new Error(`${context}: fallback cycle detected at '${role}' -> '${next}'`);
      }
      seen.add(next);
      next = fallbacks[next];
    }
  }
}
