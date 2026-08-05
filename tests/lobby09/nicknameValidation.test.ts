import { describe, expect, it } from 'vitest';
import { validateNickname } from '../../src/shared/lobby/nicknameValidation';

describe('lobby09 nickname validation', () => {
  it('normalizes outer whitespace and internal whitespace', () => {
    expect(validateNickname('  Turbo Toad  ')).toMatchObject({ valid: true, normalized: 'Turbo Toad' });
    expect(validateNickname('A   B')).toMatchObject({ valid: true, normalized: 'A B' });
  });

  it('rejects empty after normalization', () => {
    expect(validateNickname('   ').reason).toBe('empty');
    expect(validateNickname('').valid).toBe(false);
  });

  it('rejects line breaks and control characters', () => {
    expect(validateNickname('A\nB').reason).toBe('control_character');
    expect(validateNickname('A\u0000B').reason).toBe('control_character');
    expect(validateNickname('A\rB').reason).toBe('control_character');
  });

  it('enforces 20 Unicode code points', () => {
    expect(validateNickname('A'.repeat(20)).valid).toBe(true);
    expect(validateNickname('A'.repeat(21)).reason).toBe('too_long');
    expect(validateNickname('👾'.repeat(20)).valid).toBe(true);
    expect(validateNickname('👾'.repeat(21)).reason).toBe('too_long');
  });
});
