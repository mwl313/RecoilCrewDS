export type SoundtrackContext =
  | 'title'
  | 'menu'
  | 'lobby'
  | 'countdown'
  | 'match'
  | 'pause'
  | 'results';

export interface SoundtrackTrack {
  id: string;
  src: string;
  enabled: boolean;
}

export interface SoundtrackMediaElement {
  src: string;
  preload: string;
  loop: boolean;
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  addEventListener(type: 'ended', listener: () => void): void;
  removeEventListener(type: 'ended', listener: () => void): void;
}

export interface SoundtrackAutomation {
  setTrackFade(value: number, durationMs: number): void;
  setContext(cutoffHz: number, gain: number, durationMs: number): void;
  duck(depth: number, attackMs: number, holdMs: number, releaseMs: number): void;
}

export interface SoundtrackScheduler {
  setTimeout(callback: () => void, durationMs: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(callback: () => void, durationMs: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface SoundtrackDebugState {
  activeTrackCount: number;
  currentContext: SoundtrackContext;
  currentIndex: number;
  currentTrackId: string | null;
  currentSrc: string | null;
  currentTime: number;
  mediaPaused: boolean;
  pendingAutoplayStart: boolean;
  pendingMatchAdvance: boolean;
  naturalEndPending: boolean;
  disposed: boolean;
}
