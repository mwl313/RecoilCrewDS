import { describe, expect, it } from 'vitest';
import { CLIENT_CONTENT_PACK } from '../../src/generated/contentPack.generated';
import {
  AuthoritativeFallTracker,
  classifyLandingTier,
} from '../../src/shared/sim/landingMetrics';
import { MatchRuntime } from '../../src/shared/sim/matchRuntime';

describe('authoritative fall-distance tracking', () => {
  it('tracks the airborne peak for jumps, launches, and lower-ground landings', () => {
    const tracker = new AuthoritativeFallTracker(true, 4);
    expect(tracker.update({ grounded: false, previousY: 4, y: 6, preLandingVy: 8 })).toBeNull();
    expect(tracker.update({ grounded: false, previousY: 6, y: 9, preLandingVy: 2 })).toBeNull();
    expect(tracker.update({ grounded: false, previousY: 9, y: 7, preLandingVy: -5 })).toBeNull();
    expect(tracker.update({ grounded: true, previousY: 7, y: 1, preLandingVy: -12 })).toEqual({
      fallDistance: 8,
      impactSpeed: 12,
    });
    expect(tracker.snapshot()).toEqual({ wasGrounded: true, airborneStartedY: null, airbornePeakY: null });
  });

  it('handles same-height landings, pause gaps, and authority resets without spawn snaps', () => {
    const tracker = new AuthoritativeFallTracker(true, 3);
    tracker.update({ grounded: false, previousY: 3, y: 3.8, preLandingVy: 4 });
    const paused = tracker.snapshot();
    expect(tracker.snapshot()).toEqual(paused);
    expect(tracker.update({ grounded: true, previousY: 3.8, y: 3, preLandingVy: -4 })).toEqual({
      fallDistance: 0.8,
      impactSpeed: 4,
    });

    tracker.reset(true, 20);
    expect(tracker.update({ grounded: true, previousY: 20, y: 0, preLandingVy: 0 })).toBeNull();
    tracker.reset(false, 12);
    expect(tracker.update({ grounded: true, previousY: 12, y: 10, preLandingVy: -7 })).toEqual({
      fallDistance: 2,
      impactSpeed: 7,
    });
  });

  it.each([
    [2.49, 'none'],
    [2.5, 'light'],
    [5.5, 'heavy'],
    [10, 'massive'],
  ] as const)('classifies %s m as %s', (fallDistance, tier) => {
    expect(classifyLandingTier(fallDistance)).toBe(tier);
  });

  it('emits explicit authoritative metrics and never applies fall damage', () => {
    const runtime = MatchRuntime.fromContentPack(
      CLIENT_CONTENT_PACK,
      'landing-contract',
      'none',
      'mode.singlePlayerMainStage',
    );
    const tank = runtime.state.tank;
    const ground = runtime.world.groundHeightAt(tank.x, tank.z);
    const integrity = tank.integrity;
    tank.grounded = false;
    tank.y = ground + 6;
    tank.vy = 0;
    runtime.step(1 / 60);
    runtime.takeEvents();
    tank.grounded = false;
    tank.y = ground + 0.01;
    tank.vy = -11;
    runtime.step(1 / 60);
    const landing = runtime.takeEvents().find((event) => event.type === 'tankLanding');
    expect(landing).toMatchObject({
      value: 11,
      impactSpeed: 11,
      fallDistance: 6,
      kind: 'heavy',
      groundPound: false,
    });
    expect(tank.integrity).toBe(integrity);
  });

  it('resets an airborne tracker on respawn and emits no landing for the spawn snap', () => {
    const runtime = MatchRuntime.fromContentPack(
      CLIENT_CONTENT_PACK,
      'landing-respawn',
      'none',
      'mode.singlePlayerScoreAttack',
    );
    const tank = runtime.state.tank;
    tank.grounded = false;
    tank.y += 8;
    tank.vy = 2;
    runtime.step(1 / 60);
    runtime.takeEvents();
    tank.shieldedT = 0;
    runtime.damageTank(10_000, 'enemy');
    runtime.takeEvents();
    for (let i = 0; i < 300 && tank.deadT > 0; i++) runtime.step(1 / 30);
    const events = runtime.takeEvents();
    expect(events.some((event) => event.type === 'respawn')).toBe(true);
    runtime.step(1 / 30);
    expect(runtime.takeEvents().some((event) => event.type === 'tankLanding')).toBe(false);
  });
});
