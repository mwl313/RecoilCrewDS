/**
 * Shared nickname validation (client and server use this exact contract).
 */
export type NicknameValidationReason = 'empty' | 'too_long' | 'control_character';

export interface NicknameValidationResult {
  valid: boolean;
  normalized: string;
  reason?: NicknameValidationReason;
}

export const NICKNAME_MAX_CODE_POINTS = 20;

function codePointLength(value: string): number {
  return [...value].length;
}

/**
 * Rules:
 * - 1–20 visible Unicode code points
 * - trim outer whitespace
 * - collapse repeated internal whitespace to one space
 * - reject line breaks and control characters
 * - reject empty after normalization
 */
export function validateNickname(raw: string): NicknameValidationResult {
  const trimmed = String(raw ?? '').trim();
  const normalized = trimmed.replace(/[ \t]+/g, ' ');
  if (normalized.length === 0) {
    return { valid: false, normalized: '', reason: 'empty' };
  }
  if (codePointLength(normalized) > NICKNAME_MAX_CODE_POINTS) {
    return { valid: false, normalized, reason: 'too_long' };
  }
  for (const ch of normalized) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f || ch === '\n' || ch === '\r' || ch === '\u2028' || ch === '\u2029') {
      return { valid: false, normalized, reason: 'control_character' };
    }
  }
  return { valid: true, normalized };
}
