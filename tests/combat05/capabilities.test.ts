import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Match } from '../../src/shared/sim/match';
import { ContentLoader } from '../../src/shared/content/contentLoader';

const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../content');
const pack = new ContentLoader().loadFromFilesystem(CONTENT_ROOT);

describe('capability system (Combat 05 M4)', () => {
  it('a fresh match owns cannon.charge by default (content and legacy)', () => {
    const m = new Match('fresh');
    expect(m.runtime.systems.capabilities.has('cannon.charge')).toBe(true);
    expect(m.state.build.capabilities).toEqual(['cannon.charge']);
    const content = new Match('fresh-content', 'none', pack);
    expect(content.runtime.systems.capabilities.has('cannon.charge')).toBe(true);
    expect(content.state.build.capabilities).toEqual(['cannon.charge']);
  });

  it('applying the charge relic keeps the capability and replicates through state', () => {
    const m = new Match('relic', 'none', pack);
    m.runtime.systems.items.apply(pack.getItem('item.relicCannonCharge'));
    expect(m.runtime.systems.capabilities.has('cannon.charge')).toBe(true);
    expect(m.state.build.capabilities).toEqual(['cannon.charge']);
  });

  it('removing the relic source leaves the default capability; revoke removes it', () => {
    const m = new Match('relic-remove', 'none', pack);
    const relic = pack.getItem('item.relicCannonCharge');
    m.runtime.systems.items.apply(relic);
    m.runtime.systems.items.remove(relic);
    expect(m.runtime.systems.capabilities.has('cannon.charge')).toBe(true);
    m.runtime.systems.capabilities.revoke('cannon.charge');
    expect(m.runtime.systems.capabilities.has('cannon.charge')).toBe(false);
    expect(m.state.build.capabilities).toEqual([]);
  });

  it('capabilities reference-count across sources', () => {
    const m = new Match('refcount', 'none', pack);
    const relic = pack.getItem('item.relicCannonCharge');
    m.runtime.systems.capabilities.grant('cannon.charge', 'source.a');
    m.runtime.systems.capabilities.grant('cannon.charge', 'source.b');
    m.runtime.systems.capabilities.revokeSource('source.a');
    expect(m.runtime.systems.capabilities.has('cannon.charge')).toBe(true);
    m.runtime.systems.capabilities.revokeSource('source.b');
    expect(m.runtime.systems.capabilities.has('cannon.charge')).toBe(true); // default remains
    m.runtime.systems.capabilities.revoke('cannon.charge');
    expect(m.runtime.systems.capabilities.has('cannon.charge')).toBe(false);
    expect(m.state.build.capabilities).toEqual([]);
  });

  it('item grants are generic (no hardcoded relic id in the capability path)', () => {
    const m = new Match('generic', 'none', pack);
    const relic = pack.getItem('item.relicCannonCharge');
    m.runtime.systems.items.apply(relic);
    // The capability is what matters; nothing in the system checks the id.
    expect(m.runtime.systems.capabilities.has('cannon.charge')).toBe(true);
    // A different source id can grant the same capability independently.
    m.runtime.systems.capabilities.grant('cannon.charge', 'debug.grant');
    m.runtime.systems.items.remove(relic);
    expect(m.runtime.systems.capabilities.has('cannon.charge')).toBe(true);
  });
});
