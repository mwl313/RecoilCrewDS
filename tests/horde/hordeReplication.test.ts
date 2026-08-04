import { describe, expect, it } from 'vitest';
import type { EnemyState } from '../../src/shared/types';
import {
  HordeReplicationClient,
  HordeReplicationTracker,
} from '../../src/shared/net/horde/hordeReplication';
import {
  dequantizeXZ,
  dequantizeYaw,
  encodeDelta,
  encodeMaterialize,
  flagsFor,
  presentationProfileIdForIndex,
  presentationProfileIndex,
  quantizeXZ,
  quantizeYaw,
  type HordeSnapshotBlock,
} from '../../src/shared/net/horde/hordeProtocol';
import { ENEMY_ANIMATION_PRESENTATION_PROFILE_ORDER } from '../../src/generated/enemyAnimationContent.generated';

function enemy(id: number, x: number, z: number, yaw: number, hp: number, alive = true): EnemyState {
  return {
    id,
    type: 'scrapBug',
    defId: 'enemy.scrapBug',
    x,
    y: 0,
    z,
    yaw,
    hp,
    maxHp: 10,
    state: 'hunt',
    stateT: 0,
    aimYaw: 0,
    speed: 0,
    alive,
    telegraph: 0,
    flash: 0,
    spawnT: 0,
    hitCd: 0,
  };
}

const POLICY = {
  id: 'horde.replicationPolicy.main',
  behaviors: [],
  nearHz: 15,
  midHz: 8,
  farHz: 2,
  sectorHz: 1.5,
};

describe('horde record codec', () => {
  it('round-trips quantized materialize and delta records', () => {
    const e = enemy(7, 12.34, -56.78, 1.2345, 7.3);
    const m = encodeMaterialize(e);
    expect(m[0]).toBe(7);
    expect(m[2]).toBe(quantizeXZ(12.34));
    expect(dequantizeXZ(m[2])).toBeCloseTo(12.3, 5);
    expect(dequantizeYaw(m[4])).toBeCloseTo(1.235, 3);
    const d = encodeDelta(e);
    expect(d[0]).toBe(7);
    expect(flagsFor(e)).toBe(1);
  });

  it('encodes and decodes the presentation profile index', () => {
    const legacy = enemy(7, 0, 0, 0, 10);
    expect(presentationProfileIndex(legacy)).toBe(0);
    const witch = { ...legacy, presentationProfileId: 'enemyPresentation.witch.common' };
    const idx = presentationProfileIndex(witch);
    expect(idx).toBeGreaterThan(0);
    expect(presentationProfileIdForIndex(idx)).toBe('enemyPresentation.witch.common');
    expect(presentationProfileIdForIndex(0)).toBeUndefined();
    const m = encodeMaterialize(witch);
    expect(m[8]).toBe(idx);
    expect(ENEMY_ANIMATION_PRESENTATION_PROFILE_ORDER).toContain('enemyPresentation.witch.common');
  });
});

describe('HordeReplicationTracker (server, M9)', () => {
  it('materializes new enemies and rate-limits tier deltas', () => {
    const tracker = new HordeReplicationTracker(POLICY);
    const near = enemy(1, 10, 10, 0, 10);
    const far = enemy(2, 200, 200, 0, 10);
    const tierOf = (e: EnemyState) => (e.id === 1 ? 0 : 3);
    const b1 = tracker.track([near, far], 0, null, tierOf);
    expect(b1.materialize.length).toBe(2);
    expect(b1.near.length).toBe(0);
    expect(b1.far.length).toBe(0);
    // Second frame: near moves -> near delta (15 Hz at 20 Hz => every frame);
    // far changes only at farHz interval.
    const b2 = tracker.track([{ ...near, x: 11 }, { ...far, x: 201 }], 0.05, null, tierOf);
    expect(b2.materialize.length).toBe(0);
    expect(b2.near.length).toBe(1);
    expect(b2.far.length).toBe(0);
  });

  it('emits death and despawn immediately (never delayed)', () => {
    const tracker = new HordeReplicationTracker(POLICY);
    const a = enemy(1, 10, 10, 0, 10);
    const b = enemy(2, 30, 30, 0, 10);
    const tierOf = () => 3 as const;
    tracker.track([a, b], 0, null, tierOf);
    const block = tracker.track([{ ...a, alive: false }], 0.05, null, tierOf);
    expect(block.death).toEqual([1]);
    expect(block.despawn).toEqual([2]);
  });

  it('tracks bytes, serialization time, and delta queue', () => {
    const tracker = new HordeReplicationTracker(POLICY);
    const enemies = Array.from({ length: 50 }, (_, i) => enemy(i + 1, i * 2, 0, 0, 10));
    const tierOf = () => 2 as const;
    tracker.track(enemies, 0, null, tierOf);
    expect(tracker.stats.enemyBytes).toBeGreaterThan(0);
    expect(tracker.stats.serializeMs).toBeGreaterThanOrEqual(0);
    expect(tracker.stats.deltaQueue).toBeGreaterThan(0);
  });

  it('includes wave/leader state when a wave is active', () => {
    const tracker = new HordeReplicationTracker(POLICY);
    const leader = enemy(1, 10, 10, 0, 4);
    const block = tracker.track(
      [leader],
      0,
      { waveId: 1, state: 'active', leaderId: 1, leaderHp: 4, leaderMaxHp: 10 },
      () => 0,
    );
    expect(block.wave?.waveId).toBe(1);
    expect(block.wave?.leaderHp).toBe(4);
  });
});

describe('HordeReplicationClient (client, M9)', () => {
  it('materializes, updates, and purges enemies', () => {
    const client = new HordeReplicationClient((_x, _z) => 2.5);
    const a = enemy(1, 10, 10, 0, 10);
    const b = enemy(2, 30, 30, 0, 10);
    const b1: HordeSnapshotBlock = {
      seq: 1,
      materialize: [encodeMaterialize(a), encodeMaterialize(b)],
      despawn: [],
      death: [],
      near: [],
      mid: [],
      far: [],
      sectors: [],
      wave: null,
    };
    const list = client.apply(b1, 0);
    expect(list.length).toBe(2);
    expect(list.find((e) => e.id === 1)!.y).toBe(2.5);

    const b2: HordeSnapshotBlock = {
      seq: 2,
      materialize: [],
      despawn: [2],
      death: [],
      near: [encodeDelta({ ...a, x: 12, yaw: 0.5 })],
      mid: [],
      far: [],
      sectors: [],
      wave: null,
    };
    const after = client.apply(b2, 0.05);
    expect(after.length).toBe(1);
    const updated = after[0];
    expect(updated.x).toBeCloseTo(12, 5);
    expect(updated.yaw).toBeCloseTo(0.5, 2);
    expect(updated.y).toBe(2.5);
  });

  it('restores presentationProfileId from the materialize profile index', () => {
    const client = new HordeReplicationClient(() => 0);
    const profileId = 'enemyPresentation.witch.common';
    const idx = ENEMY_ANIMATION_PRESENTATION_PROFILE_ORDER.indexOf(profileId) + 1;
    const a = enemy(9, 0, 0, 0, 10);
    const rec = encodeMaterialize(a);
    rec[8] = idx;
    client.apply({
      seq: 1,
      materialize: [rec],
      despawn: [],
      death: [],
      near: [],
      mid: [],
      far: [],
      sectors: [],
      wave: null,
    }, 0);
    expect(client.enemies.get(9)?.presentationProfileId).toBe(profileId);
  });

  it('marks dead enemies instead of deleting them', () => {
    const client = new HordeReplicationClient(() => 0);
    const a = enemy(1, 10, 10, 0, 10);
    client.apply({
      seq: 1,
      materialize: [encodeMaterialize(a)],
      despawn: [],
      death: [1],
      near: [],
      mid: [],
      far: [],
      sectors: [],
      wave: null,
    }, 0);
    const e = client.enemies.get(1)!;
    expect(e.alive).toBe(false);
    expect(e.state).toBe('dead');
  });

  it('reset clears the client population', () => {
    const client = new HordeReplicationClient(() => 0);
    client.apply({
      seq: 1,
      materialize: [encodeMaterialize(enemy(1, 0, 0, 0, 10))],
      despawn: [],
      death: [],
      near: [],
      mid: [],
      far: [],
      sectors: [],
      wave: null,
    }, 0);
    client.reset();
    expect(client.enemies.size).toBe(0);
  });
});
