import { describe, expect, it } from 'vitest';
import { BASE_CONFIG, buildMatchConfig } from '../src/shared/config';
import { resolveCircleBox } from '../src/shared/math';
import { stepTankKinematics, applyVelocityResponse, type TankKinematicState } from '../src/shared/sim/tankKinematics';

const DT = 1 / 30;

function tank(x: number, z: number, yaw = 0): TankKinematicState {
  return {
    x, y: 0, z, vx: 0, vy: 0, vz: 0, yaw, yawVel: 0,
    pitch: 0, roll: 0, grounded: true, boosting: false, brace: false, drift: false,
  };
}

function step(t: TankKinematicState, input: { throttle: number; steer: number; boost?: boolean; brace?: boolean }, seconds = 0.5) {
  const mcfg = buildMatchConfig('none');
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    stepTankKinematics(t, { throttle: input.throttle, steer: input.steer, boost: !!input.boost, brace: !!input.brace }, BASE_CONFIG, mcfg, DT);
  }
}

describe('driver steering semantics', () => {
  it('A turns the chassis left while moving forward', () => {
    const t = tank(0, 0);
    step(t, { throttle: 1, steer: -1 }, 0.4);
    expect(t.yaw).toBeGreaterThan(0);
  });

  it('D turns the chassis right while moving forward', () => {
    const t = tank(0, 0);
    step(t, { throttle: 1, steer: 1 }, 0.4);
    expect(t.yaw).toBeLessThan(0);
  });

  it('A remains chassis-left while reversing (direction never flips)', () => {
    const t = tank(0, 0);
    step(t, { throttle: -1, steer: -1 }, 0.6);
    expect(t.yaw).toBeGreaterThan(0);
  });

  it('D remains chassis-right while reversing', () => {
    const t = tank(0, 0);
    step(t, { throttle: -1, steer: 1 }, 0.6);
    expect(t.yaw).toBeLessThan(0);
  });

  it('W drives along chassis forward regardless of yaw (no camera coupling)', () => {
    const t = tank(0, 0, Math.PI / 2);
    step(t, { throttle: 1, steer: 0 }, 0.3);
    expect(t.vx).toBeGreaterThan(3);
    expect(Math.abs(t.vz)).toBeLessThan(0.5);
  });

  it('recomputes the movement basis after steering', () => {
    const t = tank(0, 0);
    step(t, { throttle: 1, steer: 1 }, 0.6);
    const f = { x: Math.sin(t.yaw), z: Math.cos(t.yaw) };
    const speed = Math.hypot(t.vx, t.vz);
    expect(speed).toBeGreaterThan(2);
    const dot = (t.vx * f.x + t.vz * f.z) / speed;
    expect(dot).toBeGreaterThan(0.9);
  });
});

describe('circle-box collision', () => {
  it('produces exact separation with a valid normal and penetration', () => {
    const res = resolveCircleBox(1.5, 0, 1, 0, 0, 2, 2);
    expect(res.hit).toBe(true);
    expect(res.x).toBeCloseTo(2);
    expect(res.penetration).toBeCloseTo(0.5);
    expect(res.normalX).toBeCloseTo(1);
  });

  it('never pushes deeper on repeated resolution', () => {
    const res = resolveCircleBox(0.8, 0, 1, 0, 0, 2, 2);
    const res2 = resolveCircleBox(res.x, res.z, 1, 0, 0, 2, 2);
    expect(res2.x).toBeCloseTo(res.x);
    expect(res2.x).toBeGreaterThanOrEqual(1);
  });
});

describe('tank footprint and tunneling', () => {
  it('keeps the tank nose out of a wall', () => {
    // depotB1 barrier spans x 22.5..29.5, z 15..17.
    const t = tank(26, 12);
    step(t, { throttle: 1, steer: 0, boost: true }, 0.8);
    expect(t.z).toBeLessThan(14.0);
    expect(t.z).toBeGreaterThan(12.0);
  });

  it('does not tunnel through a thin barrier during boost', () => {
    const t = tank(26, 10);
    t.vz = 26;
    step(t, { throttle: 1, steer: 0, boost: true }, 0.4);
    expect(t.z).toBeLessThan(14.0);
    expect(t.z).toBeGreaterThan(11.0);
  });

  it('does not tunnel through a wall during cannon-scale recoil impulses', () => {
    const t = tank(26, 9);
    t.vz = 17;
    step(t, { throttle: 0, steer: 0 }, 0.5);
    expect(t.z).toBeLessThan(14.0);
    expect(t.z).toBeGreaterThan(11.0);
  });

  it('removes inward velocity and preserves tangent sliding', () => {
    let vx = 4;
    let vz = -5;
    ({ vx, vz } = applyVelocityResponse(vx, vz, 0, 1));
    expect(vz).toBeCloseTo(0);
    expect(vx).toBeCloseTo(4);
  });

  it('is stable at rest next to a wall (no oscillation)', () => {
    const t = tank(26, 13.0);
    t.vz = 0;
    step(t, { throttle: 0, steer: 0 }, 4);
    expect(t.z).toBeLessThan(13.4);
    expect(t.z).toBeGreaterThan(12.8);
  });

  it('cannot escape the arena through the south gate gap (boundary clamp)', () => {
    // Place the tank beyond the arena boundary in the gate gap (x=-6 has no
    // wall box) and drive outward: it must be clamped back and stop.
    const t = tank(-6, 70);
    t.vz = 26;
    step(t, { throttle: 1, steer: 0, boost: true }, 0.5);
    expect(t.z).toBeLessThanOrEqual(39.6);
    expect(t.z).toBeGreaterThanOrEqual(39.4);
    expect(Math.abs(t.vz)).toBeLessThan(0.01);
  });
});
