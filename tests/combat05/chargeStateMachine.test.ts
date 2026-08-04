import { describe, expect, it } from 'vitest';
import { Match } from '../../src/shared/sim/match';

const DT = 1 / 30;

function grantCharge(m: Match): void {
  m.runtime.systems.capabilities.grant('cannon.charge', 'test.grant');
}

function press(m: Match): void {
  m.applyGunnerAction('secondaryPressed', m.opState.lastGunnerInputSeq + 1, { aimYaw: 0, aimPitch: 0 });
}

function release(m: Match): void {
  m.applyGunnerAction('secondaryReleased', m.opState.lastGunnerInputSeq + 2, { aimYaw: 0, aimPitch: 0 });
}

function step(m: Match, n = 1): void {
  for (let i = 0; i < n; i++) {
    m.step(DT);
    m.takeEvents();
  }
}

describe('secondary cannon hold/release state machine (Combat 05 M5)', () => {
  it('without the capability, secondaryPressed fires the normal cannon immediately', () => {
    const m = new Match('no-cap');
    press(m);
    step(m);
    expect(m.state.shells.length).toBe(1);
    expect(m.state.turret.cannonCooldown).toBeGreaterThan(0);
    expect(m.state.turret.cannonHeld).toBe(false);
  });

  it('with the capability, secondaryPressed begins a hold and never auto-fires', () => {
    const m = new Match('hold');
    grantCharge(m);
    press(m);
    step(m, 60); // hold 2 s — far past full charge
    expect(m.state.turret.cannonHeld).toBe(true);
    expect(m.state.shells.length).toBe(0);
    expect(m.state.turret.cannonChargeRatio).toBe(1);
    expect(m.state.turret.cannonChargeFull).toBe(true);
  });

  it('a tap release fires a normal shell (ratio 0)', () => {
    const m = new Match('tap');
    grantCharge(m);
    press(m);
    step(m, 2); // 0.0667 s < tapMaxSeconds (0.16)
    expect(m.state.turret.cannonChargeRatio).toBe(0);
    release(m);
    step(m);
    expect(m.state.shells.length).toBe(1);
    expect(m.state.turret.cannonHeld).toBe(false);
    expect(m.state.turret.cannonCooldown).toBeGreaterThan(0);
  });

  it('a partial hold releases a partial charge linearly', () => {
    const m = new Match('partial');
    grantCharge(m);
    press(m);
    step(m, 20); // 0.6667 s → (0.6667-0.16)/0.84 ≈ 0.603
    const ratio = m.state.turret.cannonChargeRatio;
    expect(ratio).toBeGreaterThan(0.55);
    expect(ratio).toBeLessThan(0.65);
    release(m);
    step(m);
    expect(m.state.shells.length).toBe(1);
  });

  it('full charge clamps at 1 and can be held indefinitely without firing', () => {
    const m = new Match('full-hold');
    grantCharge(m);
    press(m);
    step(m, 300); // 10 s hold
    expect(m.state.turret.cannonChargeRatio).toBe(1);
    expect(m.state.turret.cannonChargeFull).toBe(true);
    expect(m.state.shells.length).toBe(0);
    release(m);
    step(m);
    expect(m.state.shells.length).toBe(1);
  });

  it('release without a valid press is rejected safely', () => {
    const m = new Match('no-press');
    grantCharge(m);
    const result = m.applyGunnerAction('secondaryReleased', 1);
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('not_held');
    step(m);
    expect(m.state.shells.length).toBe(0);
  });

  it('duplicate release does not fire twice', () => {
    const m = new Match('dup-release');
    grantCharge(m);
    press(m);
    step(m, 10);
    release(m);
    step(m);
    expect(m.state.shells.length).toBe(1);
    // A second release without a new press is rejected.
    const again = m.applyGunnerAction('secondaryReleased', 99);
    expect(again.accepted).toBe(false);
  });

  it('cooldown begins on fire and blocks a new hold', () => {
    const m = new Match('cooldown');
    grantCharge(m);
    press(m);
    step(m, 40);
    release(m);
    step(m);
    expect(m.state.turret.cannonCooldown).toBeGreaterThan(0);
    const blocked = m.applyGunnerAction('secondaryPressed', 50);
    expect(blocked.accepted).toBe(false);
    expect(blocked.reason).toBe('cooldown');
  });

  it('death cancels an active hold without firing', () => {
    const m = new Match('death');
    grantCharge(m);
    press(m);
    step(m, 10);
    m.state.tank.deadT = 3;
    step(m);
    expect(m.state.turret.cannonHeld).toBe(false);
    expect(m.state.shells.length).toBe(0);
  });

  it('forced input clear cancels the hold (pause/disconnect/leave)', () => {
    const m = new Match('clear');
    grantCharge(m);
    press(m);
    step(m, 10);
    m.clearGunnerInput();
    expect(m.state.turret.cannonHeld).toBe(false);
    const result = m.applyGunnerAction('secondaryReleased', 50);
    expect(result.accepted).toBe(false);
  });
});
