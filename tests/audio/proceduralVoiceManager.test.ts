import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CATEGORY_CAPS,
  ProceduralVoiceManager,
} from '../../src/client/audio/procedural/proceduralVoiceManager';

describe('ProceduralVoiceManager', () => {
  afterEach(() => vi.useRealTimers());

  it('enforces category caps and reports dropped voices', () => {
    vi.useFakeTimers();
    const manager = new ProceduralVoiceManager();
    const stops: number[] = [];
    for (let i = 0; i < DEFAULT_CATEGORY_CAPS.enemyFire; i++) {
      manager.request({ category: 'enemyFire', priority: 64, distance: i, duration: 1 })!
        .bindStop(() => stops.push(i));
    }
    expect(manager.request({ category: 'enemyFire', priority: 64, distance: 90, duration: 1 })).toBeNull();
    expect(manager.stats().active).toBe(DEFAULT_CATEGORY_CAPS.enemyFire);
    expect(manager.stats().dropped).toBe(1);
    manager.dispose();
    expect(stops).toHaveLength(DEFAULT_CATEGORY_CAPS.enemyFire);
  });

  it('lets a boss voice replace a low-priority distant enemy voice', () => {
    vi.useFakeTimers();
    const manager = new ProceduralVoiceManager();
    let displaced = false;
    for (let i = 0; i < DEFAULT_CATEGORY_CAPS.enemyFire; i++) {
      manager.request({ category: 'enemyFire', priority: 30, distance: 80 - i, duration: 1 })!
        .bindStop(() => { if (i === 0) displaced = true; });
    }
    expect(manager.request({ category: 'enemyFire', priority: 90, distance: 40, duration: 1 })).not.toBeNull();
    expect(displaced).toBe(true);
    expect(manager.stats().active).toBe(DEFAULT_CATEGORY_CAPS.enemyFire);
    manager.dispose();
  });

  it('protects a player cannon from low-priority global overflow', () => {
    vi.useFakeTimers();
    const caps = { ...DEFAULT_CATEGORY_CAPS, playerWeapon: 4, enemyDeath: 4 };
    const manager = new ProceduralVoiceManager(2, caps);
    manager.request({ category: 'playerWeapon', priority: 100, distance: 0, duration: 1 });
    manager.request({ category: 'enemyDeath', priority: 42, distance: 25, duration: 1 });
    expect(manager.request({ category: 'enemyDeath', priority: 20, distance: 10, duration: 1 })).toBeNull();
    expect(manager.stats().counts.playerWeapon).toBe(1);
    manager.dispose();
  });
});
