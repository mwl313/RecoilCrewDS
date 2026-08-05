import {
  LOBBY_CHAT_MAX_CODE_POINTS,
  type CrewSeat,
  type LobbyPlayerInternal,
} from './lobbyTypes';
import { validateNickname } from './nicknameValidation';

export function isCrewSeat(value: unknown): value is CrewSeat {
  return value === 'driver' || value === 'gunner';
}

export function validateSeat(value: unknown): CrewSeat | null {
  if (value === null || value === undefined) return null;
  return isCrewSeat(value) ? value : null;
}

/** A player may occupy a seat only when connected and currently seatless. */
export function seatConflict(
  players: readonly LobbyPlayerInternal[],
  seat: CrewSeat,
  exceptPlayerId: string,
): boolean {
  return players.some(
    (p) => p.playerId !== exceptPlayerId && p.seat === seat && p.connected,
  );
}

/** Chat text: plain text, 1–200 code points, no control characters. */
export function validateChatText(raw: string): { valid: boolean; normalized: string; reason?: 'empty' | 'too_long' | 'control_character' } {
  const normalized = String(raw ?? '').trim().replace(/[ \t]+/g, ' ');
  if (normalized.length === 0) return { valid: false, normalized: '', reason: 'empty' };
  if ([...normalized].length > LOBBY_CHAT_MAX_CODE_POINTS) {
    return { valid: false, normalized, reason: 'too_long' };
  }
  for (const ch of normalized) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return { valid: false, normalized, reason: 'control_character' };
  }
  return { valid: true, normalized };
}

export function normalizeDisplayName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return validateNickname(raw).normalized;
}
