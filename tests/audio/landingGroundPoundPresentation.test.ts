import { describe, expect, it, vi } from 'vitest';
import {
  landingCameraImpulse,
  presentLanding,
  resolveLandingPresentation,
} from '../../src/client/presentation/landingPresentation';
import {
  groundShockwaveRadiusAt,
  presentGroundPoundImpact,
} from '../../src/client/presentation/groundPoundPresentation';
import type { SimEvent } from '../../src/shared/types';

const event = (partial: Partial<SimEvent>): SimEvent => ({ type: 'tankLanding', t: 1, x: 2, y: 3, z: 4, ...partial });

describe('landing and Ground Pound presentation coordination', () => {
  it('suppresses dedicated feedback below 2.5 m and uses distance-owned tiers', () => {
    expect(resolveLandingPresentation(event({ fallDistance: 2.49, impactSpeed: 20 }))).toBeNull();
    expect(resolveLandingPresentation(event({ fallDistance: 2.5, impactSpeed: 2 }))?.tier).toBe('light');
    expect(resolveLandingPresentation(event({ fallDistance: 5.5, impactSpeed: 2 }))?.tier).toBe('heavy');
    expect(resolveLandingPresentation(event({ fallDistance: 10, impactSpeed: 2 }))?.tier).toBe('massive');
    expect(landingCameraImpulse(100)).toBe(0.65);
  });

  it('plays one combined sound and one capped camera impulse for Ground Pound', () => {
    const audio = { playLocal: vi.fn() };
    const camera = { addLandingImpulse: vi.fn() };
    const plan = presentLanding(event({
      fallDistance: 15,
      impactSpeed: 18,
      value: 18,
      groundPound: true,
    }), { audio, camera, seed: 7 });
    expect(plan).toMatchObject({ tier: 'massive', recipe: 'groundPoundImpact', groundPound: true });
    expect(audio.playLocal).toHaveBeenCalledTimes(1);
    expect(audio.playLocal).toHaveBeenCalledWith('groundPoundImpact', expect.objectContaining({ fallDistance: 15 }));
    expect(camera.addLandingImpulse).toHaveBeenCalledTimes(1);
    expect(camera.addLandingImpulse.mock.calls[0][0]).toBeLessThanOrEqual(0.72);
  });

  it('substantially attenuates camera motion without muting audio', () => {
    const normal = resolveLandingPresentation(event({ fallDistance: 10, impactSpeed: 14 }), false)!;
    const reduced = resolveLandingPresentation(event({ fallDistance: 10, impactSpeed: 14 }), true)!;
    expect(reduced.cameraImpulse).toBeCloseTo(normal.cameraImpulse * 0.28);
    expect(reduced.audioIntensity).toBe(normal.audioIntensity);
    expect(reduced.recipe).toBe(normal.recipe);
  });

  it('renders pooled shockwave rings from the authoritative radius and owns no audio/camera', () => {
    const vfx = {
      spawnGroundRing: vi.fn(),
      spawnRadialDebris: vi.fn(),
      spawnFlash: vi.fn(),
    };
    const impact = event({ type: 'groundPoundImpact', radius: 11.83, damage: 62.5, fallDistance: 12, stacks: 2 });
    expect(presentGroundPoundImpact(impact, vfx)).toBe(true);
    expect(vfx.spawnGroundRing).toHaveBeenCalledTimes(2);
    expect(vfx.spawnGroundRing.mock.calls[1][4]).toBe(11.83);
    expect(groundShockwaveRadiusAt(11.83, 1)).toBe(11.83);
    expect(vfx.spawnRadialDebris).toHaveBeenCalledTimes(1);
    expect(vfx.spawnFlash).toHaveBeenCalledTimes(1);
  });
});
