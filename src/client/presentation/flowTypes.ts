import type { ModifierId, Role } from '../../shared/types';

/** Application commands owned by code (scene content only references ids). */
export interface AppFlowHandlers {
  onBoot(): void;
  onCreate(): void;
  onJoin(code: string): void;
  onReady(): void;
  onStartSinglePlayer(): void;
  onRestartSinglePlayer(): void;
  onHowTo(): void;
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
  | 'create'
  | 'join'
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
  title: string;
  modifier: string;
}

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
