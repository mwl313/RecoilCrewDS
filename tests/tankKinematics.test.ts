import { describe, expect, it } from 'vitest';
import { BASE_CONFIG, buildMatchConfig } from '../src/shared/config';
import { resolveCircleBox } from '../src/shared/math';
import { stepTankKinematics, applyVelocityResponse, type TankKinematicState } from '../src/shared/sim/tankKinematics';

const DT = 1 / 30;

function tank(x: number, z: number, yaw = 0): TankKinematicState {
  return {
    x, y: 0, z, vx: 0, vy: 0, vz: 0, yaw, yawVel: 0,
    pitch: 0, roll: 0, grounded: true, dashCooldown: 0, dashPresentationT: 0, drift: false,
  };
}

function step(t: TankKinematicState, input: { throttle: number; steer: number; dashPressed?: boolean; jumpPressed?: boolean }, seconds = 0.5) {
  const mcfg = buildMatchConfig('none');
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    stepTankKinematics(
      t,
      {
        throttle: input.throttle,
        steer: input.steer,
        dashPressed: !!input.dashPressed,
        jumpPressed: !!input.jumpPressed,
      },
      BASE_CONFIG,
      mcfg,
      DT,
    );
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
  it('keeps the tank nose out of a wall at dash speed', () => {
    // depotB1 barrier spans x 22.5..29.5, z 15..17.
    const t = tank(26, 12);
    t.vz = BASE_CONFIG.tank.dashMaxHorizontalSpeed;
    step(t, { throttle: 1, steer: 0 }, 0.8);
    expect(t.z).toBeLessThan(14.0);
    expect(t.z).toBeGreaterThan(12.0);
  });

  it('does not tunnel through a thin barrier during a dash burst', () => {
    const t = tank(26, 10);
    t.vz = 26;
    step(t, { throttle: 1, steer: 0 }, 0.4);
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
    step(t, { throttle: 1, steer: 0 }, 0.5);
    expect(t.z).toBeLessThanOrEqual(39.6);
    expect(t.z).toBeGreaterThanOrEqual(39.4);
    expect(Math.abs(t.vz)).toBeLessThan(0.01);
  });
});

describe('jump kinematics', () => {
  it('launches a grounded tank upward with sqrt(2 * gravity * jumpHeight)', () => {
    // Flat floor: spawn point (-6, 10) has ground height 0.
    const t = tank(-6, 10);
    const expected = Math.sqrt(2 * BASE_CONFIG.tank.gravity * BASE_CONFIG.tank.jumpHeight);
    stepTankKinematics(
      t,
      { throttle: 0, steer: 0, dashPressed: false, jumpPressed: true },
      BASE_CONFIG,
      buildMatchConfig('none'),
      DT,
    );
    // Same-step gravity applies after the jump edge (jump precedes gravity
    // integration), so the observable velocity is launch minus one step.
    expect(t.vy).toBeCloseTo(expected - BASE_CONFIG.tank.gravity * DT, 5);
    expect(t.grounded).toBe(false);
  });

  it('reaches an apex approximately equal to jumpHeight', () => {
    const t = tank(-6, 10);
    stepTankKinematics(
      t,
      { throttle: 0, steer: 0, dashPressed: false, jumpPressed: true },
      BASE_CONFIG,
      buildMatchConfig('none'),
      DT,
    );
    let maxY = 0;
    for (let i = 0; i < 90; i++) {
      stepTankKinematics(
        t,
        { throttle: 0, steer: 0, dashPressed: false, jumpPressed: false },
        BASE_CONFIG,
        buildMatchConfig('none'),
        DT,
      );
      maxY = Math.max(maxY, t.y);
    }
    expect(maxY).toBeGreaterThan(BASE_CONFIG.tank.jumpHeight * 0.92);
    expect(maxY).toBeLessThan(BASE_CONFIG.tank.jumpHeight * 1.08);
  });

  it('jumpHeight zero disables jumping', () => {
    const cfg = JSON.parse(JSON.stringify(BASE_CONFIG)) as typeof BASE_CONFIG;
    cfg.tank.jumpHeight = 0;
    const t = tank(-6, 10);
    stepTankKinematics(
      t,
      { throttle: 0, steer: 0, dashPressed: false, jumpPressed: true },
      cfg,
      buildMatchConfig('none'),
      DT,
    );
    expect(t.vy).toBe(0);
    expect(t.grounded).toBe(true);
  });

  it('does not allow an air jump', () => {
    const t = tank(-6, 10);
    t.grounded = false;
    t.y = 2;
    t.vy = 0;
    stepTankKinematics(
      t,
      { throttle: 0, steer: 0, dashPressed: false, jumpPressed: true },
      BASE_CONFIG,
      buildMatchConfig('none'),
      DT,
    );
    expect(t.vy).toBeLessThanOrEqual(0);
    expect(t.grounded).toBe(false);
  });

  it('preserves horizontal momentum while jumping', () => {
    const t = tank(-6, 10);
    step(t, { throttle: 1, steer: 0 }, 0.6);
    const vxBefore = t.vx;
    const vzBefore = t.vz;
    stepTankKinematics(
      t,
      { throttle: 0, steer: 0, dashPressed: false, jumpPressed: true },
      BASE_CONFIG,
      buildMatchConfig('none'),
      DT,
    );
    expect(Math.hypot(t.vx - vxBefore, t.vz - vzBefore)).toBeLessThan(0.5);
  });

  it('a jump does not repeat while the input edge stays set', () => {
    const t = tank(-6, 10);
    const mcfg = buildMatchConfig('none');
    for (let i = 0; i < 10; i++) {
      stepTankKinematics(
        t,
        { throttle: 0, steer: 0, dashPressed: false, jumpPressed: true },
        BASE_CONFIG,
        mcfg,
        DT,
      );
    }
    // One jump only: vy decays under gravity and never re-launches mid-air.
    expect(t.vy).toBeLessThanOrEqual(Math.sqrt(2 * BASE_CONFIG.tank.gravity * BASE_CONFIG.tank.jumpHeight));
    // After landing, the same held edge cannot jump again until re-sequenced.
    step(t, { throttle: 0, steer: 0 }, 2.0);
    expect(t.grounded).toBe(true);
    expect(t.vy).toBe(0);
  });

  it('lower gravity keeps the approximate apex while lengthening airtime', () => {
    const lowG = buildMatchConfig('moonYard');
    const t = tank(-6, 10);
    let maxY = 0;
    let airSteps = 0;
    stepTankKinematics(
      t,
      { throttle: 0, steer: 0, dashPressed: false, jumpPressed: true },
      BASE_CONFIG,
      lowG,
      DT,
    );
    for (let i = 0; i < 240; i++) {
      stepTankKinematics(
        t,
        { throttle: 0, steer: 0, dashPressed: false, jumpPressed: false },
        BASE_CONFIG,
        lowG,
        DT,
      );
      maxY = Math.max(maxY, t.y);
      if (!t.grounded) airSteps++;
    }
    expect(maxY).toBeGreaterThan(BASE_CONFIG.tank.jumpHeight * 0.92);
    expect(maxY).toBeLessThan(BASE_CONFIG.tank.jumpHeight * 1.08);
    expect(airSteps).toBeGreaterThan(40); // ~1.6s vs ~1.0s at normal gravity
  });
});

describe('dash kinematics', () => {
  it('applies one chassis-forward impulse', () => {
    const t = tank(-6, 10, 0.6);
    stepTankKinematics(
      t,
      { throttle: 0, steer: 0, dashPressed: true, jumpPressed: false },
      BASE_CONFIG,
      buildMatchConfig('none'),
      DT,
    );
    const forward = { x: Math.sin(0.6), z: Math.cos(0.6) };
    const speed = Math.hypot(t.vx, t.vz);
    expect(speed).toBeCloseTo(BASE_CONFIG.tank.dashImpulse, 5);
    expect(t.vx / speed).toBeCloseTo(forward.x, 5);
    expect(t.vz / speed).toBeCloseTo(forward.z, 5);
    expect(t.dashCooldown).toBeCloseTo(BASE_CONFIG.tank.dashCooldown, 5);
    expect(t.dashPresentationT).toBeCloseTo(BASE_CONFIG.tank.dashPresentationSeconds, 5);
  });

  it('holding the dash edge is not sprint behavior: one burst then cooldown', () => {
    const t = tank(-6, 10);
    const mcfg = buildMatchConfig('none');
    stepTankKinematics(
      t,
      { throttle: 0, steer: 0, dashPressed: true, jumpPressed: false },
      BASE_CONFIG,
      mcfg,
      DT,
    );
    const speedAfterFirst = Math.hypot(t.vx, t.vz);
    for (let i = 0; i < 10; i++) {
      stepTankKinematics(
        t,
        { throttle: 0, steer: 0, dashPressed: true, jumpPressed: false },
        BASE_CONFIG,
        mcfg,
        DT,
      );
    }
    expect(Math.hypot(t.vx, t.vz)).toBeLessThanOrEqual(speedAfterFirst + 0.01);
  });

  it('cooldown rejects an early repress and accepts a later one', () => {
    const t = tank(-6, 10);
    const mcfg = buildMatchConfig('none');
    stepTankKinematics(
      t,
      { throttle: 0, steer: 0, dashPressed: true, jumpPressed: false },
      BASE_CONFIG,
      mcfg,
      DT,
    );
    // Repress immediately: blocked.
    stepTankKinematics(
      t,
      { throttle: 0, steer: 0, dashPressed: true, jumpPressed: false },
      BASE_CONFIG,
      mcfg,
      DT,
    );
    expect(t.dashCooldown).toBeGreaterThan(0);
    expect(Math.hypot(t.vx, t.vz)).toBeLessThanOrEqual(BASE_CONFIG.tank.dashImpulse + 0.01);
    // Wait out the cooldown, then a new press is accepted.
    step(t, { throttle: 0, steer: 0 }, BASE_CONFIG.tank.dashCooldown + 0.1);
    expect(t.dashCooldown).toBe(0);
    stepTankKinematics(
      t,
      { throttle: 0, steer: 0, dashPressed: true, jumpPressed: false },
      BASE_CONFIG,
      mcfg,
      DT,
    );
    expect(Math.hypot(t.vx, t.vz)).toBeCloseTo(BASE_CONFIG.tank.dashImpulse, 4);
  });

  it('dashing while reversing still bursts chassis-forward', () => {
    const t = tank(-6, 10, 0);
    step(t, { throttle: -1, steer: 0 }, 0.6);
    expect(t.vz).toBeLessThan(-1);
    stepTankKinematics(
      t,
      { throttle: -1, steer: 0, dashPressed: true, jumpPressed: false },
      BASE_CONFIG,
      buildMatchConfig('none'),
      DT,
    );
    // The burst adds +Z (chassis forward) on top of the reverse velocity.
    expect(t.vz).toBeGreaterThan(0);
  });

  it('preserves lateral and vertical velocity', () => {
    const t = tank(-6, 10);
    t.vx = 3;
    t.vy = 2;
    t.grounded = false;
    t.y = 2;
    stepTankKinematics(
      t,
      { throttle: 0, steer: 0, dashPressed: true, jumpPressed: false },
      BASE_CONFIG,
      buildMatchConfig('none'),
      DT,
    );
    // Lateral momentum decays only by the normal per-step grip (no dash-side
    // zeroing); the dash itself preserves it.
    expect(t.vx).toBeGreaterThan(2.5);
    expect(t.vz).toBeCloseTo(
      BASE_CONFIG.tank.dashImpulse * BASE_CONFIG.tank.dashAirMultiplier,
      4,
    );
    expect(t.vy).toBeCloseTo(2 - BASE_CONFIG.tank.gravity * DT, 5); // gravity only
  });

  it('applies the air multiplier while airborne and disables at zero', () => {
    const air = tank(-6, 10);
    air.grounded = false;
    stepTankKinematics(
      air,
      { throttle: 0, steer: 0, dashPressed: true, jumpPressed: false },
      BASE_CONFIG,
      buildMatchConfig('none'),
      DT,
    );
    expect(Math.hypot(air.vx, air.vz)).toBeCloseTo(
      BASE_CONFIG.tank.dashImpulse * BASE_CONFIG.tank.dashAirMultiplier,
      5,
    );

    const cfg = JSON.parse(JSON.stringify(BASE_CONFIG)) as typeof BASE_CONFIG;
    cfg.tank.dashAirMultiplier = 0;
    const disabled = tank(-6, 10);
    disabled.grounded = false;
    stepTankKinematics(
      disabled,
      { throttle: 0, steer: 0, dashPressed: true, jumpPressed: false },
      cfg,
      buildMatchConfig('none'),
      DT,
    );
    expect(Math.hypot(disabled.vx, disabled.vz)).toBe(0);
    expect(disabled.dashCooldown).toBe(0); // not accepted
  });

  it('caps horizontal speed while preserving direction', () => {
    const cfg = JSON.parse(JSON.stringify(BASE_CONFIG)) as typeof BASE_CONFIG;
    cfg.tank.dashMaxHorizontalSpeed = 20;
    const t = tank(-6, 10);
    t.vz = 18; // at the per-frame max speed; the burst would exceed the cap
    stepTankKinematics(
      t,
      { throttle: 0, steer: 0, dashPressed: true, jumpPressed: false },
      cfg,
      buildMatchConfig('none'),
      DT,
    );
    const speed = Math.hypot(t.vx, t.vz);
    expect(speed).toBeCloseTo(20, 5);
    expect(t.vz).toBeGreaterThan(0);
    expect(Math.abs(t.vx)).toBeLessThan(1e-9);
  });
});
