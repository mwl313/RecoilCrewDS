import { describe, expect, it } from 'vitest';
import { makeMatch } from './helpers';

describe('progression debug controls', () => {
  it('acquires authored relics through normal limits, projection, and capability grants', () => {
    const match = makeMatch();
    const progression = match.systems.progression;
    const initialAirControl = match.rules.resolver.resolve('tank.airControl');

    const added = progression.debugAcquireRelic('relic.air_master');
    expect(added).toMatchObject({ accepted: true, stackCount: 1 });
    expect(match.state.teamProgression.relicStacks['relic.air_master']).toBe(1);
    expect(match.rules.resolver.resolve('tank.airControl')).toBeGreaterThan(initialAirControl);
    expect(match.rules.resolver.resolve('tank.airDashCharges')).toBe(1);
    expect(match.systems.capabilities.has('tank.airDashRefresh')).toBe(true);

    expect(progression.debugAcquireRelic('relic.phase_dash')).toMatchObject({ accepted: true, stackCount: 1 });
    expect(progression.debugAcquireRelic('relic.phase_dash')).toMatchObject({
      accepted: false,
      reason: 'maximum_stacks',
      stackCount: 1,
    });
  });

  it('stacks deterministic authored upgrade values and updates the replicated summary', () => {
    const match = makeMatch();
    const progression = match.systems.progression;
    const base = match.rules.resolver.resolve('tank.forwardSpeed');

    const first = progression.debugApplyUpgrade('upgrade.tank.forwardSpeed', 'common');
    const second = progression.debugApplyUpgrade('upgrade.tank.forwardSpeed', 'common');

    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(true);
    expect(match.rules.resolver.resolve('tank.forwardSpeed')).toBeGreaterThan(base);
    expect(match.state.teamProgression.levelUpgradeSummary).toContainEqual(expect.objectContaining({
      statId: 'tank.forwardSpeed',
      effectCount: 2,
    }));
  });

  it('repairs newly added max integrity immediately', () => {
    const match = makeMatch();
    match.state.tank.integrity = 100;
    const beforeMaximum = match.rules.resolver.resolve('tank.maxIntegrity');

    const result = match.systems.progression.debugApplyUpgrade('upgrade.tank.maxIntegrity', 'legendary');

    expect(result.accepted).toBe(true);
    const afterMaximum = match.rules.resolver.resolve('tank.maxIntegrity');
    expect(afterMaximum).toBeGreaterThan(beforeMaximum);
    expect(match.state.tank.integrity).toBe(100 + (afterMaximum - beforeMaximum));
  });
});
