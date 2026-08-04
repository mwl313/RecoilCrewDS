import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ContentLoader, loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';
import type { ContentPack } from '../../src/shared/content/contentPack';
import { selectArenaSession } from '../../src/shared/mapgen/arenaSession';
import { resolveMapBundle } from '../../src/shared/mapgen/profiles';
import { HordeFlowField } from '../../src/shared/navigation/hordeFlowField';
import { Match } from '../../src/shared/sim/match';
import { TerrainFlag } from '../../src/shared/mapgen/terrainFlags';

const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..', 'content');
const pack = loadContentPackFromFilesystem(CONTENT_ROOT);

function sessionFor(mapId: string, roomCode: string) {
  const bundle = resolveMapBundle(pack, mapId);
  const fallbackBundle = bundle.map.fallbackMapId ? resolveMapBundle(pack, bundle.map.fallbackMapId) : bundle;
  return selectArenaSession({ roomCode, matchIndex: 0, bundle, fallbackBundle });
}

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

describe('HordeFlowField (M7)', () => {
  it('rebuilds from the tank and exposes reachable flow directions', () => {
    const session = sessionFor('map.dramaticHighlands', 'FLOW001');
    const director = pack.getHordeDirector('horde.mainStage');
    const field = new HordeFlowField(session.world, pack.getHordeNavigationPolicy(director.navigationPolicyId));
    const tank = session.world.spawnPoints[0];
    expect(field.update(tank.x, tank.z, 0)).toBe(true);
    expect(field.costAt(tank.x, tank.z)).toBe(0);
    const dir = field.direction(tank.x + 10, tank.z + 10);
    expect(dir).not.toBeNull();
    expect(Number.isFinite(dir!.x) && Number.isFinite(dir!.z)).toBe(true);
  });

  it('marks cliff walls impassable (infinite cost)', () => {
    const session = sessionFor('map.dramaticHighlands', 'FLOW002');
    const director = pack.getHordeDirector('horde.mainStage');
    const field = new HordeFlowField(session.world, pack.getHordeNavigationPolicy(director.navigationPolicyId));
    const tank = session.world.spawnPoints[0];
    field.update(tank.x, tank.z, 0);
    const hf = session.arena.heightfield;
    const flags = session.arena.terrainFlags;
    const isWall = (x: number, z: number) => {
      const ox = session.arena.originX;
      const oz = session.arena.originZ;
      const gx = Math.max(0, Math.min(hf.samplesX - 1, Math.round(hf.localX(x - ox) / hf.cellSize)));
      const gz = Math.max(0, Math.min(hf.samplesZ - 1, Math.round(hf.localZ(z - oz) / hf.cellSize)));
      return (flags[gz * hf.samplesX + gx] & TerrainFlag.CliffWall) !== 0;
    };
    let foundWall = false;
    for (let x = -180; x <= 180 && !foundWall; x += 4) {
      for (let z = -180; z <= 180 && !foundWall; z += 4) {
        if (isWall(x, z)) {
          expect(field.costAt(x, z)).toBe(Infinity);
          expect(field.direction(x, z)).toBeNull();
          foundWall = true;
        }
      }
    }
    expect(foundWall).toBe(true);
  });

  it('is deterministic and rate-limited', () => {
    const session = sessionFor('map.arena400Primary', 'FLOW003');
    const director = pack.getHordeDirector('horde.mainStage');
    const policy = pack.getHordeNavigationPolicy(director.navigationPolicyId);
    const a = new HordeFlowField(session.world, policy);
    const b = new HordeFlowField(session.world, policy);
    a.update(0, 0, 0);
    b.update(0, 0, 0);
    expect(a.direction(20, 20)).toEqual(b.direction(20, 20));
    // Cooldown blocks an immediate refresh...
    expect(a.update(0, 0, 0.01)).toBe(false);
    // ...but crossing into a new tank cell forces one.
    expect(a.update(12, 0, 0.01)).toBe(true);
  });

  it('horde fodder follows the flow field and resolves its own definition', () => {
    const enforced = packWithStageEnforced();
    const bundle = resolveMapBundle(enforced, 'map.arena400Primary');
    const fallbackBundle = bundle.map.fallbackMapId ? resolveMapBundle(enforced, bundle.map.fallbackMapId) : bundle;
    const session = selectArenaSession({ roomCode: 'FLOW004', matchIndex: 0, bundle, fallbackBundle });
    const m = new Match('flow-integration', 'none', enforced, session.world, 'mode.demoScoreAttack');
    const tank = m.state.tank;
    const def = m.runtime.rules.enemies.get('enemy.scrapBugHorde')!;
    const e = m.runtime.systems.enemies.spawnEnemyDef(def, tank.x + 80, tank.z + 30)!;
    const before = Math.hypot(e.x - tank.x, e.z - tank.z);
    for (let i = 0; i < 30 * 8; i++) {
      m.step(1 / 30);
      m.runtime.eventBus.drain();
      m.state.tank.integrity = m.runtime.cfg.tank.maxIntegrity;
      m.state.tank.deadT = 0;
    }
    const after = Math.hypot(e.x - tank.x, e.z - tank.z);
    expect(after).toBeLessThan(before);
    expect(m.runtime.systems.enemies.defFor(e).id).toBe('enemy.scrapBugHorde');
  });
});
