import { describe, expect, it, vi } from 'vitest';
import { PresentationEventRouter } from '../../src/client/app/presentationEventRouter';
import type { SimEvent } from '../../src/shared/types';
import * as THREE from 'three';

function setup() {
  const audio = { play: vi.fn(), playLocal: vi.fn(), playWorld: vi.fn() };
  const vfx = {
    spawnTracer: vi.fn(), spawnBurst: vi.fn(), spawnFlash: vi.fn(), explosion: vi.fn(),
    smoke: vi.fn(), spawnRing: vi.fn(), spawnJumpDust: vi.fn(), spawnDashBurst: vi.fn(),
  };
  const assets = {
    vfx: vi.fn(() => ({ color: 0xffaa00, size: 1, life: 0.1, count: 4 })),
    cameraImpulse: vi.fn(() => ({ shake: 0.2 })),
  };
  const camera = {
    addImpulse: vi.fn(),
    addDamageImpulse: vi.fn(),
    activeCam: { camera: new THREE.PerspectiveCamera() },
  };
  const router = new PresentationEventRouter(assets as never, vfx as never, audio as never, camera as never);
  return { audio, vfx, router };
}

const event = (partial: Partial<SimEvent>): SimEvent => ({ type: 'enemyFire', t: 1, x: 2, y: 1, z: 3, ...partial });

describe('presentation audio routing', () => {
  it('routes enemy tank impact through the dedicated armor recipe', () => {
    const { audio, router } = setup();
    const now = performance.now();
    router.handleEvent(event({
      type: 'tankDamageTaken', value: 12, maxIntegrity: 100, source: 'enemy',
      impactKind: 'projectile', tier: 'elite', tx: -2, tz: 3,
    }));
    router.update(now + 100);
    expect(audio.playLocal).toHaveBeenCalledWith('enemyProjectileImpact', expect.objectContaining({ damage: 12, tier: 'elite' }));
    expect(audio.playLocal).not.toHaveBeenCalledWith('wallCollision', expect.anything());
  });

  it('routes cannon impacts and barrels to distinct world recipes', () => {
    const { audio, router } = setup();
    router.handleEvent(event({ type: 'playerCannonImpact', value: 6, chargeRatio: 0.8 }));
    router.handleEvent(event({ type: 'barrelExplode', value: 6 }));
    expect(audio.playWorld).toHaveBeenCalledWith('cannonImpact', expect.objectContaining({ chargeRatio: 0.8 }));
    expect(audio.playWorld).toHaveBeenCalledWith('barrelExplosion', expect.anything());
  });

  it('resolves tier-aware deaths and boss fire', () => {
    const { audio, router } = setup();
    router.handleEvent(event({ type: 'kill', tier: 'boss', sizeClass: 'large', kind: 'monster' }));
    router.handleEvent(event({ type: 'bossFire', tier: 'boss', sizeClass: 'large', kind: 'boss' }));
    expect(audio.playWorld).toHaveBeenCalledWith('bossDeath', expect.anything());
    expect(audio.playWorld).toHaveBeenCalledWith('bossFire', expect.anything());
  });

  it('maps legacy Demo fire and telegraph cues safely', () => {
    const { audio, router } = setup();
    router.handleEvent(event({ type: 'towerFire', kind: 'tower' }));
    router.handleEvent(event({ type: 'rammerTelegraph', kind: 'rammer' }));
    expect(audio.playWorld).toHaveBeenCalledWith('enemySpecialistFire', expect.anything());
    expect(audio.playWorld).toHaveBeenCalledWith('rammerTelegraph', expect.anything());
  });
});
