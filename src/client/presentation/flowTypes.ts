import type { ModifierId, Role } from '../../shared/types';
import type { CrewSeat } from '../../shared/lobby/lobbyTypes';
import type { Locale } from '../localization/localizationTypes';

/** Application commands owned by code (scene content only references ids). */
export interface AppFlowHandlers {
  onBoot(): void;
  onCreate(): void;
  onJoin(code: string): void;
  onReady(): void;
  onStartSinglePlayer(): void;
  onRestartSinglePlayer(): void;
  onHowTo(): void;
  onOpenSettings(): void;
  onSaveSettings(nickname: string): void;
  onRandomizeNickname(): void;
  onPreviewLocale?(locale: Locale): void;
  onPreviewBgmVolume?(value: number): void;
  onPreviewSfxVolume?(value: number): void;
  onCancelSettings(): void;
  onLobbySeat(seat: CrewSeat): void;
  onLobbyRequestRoleSwap(): void;
  onLobbyResolveRoleSwap(requestId: number, accept: boolean): void;
  onLobbyReadyToggle(): void;
  onLobbyChatSend(text: string): void;
  onCopyRoomCode(code: string): void;
  onBack(): void;
  onRematch(modifier: ModifierId): void;
  onLeave(): void;
  onRetry(): void;
  onMainMenu(): void;
  onResume(): void;
  onPause(): void;
}

export type FlowStateId =
  | 'boot'
  | 'main'
  | 'settings'
  | 'create'
  | 'join'
  | 'lobby'
  | 'ready'
  | 'countdown'
  | 'game'
  | 'pause'
  | 'error'
  | 'results'
  | 'howto';

export interface ResultsPayload {
  score: number;
  bestCombo: number;
  chargedCannonShots: number;
  fullChargeShots: number;
  kills: number;
  scrapCollected: number;
  links: number;
  wipeouts: number;
  grade: string;
  titleId?: string;
  title: string;
  modifier: string;
}

export type ResultOutcome = 'victory' | 'defeat' | 'complete';

export interface RematchPayload {
  driver: boolean;
  gunner: boolean;
  modifier: string;
}

export const MODIFIERS: Array<{ id: ModifierId; label: string; desc: string }> = [
  { id: 'none', label: 'STANDARD', desc: 'The classic Recoil Crew experience.' },
  { id: 'doubleBarrel', label: 'DOUBLE BARREL', desc: 'Two shells, more recoil, longer cooldown.' },
  { id: 'soapTracks', label: 'SOAP TRACKS', desc: 'Lower grip and wider drifts.' },
  { id: 'moonYard', label: 'MOON YARD', desc: 'Lower gravity and longer airtime.' },
  { id: 'volatileInventory', label: 'VOLATILE INVENTORY', desc: 'Bigger barrel blasts and chains.' },
  { id: 'scrapMagnet', label: 'SCRAP MAGNET', desc: 'Stronger magnet, shorter pickup life.' },
  { id: 'overclocked', label: 'OVERCLOCKED', desc: 'Faster MG and more enemies.' },
];

export type RoleThemeId = 'driver' | 'gunner';
export type { Role };
