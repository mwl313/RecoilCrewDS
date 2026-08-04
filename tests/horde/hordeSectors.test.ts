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
import {
  HordeReplicationClient,
  HordeReplicationTracker,
} from '../../src/shared/net/horde/hordeReplication';

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
  const session = selectArenaSession({ roomCode: 'SECTOR1', matchIndex: 0, bundle, fallbackBundle });
  return new Match('sector-match', 'none', enforced, session.world, 'mode.demoScoreAttack');
}

function ownership(partial: Partial<SpawnOwnership> = {}): SpawnOwnership {
  return {
    populationClass: 'ambient',
    waveId: null,
    leaderId: null,
    packInstanceId: 1,
    spawnAnchorId: null,
    purgeOnLeaderDeath: false,
    ...partial,
  };
}

describe('far-horde sector aggregation (M10)', () => {
  it('aggregates eligible tier-3 enemies preserving count, threat, and ownership', () => {
    const m = makeMatch();
    const systems = m.runtime.systems;
    const def = m.runtime.rules.enemies.get('enemy.scrapBugHorde')!;
    const tx = m.state.tank.x;
    const tz = m.state.tank.z;
    for (let i = 0; i < 8; i++) {
      systems.enemies.spawnEnemyDef(def, tx + 200, tz + (i - 4) * 2);
    }
    const before = m.state.enemies.length;
    systems.hordeSectors.update(1, tx, tz);
    expect(m.state.enemies.length).toBe(before - 8);
    expect(systems.hordeSectors.sectors.size).toBeGreaterThanOrEqual(1);
    const sectors = [...systems.hordeSectors.sectors.values()];
    expect(sectors.reduce((sum, s) => sum + s.count, 0)).toBe(8);
    expect(sectors.reduce((sum, s) => sum + s.threat, 0)).toBe(8);
    expect(sectors.every((s) => s.populationClass === 'ambient' && s.waveId === null)).toBe(true);
    const tally = systems.hordeSectors.tally();
    expect(tally.entities).toBe(8);
    expect(tally.threat).toBe(8);
  });

  it('aggregation grants no score, kills, or drops', () => {
    const m = makeMatch();
    const systems = m.runtime.systems;
    const def = m.runtime.rules.enemies.get('enemy.scrapBugHorde')!;
    const tx = m.state.tank.x;
    const tz = m.state.tank.z;
    for (let i = 0; i < 4; i++) systems.enemies.spawnEnemyDef(def, tx + 200, tz + i);
    const scoreBefore = m.state.stats.score;
    const killsBefore = m.state.stats.kills;
    systems.hordeSectors.update(1, tx, tz);
    m.step(1 / 30);
    m.runtime.eventBus.drain();
    expect(m.state.stats.score).toBe(scoreBefore);
    expect(m.state.stats.kills).toBe(killsBefore);
    expect(m.takeEvents().filter((e) => e.type === 'kill').length).toBe(0);
  });

  it('materializes sectors before they enter interaction range', () => {
    const m = makeMatch();
    const systems = m.runtime.systems;
    const def = m.runtime.rules.enemies.get('enemy.scrapBugHorde')!;
    const tx = m.state.tank.x;
    const tz = m.state.tank.z;
    systems.enemies.spawnEnemyDef(def, tx + 200, tz);
    systems.hordeSectors.update(1, tx, tz);
    const sector = [...systems.hordeSectors.sectors.values()][0];
    // Tank approaches just outside tier2Enter+10 (155 m) -> not materialized.
    systems.hordeSectors.materialize(sector.centerX - 170, sector.centerZ);
    expect(systems.hordeSectors.sectors.size).toBe(1);
    // Inside the materialization band -> enemies re-enter tier 2 as individuals.
    systems.hordeSectors.materialize(sector.centerX - 100, sector.centerZ);
    expect(systems.hordeSectors.sectors.size).toBe(0);
    const respawned = m.state.enemies.filter((e) => e.ownership?.packInstanceId === sector.sectorId);
    expect(respawned.length).toBe(1);
    expect(respawned[0].ownership?.populationClass).toBe('ambient');
  });

  it('purges wave-owned sectors on leader death while ambient sectors survive', () => {
    const m = makeMatch();
    const systems = m.runtime.systems;
    const def = m.runtime.rules.enemies.get('enemy.scrapBugHorde')!;
    const tx = m.state.tank.x;
    const tz = m.state.tank.z;
    const waveOwnership = ownership({ populationClass: 'wave', waveId: 5, purgeOnLeaderDeath: true });
    for (let i = 0; i < 6; i++) {
      systems.enemies.spawnEnemyDef(def, tx + 200, tz + i, waveOwnership);
    }
    systems.enemies.spawnEnemyDef(def, tx + 220, tz);
    systems.hordeSectors.update(1, tx, tz);
    expect(systems.hordeSectors.sectors.size).toBeGreaterThanOrEqual(1);
    const removed = systems.hordeSectors.purgeWave(5);
    expect(removed).toBe(6);
    expect([...systems.hordeSectors.sectors.values()].every((s) => s.waveId !== 5)).toBe(true);
  });

  it('replicates sector state and the client stores it', () => {
    const m = makeMatch();
    const systems = m.runtime.systems;
    const def = m.runtime.rules.enemies.get('enemy.scrapBugHorde')!;
    const tx = m.state.tank.x;
    const tz = m.state.tank.z;
    systems.enemies.spawnEnemyDef(def, tx + 200, tz);
    systems.hordeSectors.update(1, tx, tz);
    const policy = m.runtime.rules.hordeDirector ? systems.horde!.resolved.policies.replication : null;
    const tracker = new HordeReplicationTracker(policy!);
    const block = tracker.track([], 0, null, () => 3, [...systems.hordeSectors.sectors.values()]);
    expect(block.sectors.length).toBeGreaterThan(0);
    const client = new HordeReplicationClient(() => 0);
    client.apply({ ...block, materialize: [], despawn: [], death: [], near: [], mid: [], far: [] }, 0);
    expect(client.sectors.size).toBe(1);
  });
});
