import { describe, expect, it } from 'vitest';
import { BASE_CONFIG } from '../src/shared/config';
import { DriverPredictor } from '../src/client/predictor';
import type { TankState } from '../src/shared/types';

function tank(z: number, yaw = 0, deadT = 0): TankState {
  return {
    x: 0, y: 0, z, vx: 0, vy: 0, vz: 0, yaw, yawVel: 0, pitch: 0, roll: 0,
    integrity: 100, dashCooldown: 0, dashPresentationT: 0, dashDamageT: 0, shieldedT: 0, deadT,
    grounded: true, drift: false,
  };
}

describe('DriverPredictor', () => {
  it('predicts immediately from input and reconciles to authority after ack', () => {
    const p = new DriverPredictor(BASE_CONFIG, 'none');
    p.resetFromAuthority(tank(0));
    const input = { throttle: 1, steer: 0, dashPressed: false, jumpPressed: false };
    p.pushInput(1, input);
    for (let i = 0; i < 30; i++) p.sampleInput(input, 1 / 30);
    expect(p.predicted.z).toBeGreaterThan(2);
    // Server processed seq 1: reconcile back to authority.
    p.reconcile(tank(0), 1);
    expect(p.predicted.z).toBeCloseTo(0, 5);
  });

  it('replays unacknowledged inputs in order after reconciliation', () => {
    const p = new DriverPredictor(BASE_CONFIG, 'none');
    p.resetFromAuthority(tank(0));
    const fwd = { throttle: 1, steer: 0, dashPressed: false, jumpPressed: false };
    const reverse = { throttle: -1, steer: 0, dashPressed: false, jumpPressed: false };
    p.pushInput(1, fwd);
    p.pushInput(2, fwd);
    p.pushInput(3, reverse);
    // Server acked seq 2; replay seq 3 from authority.
    p.reconcile(tank(0), 2);
    expect(p.pendingCount).toBe(0);
    expect(p.predicted.vz).toBeLessThan(0); // reversed
  });

  it('smooths small error instead of snapping', () => {
    const p = new DriverPredictor(BASE_CONFIG, 'none');
    p.resetFromAuthority(tank(0));
    const input = { throttle: 1, steer: 0, dashPressed: false, jumpPressed: false };
    for (let i = 0; i < 10; i++) p.sampleInput(input, 1 / 30);
    const predictedZ = p.predicted.z;
    p.display.z = predictedZ + 3; // a few metres of error (below hard-snap)
    p.reconcile(tank(0), 1);
    // Small divergence (≈ predictedZ) should NOT snap instantly; smoothing
    // moves display toward predicted over time.
    expect(Math.abs(p.display.z - p.predicted.z)).toBeGreaterThan(1);
    for (let i = 0; i < 60; i++) p.smooth(1 / 30);
    expect(Math.abs(p.display.z - p.predicted.z)).toBeLessThan(0.5);
  });

  it('snaps on respawn/wipeout and on extreme divergence', () => {
    const p = new DriverPredictor(BASE_CONFIG, 'none');
    p.resetFromAuthority(tank(0));
    p.predicted.z = 100;
    p.reconcile(tank(50, 0, 3), 0);
    expect(p.display.z).toBeCloseTo(50, 3);
  });
});
