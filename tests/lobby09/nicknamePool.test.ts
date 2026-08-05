import { describe, expect, it } from 'vitest';
import { DEFAULT_NICKNAME_BASES, generateDefaultNickname } from '../../src/shared/lobby/nicknamePool';

describe('lobby09 nickname pool', () => {
  it('generated base comes from the pool', () => {
    expect(DEFAULT_NICKNAME_BASES).toContain('TurboToad');
    expect(DEFAULT_NICKNAME_BASES).toContain('ZippyZebra');
    expect(DEFAULT_NICKNAME_BASES.length).toBeGreaterThanOrEqual(50);
    const name = generateDefaultNickname(() => 0);
    const base = name.replace(/[0-9]{2}$/, '');
    expect(DEFAULT_NICKNAME_BASES).toContain(base);
  });

  it('suffix is exactly two digits and zero-padded', () => {
    expect(generateDefaultNickname(() => 0)).toMatch(/[A-Za-z]+00$/);
    expect(generateDefaultNickname(() => 7)).toMatch(/[A-Za-z]+07$/);
    expect(generateDefaultNickname(() => 99)).toMatch(/[A-Za-z]+99$/);
  });

  it('uses injected deterministic randomness', () => {
    const calls: number[] = [];
    const name = generateDefaultNickname((max) => {
      calls.push(max);
      return max === DEFAULT_NICKNAME_BASES.length ? 0 : 42;
    });
    expect(name).toBe(`${DEFAULT_NICKNAME_BASES[0]}42`);
    expect(calls).toEqual([DEFAULT_NICKNAME_BASES.length, 100]);
  });
});
