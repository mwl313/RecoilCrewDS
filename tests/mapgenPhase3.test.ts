import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';
import {
  metadataFromArena,
  reconstructArenaSession,
  resolveClientMapBundle,
  selectArenaSession,
  selectArenaSessionFromPack,
  type ArenaMetadata,
} from '../src/shared/mapgen/arenaSession';
import { resolveMapBundle } from '../src/shared/mapgen/profiles';
import { ARENA_GENERATOR_VERSION } from '../src/shared/mapgen/seed';
import { computeArenaChecksum } from '../src/shared/mapgen/terrainFlags';
import { createGeneratedArenaWorld, createStaticArenaWorld } from '../src/shared/sim/arenaWorld';
import { Match } from '../src/shared/sim/match';
import { RoomManager, type ContentMetadata, type SocketLike } from '../src/server/room';
import {
  groundHeightAt as staticGroundHeightAt,
  nearestSpawn as staticNearestSpawn,
} from '../src/shared/arena';

const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../content');
const pack = loadContentPackFromFilesystem(CONTENT_ROOT);
const bundle = resolveMapBundle(pack, 'map.arena400Primary');
const fallbackBundle = resolveMapBundle(pack, bundle.map.fallbackMapId!);

function selectRoom(roomCode: string, matchIndex = 0) {
  return selectArenaSession({ roomCode, matchIndex, bundle, fallbackBundle });
}

describe('arena session selection', () => {
  it('is deterministic and exposes all required metadata', () => {
    const a = selectRoom('PHASE3A');
    const b = selectRoom('PHASE3A');
    expect(a.metadata).toEqual(b.metadata);
    expect(a.arena.heightfield.checksum()).toBe(b.arena.heightfield.checksum());
    const meta: ArenaMetadata = a.metadata;
    expect(meta.mapProfileId).toBe('map.arena400Primary');
    expect(meta.arenaBaseSeed).toBeGreaterThan(0);
    expect(meta.arenaCandidateSeed).toBeGreaterThan(0);
    expect(meta.arenaAttempt).toBe(0);
    expect(meta.arenaGeneratorVersion).toBe(ARENA_GENERATOR_VERSION);
    expect(meta.arenaChecksum).toBeGreaterThan(0);
    expect(meta.arenaFallbackUsed).toBe(false);
  });

  it('rematch (matchIndex+1) rerolls the map seed and checksum', () => {
    const first = selectRoom('PHASE3B', 0);
    const second = selectRoom('PHASE3B', 1);
    expect(second.metadata.arenaBaseSeed).not.toBe(first.metadata.arenaBaseSeed);
    expect(second.metadata.arenaChecksum).not.toBe(first.metadata.arenaChecksum);
  });

  it('two rooms produce different maps (no shared arena state)', () => {
    const a = selectRoom('ROOMALPHA');
    const b = selectRoom('ROOMBETA');
    expect(a.metadata.arenaChecksum).not.toBe(b.metadata.arenaChecksum);
    expect(a.world).not.toBe(b.world);
    expect(a.world.obstacles).not.toBe(b.world.obstacles);
  });

  it('fallback selection reports fallback metadata and keeps fixed props', () => {
    const impossibleValidation = { ...bundle.validationProfile, heightRange: { min: 100, max: 200 } };
    const impossibleTerrain = {
      ...bundle.terrainProfile,
      slopeCorrectionIterations: 0,
      smoothingPasses: 0,
      features: {
        basin: { count: 1, minSeparation: 60, radius: { min: 30, max: 40 }, depth: { min: 2, max: 3 }, falloff: 0.3 },
        ridge: { count: 1, minSeparation: 70, length: { min: 100, max: 140 }, width: { min: 20, max: 26 }, height: { min: 3, max: 4 }, falloff: 0.3 },
        plateau: { count: 1, minSeparation: 60, radius: { min: 20, max: 30 }, height: { min: 2, max: 3 }, falloff: 0.3 },
        valley: { count: 1, minSeparation: 70, length: { min: 100, max: 140 }, width: { min: 20, max: 26 }, depth: { min: 2, max: 3 }, falloff: 0.3 },
        hill: { count: 1, minSeparation: 30, radius: { min: 10, max: 16 }, height: { min: 1, max: 2 }, falloff: 0.3 },
      },
    };
    const session = selectArenaSession({
      roomCode: 'FORCEFB',
      matchIndex: 0,
      bundle: { ...bundle, terrainProfile: impossibleTerrain, validationProfile: impossibleValidation },
      fallbackBundle,
    });
    expect(session.metadata.arenaFallbackUsed).toBe(true);
    expect(session.metadata.mapProfileId).toBe('map.fallbackLegacy');
    // The fixed prop set remains playable (obstacles/barrels present).
    expect(session.world.obstacles.length).toBeGreaterThan(20);
    expect(session.world.barrels.length).toBeGreaterThan(10);
  });
});

describe('client reconstruction + checksum gate', () => {
  it('reconstructs the exact server candidate and passes the gate', () => {
    const session = selectRoom('PHASE3C');
    const { bundle: cb, fallbackBundle: fb } = resolveClientMapBundle('map.arena400Primary');
    const result = reconstructArenaSession(session.metadata, cb, fb);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(computeArenaChecksum(result.session.arena)).toBe(session.metadata.arenaChecksum);
      expect(result.session.metadata).toEqual(session.metadata);
    }
  });

  it('rejects corrupted checksums, version mismatch, and profile mismatch', () => {
    const session = selectRoom('PHASE3D');
    const { bundle: cb, fallbackBundle: fb } = resolveClientMapBundle('map.arena400Primary');
    const corrupt: ArenaMetadata = { ...session.metadata, arenaChecksum: session.metadata.arenaChecksum + 1 };
    expect(reconstructArenaSession(corrupt, cb, fb)).toEqual({ ok: false, reason: 'checksum' });
    const badVersion: ArenaMetadata = { ...session.metadata, arenaGeneratorVersion: 999 };
    expect(reconstructArenaSession(badVersion, cb, fb)).toEqual({ ok: false, reason: 'version' });
    const badProfile: ArenaMetadata = { ...session.metadata, mapProfileId: 'map.other' };
    expect(reconstructArenaSession(badProfile, cb, fb)).toEqual({ ok: false, reason: 'profile' });
  });

  it('never continues with mismatched geometry (gate blocks world creation)', () => {
    const session = selectRoom('PHASE3E');
    const { bundle: cb, fallbackBundle: fb } = resolveClientMapBundle('map.arena400Primary');
    const corrupt: ArenaMetadata = { ...session.metadata, arenaChecksum: 1 };
    const result = reconstructArenaSession(corrupt, cb, fb);
    expect(result.ok).toBe(false);
  });
});

describe('world queries and match integration', () => {
  it('generated world queries agree with the authoritative heightfield', () => {
    const session = selectRoom('PHASE3F');
    const hf = session.arena.heightfield;
    for (const [x, z] of [[200, 200], [50, 300], [380, 20], [100, 100]] as const) {
      const worldX = x - 200;
      const worldZ = z - 200;
      expect(session.world.groundHeightAt(worldX, worldZ)).toBeCloseTo(hf.heightAt(x, z), 5);
    }
  });

  it('static world matches the legacy arena queries', () => {
    const world = createStaticArenaWorld();
    for (const [x, z] of [[-6, 10], [0, 0], [28, 8], [30, -26]] as const) {
      expect(world.groundHeightAt(x, z)).toBe(staticGroundHeightAt(x, z));
    }
    expect(world.nearestSpawn(30, 30)).toEqual(staticNearestSpawn(30, 30));
  });

  it('a Match runs on a generated world (tank spawns on the arena ground)', () => {
    const session = selectRoom('PHASE3G');
    const match = new Match('phase3-match', 'none', pack, session.world);
    const spawn = session.world.spawnPoints[0];
    expect(match.state.tank.x).toBeCloseTo(spawn.x, 4);
    expect(match.state.tank.y).toBeCloseTo(session.world.groundHeightAt(spawn.x, spawn.z), 4);
    match.setDriverInput({ throttle: 1, steer: 0, dashPressed: false, jumpPressed: false });
    match.step(1 / 30);
    expect(match.state.tank.z).not.toBeCloseTo(spawn.z, 4);
    expect(match.runtime.world).toBe(session.world);
  });

  it('metadataFromArena round-trips through reconstruction', () => {
    const session = selectRoom('PHASE3H');
    const meta = metadataFromArena(session.arena);
    expect(meta).toEqual(session.metadata);
    expect(createGeneratedArenaWorld(session.arena, meta).groundHeightAt(0, 0)).toBeCloseTo(
      session.world.groundHeightAt(0, 0),
      5,
    );
  });
});

describe('server room arena lifecycle', () => {
  class FakeSocket implements SocketLike {
    sent: Record<string, unknown>[] = [];
    send(msg: unknown) {
      this.sent.push(msg as Record<string, unknown>);
    }
    close() {}
    last(t: string) {
      return [...this.sent].reverse().find((m) => m.t === t);
    }
  }

  function startCrew(manager: RoomManager) {
    const a = new FakeSocket();
    const b = new FakeSocket();
    manager.handle(a, { t: 'create' });
    const code = a.last('created')!.code as string;
    manager.handle(b, { t: 'join', code });
    manager.handle(a, { t: 'ready', ready: true });
    manager.handle(b, { t: 'ready', ready: true });
    for (let i = 0; i < 105; i++) manager.tick(1 / 30);
    return { a, b, code, room: manager.getClient(a)!.room! };
  }

  const CONTENT_META: ContentMetadata = {
    packId: pack.id,
    version: pack.version,
    hash: pack.hash,
    modeId: pack.modeId,
  };

  it('publishes arena metadata on start and every snapshot', () => {
    const manager = new RoomManager({ content: CONTENT_META, pack });
    const { a, room } = startCrew(manager);
    const start = a.last('start') as { arena?: ArenaMetadata };
    expect(start.arena?.mapProfileId).toBe('map.urban400Prototype');
    expect(typeof start.arena?.arenaChecksum).toBe('number');
    const snapshot = a.last('snapshot') as { arena?: ArenaMetadata };
    expect(snapshot.arena).toEqual(start.arena);
    expect(room.arenaSession?.metadata.arenaBaseSeed).toBe(start.arena?.arenaBaseSeed);
  });

  it('two rooms hold independent generated arenas', () => {
    const manager = new RoomManager({ content: CONTENT_META, pack });
    const crewA = startCrew(manager);
    const crewB = startCrew(manager);
    const metaA = crewA.room.arenaSession!.metadata;
    const metaB = crewB.room.arenaSession!.metadata;
    expect(metaA.arenaChecksum).not.toBe(metaB.arenaChecksum);
    expect(crewA.room.match!.runtime.world).not.toBe(crewB.room.match!.runtime.world);
  });

  it('rematch rerolls the arena; reconnect keeps the same arena', () => {
    const manager = new RoomManager({ content: CONTENT_META, pack });
    const { a, b, code, room } = startCrew(manager);
    const first = room.arenaSession!.metadata;
    // Play to results, return to the connected lobby, then ready a new round.
    for (let i = 0; i < 30 * 90; i++) manager.tick(1 / 30);
    expect(room.phase).toBe('results');
    manager.handle(a, { t: 'rematch', modifier: 'none' });
    expect(room.phase).toBe('lobby');
    manager.handle(a, { t: 'ready', ready: true });
    manager.handle(b, { t: 'ready', ready: true });
    for (let i = 0; i < 105; i++) manager.tick(1 / 30);
    expect(room.phase).toBe('running');
    const second = room.arenaSession!.metadata;
    expect(second.arenaBaseSeed).not.toBe(first.arenaBaseSeed);
    expect(second.arenaChecksum).not.toBe(first.arenaChecksum);

    // Reconnect mid-round: same metadata + same world.
    const sessionId = (b as unknown as { last(t: string): { sessionId: string } }).last('joined')!.sessionId;
    const b2 = new FakeSocket();
    manager.disconnect(manager.getClient(b)!);
    const rejoined = manager.rejoin(code, sessionId, b2);
    expect(rejoined).not.toBeNull();
    const joinedMsg = b2.last('joined') as { arena?: ArenaMetadata };
    expect(joinedMsg.arena).toEqual(second);
    expect(room.arenaSession!.metadata.arenaChecksum).toBe(second.arenaChecksum);
  });

  it('pack-less servers keep the legacy static path (no metadata)', () => {
    const manager = new RoomManager();
    const { a, room } = startCrew(manager);
    expect(room.arenaSession).toBeNull();
    expect((a.last('start') as { arena?: unknown }).arena).toBeUndefined();
    expect(room.match!.runtime.world.metadata).toBeNull();
  });
});
