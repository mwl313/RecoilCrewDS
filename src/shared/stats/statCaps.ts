/** Base-relative safety caps that apply after every authored/runtime modifier. */
export const BASE_MULTIPLIER_CAPS: Readonly<Record<string, number>> = Object.freeze({
  'weapon.mgDamage': 5,
  'weapon.mgRange': 3,
  'weapon.mgRate': 2.25,
});

export function applyBaseMultiplierCap(stat: string, base: number, resolved: number): number {
  const multiplier = BASE_MULTIPLIER_CAPS[stat];
  return multiplier === undefined ? resolved : Math.min(resolved, base * multiplier);
}
