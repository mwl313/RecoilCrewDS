export const INVINCIBILITY_SHIELD_BASE_OPACITY = 0.14;
export const INVINCIBILITY_SHIELD_WARNING_SECONDS = 1.25;

const INVINCIBILITY_SHIELD_BLINK_HZ_START = 3.5;
const INVINCIBILITY_SHIELD_BLINK_HZ_END = 9;
const INVINCIBILITY_SHIELD_BLINK_FLOOR = 0.1;

export interface InvincibilityShieldVisual {
  visible: boolean;
  opacity: number;
}

/**
 * Keeps invincibility readable at full strength, then gives an increasingly
 * urgent blink while the shell fades through its final warning window.
 */
export function resolveInvincibilityShieldVisual(
  remainingSeconds: number,
  timeSeconds: number,
): InvincibilityShieldVisual {
  if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) {
    return { visible: false, opacity: 0 };
  }

  if (remainingSeconds >= INVINCIBILITY_SHIELD_WARNING_SECONDS) {
    return { visible: true, opacity: INVINCIBILITY_SHIELD_BASE_OPACITY };
  }

  const remainingRatio = remainingSeconds / INVINCIBILITY_SHIELD_WARNING_SECONDS;
  const warningProgress = 1 - remainingRatio;
  const blinkHz = INVINCIBILITY_SHIELD_BLINK_HZ_START
    + (INVINCIBILITY_SHIELD_BLINK_HZ_END - INVINCIBILITY_SHIELD_BLINK_HZ_START) * warningProgress;
  const wave = 0.5 + 0.5 * Math.sin(timeSeconds * Math.PI * 2 * blinkHz);
  const blinkPulse = INVINCIBILITY_SHIELD_BLINK_FLOOR
    + (1 - INVINCIBILITY_SHIELD_BLINK_FLOOR) * wave * wave;
  const blinkStrength = 1 - warningProgress + warningProgress * blinkPulse;

  return {
    visible: true,
    opacity: INVINCIBILITY_SHIELD_BASE_OPACITY * remainingRatio * blinkStrength,
  };
}
