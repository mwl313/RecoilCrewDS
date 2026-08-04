import { describe, expect, it } from 'vitest';
import { BASE_CONFIG, buildMatchConfig } from '../src/shared/config';
import { Heightfield } from '../src/shared/mapgen/heightfield';
import { classifyTerrainFlags, TerrainFlag } from '../src/shared/mapgen/terrainFlags';
import {
  canTraverseGroundStep,
  queryTerrainTransition,
  type TerrainTransition,
} from '../src/shared/mapgen/terrainTraversal';
import { stepTankKinematics, type TankKinematicState } from '../src/shared/sim/tankKinematics';
import type { GroundQuery } from '../src/shared/sim/groundQuery';

const DT = 1 / 30;
const RULES = {
  driveableMax: 0.35,
  riskyMax: 0.9,
  blockedMin: 0.9,
  cliffMin: 0.5,
  spawnMax: 0.2,
  recoveryMax: 0.15,
  landingMax: 0.25,
  maxStepUp: 0.8,
};

/** 400×400 heightfield with a straight north-south cliff at x = 200. */
function cliffField(topHeight: number): { hf: Heightfield; flags: Uint32Array } {
  const hf = new Heightfield({ widthMeters: 400, depthMeters: 400, cellSize: 4 });
  for (let zi = 0; zi < hf.samplesZ; zi++) {
    for (let xi = 0; xi < hf.samplesX; xi++) {
      hf.setSample(xi, zi, xi >= 50 ? topHeight : 0);
    }
  }
  const slopes = hf.slopeGrid();
  const flags = classifyTerrainFlags(slopes, RULES, undefined);
  return { hf, flags };
}

function groundFor(hf: Heightfield, flags: Uint32Array): GroundQuery {
  return {
    groundHeightAt: (x, z) => hf.heightAt(x, z),
    groundNormalAt: (x, z) => hf.normalAt(x, z),
    ramps: [],
    half: 200,
    resolveCircleContacts: (x, z) => ({ x, z, contacts: [] }),
    queryTerrainTransition: (fx, fz, tx, tz) =>
      queryTerrainTransition(hf, flags, RULES.maxStepUp, fx, fz, tx, tz),
  };
}

function tank(x: number, z: number, yaw = 0): TankKinematicState {
  return {
    x,
    y: 0,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw,
    yawVel: 0,
    pitch: 0,
    roll: 0,
    grounded: true,
    dashCooldown: 0,
    dashPresentationT: 0,
    dashDamageT: 0,
    drift: false,
    landingGripT: 0,
  };
}

function run(t: TankKinematicState, ground: GroundQuery, seconds: number, input: { throttle: number; steer: number; dash?: boolean }): void {
  const mcfg = buildMatchConfig('none');
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    stepTankKinematics(
      t,
      { throttle: input.throttle, steer: input.steer, dashPressed: input.dash ?? false, jumpPressed: false },
      BASE_CONFIG,
      mcfg,
      DT,
      undefined,
      ground,
    );
  }
}

describe('terrain traversal guard', () => {
  it('a small step up (below maxStepUp) succeeds', () => {
    const hf = new Heightfield({ widthMeters: 400, depthMeters: 400, cellSize: 4 });
    for (let zi = 0; zi < hf.samplesZ; zi++) {
      for (let xi = 0; xi < hf.samplesX; xi++) hf.setSample(xi, zi, xi >= 25 ? 0.5 : 0);
    }
    const slopes = hf.slopeGrid();
    const flags = classifyTerrainFlags(slopes, RULES, undefined);
    const ground = groundFor(hf, flags);
    const t = tank(80, 200, Math.PI / 2);
    t.y = hf.heightAt(t.x, t.z);
    run(t, ground, 2.0, { throttle: 1, steer: 0 });
    expect(t.x).toBeGreaterThan(96); // crossed the gentle step
  });

  it('a step above maxStepUp is blocked (no upward snap)', () => {
    const { hf, flags } = cliffField(2.4);
    const ground = groundFor(hf, flags);
    const t = tank(186, 200, Math.PI / 2);
    t.y = hf.heightAt(t.x, t.z);
    run(t, ground, 1.2, { throttle: 1, steer: 0 });
    expect(t.x).toBeLessThan(200);
    expect(t.y).toBeLessThan(1.0);
    expect(t.grounded).toBe(true);
  });

  it('an upward cliff-wall crossing cannot snap to the top', () => {
    const { hf, flags } = cliffField(6);
    const ground = groundFor(hf, flags);
    const t = tank(182, 200, Math.PI / 2);
    t.y = hf.heightAt(t.x, t.z);
    run(t, ground, 1.5, { throttle: 1, steer: 0, dash: true });
    expect(t.x).toBeLessThan(200);
    expect(t.y).toBeLessThan(2);
  });

  it('downhill crossing makes the tank airborne', () => {
    const { hf, flags } = cliffField(6);
    const ground = groundFor(hf, flags);
    const t = tank(210, 200, -Math.PI / 2); // facing -x (toward the drop)
    t.y = hf.heightAt(t.x, t.z);
    let sawAirborne = false;
    const mcfg = buildMatchConfig('none');
    for (let i = 0; i < 100; i++) {
      stepTankKinematics(t, { throttle: 1, steer: 0, dashPressed: false, jumpPressed: false }, BASE_CONFIG, mcfg, DT, undefined, ground);
      if (t.x < 200 && !t.grounded) sawAirborne = true;
    }
    expect(t.x).toBeLessThan(196); // moved past the cliff
    expect(sawAirborne).toBe(true);
  });

  it('dash cannot tunnel upward through a cliff', () => {
    const { hf, flags } = cliffField(4);
    const ground = groundFor(hf, flags);
    const t = tank(184, 200, Math.PI / 2);
    t.y = hf.heightAt(t.x, t.z);
    run(t, ground, 1.0, { throttle: 1, steer: 0, dash: true });
    expect(t.x).toBeLessThan(200);
  });

  it('recoil-speed horizontal velocity cannot tunnel upward', () => {
    const { hf, flags } = cliffField(4);
    const ground = groundFor(hf, flags);
    const t = tank(188, 200, Math.PI / 2);
    t.y = hf.heightAt(t.x, t.z);
    t.vx = 40;
    run(t, ground, 0.2, { throttle: 0, steer: 0 });
    expect(t.x).toBeLessThan(200);
    expect(t.y).toBeLessThan(1.5);
  });

  it('falling stays deterministic and never applies fall damage', () => {
    const { hf, flags } = cliffField(18);
    const ground = groundFor(hf, flags);
    const a = tank(212, 200, -Math.PI / 2);
    const b = tank(212, 200, -Math.PI / 2);
    a.y = hf.heightAt(a.x, a.z);
    b.y = hf.heightAt(b.x, b.z);
    const mcfg = buildMatchConfig('none');
    for (let i = 0; i < Math.round(2.5 / DT); i++) {
      stepTankKinematics(a, { throttle: 1, steer: 0, dashPressed: false, jumpPressed: false }, BASE_CONFIG, mcfg, DT, undefined, ground);
      stepTankKinematics(b, { throttle: 1, steer: 0, dashPressed: false, jumpPressed: false }, BASE_CONFIG, mcfg, DT, undefined, ground);
    }
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.y).toBeCloseTo(b.y, 6);

    // Moon Yard remains deterministic (same inputs → same trajectory).
    const moon = buildMatchConfig('moonYard');
    const c = tank(180, 120, Math.PI / 2);
    const d = tank(180, 120, Math.PI / 2);
    c.y = hf.heightAt(c.x, c.z);
    d.y = hf.heightAt(d.x, d.z);
    for (let i = 0; i < 90; i++) {
      stepTankKinematics(c, { throttle: 0.4, steer: 0, dashPressed: false, jumpPressed: i === 30 }, BASE_CONFIG, moon, DT, undefined, ground);
      stepTankKinematics(d, { throttle: 0.4, steer: 0, dashPressed: false, jumpPressed: i === 30 }, BASE_CONFIG, moon, DT, undefined, ground);
    }
    expect(c.x).toBeCloseTo(d.x, 6);
    expect(c.y).toBeCloseTo(d.y, 6);
  });

  it('server-style and predictor-style runs converge (shared implementation)', () => {
    const { hf, flags } = cliffField(6);
    const ground = groundFor(hf, flags);
    const a = tank(150, 200, Math.PI / 2);
    const b = tank(150, 200, Math.PI / 2);
    a.y = hf.heightAt(a.x, a.z);
    b.y = hf.heightAt(b.x, b.z);
    const mcfg = buildMatchConfig('none');
    for (let i = 0; i < 120; i++) {
      stepTankKinematics(a, { throttle: 1, steer: 0.3, dashPressed: i === 20, jumpPressed: i === 60 }, BASE_CONFIG, mcfg, DT, undefined, ground);
      stepTankKinematics(b, { throttle: 1, steer: 0.3, dashPressed: i === 20, jumpPressed: i === 60 }, BASE_CONFIG, mcfg, DT, undefined, ground);
    }
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.y).toBeCloseTo(b.y, 6);
    expect(a.z).toBeCloseTo(b.z, 6);
  });

  it('pure transition helpers classify cliffs and steps correctly', () => {
    const t1: TerrainTransition = { fromHeight: 0, toHeight: 0.5, delta: 0.5, crossesCliffWall: false, maxStepUp: 0.8 };
    expect(canTraverseGroundStep(t1)).toBe(true);
    const t2: TerrainTransition = { fromHeight: 0, toHeight: 2, delta: 2, crossesCliffWall: false, maxStepUp: 0.8 };
    expect(canTraverseGroundStep(t2)).toBe(false);
    const t3: TerrainTransition = { fromHeight: 2, toHeight: 0, delta: -2, crossesCliffWall: true, maxStepUp: 0.8 };
    expect(canTraverseGroundStep(t3)).toBe(true); // downhill always allowed
    const t4: TerrainTransition = { fromHeight: 0, toHeight: 1.5, delta: 1.5, crossesCliffWall: true, maxStepUp: 0.8 };
    expect(canTraverseGroundStep(t4)).toBe(false);
    expect(TerrainFlag.CliffWall & TerrainFlag.Blocked).toBe(0);
  });
});
