import type { MapGenerationBundle } from '@app/shared/mapgen/profiles';
import type { ArenaMetadata } from '@app/shared/mapgen/arenaSession';
import { GENERATED_MAP_PROFILES, MAP_PROFILE_SOURCE_HASH } from '@app/generated/mapProfiles.generated';

export type CameraMode = 'orbit3d' | 'topDown';
export type GeneratorMode = 'production' | 'exactCandidate';

export interface MapLabState {
  mode: GeneratorMode;
  sourceProfileId: string;
  workingBundle: MapGenerationBundle;
  fallbackBundle: MapGenerationBundle;
  roomCode: string;
  matchIndex: number;
  generatorVersion: number;
  exactBaseSeed?: number;
  exactCandidateSeed?: number;
  exactAttempt?: number;
  cameraMode: CameraMode;
  autoRegenerate: boolean;
  layers: Record<string, boolean>;
  selectedIssueId?: string;
  dirty: boolean;
  latestMetadata?: ArenaMetadata;
}

export const DEFAULT_ROOM_CODE = 'MAPLAB';
export const DEFAULT_MATCH_INDEX = 0;

export function createMapLabState(sourceProfileId = 'map.arena400Primary'): MapLabState {
  const bundle = GENERATED_MAP_PROFILES[sourceProfileId];
  const fallbackBundle = GENERATED_MAP_PROFILES[bundle.map.fallbackMapId!];
  return {
    mode: 'production',
    sourceProfileId,
    workingBundle: deepCloneBundle(bundle),
    fallbackBundle: deepCloneBundle(fallbackBundle),
    roomCode: DEFAULT_ROOM_CODE,
    matchIndex: DEFAULT_MATCH_INDEX,
    generatorVersion: 1,
    cameraMode: 'orbit3d',
    autoRegenerate: true,
    layers: {},
    dirty: false,
  };
}

export function deepCloneBundle<T>(bundle: T): T {
  return JSON.parse(JSON.stringify(bundle)) as T;
}

export function getPath(target: unknown, path: string): unknown {
  let current: unknown = target;
  for (const part of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = current[parts[i]];
    if (next === null || typeof next !== 'object') {
      throw new Error(`cannot set path ${path}: ${parts[i]} is not an object`);
    }
    current = next as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

export const DRAFT_KEY = 'maplab:draft:v1';

export interface MapLabDraft {
  fingerprint: string;
  savedAt: number;
  state: MapLabState;
}

export function saveDraft(state: MapLabState): void {
  try {
    const draft: MapLabDraft = {
      fingerprint: MAP_PROFILE_SOURCE_HASH,
      savedAt: Date.now(),
      state: deepCloneBundle(state),
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // storage unavailable (private mode etc.)
  }
}

export function loadDraft(): MapLabDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MapLabDraft;
    if (!parsed?.state?.workingBundle) return null;
    return parsed;
  } catch {
    return null;
  }
}
