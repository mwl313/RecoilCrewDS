import { describe, expect, it, vi } from 'vitest';
import {
  MACHINE_GUN_ALIGNMENT_LIMITS,
  MACHINE_GUN_PRESENTATION_LIMITS,
  MachineGunPresentation,
  resolveMachineGunVisualRay,
} from '../../src/client/weapons/machineGunPresentation';
import { VFX_POOL_LIMITS } from '../../src/client/vfx';

function setup(now = () => 1_000, reducedMotion = () => false) {
  const vfx = {
    spawnStreak: vi.fn(() => true),
    spawnFlash: vi.fn(),
    spawnBurst: vi.fn(),
  };
  const audio = { playLocal: vi.fn(), playWorld: vi.fn() };
  const camera = { addImpulse: vi.fn() };
  const presentation = new MachineGunPresentation(
    vfx as never,
    audio as never,
    camera as never,
    now,
    reducedMotion,
  );
  return { presentation, vfx, audio, camera };
}

const origin = { x: 1, y: 2, z: 3 };
const endpoint = { x: 1, y: 2, z: 48 };

describe('bounded Machine Gun presentation', () => {
  it('re-anchors ordinary network delay to the visible turret without moving the authoritative endpoint', () => {
    const authoritative = {
      origin: { x: 0, y: 2, z: 0 },
      direction: { x: 0, y: 0, z: 1 },
      distance: 20,
    };
    const rendered = {
      origin: { x: 0.2, y: 2, z: 0.25 },
      direction: { x: 0, y: 0, z: 1 },
    };
    const ray = resolveMachineGunVisualRay(authoritative, rendered);
    expect(ray.alignedToRenderedMuzzle).toBe(true);
    expect(ray.origin).toBe(rendered.origin);
    expect(ray.endpoint).toEqual({ x: 0, y: 2, z: 20 });
  });

  it('falls back to the authoritative ray on a large turret flick', () => {
    const authoritative = {
      origin: { x: 0, y: 2, z: 0 },
      direction: { x: 0, y: 0, z: 1 },
      distance: 20,
    };
    const rendered = {
      origin: { x: 0.2, y: 2, z: 0.25 },
      direction: { x: 1, y: 0, z: 0 },
    };
    const ray = resolveMachineGunVisualRay(authoritative, rendered);
    expect(ray.alignedToRenderedMuzzle).toBe(false);
    expect(ray.origin).toBe(authoritative.origin);
    expect(ray.endpoint).toEqual({ x: 0, y: 2, z: 20 });
    expect(MACHINE_GUN_ALIGNMENT_LIMITS.maximumDirectionErrorRadians).toBeLessThan(Math.PI / 2);
  });

  it('presents the predicted first shot immediately and suppresses duplicate confirmation transients', () => {
    const { presentation, vfx, audio, camera } = setup();
    presentation.presentPredictedShot(origin, 7);
    presentation.presentAcceptedShot({ origin, endpoint, seed: 7, confirmedPrediction: true });

    expect(vfx.spawnFlash).toHaveBeenCalledTimes(1);
    expect(vfx.spawnBurst).toHaveBeenCalledTimes(1);
    expect(vfx.spawnStreak).toHaveBeenCalledTimes(2);
    expect(audio.playLocal).toHaveBeenCalledTimes(1);
    expect(camera.addImpulse).toHaveBeenCalledTimes(1);
    expect(presentation.diagnostics()).toMatchObject({ predictedShots: 1, acceptedShots: 1 });
  });

  it('gives every authoritative round muzzle, core/glow tracer, audio, and bounded recoil', () => {
    const { presentation, vfx, audio, camera } = setup();
    for (let i = 0; i < 25; i++) presentation.presentAcceptedShot({ origin, endpoint, seed: i });

    expect(vfx.spawnFlash).toHaveBeenCalledTimes(25);
    expect(vfx.spawnStreak).toHaveBeenCalledTimes(50);
    expect(audio.playLocal).toHaveBeenCalledTimes(25);
    const recoilTotal = camera.addImpulse.mock.calls.reduce((sum, [value]) => sum + value, 0);
    expect(recoilTotal).toBeCloseTo(MACHINE_GUN_PRESENTATION_LIMITS.recoilWindowCap, 8);
    expect(presentation.diagnostics().acceptedShots).toBe(25);
  });

  it('attenuates recoil completely under reduced motion while preserving shot VFX/audio', () => {
    const { presentation, vfx, audio, camera } = setup(() => 1_000, () => true);
    presentation.presentAcceptedShot({ origin, endpoint });
    expect(camera.addImpulse).not.toHaveBeenCalled();
    expect(vfx.spawnStreak).toHaveBeenCalledTimes(2);
    expect(audio.playLocal).toHaveBeenCalledTimes(1);
  });

  it('presents bounded warm impacts through the dedicated low-priority recipe', () => {
    const { presentation, vfx, audio } = setup();
    presentation.presentImpact(endpoint, 99);
    expect(vfx.spawnBurst).toHaveBeenCalledTimes(2);
    expect(vfx.spawnFlash).toHaveBeenCalledTimes(1);
    expect(audio.playWorld).toHaveBeenCalledWith('playerMgImpact', expect.objectContaining({ ...endpoint, seed: 99 }));
  });

  it('has ample pooled geometry for maximum-rate tracer overlap', () => {
    const overlappingShots = Math.ceil(24.75 * MACHINE_GUN_PRESENTATION_LIMITS.tracerLifeSeconds);
    expect(overlappingShots * 2).toBeLessThanOrEqual(VFX_POOL_LIMITS.streaks);
    expect(MACHINE_GUN_PRESENTATION_LIMITS.tracerCoreWidth).toBeGreaterThan(0);
    expect(MACHINE_GUN_PRESENTATION_LIMITS.tracerGlowWidth)
      .toBeGreaterThan(MACHINE_GUN_PRESENTATION_LIMITS.tracerCoreWidth);
  });

  it('delivers every accepted round independently to Gunner and Driver observers', () => {
    const gunner = setup();
    const driver = setup();
    for (let i = 0; i < 25; i++) {
      const shot = { origin, endpoint, seed: i };
      gunner.presentation.presentAcceptedShot(shot);
      driver.presentation.presentAcceptedShot(shot);
    }
    expect(gunner.presentation.diagnostics().acceptedShots).toBe(25);
    expect(driver.presentation.diagnostics().acceptedShots).toBe(25);
    expect(gunner.vfx.spawnStreak).toHaveBeenCalledTimes(50);
    expect(driver.vfx.spawnStreak).toHaveBeenCalledTimes(50);
  });
});
