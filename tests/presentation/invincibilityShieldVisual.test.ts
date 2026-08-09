import { describe, expect, it } from 'vitest';
import {
  INVINCIBILITY_SHIELD_BASE_OPACITY,
  INVINCIBILITY_SHIELD_WARNING_SECONDS,
  resolveInvincibilityShieldVisual,
} from '../../src/client/presentation/invincibilityShieldVisual';

describe('invincibility shield visual', () => {
  it('stays steady before its expiry warning window', () => {
    expect(resolveInvincibilityShieldVisual(2, 0)).toEqual({
      visible: true,
      opacity: INVINCIBILITY_SHIELD_BASE_OPACITY,
    });
    expect(resolveInvincibilityShieldVisual(INVINCIBILITY_SHIELD_WARNING_SECONDS, 99)).toEqual({
      visible: true,
      opacity: INVINCIBILITY_SHIELD_BASE_OPACITY,
    });
  });

  it('blinks while its opacity fades through the warning window', () => {
    const remaining = INVINCIBILITY_SHIELD_WARNING_SECONDS / 2;
    const brightBlink = resolveInvincibilityShieldVisual(remaining, 0.04);
    const dimBlink = resolveInvincibilityShieldVisual(remaining, 0.12);

    expect(brightBlink.visible).toBe(true);
    expect(brightBlink.opacity).toBeLessThan(INVINCIBILITY_SHIELD_BASE_OPACITY);
    expect(dimBlink.opacity).toBeLessThan(brightBlink.opacity);
    expect(resolveInvincibilityShieldVisual(0.05, 0).opacity).toBeLessThan(dimBlink.opacity);
  });

  it('fully disappears when invincibility expires or is invalid', () => {
    expect(resolveInvincibilityShieldVisual(0, 1)).toEqual({ visible: false, opacity: 0 });
    expect(resolveInvincibilityShieldVisual(-1, 1)).toEqual({ visible: false, opacity: 0 });
    expect(resolveInvincibilityShieldVisual(Number.NaN, 1)).toEqual({ visible: false, opacity: 0 });
  });
});
