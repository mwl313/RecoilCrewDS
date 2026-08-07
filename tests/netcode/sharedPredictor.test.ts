import { describe, expect, it } from 'vitest';
import { BASE_CONFIG } from '../../src/shared/config';
import type { GroundQuery } from '../../src/shared/sim/groundQuery';
import type { TankState } from '../../src/shared/types';
import { SharedTankPredictor } from '../../src/client/prediction/sharedTankPredictor';
import { PredictionController } from '../../src/client/app/predictionController';
import type { TankImpulseWire } from '../../src/shared/effects/tankImpulseSystem';

function ground(half: number): GroundQuery {
  return {
    groundHeightAt: () => 0,
    groundNormalAt: () => ({ nx: 0, ny: 1, nz: 0 }),
    ramps: [],
    half,
    resolveCircleContacts: (x, z) => ({ x, z, contacts: [] }),
  };
}

function tank(partial: Partial<TankState> = {}): TankState {
  return {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, yawVel: 0, pitch: 0, roll: 0,
    integrity: 100, shieldedT: 0, deadT: 0, grounded: true, dashCooldown: 0,
    dashPresentationT: 0, dashDamageT: 0, drift: false, prevOnRamp: false, ...partial,
  };
}

const FORWARD = { throttle: 1, steer: 0, dashPressed: false, jumpPressed: false };

describe('shared tank predictor', () => {
  it('Driver local and Gunner relay prediction converge to the same state', () => {
    const g = ground(200);
    const driver = new SharedTankPredictor(BASE_CONFIG, 'none', g, 'driver');
    const gunner = new SharedTankPredictor(BASE_CONFIG, 'none', g, 'gunner');
    // Replay is bounded to 8 frames by design; parity holds within the bound.
    const frames = Array.from({ length: 8 }, () => ({ ...FORWARD }));
    for (const f of frames) driver.sampleInput(f, 1 / 30);
    for (let i = 0; i < frames.length; i++) gunner.pushRelayInput(i + 1, frames[i]);
    gunner.reconcile(tank(), 0, {});
    expect(gunner.predicted.x).toBeCloseTo(driver.predicted.x, 6);
    expect(gunner.predicted.z).toBeCloseTo(driver.predicted.z, 6);
  });

  it('normalized relay edges apply jump/dash exactly once (no double jump)', () => {
    const g = ground(200);
    const driver = new SharedTankPredictor(BASE_CONFIG, 'none', g, 'driver');
    const gunner = new SharedTankPredictor(BASE_CONFIG, 'none', g, 'gunner');
    const raw1 = { throttle: 0, steer: 0, dashPressed: false, jumpPressed: true };
    const raw2 = { throttle: 0, steer: 0, dashPressed: false, jumpPressed: true };
    driver.sampleInput(raw1, 1 / 30);
    driver.sampleInput(raw2, 1 / 30);
    // Server normalizes the relay: only the first frame carries the edge.
    gunner.pushRelayInput(1, { ...raw1 });
    gunner.pushRelayInput(2, { ...raw2, jumpPressed: false });
    gunner.reconcile(tank(), 0, {});
    expect(gunner.predicted.y).toBeCloseTo(driver.predicted.y, 6);
  });

  it('applies an exact impulse once and ignores duplicates', () => {
    const predictor = new SharedTankPredictor(BASE_CONFIG, 'none', ground(200));
    const wire: TankImpulseWire = {
      impulseSeq: 1, opSeq: 1, simulationTick: 10, source: 'recoil', sourceActionSeq: 3,
      sourceId: 'weapon.mainCannon', kind: 'cannon',
      deltaVx: 5, deltaVy: 0, deltaVz: 0, deltaYawVel: 0, deltaRoll: 0,
    };
    predictor.applyImpulse(wire);
    predictor.applyImpulse(wire); // duplicate ignored
    expect(predictor.predicted.vx).toBeCloseTo(5);
    expect(predictor.pendingImpulseCount).toBe(1);
  });

  it('reconcile replays unacked impulses and inputs in op order', () => {
    const predictor = new SharedTankPredictor(BASE_CONFIG, 'none', ground(200), 'gunner');
    predictor.pushRelayInput(1, FORWARD);
    const wire: TankImpulseWire = {
      impulseSeq: 1, opSeq: 2, simulationTick: 10, source: 'recoil',
      sourceId: 'weapon.mainCannon', kind: 'cannon',
      deltaVx: 0, deltaVy: 0, deltaVz: 3, deltaYawVel: 0, deltaRoll: 0,
    };
    predictor.applyImpulse(wire);
    // Snapshot ack: nothing processed yet; opLog shows input op 1 then impulse op 2.
    predictor.reconcile(tank(), 0, {
      impulseAckSeq: 0,
      opLog: [
        { o: 1, k: 'd', s: 1 },
        { o: 2, k: 'i', s: 1 },
      ],
    });
    // Replay order: input op 1 first (drives vz ~0.47), then impulse +3.
    expect(predictor.predicted.vz).toBeCloseTo(3.4667, 3);
    expect(predictor.predicted.z).toBeGreaterThan(0);
    expect(predictor.pendingCount).toBe(1);
    expect(predictor.pendingImpulseCount).toBe(1);

    // A second stale snapshot rebuilds to the same result; it must not forget
    // or double-apply operations that remain unacknowledged.
    predictor.reconcile(tank(), 0, { impulseAckSeq: 0 });
    expect(predictor.predicted.vz).toBeCloseTo(3.4667, 3);
    expect(predictor.pendingCount).toBe(1);
    expect(predictor.pendingImpulseCount).toBe(1);

    predictor.reconcile(tank(), 1, { impulseAckSeq: 1 });
    expect(predictor.pendingCount).toBe(0);
    expect(predictor.pendingImpulseCount).toBe(0);
  });

  it('Gunner keeps sampling the latest relayed held input after reconcile', () => {
    const predictor = new SharedTankPredictor(BASE_CONFIG, 'none', ground(200), 'gunner');
    predictor.pushRelayInput(1, FORWARD);
    predictor.reconcile(tank(), 1);

    predictor.sampleRelayed(1 / 30);

    expect(predictor.predicted.z).toBeGreaterThan(0);
  });

  it('reconnect/arena reset clears queues', () => {
    const predictor = new SharedTankPredictor(BASE_CONFIG, 'none', ground(200), 'gunner');
    predictor.pushRelayInput(1, FORWARD);
    predictor.applyImpulse({
      impulseSeq: 1, opSeq: 1, simulationTick: 1, source: 'external',
      sourceId: 'test', kind: 'other',
      deltaVx: 1, deltaVy: 0, deltaVz: 0, deltaYawVel: 0, deltaRoll: 0,
    });
    predictor.resetFromAuthority(tank());
    expect(predictor.pendingCount).toBe(0);
    expect(predictor.pendingImpulseCount).toBe(0);
    expect(predictor.predicted.vx).toBe(0);
  });
});

describe('gunner turret ack replay', () => {
  function stateWithTurret(yaw: number, pitch = 0.05): never {
    return {
      tank: tank(),
      turret: { yaw, pitch, cannonHeld: false, cannonHoldT: 0, cannonChargeRatio: 0, cannonChargeFull: false, cannonCooldown: 0, cannonFlash: 0, mgCooldown: 0, mgFiring: false },
    } as never;
  }

  it('replays only aim frames newer than the gunner input ack', () => {
    const controller = new PredictionController('gunner', { send: () => undefined });
    controller.applyMovementRules(
      {
        tank: BASE_CONFIG.tank,
        match: { timeScale: 1, grip: 1, gravity: 13.5 },
        turret: { responseMode: 'rateLimited', turnRate: 4.6, pitchFollowRate: 8, minPitch: -1.45, maxPitch: 0.42 },
      },
      1,
      'none',
    );
    controller.setTurretRates(4.6, 8);
    controller.sendGunner({ aimYaw: 0.2, aimPitch: 0.1, primary: false, secondary: false, ability: false });
    controller.sendGunner({ aimYaw: 0.4, aimPitch: 0.1, primary: false, secondary: false, ability: false });
    controller.reconcileTurret(stateWithTurret(0), 1); // ack the first frame only
    const spaces = controller.getTurretSpaces();
    // One replay step from 0 toward 0.4 at 4.6 rad/s / 30 Hz.
    expect(spaces.predictedYawLocal).toBeGreaterThan(0);
    expect(spaces.predictedYawLocal).toBeLessThan(0.4);
  });

  it('instant mode never pulls the local turret back toward authority', () => {
    const controller = new PredictionController('gunner', { send: () => undefined });
    controller.setTurretRates(4.6, 8);
    controller.sendGunner({ aimYaw: 0.3, aimPitch: 0.1, primary: false, secondary: false, ability: false });
    controller.updateTurretTarget(0.3, 0.1, 0, 1 / 30);
    controller.reconcileTurret(stateWithTurret(0.25), 1); // all acked
    // Local visual truth stays at the newest desired aim (no backward blend).
    expect(controller.getTurretSpaces().predictedYawLocal).toBeCloseTo(0.3, 9);
  });
});
