import { describe, expect, it } from 'vitest';
import { interpolateSinglePlayerTank } from '../src/client/prediction/singlePlayerTankInterpolator';
import type { TankState } from '../src/shared/types';

function tank(partial: Partial<TankState> = {}): TankState {
  return {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, yawVel: 0, pitch: 0, roll: 0,
    integrity: 100, shieldedT: 0, deadT: 0, grounded: true, dashCooldown: 0,
    dashPresentationT: 0, dashDamageT: 0, drift: false, prevOnRamp: false, ...partial,
  };
}

describe('Single Player tank render interpolation', () => {
  it('smooths the tank and camera anchor between fixed simulation poses', () => {
    const previous = tank({ x: 10, z: 20, vx: 2, yaw: 0.2, roll: -0.1 });
    const current = tank({ x: 12, z: 24, vx: 6, yaw: 0.6, roll: 0.3, integrity: 80 });

    const rendered = interpolateSinglePlayerTank(previous, current, 0.5);

    expect(rendered.x).toBeCloseTo(11);
    expect(rendered.z).toBeCloseTo(22);
    expect(rendered.vx).toBeCloseTo(4);
    expect(rendered.yaw).toBeCloseTo(0.4);
    expect(rendered.roll).toBeCloseTo(0.1);
    expect(rendered.integrity).toBe(80);
  });

  it('takes the shortest path across the yaw wrap', () => {
    const rendered = interpolateSinglePlayerTank(
      tank({ yaw: Math.PI - 0.1 }),
      tank({ yaw: -Math.PI + 0.1 }),
      0.5,
    );

    expect(Math.abs(Math.abs(rendered.yaw) - Math.PI)).toBeLessThan(1e-9);
  });

  it('does not smear teleports or respawn-state changes across the world', () => {
    const teleported = tank({ x: 30, deadT: 2 });
    expect(interpolateSinglePlayerTank(tank(), teleported, 0.5)).toBe(teleported);
  });
});
