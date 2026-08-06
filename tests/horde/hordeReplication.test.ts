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
  semanticActionIdForIndex,
  semanticActionIndex,
  quantizeXZ,
  quantizeYaw,
  type HordeSnapshotBlock,
} from '../../src/shared/net/horde/hordeProtocol';
import { ENEMY_ANIMATION_PRESENTATION_PROFILE_ORDER } from '../../src/generated/enemyAnimationContent.generated';
import { loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';
import {
  decodeSector,
  encodeSector,
  typeForDefinitionId,
} from '../../src/shared/net/horde/hordeProtocol';

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

function monster(id: number, defId: string, profileId: string): EnemyState {
  return {
    ...enemy(id, 0, 0, 0, 10),
    type: 'monster',
    defId,
    presentationProfileId: profileId,
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
  it('round-trips semantic action codec indexes', () => {
    for (const id of [
      'enemy.semantic.idle',
      'enemy.semantic.walk',
      'enemy.semantic.attack',
      'enemy.semantic.death',
    ]) {
      expect(semanticActionIdForIndex(semanticActionIndex(id))).toBe(id);
    }
    expect(semanticActionIdForIndex(0)).toBeUndefined();
    expect(semanticActionIndex('enemy.semantic.nope')).toBe(0);
  });

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

  it('replicates semantic presentation cues once per sequence and applies them on the client', () => {
    const tracker = new HordeReplicationTracker(POLICY);
    const a = enemy(1, 0, 0, 0, 10);
    a.actionCue = {
      sequence: 5,
      actionId: 'enemy.semantic.attack',
      startedAtTick: 60,
      durationTicks: 30,
    };
    const b1 = tracker.track([a], 2, null, () => 0);
    expect(b1.cues).toEqual([[1, 5, 3, 60, 30]]);
    const b2 = tracker.track([a], 2.05, null, () => 0);
    expect(b2.cues).toEqual([]);
    a.actionCue = {
      sequence: 9,
      actionId: 'enemy.semantic.death',
      startedAtTick: 75,
      durationTicks: 36,
    };
    const b3 = tracker.track([a], 2.5, null, () => 0);
    expect(b3.cues).toEqual([[1, 9, 4, 75, 36]]);

    const client = new HordeReplicationClient(() => 0);
    client.apply(
      {
        seq: 1,
        materialize: [encodeMaterialize(a)],
        cues: [[1, 5, 3, 60, 30]],
        despawn: [],
        death: [],
        near: [],
        mid: [],
        far: [],
        sectors: [],
        wave: null,
      },
      2,
    );
    expect(client.enemies.get(1)?.actionCue).toEqual({
      sequence: 5,
      actionId: 'enemy.semantic.attack',
      startedAtTick: 60,
      durationTicks: 30,
    });
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
      cues: [],
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
    // Protocol 10: materialize replicates authoritative Y (enemy y was 0),
    // never the client terrain projection.
    expect(list.find((e) => e.id === 1)!.y).toBe(0);

    const b2: HordeSnapshotBlock = {
      seq: 2,
      materialize: [],
      cues: [],
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
    expect(updated.y).toBe(0);
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
      cues: [],
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
      cues: [],
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
      cues: [],
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

  it('materializes an airborne enemy at its authoritative Y with velocity and impulse tick', () => {
    const client = new HordeReplicationClient(() => 3);
    const a = enemy(11, 10, 10, 0, 10);
    a.y = 12.34;
    a.impulseVy = 3.2;
    a.impulseGrounded = false;
    a.lastImpulseT = 2.5;
    client.apply(
      {
        seq: 1,
        materialize: [encodeMaterialize(a)],
        cues: [],
        despawn: [],
        death: [],
        near: [],
        mid: [],
        far: [],
        sectors: [],
        wave: null,
      },
      0,
    );
    const e = client.enemies.get(11)!;
    expect(e.y).toBeCloseTo(12.35, 3);
    expect(e.impulseGrounded).toBe(false);
    expect(e.impulseVy).toBeCloseTo(3.1875, 3);
    expect(e.lastImpulseT).toBeCloseTo(2.5, 3);
  });

  it('preserves the airborne arc through near deltas and lands cleanly', () => {
    const client = new HordeReplicationClient(() => 0);
    const a = enemy(12, 0, 0, 0, 10);
    client.apply(
      {
        seq: 1,
        materialize: [encodeMaterialize(a)],
        cues: [],
        despawn: [],
        death: [],
        near: [],
        mid: [],
        far: [],
        sectors: [],
        wave: null,
      },
      0,
    );
    const airborne = { ...a, y: 8, impulseVy: 1.5, impulseGrounded: false, lastImpulseT: 3 };
    client.apply(
      {
        seq: 2,
        materialize: [],
        cues: [],
        despawn: [],
        death: [],
        near: [encodeDelta(airborne)],
        mid: [],
        far: [],
        sectors: [],
        wave: null,
      },
      0.05,
    );
    const e = client.enemies.get(12)!;
    expect(e.y).toBeCloseTo(8, 3);
    expect(e.impulseGrounded).toBe(false);
    expect(e.impulseVy).toBeCloseTo(1.5, 3);
    // Landing delta: airborne flag cleared, Y at ground.
    const landed = { ...a, y: 0.4, impulseVy: 0, impulseGrounded: true, lastImpulseT: 3.5 };
    client.apply(
      {
        seq: 3,
        materialize: [],
        cues: [],
        despawn: [],
        death: [],
        near: [encodeDelta(landed)],
        mid: [],
        far: [],
        sectors: [],
        wave: null,
      },
      0.1,
    );
    expect(e.y).toBeCloseTo(0.4, 3);
    expect(e.impulseGrounded).toBe(true);
    expect(e.impulseVy).toBe(0);
  });

  it('keeps airborne death visually consistent (no re-grounding)', () => {
    const client = new HordeReplicationClient(() => 0);
    const a = enemy(13, 0, 0, 0, 10);
    a.y = 9.2;
    a.impulseVy = 2;
    a.impulseGrounded = false;
    a.lastImpulseT = 4;
    client.apply(
      {
        seq: 1,
        materialize: [encodeMaterialize(a)],
        cues: [],
        despawn: [],
        death: [],
        near: [],
        mid: [],
        far: [],
        sectors: [],
        wave: null,
      },
      0,
    );
    client.apply(
      {
        seq: 2,
        materialize: [],
        cues: [],
        despawn: [],
        death: [13],
        near: [],
        mid: [],
        far: [],
        sectors: [],
        wave: null,
      },
      0.05,
    );
    const e = client.enemies.get(13)!;
    expect(e.alive).toBe(false);
    expect(e.y).toBeCloseTo(9.2, 3);
  });

  it('far deltas remain terrain-projected', () => {
    const client = new HordeReplicationClient(() => 7.5);
    const a = enemy(14, 0, 0, 0, 10);
    client.apply(
      {
        seq: 1,
        materialize: [encodeMaterialize(a)],
        cues: [],
        despawn: [],
        death: [],
        near: [],
        mid: [],
        far: [],
        sectors: [],
        wave: null,
      },
      0,
    );
    const far = { ...a, y: 99, impulseGrounded: false };
    client.apply(
      {
        seq: 2,
        materialize: [],
        cues: [],
        despawn: [],
        death: [],
        near: [],
        mid: [],
        far: [encodeDelta(far, false)],
        sectors: [],
        wave: null,
      },
      0.05,
    );
    const e = client.enemies.get(14)!;
    expect(e.y).toBe(7.5);
    expect(e.impulseGrounded).toBe(true);
  });

  it('rejects unknown enemy definition indices instead of falling back', () => {
    const client = new HordeReplicationClient(() => 0);
    for (const badIndex of [0, 999]) {
      const rec = encodeMaterialize(enemy(15, 0, 0, 0, 10));
      rec[1] = badIndex;
      expect(() =>
        client.apply(
          {
            seq: 1,
            materialize: [rec],
            cues: [],
            despawn: [],
            death: [],
            near: [],
            mid: [],
            far: [],
            sectors: [],
            wave: null,
          },
          0,
        ),
      ).toThrow(/unknown enemy definition index/);
    }
  });
});

describe('generalized monster identity (bug-fix phase 1)', () => {
  const pack = loadContentPackFromFilesystem('content');
  const profileFor = (defId: string) => pack.getEnemy(defId).presentationProfileId!;

  function roundTrip(defId: string) {
    const m = monster(700, defId, profileFor(defId));
    const client = new HordeReplicationClient(() => 0);
    client.apply(
      {
        seq: 1,
        materialize: [encodeMaterialize(m)],
        cues: [],
        despawn: [],
        death: [],
        near: [],
        mid: [],
        far: [],
        sectors: [],
        wave: null,
      },
      0,
    );
    return client.enemies.get(700)!;
  }

  it('round-trips an ordinary melee monster (Ninja) with exact identity', () => {
    const e = roundTrip('enemy.quaternius.ninja');
    expect(e.type).toBe('monster');
    expect(e.defId).toBe('enemy.quaternius.ninja');
    expect(e.presentationProfileId).toBe(profileFor('enemy.quaternius.ninja'));
  });

  it('round-trips a ranged monster (Wizard) with exact identity', () => {
    const e = roundTrip('enemy.quaternius.wizard');
    expect(e.type).toBe('monster');
    expect(e.defId).toBe('enemy.quaternius.wizard');
  });

  it('round-trips a specialist with exact identity', () => {
    const e = roundTrip('enemy.quaternius.orc-enemy');
    expect(e.type).toBe('monster');
    expect(e.defId).toBe('enemy.quaternius.orc-enemy');
  });

  it('round-trips an elite (Demon elite) with exact identity', () => {
    const e = roundTrip('enemy.quaternius.demon-high-detail.elite');
    expect(e.type).toBe('monster');
    expect(e.defId).toBe('enemy.quaternius.demon-high-detail.elite');
    expect(e.presentationProfileId).toBe(profileFor('enemy.quaternius.demon-high-detail.elite'));
  });

  it('round-trips a boss (Ninja boss) with exact identity', () => {
    const e = roundTrip('enemy.quaternius.ninja-high-detail.boss');
    expect(e.type).toBe('monster');
    expect(e.defId).toBe('enemy.quaternius.ninja-high-detail.boss');
    expect(e.presentationProfileId).toBe(profileFor('enemy.quaternius.ninja-high-detail.boss'));
  });

  it('never reconstructs a generalized monster as a Scrap Bug', () => {
    expect(typeForDefinitionId('enemy.quaternius.ninja')).toBe('monster');
    expect(typeForDefinitionId('enemy.quaternius.wizard')).toBe('monster');
    expect(typeForDefinitionId('enemy.quaternius.demon-high-detail.elite')).toBe('monster');
    expect(typeForDefinitionId('enemy.quaternius.ninja-high-detail.boss')).toBe('monster');
    expect(typeForDefinitionId('enemy.scrapBug')).toBe('scrapBug');
  });

  it('generated runtime typing covers every definition including scrapBugHorde', () => {
    expect(typeForDefinitionId('enemy.scrapBugHorde')).toBe('scrapBug');
    expect(typeForDefinitionId('enemy.rammer')).toBe('rammer');
    expect(typeForDefinitionId('enemy.gunTower')).toBe('gunTower');
    expect(typeForDefinitionId('enemy.lootTruck')).toBe('lootTruck');
    // enemy.testHound is content-defined with the validated scrapBug type
    // (there is no 'testHound' runtime type in the schema); the generated
    // map reproduces the exact validated type.
    expect(typeForDefinitionId('enemy.testHound')).toBe('scrapBug');
    expect(typeForDefinitionId('enemy.quaternius.alien')).toBe('monster');
    expect(typeForDefinitionId('enemy.quaternius.yeti-high-detail.elite')).toBe('monster');
  });

  it('round-trips scrapBugHorde as an exact scrapBug definition', () => {
    const e = roundTrip('enemy.scrapBugHorde');
    expect(e.type).toBe('scrapBug');
    expect(e.defId).toBe('enemy.scrapBugHorde');
    expect(e.defId).not.toBe('enemy.scrapBug');
  });

  it('replicates compact ownership metadata with elite/boss priority', () => {
    const client = new HordeReplicationClient(() => 0);
    const boss = monster(701, 'enemy.quaternius.ninja-high-detail.boss', profileFor('enemy.quaternius.ninja-high-detail.boss'));
    boss.ownership = {
      populationClass: 'boss',
      waveId: 3,
      leaderId: 701,
      packInstanceId: 42,
      spawnAnchorId: null,
      purgeOnLeaderDeath: false,
      formationRole: 'vanguard',
    };
    const elite = monster(702, 'enemy.quaternius.ninja-high-detail', profileFor('enemy.quaternius.ninja-high-detail'));
    elite.ownership = {
      populationClass: 'wave',
      waveId: 1,
      leaderId: null,
      packInstanceId: 7,
      spawnAnchorId: null,
      purgeOnLeaderDeath: true,
      formationRole: 'line',
    };
    client.apply(
      {
        seq: 1,
        materialize: [encodeMaterialize(boss), encodeMaterialize(elite)],
        cues: [],
        despawn: [],
        death: [],
        near: [],
        mid: [],
        far: [],
        sectors: [],
        wave: null,
      },
      0,
    );
    const b = client.enemies.get(701)!;
    expect(b.ownership?.populationClass).toBe('boss');
    expect(b.ownership?.waveId).toBe(3);
    expect(b.ownership?.leaderId).toBe(701);
    expect(b.ownership?.purgeOnLeaderDeath).toBe(false);
    expect(b.ownership?.formationRole).toBe('vanguard');
    expect(b.ownership?.priority).toBe(2);
    const el = client.enemies.get(702)!;
    expect(el.ownership?.populationClass).toBe('wave');
    expect(el.ownership?.waveId).toBe(1);
    expect(el.ownership?.leaderId).toBeNull();
    expect(el.ownership?.purgeOnLeaderDeath).toBe(true);
    expect(el.ownership?.formationRole).toBe('line');
    expect(el.ownership?.priority).toBe(1);
  });

  it('preserves exact definition identity in aggregate sectors', () => {
    const sector = {
      sectorId: 9,
      enemyDefId: 'enemy.quaternius.wizard',
      count: 5,
      centerX: 10,
      centerZ: -20,
      flowDx: 0.3,
      flowDz: -0.2,
      populationClass: 'wave' as const,
      waveId: 1,
      threat: 5,
      presentationSeed: 9,
    };
    const decoded = decodeSector(encodeSector(sector));
    expect(decoded.enemyDefId).toBe('enemy.quaternius.wizard');
    expect(decoded.enemyDefId).not.toBe('enemy.scrapBug');
    expect(decoded.count).toBe(5);
  });
});
