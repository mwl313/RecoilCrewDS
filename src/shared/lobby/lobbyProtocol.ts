/** Typed Lobby V2 wire payloads (protocol v8). */

export interface CreateLobbyMessage {
  t: 'create';
  displayName: string;
}

export interface JoinLobbyMessage {
  t: 'join';
  code: string;
  displayName: string;
}

export interface LobbySelectSeatMessage {
  t: 'lobbySelectSeat';
  seat: 'driver' | 'gunner';
  lobbyRevision: number;
}

export interface LobbyRequestRoleSwapMessage {
  t: 'lobbyRequestRoleSwap';
  lobbyRevision: number;
}

export interface LobbyResolveRoleSwapMessage {
  t: 'lobbyResolveRoleSwap';
  requestId: number;
  accept: boolean;
  lobbyRevision: number;
}

export interface LobbyReadySetMessage {
  t: 'lobbyReadySet';
  ready: boolean;
  lobbyRevision: number;
}

export interface LobbyChatSendMessage {
  t: 'lobbyChatSend';
  text: string;
}
