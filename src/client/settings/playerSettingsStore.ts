import { generateDefaultNickname } from '../../shared/lobby/nicknamePool';
import { validateNickname } from '../../shared/lobby/nicknameValidation';
import { localeFromNavigator, normalizeLocale } from '../localization/localizationService';
import type { Locale } from '../localization/localizationTypes';

export const PLAYER_SETTINGS_V1_STORAGE_KEY = 'recoilCrew.playerSettings.v1';
export const PLAYER_SETTINGS_STORAGE_KEY = 'recoilCrew.playerSettings.v2';

export interface ClientPlayerSettingsV1 {
  version: 1;
  nickname: string;
}

export interface ClientPlayerSettingsV2 {
  version: 2;
  nickname: string;
  locale: Locale;
  bgmVolume: number;
  sfxVolume: number;
}

export interface PlayerSettingsStore {
  load(): ClientPlayerSettingsV2;
  save(settings: ClientPlayerSettingsV2): void;
  resetNickname(): ClientPlayerSettingsV2;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function volume(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function defaultSettings(language?: string): ClientPlayerSettingsV2 {
  return {
    version: 2,
    nickname: generateDefaultNickname(),
    locale: localeFromNavigator(language),
    bgmVolume: 100,
    sfxVolume: 100,
  };
}
function validNickname(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const validation = validateNickname(value);
  return validation.valid ? validation.normalized : null;
}

export function parsePlayerSettingsV2(raw: string | null): ClientPlayerSettingsV2 | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const nickname = validNickname(parsed.nickname);
    const bgmVolume = volume(parsed.bgmVolume);
    const sfxVolume = volume(parsed.sfxVolume);
    if (parsed.version !== 2 || nickname === null || bgmVolume === null || sfxVolume === null) return null;
    if (parsed.locale !== 'en' && parsed.locale !== 'ko') return null;
    return { version: 2, nickname, locale: parsed.locale, bgmVolume, sfxVolume };
  } catch {
    return null;
  }
}

function parsePlayerSettingsV1(raw: string | null): ClientPlayerSettingsV1 | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const nickname = validNickname(parsed.nickname);
    return parsed.version === 1 && nickname !== null ? { version: 1, nickname } : null;
  } catch {
    return null;
  }
}

export function migratePlayerSettingsV1(settings: ClientPlayerSettingsV1, language?: string): ClientPlayerSettingsV2 {
  return {
    version: 2,
    nickname: settings.nickname,
    locale: normalizeLocale(localeFromNavigator(language)),
    bgmVolume: 100,
    sfxVolume: 100,
  };
}
/** V2 settings persistence with V1 migration and a durable in-memory fallback. */
export function createPlayerSettingsStore(
  storage: StorageLike | null = typeof localStorage !== 'undefined' ? localStorage : null,
  language = typeof navigator === 'undefined' ? '' : navigator.language,
): PlayerSettingsStore {
  let memory: ClientPlayerSettingsV2 | null = null;
  let storageFailed = false;

  const readKey = (key: string): string | null => {
    if (!storage || storageFailed) return null;
    try {
      return storage.getItem(key);
    } catch {
      storageFailed = true;
      return null;
    }
  };

  const write = (settings: ClientPlayerSettingsV2): void => {
    memory = { ...settings };
    if (!storage || storageFailed) return;
    try {
      storage.setItem(PLAYER_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      storageFailed = true;
    }
  };

  return {
    load() {
      if (memory) return { ...memory };
      const current = parsePlayerSettingsV2(readKey(PLAYER_SETTINGS_STORAGE_KEY));
      if (current) {
        memory = current;
        return { ...current };
      }
      const legacy = parsePlayerSettingsV1(readKey(PLAYER_SETTINGS_V1_STORAGE_KEY));
      const created = legacy ? migratePlayerSettingsV1(legacy, language) : defaultSettings(language);
      write(created);
      return { ...created };
    },
    save(settings) {
      write({ ...settings, bgmVolume: volume(settings.bgmVolume) ?? 100, sfxVolume: volume(settings.sfxVolume) ?? 100 });
    },
    resetNickname() {
      const current = memory ?? this.load();
      const next = { ...current, nickname: generateDefaultNickname() };
      write(next);
      return { ...next };
    },
  };
}
