import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ContentLoader, loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';
import type { ContentPack } from '../../src/shared/content/contentPack';
import { selectArenaSession } from '../../src/shared/mapgen/arenaSession';
import { resolveMapBundle } from '../../src/shared/mapgen/profiles';
import { Match } from '../../src/shared/sim/match';
import type { SpawnOwnership } from '../../src/shared/horde/spawnOwnership';

const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..', 'content');
const pack = loadContentPackFromFilesystem(CONTENT_ROOT);

function packWithStageEnforced(): ContentPack {
  const manifest = JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, 'manifest.json'), 'utf8'));
  const files: Record<string, unknown> = {};
  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, rel);
      else if (entry.name.endsWith('.json')) files[rel] = JSON.parse(fs.readFileSync(abs, 'utf8'));
    }
  };
  walk(CONTENT_ROOT, '');
  files['horde/director.json'] = { ...(files['horde/director.json'] as object), enforceStage: true };
  return new ContentLoader().loadFromRecords(manifest, files);
}

function makeMatch(): Match {
  const enforced = packWithStageEnforced();
  const bundle = resolveMapBundle(enforced, 'map.arena400Primary');
  const fallbackBundle = bundle.map.fallbackMapId ? resolveMapBundle(enforced, bundle.map.fallbackMapId) : bundle;
  const session = selectArenaSession({ roomCode: 'LODTEST', matchIndex: 0, bundle, fallbackBundle });
  return new Match('lod-match', 'none', enforced, session.world, 'mode.demoScoreAttack');
}

const DT = 1 / 30;

describe('enemy simulation LOD (M8)', () => {
  it('uses hysteresis when demoting and promoting tiers', () => {
    const m = makeMatch();
    const systems = m.runtime.systems;
    const def = m.runtime.rules.enemies.get('enemy.scrapBugHorde')!;
    const e = systems.enemies.spawnEnemyDef(def, m.state.tank.x + 60, m.state.tank.z)!;
    // First assessment starts from tier 0 -> far distance demotes to 1.
    expect(systems.enemies.tierFor(e)).toBe(1);
    // Still tier 1 inside tier1Leave, and hysteresis keeps 1 above tier0Enter.
    e.x = m.state.tank.x + 45;
    expect(systems.enemies.tierFor(e)).toBe(1);
    e.x = m.state.tank.x + 40;
    expect(systems.enemies.tierFor(e)).toBe(0);
    // Deep demotion: 120 m -> tier 2; 170 m -> tier 3.
    e.x = m.state.tank.x + 120;
    expect(systems.enemies.tierFor(e)).toBe(1); // one demotion step per frame
    expect(systems.enemies.tierFor(e)).toBe(2);
    e.x = m.state.tank.x + 170;
    expect(systems.enemies.tierFor(e)).toBe(3);
  });

  it('preserves movement distance over real time at reduced update rates', () => {
    const m = makeMatch();
    const systems = m.runtime.systems;
    const def = m.runtime.rules.enemies.get('enemy.scrapBugHorde')!;
    const e = systems.enemies.spawnEnemyDef(def, m.state.tank.x + 130, m.state.tank.z)!;
    const before = Math.hypot(e.x - m.state.tank.x, e.z - m.state.tank.z);
    for (let i = 0; i < 30 * 6; i++) {
      m.step(DT);
      m.runtime.eventBus.drain();
      m.state.tank.integrity = m.runtime.cfg.tank.maxIntegrity;
      m.state.tank.deadT = 0;
    }
    const after = Math.hypot(e.x - m.state.tank.x, e.z - m.state.tank.z);
    // ~19 m expected at 3.2 m/s for 6 s; allow LOD stepping tolerance.
    expect(before - after).toBeGreaterThan(10);
    expect(after).toBeGreaterThan(0);
  });

  it('promotes telegraphing, boss, and knockback enemies to tier 0', () => {
    const m = makeMatch();
    const systems = m.runtime.systems;
    const def = m.runtime.rules.enemies.get('enemy.scrapBugHorde')!;
    const e = systems.enemies.spawnEnemyDef(def, m.state.tank.x + 170, m.state.tank.z)!;
    expect(systems.enemies.tierFor(e)).toBe(1);
    expect(systems.enemies.tierFor(e)).toBe(2);
    expect(systems.enemies.tierFor(e)).toBe(3);
    e.telegraph = 0.5;
    expect(systems.enemies.tierFor(e)).toBe(0);
    e.telegraph = 0;
    expect(systems.enemies.tierFor(e)).toBe(3);

    const bossOwnership: SpawnOwnership = {
      populationClass: 'boss',
      waveId: 1,
      leaderId: null,
      packInstanceId: 1,
      spawnAnchorId: null,
      purgeOnLeaderDeath: false,
    };
    const boss = systems.enemies.spawnEnemyDef(def, m.state.tank.x + 180, m.state.tank.z, bossOwnership)!;
    expect(systems.enemies.tierFor(boss)).toBe(0);

    const knocked = systems.enemies.spawnEnemyDef(def, m.state.tank.x + 160, m.state.tank.z)!;
    m.step(DT);
    m.runtime.eventBus.drain();
    knocked.lastImpulseT = m.state.time;
    knocked.impulseVx = 1;
    expect(systems.enemies.tierFor(knocked)).toBe(0);
  });

  it('legacy demo matches keep full-rate simulation (LOD disabled)', () => {
    const m = new Match('legacy-lod');
    const systems = m.runtime.systems;
    const def = m.runtime.rules.enemies.get('enemy.scrapBug')!;
    const e = systems.enemies.spawnEnemyDef(def, 120, 0)!;
    expect(systems.enemies.lodEnabled).toBe(false);
    expect(systems.enemies.tierFor(e)).toBe(0);
  });

  it('phase offsets spread tiered updates deterministically', () => {
    const m = makeMatch();
    const systems = m.runtime.systems;
    const def = m.runtime.rules.enemies.get('enemy.scrapBugHorde')!;
    const a = systems.enemies.spawnEnemyDef(def, m.state.tank.x + 100, m.state.tank.z)!;
    const b = systems.enemies.spawnEnemyDef(def, m.state.tank.x + 101, m.state.tank.z)!;
    const runtimes = (systems.enemies as unknown as { runtimes: Map<number, { phaseOffset: number; tier: number }> }).runtimes;
    expect(runtimes.get(a.id)!.phaseOffset).not.toBe(runtimes.get(b.id)!.phaseOffset);
    expect(runtimes.get(a.id)!.phaseOffset).toBeGreaterThanOrEqual(0);
    expect(runtimes.get(a.id)!.phaseOffset).toBeLessThan(1);
  });
});
