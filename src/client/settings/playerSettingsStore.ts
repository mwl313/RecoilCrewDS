import { generateDefaultNickname } from '../../shared/lobby/nicknamePool';
import { validateNickname } from '../../shared/lobby/nicknameValidation';

export const PLAYER_SETTINGS_STORAGE_KEY = 'recoilCrew.playerSettings.v1';

export interface ClientPlayerSettingsV1 {
  version: 1;
  nickname: string;
}

export interface PlayerSettingsStore {
  load(): ClientPlayerSettingsV1;
  save(settings: ClientPlayerSettingsV1): void;
  resetNickname(): ClientPlayerSettingsV1;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultSettings(): ClientPlayerSettingsV1 {
  return { version: 1, nickname: generateDefaultNickname() };
}

function parseStored(raw: string | null): ClientPlayerSettingsV1 | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; nickname?: unknown };
    if (parsed.version !== 1 || typeof parsed.nickname !== 'string') return null;
    const validation = validateNickname(parsed.nickname);
    if (!validation.valid) return null;
    return { version: 1, nickname: validation.normalized };
  } catch {
    return null;
  }
}

/**
 * Persistent local player settings. First launch generates and persists one
 * default; corrupt/invalid values recover with a fresh generated default;
 * storage failure falls back to in-memory settings so the game still works.
 */
export function createPlayerSettingsStore(
  storage: StorageLike | null = typeof localStorage !== 'undefined' ? localStorage : null,
): PlayerSettingsStore {
  let memory: ClientPlayerSettingsV1 | null = null;
  let storageFailed = false;

  const read = (): ClientPlayerSettingsV1 | null => {
    if (!storage || storageFailed) return memory;
    try {
      return parseStored(storage.getItem(PLAYER_SETTINGS_STORAGE_KEY));
    } catch {
      storageFailed = true;
      return memory;
    }
  };

  const write = (settings: ClientPlayerSettingsV1): void => {
    memory = settings;
    if (!storage || storageFailed) return;
    try {
      storage.setItem(PLAYER_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      storageFailed = true;
    }
  };

  return {
    load() {
      const existing = read();
      if (existing) return existing;
      const created = defaultSettings();
      write(created);
      return created;
    },
    save(settings) {
      write(settings);
    },
    resetNickname() {
      const created = defaultSettings();
      write(created);
      return created;
    },
  };
}
