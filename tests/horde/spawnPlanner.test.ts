import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ContentLoader, loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';
import type { ContentPack } from '../../src/shared/content/contentPack';
import { selectArenaSession, type ArenaSessionResult } from '../../src/shared/mapgen/arenaSession';
import { resolveMapBundle } from '../../src/shared/mapgen/profiles';
import { Match } from '../../src/shared/sim/match';
import { buildSpawnAnchors, type SpawnAnchor } from '../../src/shared/horde/spawnAnchors';
import { SpawnPlanner } from '../../src/shared/horde/spawnPlanner';
import { hash32 } from '../../src/shared/mapgen/seed';

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

function sessionFor(mapId: string, roomCode: string): ArenaSessionResult {
  const bundle = resolveMapBundle(pack, mapId);
  const fallbackBundle = bundle.map.fallbackMapId ? resolveMapBundle(pack, bundle.map.fallbackMapId) : bundle;
  return selectArenaSession({ roomCode, matchIndex: 0, bundle, fallbackBundle });
}

function matchFor(session: ArenaSessionResult, matchId: string): Match {
  return new Match(matchId, 'none', pack, session.world, 'mode.demoScoreAttack');
}

describe('spawn anchors (M4)', () => {
  it('derives deterministic terrain-aware anchors from generated arena metadata', () => {
    const session = sessionFor('map.arena400Primary', 'ANCHOR01');
    const anchors = buildSpawnAnchors(session.world).anchors;
    expect(anchors.length).toBeGreaterThan(0);
    expect(anchors.every((a) => a.id && Number.isFinite(a.x) && Number.isFinite(a.z))).toBe(true);
    expect(anchors.some((a) => a.type === 'perimeter')).toBe(true);
    expect(anchors.some((a) => a.type === 'accessRoad')).toBe(true);
    // Safe/recovery zones must never become anchors (the planner also
    // rejects them at plan time).
    for (const a of anchors) {
      expect(['spawnSafe', 'recovery']).not.toContain(a.terrainTag);
    }
    // Same arena -> same anchor set (deterministic).
    const again = sessionFor('map.arena400Primary', 'ANCHOR01');
    expect(buildSpawnAnchors(again.world).anchors.map((a) => a.id)).toEqual(anchors.map((a) => a.id));
  });

  it('produces cliff top/bottom anchors on dramatic highlands', () => {
    const session = sessionFor('map.dramaticHighlands', 'ANCHOR02');
    const anchors = buildSpawnAnchors(session.world).anchors;
    const cliff = anchors.filter((a) => a.type === 'cliffTop' || a.type === 'cliffBottom');
    // Access-carved cliffs should produce at least one top/bottom pair.
    expect(cliff.length).toBeGreaterThanOrEqual(2);
    for (const a of cliff) {
      expect(a.reachable).toBe(true);
    }
  });
});

describe('SpawnPlanner (M4)', () => {
  it('produces identical plans for the same seed and authoritative state', () => {
    const a = matchFor(sessionFor('map.arena400Primary', 'PLAN001'), 'plan-match-a');
    const b = matchFor(sessionFor('map.arena400Primary', 'PLAN001'), 'plan-match-a');
    const packA = a.runtime.systems.horde!.resolved.packs.get('pack.wanderingCluster')!;
    const packB = b.runtime.systems.horde!.resolved.packs.get('pack.wanderingCluster')!;
    const planA = a.runtime.systems.spawnPlanner.plan(packA, 'ambient');
    const planB = b.runtime.systems.spawnPlanner.plan(packB, 'ambient');
    expect(planA).not.toBeNull();
    expect(planB).not.toBeNull();
    expect(planA!.anchor.id).toBe(planB!.anchor.id);
    expect(planA!.positions).toEqual(planB!.positions);
    expect(planA!.seed).toBe(planB!.seed);
  });

  it('marks the chosen anchor used so it is not immediately re-chosen', () => {
    const m = matchFor(sessionFor('map.arena400Primary', 'PLAN002'), 'plan-match-b');
    const horde = m.runtime.systems.horde!;
    const packA = horde.resolved.packs.get('pack.wanderingCluster')!;
    const first = m.runtime.systems.spawnPlanner.plan(packA, 'ambient');
    expect(first).not.toBeNull();
    expect(first!.anchor.lastUsedAt).toBe(0);
    const second = m.runtime.systems.spawnPlanner.plan(packA, 'ambient');
    if (second) {
      expect(second.anchor.id).not.toBe(first!.anchor.id);
    }
  });

  it('rejects anchors inside the visible near field, safe zones, and small capacity', () => {
    const m = matchFor(sessionFor('map.arena400Primary', 'PLAN003'), 'plan-match-c');
    const packA = m.runtime.systems.horde!.resolved.packs.get('pack.wanderingCluster')!;
    const ctx = m.runtime.systems;
    const near: SpawnAnchor = {
      id: 'anchor.near',
      type: 'perimeter',
      x: ctx.state.tank.x + 5,
      z: ctx.state.tank.z,
      regionId: null,
      terrainTag: 'flat',
      tags: ['perimeter'],
      capacity: 20,
      minTankDistance: 0,
      maxTankDistance: 200,
      cameraExposure: 0,
      lastUsedAt: -Infinity,
      reachable: true,
    };
    const safe: SpawnAnchor = {
      ...near,
      id: 'anchor.safe',
      terrainTag: 'recovery',
      x: ctx.state.tank.x + 40,
      tags: ['recovery'],
    };
    const small: SpawnAnchor = {
      ...near,
      id: 'anchor.small',
      capacity: 1,
      x: ctx.state.tank.x + 40,
    };
    const planner = new SpawnPlanner(ctx, hash32('test'), [near, safe, small]);
    expect(planner.plan(packA, 'ambient')).toBeNull();
  });

  it('uses the data-driven preferred tank distance', () => {
    const m = matchFor(sessionFor('map.arena400Primary', 'PLAN055'), 'plan-match-55');
    const packA = m.runtime.systems.horde!.resolved.packs.get('pack.wanderingCluster')!;
    const tank = m.state.tank;
    const makeAnchor = (id: string, distance: number): SpawnAnchor => ({
      id,
      type: 'regional',
      x: tank.x + distance,
      z: tank.z,
      regionId: null,
      terrainTag: 'flat',
      tags: ['farming'],
      capacity: 20,
      minTankDistance: 0,
      maxTankDistance: 200,
      cameraExposure: 0,
      lastUsedAt: -Infinity,
      reachable: true,
    });
    const planner = new SpawnPlanner(m.runtime.systems, hash32('preferred-55'), [makeAnchor('55m', 55), makeAnchor('70m', 70)]);
    expect(m.runtime.systems.horde!.resolved.policies.anchor.preferredTankDistance).toBe(55);
    expect(planner.plan(packA, 'ambient')?.anchor.id).toBe('55m');
  });

  it('farming spawns through the HordeDirector carry anchor ownership', () => {
    const enforced = packWithStageEnforced();
    const bundle = resolveMapBundle(enforced, 'map.arena400Primary');
    const fallbackBundle = bundle.map.fallbackMapId ? resolveMapBundle(enforced, bundle.map.fallbackMapId) : bundle;
    const session = selectArenaSession({ roomCode: 'PLAN004', matchIndex: 0, bundle, fallbackBundle });
    const m = new Match('plan-match-d', 'none', enforced, session.world, 'mode.demoScoreAttack');
    for (let i = 0; i < 300; i++) {
      m.step(1 / 30);
      m.runtime.eventBus.drain();
      m.state.tank.integrity = m.runtime.cfg.tank.maxIntegrity;
      m.state.tank.deadT = 0;
    }
    const horde = m.runtime.systems.horde!;
    expect(horde.lastAnchor).not.toBeNull();
    const ambient = m.state.enemies.filter((e) => e.ownership?.populationClass === 'ambient');
    expect(ambient.length).toBeGreaterThan(0);
    expect(ambient.every((e) => e.ownership?.spawnAnchorId !== null)).toBe(true);
  });
});
