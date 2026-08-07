import { describe, expect, it } from 'vitest';
import { angleDiff } from '../src/shared/math';
import { DEFAULT_TANK_RIG } from '../src/shared/vehicle/tankRigTypes';
import { computeAimPivotWorld } from '../src/shared/vehicle/tankRigGeometry';
import {
  resolveTpsWeaponAim,
  TPS_AIM_POLE_THRESHOLDS,
  type TpsWeaponAimState,
} from '../src/client/aim/tpsWeaponAimResolver';

const tank = { x: 4, y: 2, z: -3, yaw: 0.35 };
const limits = { minPitch: -Math.PI / 2, maxPitch: Math.PI / 2 };

function targetOnIntent(yaw: number, pitch: number, distance = 30) {
  const pivot = computeAimPivotWorld(tank, DEFAULT_TANK_RIG);
  const cosPitch = Math.cos(pitch);
  return {
    x: pivot.x + Math.sin(yaw) * cosPitch * distance,
    y: pivot.y + Math.sin(pitch) * distance,
    z: pivot.z + Math.cos(yaw) * cosPitch * distance,
  };
}

function resolve(yaw: number, pitch: number, state: TpsWeaponAimState) {
  return resolveTpsWeaponAim({
    tank,
    rig: DEFAULT_TANK_RIG,
    worldTarget: targetOnIntent(yaw, pitch),
    cameraYaw: yaw,
    cameraPitch: pitch,
    limits,
  }, state);
}

describe('pole-safe TPS weapon aim resolver', () => {
  it.each([-1, 1])('is continuous through a fine %s90-degree pitch sweep', (sign) => {
    const state = { poleActive: false };
    const yaw = 1.2;
    let previous = resolve(yaw, sign * Math.PI / 3, state);
    for (let degree = 60.1; degree <= 90; degree += 0.1) {
      const current = resolve(yaw, sign * degree * Math.PI / 180, state);
      expect(Number.isFinite(current.desiredYawLocal)).toBe(true);
      expect(Number.isFinite(current.desiredPitch)).toBe(true);
      expect(Math.abs(angleDiff(previous.desiredYawLocal, current.desiredYawLocal))).toBeLessThan(0.02);
      expect(Math.abs(current.desiredPitch - previous.desiredPitch)).toBeLessThan(0.01);
      previous = current;
    }
    expect(previous.desiredPitch).toBeCloseTo(sign * Math.PI / 2, 6);
    expect(previous.diagnostics.poleActive).toBe(true);
  });

  it.each([-1, 1])('preserves stored yaw through 360 degrees near the %s pole', (sign) => {
    const state = { poleActive: false };
    let previousWorldYaw = -Math.PI;
    for (let degree = -180; degree <= 540; degree += 2) {
      const yaw = degree * Math.PI / 180;
      const result = resolve(yaw, sign * (89.99 * Math.PI / 180), state);
      expect(Math.abs(angleDiff(previousWorldYaw, result.diagnostics.resolvedWorldYaw))).toBeLessThan(0.04);
      previousWorldYaw = result.diagnostics.resolvedWorldYaw;
    }
  });

  it('uses stored camera yaw at the direct pivot singularity', () => {
    const pivot = computeAimPivotWorld(tank, DEFAULT_TANK_RIG);
    const state = { poleActive: false };
    const cameraYaw = -2.2;
    const result = resolveTpsWeaponAim({
      tank,
      rig: DEFAULT_TANK_RIG,
      worldTarget: { x: pivot.x, y: pivot.y - 20, z: pivot.z },
      cameraYaw,
      cameraPitch: -Math.PI / 2,
      limits,
    }, state);
    expect(result.diagnostics.horizontalRatio).toBeLessThan(TPS_AIM_POLE_THRESHOLDS.blendInner);
    expect(result.diagnostics.resolvedWorldYaw).toBeCloseTo(cameraYaw, 6);
    expect(result.desiredPitch).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('preserves exact vertical intent when the pole-safe boom offsets the terrain hit', () => {
    const pivot = computeAimPivotWorld(tank, DEFAULT_TANK_RIG);
    const cameraYaw = 0.65;
    const state = { poleActive: false };
    // Representative exact-down terrain point below a physical camera boom:
    // several metres behind the pivot rather than directly beneath it.
    const result = resolveTpsWeaponAim({
      tank,
      rig: DEFAULT_TANK_RIG,
      worldTarget: {
        x: pivot.x - Math.sin(cameraYaw) * 2.2,
        y: 0,
        z: pivot.z - Math.cos(cameraYaw) * 2.2,
      },
      cameraYaw,
      cameraPitch: -Math.PI / 2,
      limits,
    }, state);
    expect(result.diagnostics.horizontalRatio).toBeGreaterThan(TPS_AIM_POLE_THRESHOLDS.exit);
    expect(result.diagnostics.cameraHorizontalRatio).toBeLessThan(1e-8);
    expect(result.diagnostics.conditioningRatio).toBeLessThan(1e-8);
    expect(result.diagnostics.resolvedWorldYaw).toBeCloseTo(cameraYaw, 6);
    expect(result.desiredPitch).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('returns to parallax-correct world targeting outside the pole band', () => {
    const state = { poleActive: true };
    const result = resolve(0.8, 45 * Math.PI / 180, state);
    expect(result.diagnostics.horizontalRatio).toBeGreaterThan(TPS_AIM_POLE_THRESHOLDS.exit);
    expect(result.diagnostics.poleActive).toBe(false);
    expect(result.diagnostics.poleBlendWeight).toBe(0);
    expect(result.diagnostics.resolvedWorldYaw).toBeCloseTo(0.8, 6);
  });

  it('uses a continuous hysteresis band while returning from the pole', () => {
    const ratio = 0.11;
    const pitch = Math.acos(ratio);
    const approaching = resolve(0.8, pitch, { poleActive: false });
    const returning = resolve(0.8, pitch, { poleActive: true });
    expect(approaching.diagnostics.poleActive).toBe(false);
    expect(returning.diagnostics.poleActive).toBe(true);
    expect(returning.diagnostics.poleBlendWeight).toBeGreaterThan(approaching.diagnostics.poleBlendWeight);
    for (const boundary of [TPS_AIM_POLE_THRESHOLDS.enter, TPS_AIM_POLE_THRESHOLDS.exit]) {
      const boundaryPitch = Math.acos(boundary);
      const inactive = resolve(0.8, boundaryPitch, { poleActive: false });
      const active = resolve(0.8, boundaryPitch, { poleActive: true });
      expect(active.diagnostics.poleBlendWeight).toBeCloseTo(inactive.diagnostics.poleBlendWeight, 8);
    }
  });

  it('is deterministic for Single Player and multiplayer Gunner state', () => {
    const input = {
      tank,
      rig: DEFAULT_TANK_RIG,
      worldTarget: targetOnIntent(2.4, -88 * Math.PI / 180),
      cameraYaw: 2.4,
      cameraPitch: -88 * Math.PI / 180,
      limits,
    };
    const singlePlayer = resolveTpsWeaponAim(input, { poleActive: false });
    const multiplayerGunner = resolveTpsWeaponAim(input, { poleActive: false });
    expect(multiplayerGunner).toEqual(singlePlayer);
  });
});
