import { describe, expect, it } from 'vitest';
import { angleDiff } from '../src/shared/math';
import { DEFAULT_TANK_RIG } from '../src/shared/vehicle/tankRigTypes';
import { computeAimPivotWorld } from '../src/shared/vehicle/tankRigGeometry';
import {
  resolveTpsWeaponAim,
  TPS_AIM_POLE_THRESHOLDS,
  TPS_VERTICAL_AIM_ASSIST,
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

  it('keeps angular camera intent when close cover makes parallax ill-conditioned', () => {
    const pivot = computeAimPivotWorld(tank, DEFAULT_TANK_RIG);
    const cameraYaw = 0;
    const cameraPitch = 0.08;
    const result = resolveTpsWeaponAim({
      tank,
      rig: DEFAULT_TANK_RIG,
      worldTarget: { x: pivot.x, y: pivot.y + 8, z: pivot.z + 0.1 },
      cameraYaw,
      cameraPitch,
      limits,
    }, { poleActive: false });

    expect(result.desiredPitch).toBeCloseTo(cameraPitch, 6);
    expect(result.diagnostics.resolvedWorldYaw).toBeCloseTo(cameraYaw, 6);
  });

  it('enters a continuous assist and reaches exact vertical before the visual pole', () => {
    const state = { poleActive: false };
    const yaw = 0.8;
    const before = resolve(yaw, TPS_VERTICAL_AIM_ASSIST.pitchStartPitch, state);
    expect(before.diagnostics.pitchAssistWeight).toBe(0);
    let previousPitch = before.desiredPitch;
    for (let degree = 70.1; degree <= 84; degree += 0.1) {
      const current = resolve(yaw, degree * Math.PI / 180, state);
      expect(current.desiredPitch).toBeGreaterThanOrEqual(previousPitch - 1e-8);
      expect(current.desiredPitch - previousPitch).toBeLessThan(0.02);
      previousPitch = current.desiredPitch;
    }
    expect(previousPitch).toBeCloseTo(Math.PI / 2, 6);
    expect(state.poleActive).toBe(true);
  });

  it('does not reverse-spin against an offset shoulder-camera terrain point', () => {
    const pivot = computeAimPivotWorld(tank, DEFAULT_TANK_RIG);
    const state: TpsWeaponAimState = { poleActive: false };
    let previousYaw = 0;
    let maxYawStep = 0;
    for (let degree = 70; degree <= 86; degree += 0.1) {
      const result = resolveTpsWeaponAim({
        tank,
        rig: DEFAULT_TANK_RIG,
        worldTarget: { x: pivot.x + 0.9, y: 0, z: pivot.z - 2.2 },
        cameraYaw: 0,
        cameraPitch: -degree * Math.PI / 180,
        limits,
      }, state);
      if (degree > 70) {
        maxYawStep = Math.max(maxYawStep, Math.abs(angleDiff(previousYaw, result.diagnostics.resolvedWorldYaw)));
      }
      previousYaw = result.diagnostics.resolvedWorldYaw;
      if (degree >= 84) {
        expect(result.desiredPitch).toBeCloseTo(-Math.PI / 2, 6);
        expect(result.diagnostics.verticalLocked).toBe(true);
      }
    }
    expect(maxYawStep).toBeLessThan(0.01);

    const lockedYaw = previousYaw;
    const movedAtPole = resolveTpsWeaponAim({
      tank,
      rig: DEFAULT_TANK_RIG,
      worldTarget: { x: pivot.x + 0.9, y: 0, z: pivot.z - 2.2 },
      cameraYaw: 2.4,
      cameraPitch: -86 * Math.PI / 180,
      limits,
    }, state);
    expect(Math.abs(angleDiff(lockedYaw, movedAtPole.diagnostics.resolvedWorldYaw))).toBeLessThan(1e-9);
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
