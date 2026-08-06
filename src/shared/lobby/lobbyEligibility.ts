import type { LobbyPlayerInternal, StartEligibilityReason } from './lobbyTypes';

export interface LobbyEligibilityInput {
  players: readonly LobbyPlayerInternal[];
  contentAvailable: boolean;
  roleSwapPending?: boolean;
}

export function computeStartEligibility(
  input: LobbyEligibilityInput,
): { eligible: boolean; reason: StartEligibilityReason } {
  const connected = input.players.filter((p) => p.connected);
  if (input.players.length < 2) return { eligible: false, reason: 'waiting_for_player' };
  if (input.players.some((p) => !p.connected)) return { eligible: false, reason: 'player_disconnected' };
  if (connected.length < 2) return { eligible: false, reason: 'waiting_for_player' };
  if (input.roleSwapPending) return { eligible: false, reason: 'role_swap_pending' };
  const drivers = connected.filter((p) => p.seat === 'driver');
  const gunners = connected.filter((p) => p.seat === 'gunner');
  if (drivers.length !== 1 || gunners.length !== 1) return { eligible: false, reason: 'invalid_seats' };
  if (connected.some((p) => !p.ready)) return { eligible: false, reason: 'player_not_ready' };
  if (!input.contentAvailable) return { eligible: false, reason: 'content_unavailable' };
  return { eligible: true, reason: 'eligible' };
}
