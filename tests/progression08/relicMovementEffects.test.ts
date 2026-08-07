import { describe, expect, it } from 'vitest';
import { BASE_CONFIG, type GameConfig } from '../../src/shared/config';
import { buildMatchConfig } from '../../src/shared/config';
import { stepTankKinematics, type TankKinematicState } from '../../src/shared/sim/tankKinematics';
import { STATIC_GROUND_QUERY } from '../../src/shared/sim/groundQuery';
import { makeMatch } from './helpers';

function config(extraJumps = 0, airDashCharges = 0): GameConfig {
  return { ...BASE_CONFIG, tank: { ...BASE_CONFIG.tank, extraJumps, airDashCharges } };
}

function tank(partial: Partial<TankKinematicState> = {}): TankKinematicState {
  return {
    x: 10, y: 5, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, yawVel: 0,
    pitch: 0, roll: 0, grounded: false, dashCooldown: 0,
    dashPresentationT: 0, dashDamageT: 0, dashState: 'inactive', dashStateT: 0,
    dashDirectionX: 0, dashDirectionZ: 1, dashPeakSpeed: 0, dashSpeed: 0,
    dashSteeringMultiplier: 1, drift: false, landingGripT: 0,
    airJumpsRemaining: 0, airJumpCapacity: 0,
    airDashReuseRemaining: 0, airDashReuseCapacity: 0,
    ...partial,
  };
}

const neutral = { throttle: 0, steer: 0, dashPressed: false, jumpPressed: false };

describe('shared authoritative/predicted relic movement', () => {
  it('DOUBLE JUMP grants and consumes exactly one airborne jump per stack', () => {
    const base = tank();
    stepTankKinematics(base, { ...neutral, jumpPressed: true }, config(0), buildMatchConfig('none'), 1 / 30, undefined, STATIC_GROUND_QUERY);
    expect(base.vy).toBeLessThan(0);

    const one = tank();
    stepTankKinematics(one, { ...neutral, jumpPressed: true }, config(1), buildMatchConfig('none'), 1 / 30, undefined, STATIC_GROUND_QUERY);
    expect(one.vy).toBeGreaterThan(0);
    expect(one.airJumpsRemaining).toBe(0);
    one.vy = 0;
    stepTankKinematics(one, { ...neutral, jumpPressed: true }, config(1), buildMatchConfig('none'), 1 / 30, undefined, STATIC_GROUND_QUERY);
    expect(one.vy).toBeLessThan(0);

    const two = tank();
    stepTankKinematics(two, { ...neutral, jumpPressed: true }, config(2), buildMatchConfig('none'), 1 / 30, undefined, STATIC_GROUND_QUERY);
    two.vy = 0;
    stepTankKinematics(two, { ...neutral, jumpPressed: true }, config(2), buildMatchConfig('none'), 1 / 30, undefined, STATIC_GROUND_QUERY);
    expect(two.vy).toBeGreaterThan(0);
    expect(two.airJumpsRemaining).toBe(0);
  });

  it('landing refills DOUBLE JUMP charges', () => {
    const state = tank({ y: 0, airJumpsRemaining: 0, airJumpCapacity: 1 });
    stepTankKinematics(state, neutral, config(1), buildMatchConfig('none'), 1 / 30, undefined, STATIC_GROUND_QUERY);
    expect(state.grounded).toBe(true);
    expect(state.airJumpsRemaining).toBe(1);
  });

  it('AIR MASTER grants one airborne cooldown bypass and landing refills it', () => {
    const state = tank({ dashCooldown: 0.5 });
    let accepted = 0;
    stepTankKinematics(state, { ...neutral, dashPressed: true }, config(0, 1), buildMatchConfig('none'), 1 / 30, { onDash: () => accepted++ }, STATIC_GROUND_QUERY);
    expect(accepted).toBe(1);
    expect(state.airDashReuseRemaining).toBe(0);
    stepTankKinematics(state, { ...neutral, dashPressed: true }, config(0, 1), buildMatchConfig('none'), 1 / 30, { onDash: () => accepted++ }, STATIC_GROUND_QUERY);
    expect(accepted).toBe(1);
    state.y = 0;
    state.vy = 0;
    stepTankKinematics(state, neutral, config(0, 1), buildMatchConfig('none'), 1 / 30, undefined, STATIC_GROUND_QUERY);
    expect(state.airDashReuseRemaining).toBe(1);
  });

  it('AIR MASTER capability stays one while air control stacks', () => {
    const m = makeMatch();
    m.state.teamProgression.relicStacks['relic.air_master'] = 2;
    m.systems.progression.projectionRefresh();
    expect(m.rules.resolver.resolve('tank.airControl')).toBeCloseTo(BASE_CONFIG.tank.airControl * 1.8);
    expect(m.rules.resolver.resolve('tank.airDashCharges')).toBe(1);
  });
});
