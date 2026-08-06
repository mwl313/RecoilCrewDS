import { describe, expect, it } from 'vitest';
import { BASE_CONFIG, buildMatchConfig } from '../src/shared/config';
import { resolveCircleBox } from '../src/shared/math';
import { resolveTankFootprint, stepTankKinematics, applyVelocityResponse, type TankKinematicState } from '../src/shared/sim/tankKinematics';
import type { GroundQuery } from '../src/shared/sim/groundQuery';

const DT = 1 / 30;

function tank(x: number, z: number, yaw = 0): TankKinematicState {
  return {
    x, y: 0, z, vx: 0, vy: 0, vz: 0, yaw, yawVel: 0,
    pitch: 0, roll: 0, grounded: true, dashCooldown: 0, dashPresentationT: 0, dashDamageT: 0, drift: false, landingGripT: 0,
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

function groundWithBounds(bounds: { minX: number; maxX: number; minZ: number; maxZ: number }, half: number): GroundQuery {
  return {
    groundHeightAt: () => 0,
    groundNormalAt: () => ({ nx: 0, ny: 1, nz: 0 }),
    ramps: [],
    half,
    bounds,
    resolveCircleContacts: (x, z) => ({ x, z, contacts: [] }),
  };
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

describe('arena bounds are axis-aware (any map size)', () => {
  it('clamps a rectangular arena on the correct axis only', () => {
    // 300 wide (X) × 600 deep (Z), centered on (0,0).
    const ground = groundWithBounds({ minX: -150, maxX: 150, minZ: -300, maxZ: 300 }, 150);
    const t = tank(200, 250); // outside X, inside Z
    resolveTankFootprint(t, BASE_CONFIG, ground);
    expect(t.x).toBeCloseTo(149.5); // clamped on the narrow axis
    expect(t.z).toBeCloseTo(250); // untouched on the long axis
    expect(t.vx).toBe(0);
  });

  it('still clamps the default square bounds exactly as before', () => {
    const ground = groundWithBounds({ minX: -40, maxX: 40, minZ: -40, maxZ: 40 }, 40);
    const t = tank(100, 10);
    resolveTankFootprint(t, BASE_CONFIG, ground);
    expect(t.x).toBeCloseTo(39.5);
    expect(t.z).toBeCloseTo(10);
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
  it('enters burst and accelerates along chassis forward captured at activation', () => {
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
    expect(t.dashState).toBe('burst');
    expect(speed).toBeGreaterThan(0);
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
    expect(t.dashState).toBe('burst');
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
    expect(t.dashState).toBe('burst');
    expect(t.dashStateT).toBeCloseTo(DT, 5);
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
    expect(t.vz).toBeGreaterThan(0);
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
    const ground = tank(-6, 10);
    stepTankKinematics(
      ground,
      { throttle: 0, steer: 0, dashPressed: true, jumpPressed: false },
      BASE_CONFIG,
      buildMatchConfig('none'),
      DT,
    );
    expect(Math.hypot(air.vx, air.vz)).toBeCloseTo(
      Math.hypot(ground.vx, ground.vz) * BASE_CONFIG.tank.dashAirMultiplier,
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

  it('exceeds normal maximum without the base-drive clamp deleting the burst', () => {
    const t = tank(-6, 10);
    const mcfg = buildMatchConfig('none');
    let peak = 0;
    stepTankKinematics(t, { throttle: 1, steer: 0, dashPressed: true, jumpPressed: false }, BASE_CONFIG, mcfg, DT);
    for (let i = 0; i < 8; i++) {
      stepTankKinematics(t, { throttle: 1, steer: 0, dashPressed: false, jumpPressed: false }, BASE_CONFIG, mcfg, DT);
      peak = Math.max(peak, Math.hypot(t.vx, t.vz));
    }
    expect(peak).toBeGreaterThan(BASE_CONFIG.tank.forwardSpeed * 1.8);
    expect(peak).toBeLessThan(BASE_CONFIG.tank.forwardSpeed * 2.3 + 0.1);
    expect(t.dashState).toBe('burst');
  });

  it('locks initial steering, allows limited late steering, and keeps captured direction fixed', () => {
    const t = tank(-6, 10, 0.4);
    const mcfg = buildMatchConfig('none');
    stepTankKinematics(t, { throttle: 1, steer: 0, dashPressed: true, jumpPressed: false }, BASE_CONFIG, mcfg, DT);
    const captured = { x: t.dashDirectionX, z: t.dashDirectionZ };
    const yawAtDash = t.yaw;
    for (let i = 0; i < 2; i++) {
      stepTankKinematics(t, { throttle: 1, steer: 1, dashPressed: false, jumpPressed: false }, BASE_CONFIG, mcfg, DT);
    }
    expect(t.yaw).toBeCloseTo(yawAtDash, 8);
    for (let i = 0; i < 1; i++) {
      stepTankKinematics(t, { throttle: 1, steer: 1, dashPressed: false, jumpPressed: false }, BASE_CONFIG, mcfg, DT);
    }
    expect(t.yaw).toBeLessThan(yawAtDash);
    expect(t.dashDirectionX).toBeCloseTo(captured.x!, 8);
    expect(t.dashDirectionZ).toBeCloseTo(captured.z!, 8);
    expect(t.dashSteeringMultiplier).toBeGreaterThan(0);
    expect(t.dashSteeringMultiplier).toBeLessThanOrEqual(BASE_CONFIG.tank.dashLateSteeringInfluence + 1e-6);
  });

  it('decays through recovery without a terminal speed snap', () => {
    const t = tank(-6, 10);
    const mcfg = buildMatchConfig('none');
    stepTankKinematics(t, { throttle: 1, steer: 0, dashPressed: true, jumpPressed: false }, BASE_CONFIG, mcfg, DT);
    const speeds: number[] = [];
    for (let i = 0; i < 24; i++) {
      stepTankKinematics(t, { throttle: 1, steer: 0, dashPressed: false, jumpPressed: false }, BASE_CONFIG, mcfg, DT);
      speeds.push(Math.hypot(t.vx, t.vz));
    }
    const maxFrameDrop = Math.max(...speeds.slice(1).map((speed, i) => speeds[i] - speed));
    expect(maxFrameDrop).toBeLessThan(5);
    expect(t.dashState).toBe('inactive');
    expect(speeds.at(-1)).toBeGreaterThan(0);
    expect(speeds.at(-1)).toBeLessThanOrEqual(BASE_CONFIG.tank.forwardSpeed);
  });
});

describe('natural surface crest launch (map polish)', () => {
  const CFG = BASE_CONFIG;
  const MCFG = buildMatchConfig('none');

  function crestGround(h: (z: number) => number): GroundQuery {
    return {
      groundHeightAt: (_x, z) => h(z),
      groundNormalAt: () => ({ nx: 0, ny: 1, nz: 0 }),
      ramps: [],
      half: 200,
      bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
      resolveCircleContacts: (x, z) => ({ x, z, contacts: [] }),
    };
  }

  function crestState(speed: number, z = 10): TankKinematicState {
    return { ...tank(0, z), vz: speed, y: 0 };
  }

  function run(state: TankKinematicState, ground: GroundQuery, input = { throttle: 0, steer: 0, dashPressed: false, jumpPressed: false }) {
    return stepTankKinematics(state, input, CFG, MCFG, DT, undefined, ground);
  }

  it('fast uphill-to-flat crest launches with positive vy', () => {
    const ground = crestGround((z) => (z <= 10 ? z * 0.4 : 4));
    const t = crestState(15);
    t.y = 4;
    run(t, ground);
    expect(t.grounded).toBe(false);
    expect(t.vy).toBeGreaterThan(1.5);
    expect(t.vy).toBeLessThanOrEqual(CFG.tank.surfaceLaunchMaxVy);
  });

  it('fast uphill-to-downhill crest launches', () => {
    const ground = crestGround((z) => (z <= 10 ? z * 0.4 : 4 - (z - 10) * 0.3));
    const t = crestState(15);
    t.y = 4;
    run(t, ground);
    expect(t.grounded).toBe(false);
    expect(t.vy).toBeGreaterThan(1.5);
  });

  it('slow crest stays grounded with zero vy', () => {
    const ground = crestGround((z) => (z <= 10 ? z * 0.4 : 4));
    const t = crestState(4);
    t.y = 4;
    run(t, ground);
    expect(t.grounded).toBe(true);
    expect(t.vy).toBe(0);
  });

  it('continuing uphill does not launch', () => {
    const ground = crestGround((z) => (z <= 10 ? z * 0.4 : 4 + (z - 10) * 0.4));
    const t = crestState(15);
    t.y = 4;
    run(t, ground);
    expect(t.grounded).toBe(true);
    expect(t.vy).toBe(0);
  });

  it('downhill-only travel does not launch upward', () => {
    // Terrain rises with +Z, so moving -Z is pure downhill: the sample
    // behind (higher Z) is above the tank and the incoming grade is negative.
    const ground = crestGround((z) => z * 0.4);
    const t = crestState(-15, 10);
    t.y = 4;
    run(t, ground);
    // A downhill step may leave the ground by less than the snap tolerance,
    // but it must never receive an artificial upward launch impulse.
    expect(t.vy).toBeLessThanOrEqual(0);
  });

  it('flat ground does not launch', () => {
    const ground = crestGround(() => 0);
    const t = crestState(15, 0);
    run(t, ground);
    expect(t.grounded).toBe(true);
    expect(t.vy).toBe(0);
  });

  it('launch vertical velocity is capped', () => {
    const ground = crestGround((z) => (z <= 10 ? z : 10));
    const t = crestState(30);
    t.y = 10;
    run(t, ground);
    expect(t.vy).toBeLessThanOrEqual(CFG.tank.surfaceLaunchMaxVy + 1e-9);
    // One gravity tick applies after the launch in the same step.
    expect(t.vy).toBeGreaterThan(CFG.tank.surfaceLaunchMaxVy - CFG.tank.gravity * DT - 0.01);
  });

  it('horizontal momentum is retained through the crest launch', () => {
    const ground = crestGround((z) => (z <= 10 ? z * 0.4 : 4));
    const t = crestState(15);
    t.y = 4;
    run(t, ground);
    expect(t.grounded).toBe(false);
    // Coasting with zero throttle decelerates by accel * dt; the launch must
    // not change horizontal momentum beyond that.
    expect(Math.hypot(t.vx, t.vz)).toBeCloseTo(15 - CFG.tank.accel * DT, 2);
  });

  it('manual jump is not overwritten by the crest detector', () => {
    const ground = crestGround((z) => (z <= 10 ? z * 0.4 : 4));
    const t = crestState(15);
    t.y = 4;
    const jumpVy = Math.sqrt(2 * CFG.tank.gravity * CFG.tank.jumpHeight);
    run(t, ground, { throttle: 0, steer: 0, dashPressed: false, jumpPressed: true });
    expect(t.grounded).toBe(false);
    expect(t.vy).toBeGreaterThanOrEqual(jumpVy - CFG.tank.gravity * DT - 0.01);
  });

  it('existing explicit ramp still launches when the crest detector is quiet', () => {
    const ground: GroundQuery = {
      groundHeightAt: () => 0,
      groundNormalAt: () => ({ nx: 0, ny: 1, nz: 0 }),
      ramps: [{ id: 'ramp', x: 0, z: 9.5, w: 4, d: 3, dirX: 0, dirZ: 1, rise: 1.2, baseY: 0 }],
      half: 200,
      bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
      resolveCircleContacts: (x, z) => ({ x, z, contacts: [] }),
    };
    const t = crestState(15, 10.9);
    t.prevOnRamp = true;
    t.y = 0;
    run(t, ground);
    expect(t.grounded).toBe(false);
    expect(t.vy).toBeGreaterThan(1);
  });

  it('same initial state and inputs produce an identical final state', () => {
    const ground = crestGround((z) => (z <= 10 ? z * 0.4 : 4));
    const a = crestState(15);
    const b = crestState(15);
    a.y = 4;
    b.y = 4;
    run(a, ground);
    run(b, ground);
    expect(a).toEqual(b);
  });
});
