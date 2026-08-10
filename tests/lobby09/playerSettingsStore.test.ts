// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import {
  createPlayerSettingsStore,
  PLAYER_SETTINGS_STORAGE_KEY,
  PLAYER_SETTINGS_V1_STORAGE_KEY,
} from '../../src/client/settings/playerSettingsStore';
import { PlayerSettingsController } from '../../src/client/settings/playerSettingsController';

afterEach(() => localStorage.clear());

describe('lobby09 player settings', () => {
  it('first launch generates and persists a default', () => {
    const store = createPlayerSettingsStore();
    const settings = store.load();
    expect(settings.nickname).toMatch(/^[A-Za-z]+[0-9]{2}$/);
    expect(settings).toMatchObject({ version: 2, bgmVolume: 100, sfxVolume: 100 });
    expect(localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY)).toContain(settings.nickname);
    const again = store.load();
    expect(again.nickname).toBe(settings.nickname);
  });

  it('migrates V1 nickname settings and chooses locale from the browser', () => {
    localStorage.setItem(PLAYER_SETTINGS_V1_STORAGE_KEY, JSON.stringify({ version: 1, nickname: 'TurboToad07' }));
    const settings = createPlayerSettingsStore(localStorage, 'ko-KR').load();
    expect(settings).toEqual({
      version: 2,
      nickname: 'TurboToad07',
      locale: 'ko',
      bgmVolume: 100,
      sfxVolume: 100,
    });
    expect(JSON.parse(localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY)!)).toEqual(settings);
  });

  it('corrupt JSON and invalid stored nicknames recover', () => {
    localStorage.setItem(PLAYER_SETTINGS_STORAGE_KEY, '{not json');
    const a = createPlayerSettingsStore().load();
    expect(a.nickname).toMatch(/^[A-Za-z]+[0-9]{2}$/);
    localStorage.setItem(PLAYER_SETTINGS_STORAGE_KEY, JSON.stringify({ version: 1, nickname: 'bad\nname' }));
    const b = createPlayerSettingsStore().load();
    expect(b.nickname).toMatch(/^[A-Za-z]+[0-9]{2}$/);
  });

  it('randomize changes draft only; cancel restores; save persists normalized', () => {
    const store = createPlayerSettingsStore();
    const controller = new PlayerSettingsController(store);
    const original = controller.currentNickname;
    controller.randomize();
    expect(controller.draftNickname).not.toBe(original);
    expect(controller.currentNickname).toBe(original);
    controller.cancel();
    expect(controller.draftNickname).toBe(original);
    controller.setDraft('  New  Name  ');
    expect(controller.save().valid).toBe(true);
    expect(controller.currentNickname).toBe('New Name');
    expect(JSON.parse(localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY)!).nickname).toBe('New Name');
  });

  it('previews language and independent volumes in draft; cancel restores and save persists', () => {
    const controller = new PlayerSettingsController(createPlayerSettingsStore(localStorage, 'en-US'));
    controller.beginEdit();
    controller.setDraftLocale('ko');
    controller.setDraftBgmVolume(26);
    controller.setDraftSfxVolume(81);
    expect(controller.draftSettings).toMatchObject({ locale: 'ko', bgmVolume: 26, sfxVolume: 81 });
    expect(controller.current).toMatchObject({ locale: 'en', bgmVolume: 100, sfxVolume: 100 });
    expect(controller.cancel()).toMatchObject({ locale: 'en', bgmVolume: 100, sfxVolume: 100 });
    controller.beginEdit();
    controller.setDraftLocale('ko');
    controller.setDraftBgmVolume(26);
    controller.setDraftSfxVolume(81);
    expect(controller.save().valid).toBe(true);
    expect(JSON.parse(localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY)!)).toMatchObject({ locale: 'ko', bgmVolume: 26, sfxVolume: 81 });
  });

  it('storage failure is nonfatal (memory fallback)', () => {
    const failing: Storage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    };
    const store = createPlayerSettingsStore(failing);
    const first = store.load();
    const second = store.load();
    expect(second.nickname).toBe(first.nickname);
  });
});
