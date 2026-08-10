// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_MIX_MULTIPLIERS, AudioManager, perceptualVolumeGain } from '../../src/client/audio';

afterEach(() => vi.restoreAllMocks());

describe('user audio gains', () => {
  it('applies the approved SFX and BGM mix multipliers', () => {
    expect(AUDIO_MIX_MULTIPLIERS).toEqual({ sfx: 1.7, bgm: 1.3 });
  });

  it('uses a perceptual curve with exact mute and unity endpoints', () => {
    expect(perceptualVolumeGain(0)).toBe(0);
    expect(perceptualVolumeGain(50)).toBeCloseTo(0.25);
    expect(perceptualVolumeGain(100)).toBe(1);
    expect(perceptualVolumeGain(-10)).toBe(0);
    expect(perceptualVolumeGain(130)).toBe(1);
  });

  it('keeps BGM and SFX user settings isolated before audio unlock', () => {
    const manager = new AudioManager();
    manager.setBgmVolume(0);
    expect(manager.userVolumeState()).toEqual({ bgmVolume: 0, sfxVolume: 100, bgmGain: 0, sfxGain: 1 });
    manager.setSfxVolume(40);
    const state = manager.userVolumeState();
    expect(state).toMatchObject({ bgmVolume: 0, sfxVolume: 40, bgmGain: 0 });
    expect(state.sfxGain).toBeCloseTo(0.16);
    manager.soundtrack.dispose();
  });

  it('muting BGM does not pause or reset the soundtrack timeline', () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause');
    const manager = new AudioManager();
    const before = manager.soundtrack.debugState();
    pause.mockClear();
    manager.setBgmVolume(0);
    const after = manager.soundtrack.debugState();
    expect(after.currentTrackId).toBe(before.currentTrackId);
    expect(after.currentContext).toBe(before.currentContext);
    expect(after.currentTime).toBe(before.currentTime);
    expect(pause).not.toHaveBeenCalled();
    manager.soundtrack.dispose();
  });
});
