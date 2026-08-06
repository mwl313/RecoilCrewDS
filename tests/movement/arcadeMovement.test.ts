import { describe, expect, it } from 'vitest';
import { BASE_CONFIG, buildMatchConfig } from '../../src/shared/config';
import type { GameConfig } from '../../src/shared/config';
import type { GroundQuery } from '../../src/shared/sim/groundQuery';
import { stepTankKinematics, type TankKinematicState } from '../../src/shared/sim/tankKinematics';
import { Match } from '../../src/shared/sim/match';
import { loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';
import { MatchRules } from '../../src/shared/rules/matchRules';
import type { TankImpulseSpec } from '../../src/shared/effects/tankImpulseSystem';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../content');

function ground(half = 200): GroundQuery {
  return {
    groundHeightAt: () => 0,
    groundNormalAt: () => ({ nx: 0, ny: 1, nz: 0 }),
    ramps: [],
    half,
    resolveCircleContacts: (x, z) => ({ x, z, contacts: [] }),
  };
}

function tank(partial: Partial<TankKinematicState> = {}): TankKinematicState {
  return {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, yawVel: 0,
    pitch: 0, roll: 0, grounded: true, dashCooldown: 0, dashPresentationT: 0, dashDamageT: 0, drift: false,
    landingGripT: 0, ...partial,
  };
}

const NEUTRAL = { throttle: 0, steer: 0, dashPressed: false, jumpPressed: false };
const STEP = 1 / 30;

function step(t: TankKinematicState, input = NEUTRAL, seconds = STEP): void {
  stepTankKinematics(t, input, BASE_CONFIG, buildMatchConfig('none'), seconds, undefined, ground());
}

describe('arcade movement values are content-driven', () => {
  it('content and legacy paths project identical new tank fields', () => {
    const pack = loadContentPackFromFilesystem(CONTENT_ROOT);
    const content = MatchRules.fromContentPack(pack, 'none');
    const legacy = MatchRules.fromLegacyConfig('none');
    for (const key of [
      'steerHigh', 'normalGrip', 'airControl', 'airGripMultiplier', 'groundYawDamping',
      'airYawDamping', 'hardHorizontalSpeedCap', 'maxVisualAirPitch', 'maxVisualAirRoll',
      'visualAirLevelRate', 'landingGripSeconds', 'landingGripMultiplier', 'gravity',
      'jumpHeight', 'rampLaunchSpeed', 'dashImpulse', 'dashCooldown', 'dashAirMultiplier',
      'dashMaxHorizontalSpeed', 'recoilImpulse', 'mgRecoilImpulse',
    ] as const) {
      expect((content.config.tank as unknown as Record<string, number>)[key], key).toBe(
        (legacy.config.tank as unknown as Record<string, number>)[key],
      );
    }
    expect(content.config.tank.steerHigh).toBe(0.9);
    expect(content.config.tank.normalGrip).toBe(2.1);
    expect(content.config.tank.gravity).toBe(13.5);
    expect(content.config.tank.jumpHeight).toBe(3.0);
    expect(content.config.tank.dashImpulse).toBe(13.0);
    expect(content.config.tank.hardHorizontalSpeedCap).toBe(35.0);
    expect(content.config.tank.landingGripSeconds).toBe(0.12);
    expect(content.config.tank.landingGripMultiplier).toBe(0.35);
  });

  it('movement block replicates every predictor-critical field incl. turret pitch', () => {
    const pack = loadContentPackFromFilesystem(CONTENT_ROOT);
    const rules = MatchRules.fromContentPack(pack, 'none');
    const block = rules.movementBlock();
    expect(block.tank.steerHigh).toBe(0.9);
    expect(block.tank.airGripMultiplier).toBe(0.35);
    expect(block.tank.groundYawDamping).toBe(3.2);
    expect(block.tank.airYawDamping).toBe(2.2);
    expect(block.tank.hardHorizontalSpeedCap).toBe(35.0);
    expect(block.tank.landingGripSeconds).toBe(0.12);
    expect(block.turret.minPitch).toBeCloseTo(-Math.PI / 2, 12);
    expect(block.turret.maxPitch).toBeCloseTo(Math.PI / 2, 12);
    expect(block.weapon?.cannonSpeed).toBe(BASE_CONFIG.weapons.cannonSpeed);
    expect(block.weapon?.cannonGravity).toBe(BASE_CONFIG.weapons.cannonGravity);
    expect(block.weapon?.cannonLife).toBe(BASE_CONFIG.weapons.cannonLife);
  });
});

describe('upright aerial handling', () => {
  it('aerial grip preserves more lateral momentum than ground grip', () => {
    const air = tank({ y: 5, grounded: false, vx: 10 });
    const groundT = tank({ vx: 10 });
    for (let i = 0; i < 30; i++) {
      step(air);
      step(groundT);
    }
    expect(Math.abs(air.vx)).toBeGreaterThan(Math.abs(groundT.vx));
    // Ground decay: exp(-2.1) ≈ 0.122 → ~1.2; air: exp(-2.1*0.35) ≈ 0.48 → ~4.8.
    expect(groundT.vx).toBeLessThan(2);
    expect(air.vx).toBeGreaterThan(4);
  });

  it('ground and air yaw damping differ and are data-driven', () => {
    const groundT = tank({ yawVel: 10 });
    const air = tank({ y: 5, grounded: false, yawVel: 10 });
    step(groundT);
    step(air);
    const groundRatio = groundT.yawVel / 10;
    const airRatio = air.yawVel / 10;
    expect(groundRatio).toBeCloseTo(Math.exp(-3.2 * STEP), 5);
    expect(airRatio).toBeCloseTo(Math.exp(-2.2 * STEP), 5);
    expect(airRatio).toBeGreaterThan(groundRatio);
  });

  it('air yaw steering uses airControl', () => {
    const air = tank({ y: 5, grounded: false });
    step(air, { throttle: 1, steer: 1, dashPressed: false, jumpPressed: false });
    const groundT = tank();
    step(groundT, { throttle: 1, steer: 1, dashPressed: false, jumpPressed: false });
    // Steer rate scales with speed ratio; air is additionally ×0.55.
    expect(Math.abs(air.yaw)).toBeLessThan(Math.abs(groundT.yaw));
  });

  it('visual pitch/roll stay clamped while airborne and never invert', () => {
    const t = tank({ y: 5, grounded: false, vy: 20, yawVel: 30 });
    for (let i = 0; i < 10; i++) {
      step(t, { throttle: 0, steer: -1, dashPressed: false, jumpPressed: false });
      expect(Math.abs(t.pitch)).toBeLessThanOrEqual(0.22 + 1e-9);
      expect(Math.abs(t.roll)).toBeLessThanOrEqual(0.28 + 1e-9);
    }
    expect(t.pitch).toBeGreaterThan(-0.22);
    expect(t.roll).toBeGreaterThan(-0.28);
  });

  it('landing sets the grace timer and reduces grip during the window', () => {
    const t = tank({ y: 0.05, grounded: false, vy: -3 });
    step(t);
    expect(t.grounded).toBe(true);
    expect(t.landingGripT).toBeCloseTo(0.12, 5);
    // Grip during the grace window is weaker than normal ground grip.
    const grace = tank({ vx: 10, landingGripT: 0.1 });
    const normal = tank({ vx: 10 });
    for (let i = 0; i < 6; i++) {
      step(grace);
      step(normal);
    }
    expect(Math.abs(grace.vx)).toBeGreaterThan(Math.abs(normal.vx));
  });
});

describe('dash and hard speed cap', () => {
  it('dash uses the new values and caps at dashMaxHorizontalSpeed', () => {
    const t = tank({ vx: 30 });
    step(t, { throttle: 0, steer: 0, dashPressed: true, jumpPressed: false });
    expect(t.dashCooldown).toBeCloseTo(0.8, 5);
    expect(Math.hypot(t.vx, t.vz)).toBeLessThanOrEqual(33.0001);
    expect(Math.hypot(t.vx, t.vz)).toBeGreaterThan(30);
  });

  it('hardHorizontalSpeedCap bounds external impulse stacking but never vertical velocity', () => {
    const match = new Match('m', 'none');
    const impulse: TankImpulseSpec = {
      sourceId: 'test', kind: 'other',
      direction: { x: 1, y: 0, z: 0 },
      magnitude: 100,
      yawImpulse: 0,
      rollImpulse: 0,
      verticalScale: 1,
    };
    match.runtime.systems.impulses.apply(impulse);
    expect(match.state.tank.vx).toBeLessThanOrEqual(35.0001);
    const up: TankImpulseSpec = {
      sourceId: 'test', kind: 'other',
      direction: { x: 0, y: 1, z: 0 },
      magnitude: 100,
      yawImpulse: 0,
      rollImpulse: 0,
      verticalScale: 1,
    };
    match.runtime.systems.impulses.apply(up);
    expect(match.state.tank.vy).toBe(100); // vertical is never horizontally capped
  });
});

describe('3D recoil and traversal', () => {
  function recoilSpec(direction: { x: number; y: number; z: number }, magnitude = 10.5): TankImpulseSpec {
    return {
      sourceId: 'weapon.mainCannon', kind: 'cannon',
      direction,
      magnitude,
      yawImpulse: 0,
      rollImpulse: 0,
      verticalScale: 1,
      launchThreshold: 0.25,
    };
  }

  it('downward shot gives upward recoil and launches a grounded tank', () => {
    const match = new Match('m', 'none');
    // Spec direction is the recoil direction (inverse of the shot).
    match.runtime.systems.recoil.apply(recoilSpec({ x: 0, y: 1, z: 0 }));
    expect(match.state.tank.vy).toBeCloseTo(10.5, 5);
    expect(match.state.tank.grounded).toBe(false);
  });

  it('upward shot gives downward recoil; horizontal shot is horizontal only', () => {
    const match = new Match('m', 'none');
    match.runtime.systems.recoil.apply(recoilSpec({ x: 0, y: -1, z: 0 }));
    expect(match.state.tank.vy).toBeCloseTo(-10.5, 5);
    const match2 = new Match('m', 'none');
    match2.runtime.systems.recoil.apply(recoilSpec({ x: 1, y: 0, z: 0 }));
    expect(match2.state.tank.vx).toBeCloseTo(10.5, 5);
    expect(match2.state.tank.vy).toBe(0);
  });

  it('jump + downward cannon reaches higher than jump alone', () => {
    const jumpOnly = new Match('m', 'none');
    jumpOnly.setDriverInput({ throttle: 0, steer: 0, dashPressed: false, jumpPressed: true });
    jumpOnly.step(1 / 30);
    const jumpVy = jumpOnly.state.tank.vy;
    const combo = new Match('m', 'none');
    combo.setDriverInput({ throttle: 0, steer: 0, dashPressed: false, jumpPressed: true });
    combo.step(1 / 30);
    combo.runtime.systems.recoil.apply(recoilSpec({ x: 0, y: 1, z: 0 }));
    expect(combo.state.tank.vy).toBeGreaterThan(jumpVy + 9);
  });

  it('near-vertical downward aim gives almost pure vertical takeoff', () => {
    const match = new Match('m', 'none');
    // Recoil is the inverse of a ~straight-down shot → ~straight up.
    match.runtime.systems.recoil.apply({
      sourceId: 'weapon.mainCannon',
      kind: 'cannon',
      direction: { x: 0, y: 1, z: 0 },
      magnitude: 10.5,
      yawImpulse: 0,
      rollImpulse: 0,
      verticalScale: 1,
      launchThreshold: 0.25,
    });
    expect(match.state.tank.vy).toBeCloseTo(10.5, 5);
    expect(match.state.tank.grounded).toBe(false);
    expect(Math.hypot(match.state.tank.vx, match.state.tank.vz)).toBeLessThan(0.001);
  });

  it('MG applies small repeated recoil impulses', () => {
    const match = new Match('m', 'none');
    const spec: TankImpulseSpec = {
      sourceId: 'weapon.machineGun', kind: 'mg',
      direction: { x: -1, y: 0, z: 0 },
      magnitude: 0.15,
      yawImpulse: 0,
      rollImpulse: 0,
      verticalScale: 1,
      launchThreshold: 0.25,
    };
    for (let i = 0; i < 5; i++) match.runtime.systems.recoil.apply(spec);
    expect(match.state.tank.vx).toBeCloseTo(-0.75, 5);
  });
});
