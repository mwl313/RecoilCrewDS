import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Match } from '../../src/shared/sim/match';
import { ContentLoader } from '../../src/shared/content/contentLoader';
import { resolveCannonShotProfile } from '../../src/shared/weapons/cannonShotProfile';
import { statModifier } from '../../src/shared/stats/statModifier';

const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../content');
const pack = new ContentLoader().loadFromFilesystem(CONTENT_ROOT);
const DT = 1 / 30;
const cannon = (): ReturnType<typeof pack.getWeapon> => pack.getWeapon('weapon.mainCannon');

describe('cannon charge profile (Combat 05 M6)', () => {
  it('ratio 0 resolves to the normal resolved cannon', () => {
    const m = new Match('m', 'none', pack);
    const p = resolveCannonShotProfile(m.runtime.systems, cannon(), 0);
    expect(p.chargeRatio).toBe(0);
    expect(p.damage).toBe(12);
    expect(p.splashRadius).toBe(3.4);
    expect(p.recoilImpulse).toBe(10.5);
    expect(p.knockbackMax).toBe(8);
    expect(p.knockbackMin).toBe(1.5);
    expect(p.knockbackVertical).toBe(2.5);
    expect(p.visualScale).toBe(1);
  });

  it('full charge clamps to jackpot-like defaults', () => {
    const m = new Match('m', 'none', pack);
    const p = resolveCannonShotProfile(m.runtime.systems, cannon(), 5);
    expect(p.chargeRatio).toBe(1);
    expect(p.damage).toBeCloseTo(60, 6);
    expect(p.splashRadius).toBeCloseTo(9, 6);
    expect(p.recoilImpulse).toBeCloseTo(17, 6);
    expect(p.knockbackMax).toBeCloseTo(12, 6);
    expect(p.knockbackMin).toBeCloseTo(2.5, 6);
    expect(p.knockbackVertical).toBeCloseTo(4, 6);
    expect(p.visualScale).toBeCloseTo(1.8, 6);
  });

  it('partial charge scales linearly at 50%', () => {
    const m = new Match('m', 'none', pack);
    const p = resolveCannonShotProfile(m.runtime.systems, cannon(), 0.5);
    expect(p.damage).toBeCloseTo(36, 6);
    expect(p.splashRadius).toBeCloseTo(6.2, 6);
    expect(p.recoilImpulse).toBeCloseTo(13.75, 6);
    expect(p.knockbackMax).toBeCloseTo(10, 6);
    expect(p.knockbackMin).toBeCloseTo(2, 6);
    expect(p.knockbackVertical).toBeCloseTo(3.25, 6);
    expect(p.visualScale).toBeCloseTo(1.4, 6);
  });

  it('cannon modifiers resolve first and apply to normal and charged shots', () => {
    const m = new Match('mod', 'none', pack);
    m.runtime.rules.addModifier(
      statModifier('test.recoil', 'weapon.cannonRecoilImpulse', 'multiply', 1.5, { source: 'test' }),
    );
    const normal = resolveCannonShotProfile(m.runtime.systems, cannon(), 0);
    const full = resolveCannonShotProfile(m.runtime.systems, cannon(), 1);
    expect(normal.recoilImpulse).toBeCloseTo(10.5 * 1.5, 6);
    expect(full.recoilImpulse).toBeCloseTo(10.5 * 1.5 * 1.619047619, 6);
  });

  it('a normal cannon shell carries ratio 0 and its combat payload', () => {
    const m = new Match('normal-shell', 'none', pack);
    m.runtime.systems.capabilities.revoke('cannon.charge');
    m.applyGunnerAction('secondaryPressed', 1);
    m.step(DT);
    m.takeEvents();
    expect(m.state.shells.length).toBe(1);
    expect(m.state.shells[0].kind).toBe('cannon');
    expect(m.state.shells[0].chargeRatio).toBe(0);
    expect(m.state.shells[0].combat?.damage).toBe(12);
  });

  it('Double Barrel burst shells inherit the charge ratio and payload', () => {
    const m = new Match('burst', 'doubleBarrel', pack);
    m.runtime.systems.capabilities.grant('cannon.charge', 'test');
    m.applyGunnerAction('secondaryPressed', 1);
    m.step(DT);
    for (let i = 0; i < 40; i++) m.step(DT); // hold to full
    m.applyGunnerAction('secondaryReleased', 2);
    m.step(DT);
    for (let i = 0; i < 8 && m.state.shells.length < 2; i++) m.step(DT);
    expect(m.state.shells.length).toBe(2);
    for (const sh of m.state.shells) {
      expect(sh.chargeRatio).toBe(1);
      expect(sh.combat?.damage).toBe(60);
      expect(sh.visualScale).toBeCloseTo(1.8, 6);
    }
  });
});
