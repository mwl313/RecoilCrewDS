import type { SoundtrackTrack } from './soundtrackTypes';
import { resolveClientAssetUrl } from '../urlResolution';

export const SOUNDTRACK_TRACKS: readonly SoundtrackTrack[] = [
  { id: 'bgm1', src: resolveClientAssetUrl('/assets/audio/bgm/BGM1.mp3'), enabled: true },
  { id: 'bgm2', src: resolveClientAssetUrl('/assets/audio/bgm/BGM2.mp3'), enabled: true },
];
