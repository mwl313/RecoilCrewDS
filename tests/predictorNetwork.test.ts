import { describe, expect, it } from 'vitest';
import { BASE_CONFIG } from '../src/shared/config';
import type { GroundQuery } from '../src/shared/sim/groundQuery';
import type { TankState } from '../src/shared/types';
import { DriverPredictor } from '../src/client/predictor';
import { PredictionController } from '../src/client/app/predictionController';

function ground(half: number): GroundQuery {
  return {
    groundHeightAt: () => 0,
    groundNormalAt: () => ({ nx: 0, ny: 1, nz: 0 }),
    ramps: [],
    half,
    resolveCircleContacts: (x, z) => ({ x, z, contacts: [] }),
  };
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

function tank(x: number, z: number, partial: Partial<TankState> = {}): TankState {
  return {
    x,
    y: 0,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    yawVel: 0,
    pitch: 0,
    roll: 0,
    integrity: 100,
    shieldedT: 0,
    grounded: true,
    dashCooldown: 0,
    dashPresentationT: 0,
    dashDamageT: 0,
    drift: false,
    deadT: 0,
    prevOnRamp: false,
    ...partial,
  };
}

const FORWARD = { throttle: 1, steer: 0, dashPressed: false, jumpPressed: false };

describe('Driver prediction ground lifecycle (400x400 regression)', () => {
  it('reset() keeps the authoritative generated ground', () => {
    const pc = new PredictionController('driver', { send: () => undefined });
    pc.setGround(ground(200));
    pc.reset();
    pc.ensurePredictor('none');
    expect(pc.groundHalf()).toBe(200);
    expect(pc.isPredictionDisabled()).toBe(false);
  });

  it('reconcile replay never clamps a 400x400 world tank to the legacy ±39.5 bounds', () => {
    const predictor = new DriverPredictor(BASE_CONFIG, 'none', ground(200));
    predictor.pushInput(1, FORWARD);
    predictor.reconcile(tank(100, 100), 0);
    expect(predictor.predicted.x).toBeGreaterThan(90);
    expect(predictor.predicted.z).toBeGreaterThan(90);
    expect(predictor.isDisabled).toBe(false);
  });

  it('bounded replay prevents a stalled ack from launching predicted tens of meters', () => {
    const predictor = new DriverPredictor(BASE_CONFIG, 'none', ground(200));
    for (let i = 1; i <= 30; i++) predictor.pushInput(i, FORWARD);
    predictor.reconcile(tank(0, 0), 0);
    // At most 8 replay steps from standstill: far less than 30 steps.
    expect(predictor.predicted.x).toBeLessThan(8);
    expect(predictor.pendingCount).toBe(0);
  });
});

describe('Driver prediction fallback and smoothing', () => {
  it('disables local prediction when the authoritative tank is outside the ground bounds', () => {
    const predictor = new DriverPredictor(BASE_CONFIG, 'none', ground(200));
    predictor.pushInput(1, FORWARD);
    predictor.reconcile(tank(300, 0), 0);
    expect(predictor.isDisabled).toBe(true);
    expect(predictor.display.x).toBe(300);
    predictor.sampleInput(FORWARD, 1 / 30);
    expect(predictor.predicted.x).toBe(300); // no local simulation while disabled
  });

  it('softens large divergence instead of teleporting the display', () => {
    const predictor = new DriverPredictor(BASE_CONFIG, 'none', ground(200));
    predictor.reconcile(tank(0, 0), 0); // first reconcile: snap to spawn
    expect(predictor.display.x).toBe(0);
    predictor.reconcile(tank(10, 0), 0); // divergence 10 m, not a respawn
    expect(predictor.display.x).toBeLessThan(1); // no instant teleport
    predictor.smooth(1 / 60);
    // Bounded by the adaptive correction cap (max(30, 1.8×speed) m/s),
    // far below a snap.
    expect(predictor.display.x).toBeLessThanOrEqual(32.4 / 60 + 1e-9);
    expect(predictor.display.x).toBeGreaterThan(0);
  });

  it('still hard-snaps on respawn', () => {
    const predictor = new DriverPredictor(BASE_CONFIG, 'none', ground(200));
    predictor.reconcile(tank(0, 0, { deadT: 0 }), 0);
    predictor.reconcile(tank(5, 5, { deadT: 1 }), 0);
    expect(predictor.display.x).toBe(5);
    expect(predictor.display.z).toBe(5);
  });
});

describe('arena-size independence', () => {
  it('works with a 600x600 arena (half 300)', () => {
    const predictor = new DriverPredictor(BASE_CONFIG, 'none', ground(300));
    predictor.reconcile(tank(250, 250), 0);
    expect(predictor.predicted.x).toBe(250);
    expect(predictor.predicted.z).toBe(250);
    predictor.sampleInput(FORWARD, 1 / 30);
    expect(predictor.predicted.z).toBeGreaterThan(250); // drives +z, never clamped to 39.5
  });

  it('respects a small arena bounds clamp (half 50)', () => {
    const predictor = new DriverPredictor(BASE_CONFIG, 'none', ground(50));
    predictor.pushInput(1, FORWARD);
    predictor.reconcile(tank(49.4, 49.4), 0);
    expect(predictor.predicted.x).toBeLessThanOrEqual(49.5);
    expect(predictor.predicted.z).toBeLessThanOrEqual(49.5);
  });

  it('uses axis-aware bounds for a rectangular arena (300×600)', () => {
    const rectangular = groundWithBounds({ minX: -150, maxX: 150, minZ: -300, maxZ: 300 }, 150);
    const predictor = new DriverPredictor(BASE_CONFIG, 'none', rectangular);
    // Inside the long Z axis but outside the narrow X axis → wrong-ground fallback.
    predictor.reconcile(tank(160, 250), 0);
    expect(predictor.isDisabled).toBe(true);

    const predictor2 = new DriverPredictor(BASE_CONFIG, 'none', rectangular);
    // Inside both axes → normal prediction.
    predictor2.reconcile(tank(140, 250), 0);
    expect(predictor2.isDisabled).toBe(false);
    predictor2.sampleInput(FORWARD, 1 / 30);
    expect(predictor2.predicted.z).toBeGreaterThan(250);

    const predictor3 = new DriverPredictor(BASE_CONFIG, 'none', rectangular);
    // Inside X but outside Z → wrong-ground fallback.
    predictor3.reconcile(tank(0, 310), 0);
    expect(predictor3.isDisabled).toBe(true);
  });
});

describe('Gunner action transport lifecycle', () => {
  it('stops retrying an action as soon as the server acknowledges it', () => {
    const sent: Record<string, unknown>[] = [];
    const pc = new PredictionController('gunner', { send: (message) => sent.push(message) });
    const seq = pc.sendGunnerAction('secondaryPressed');
    expect(pc.metricsPending().actions).toBe(1);

    expect(pc.confirmAction(seq)).toBe('secondaryPressed');
    expect(pc.metricsPending().actions).toBe(0);
    pc.retransmitPendingActions(performance.now() + 500);

    expect(sent).toHaveLength(1);
  });

  it('seeds reconnect counters monotonically and preserves them across a match reset', () => {
    const sent: Record<string, unknown>[] = [];
    const pc = new PredictionController('gunner', { send: (message) => sent.push(message) });
    pc.seedSequences(40, 70);
    pc.seedSequences(2, 3);
    pc.reset({ preserveSequences: true });

    expect(pc.nextSeq()).toBe(41);
    expect(pc.sendGunnerAction('mgStart')).toBe(71);
    expect(pc.sequenceState()).toEqual({ inputSeq: 41, actionSeq: 71 });

    pc.reset();
    expect(pc.sequenceState()).toEqual({ inputSeq: 0, actionSeq: 0 });
  });
});
