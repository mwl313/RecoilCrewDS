import { describe, expect, it } from 'vitest';
import { Match } from '../../src/shared/sim/match';
import { PredictionController } from '../../src/client/app/predictionController';
import { PROTOCOL_VERSION } from '../../src/shared/net/protocol';
import { BASE_CONFIG } from '../../src/shared/config';
import type { MovementRulesBlock } from '../../src/shared/stats/rulesRevision';
import { wrapAngle } from '../../src/shared/math';

const DT = 1 / 30;

describe('instant turret response (Combat 05 M3)', () => {
  it('protocol version was bumped for click-time aim', () => {
    // Progression08 M17 bumped the protocol for selectUpgrade; the
    // hardening pass bumped it again for skipRelicPresentation.
    expect(PROTOCOL_VERSION).toBe(11);
  });

  it('instant client mode makes predicted yaw/pitch equal the mouse target in the same frame', () => {
    const p = new PredictionController('gunner', { send: () => undefined });
    p.updateTurretTarget(1.9, -0.6, 0, DT);
    const s = p.getTurretSpaces();
    expect(s.predictedYawLocal).toBeCloseTo(wrapAngle(1.9), 9);
    expect(s.predictedPitch).toBeCloseTo(-0.6, 9);
    // A second large sweep is also instant (no rate-limited chase).
    p.updateTurretTarget(-2.4, 0.4, 0, DT);
    const s2 = p.getTurretSpaces();
    expect(s2.predictedYawLocal).toBeCloseTo(wrapAngle(-2.4), 9);
    expect(s2.predictedPitch).toBeCloseTo(0.4, 9);
  });

  it('instant pitch clamps to turret limits', () => {
    const p = new PredictionController('gunner', { send: () => undefined });
    p.updateTurretTarget(0, 9, 0, DT);
    expect(p.getTurretSpaces().predictedPitch).toBeCloseTo(0.42, 9);
    p.updateTurretTarget(0, -9, 0, DT);
    expect(p.getTurretSpaces().predictedPitch).toBeCloseTo(-1.45, 9);
  });

  it('rate-limited mode still uses the legacy chase path', () => {
    const p = new PredictionController('gunner', { send: () => undefined });
    const block: MovementRulesBlock = {
      tank: BASE_CONFIG.tank,
      match: { timeScale: 1, grip: 1, gravity: 13.5 },
      turret: { responseMode: 'rateLimited', turnRate: 4.6, pitchFollowRate: 8, minPitch: -1.45, maxPitch: 0.42 },
    };
    p.applyMovementRules(block, 1, 'none');
    const before = p.getTurretSpaces();
    p.updateTurretTarget(2.0, 0.3, 0, DT);
    const after = p.getTurretSpaces();
    expect(after.predictedYawLocal).not.toBeCloseTo(2.0, 3);
    expect(Math.abs(after.predictedYawLocal - before.predictedYawLocal)).toBeLessThanOrEqual(4.6 * DT + 1e-9);
  });

  it('server instant mode applies accepted aim directly (no lerp)', () => {
    const m = new Match('instant-server');
    m.setGunnerInput({ aimYaw: 2.0, aimPitch: -1.0, primary: false, secondary: false });
    m.step(DT);
    expect(m.state.turret.yaw).toBeCloseTo(wrapAngle(2.0), 9);
    expect(m.state.turret.pitch).toBeCloseTo(-1.0, 9);
  });

  it('server clamps invalid pitch and ignores non-finite aim', () => {
    const m = new Match('instant-clamp');
    m.setGunnerInput({ aimYaw: 0, aimPitch: 9, primary: false, secondary: false });
    m.step(DT);
    expect(m.state.turret.pitch).toBeCloseTo(0.42, 9);
    const yaw0 = m.state.turret.yaw;
    m.setGunnerInput({ aimYaw: Number.NaN, aimPitch: 0, primary: false, secondary: false });
    m.step(DT);
    expect(m.state.turret.yaw).toBe(yaw0);
  });

  it('click-time aim on a cannon action fires along the action aim', () => {
    const m = new Match('action-aim');
    m.runtime.systems.capabilities.revoke('cannon.charge');
    m.applyGunnerAction('secondaryPressed', 1, { aimYaw: 0, aimPitch: 0.3 });
    m.setGunnerInput({ aimYaw: 0, aimPitch: 0.3, primary: false, secondary: true });
    m.step(DT);
    m.takeEvents();
    expect(m.state.shells.length).toBe(1);
    expect(m.state.shells[0].vy).toBeGreaterThan(0);
    // The turret pitch was applied directly (instant) before the shot.
    expect(m.state.turret.pitch).toBeCloseTo(0.3, 9);
  });
});
