/** Generic Lobby V2 state (Shared Tank first release only). */

export type CrewSeat = 'driver' | 'gunner';

export type LobbyGameplayType = 'sharedTank';

export type LobbyPhase = 'lobby' | 'countdown';

export type StartEligibilityReason =
  | 'eligible'
  | 'waiting_for_player'
  | 'invalid_seats'
  | 'role_swap_pending'
  | 'player_not_ready'
  | 'player_disconnected'
  | 'content_unavailable';

export interface LobbyPlayerInternal {
  playerId: string;
  sessionId: string;
  displayName: string;
  connected: boolean;
  reconnectDeadlineWallMs: number | null;
  seat: CrewSeat;
  ready: boolean;
  joinedSequence: number;
}

export interface LobbyPlayerView {
  playerId: string;
  displayName: string;
  connected: boolean;
  reconnecting: boolean;
  seat: CrewSeat;
  ready: boolean;
}

export interface LobbyRoleSwapView {
  requestId: number;
  requestedByPlayerId: string;
  targetPlayerId: string;
  requestedBySeat: CrewSeat;
  requestedSeat: CrewSeat;
}

export interface ClientLobbyState {
  revision: number;
  roomCode: string;
  phase: LobbyPhase;
  hostPlayerId: string;
  players: LobbyPlayerView[];
  settings: {
    gameplayType: LobbyGameplayType;
    modeId: string;
  };
  countdownEndsAtWallMs: number | null;
  startEligibility: {
    eligible: boolean;
    reason: StartEligibilityReason;
  };
  roleSwap: LobbyRoleSwapView | null;
}

export interface LobbyChatMessage {
  messageId: number;
  playerId: string;
  displayName: string;
  text: string;
  sentAtWallMs: number;
}

export interface SharedTankStartAssignment {
  driver: unknown;
  gunner: unknown;
}

export const LOBBY_MAX_PLAYERS = 2;
export const LOBBY_CHAT_MAX_MESSAGES = 30;
export const LOBBY_CHAT_MAX_CODE_POINTS = 200;
export const LOBBY_CHAT_BURST = 4;
export const LOBBY_CHAT_REFILL_SECONDS = 2;
export const LOBBY_COUNTDOWN_SECONDS = 3.4;
