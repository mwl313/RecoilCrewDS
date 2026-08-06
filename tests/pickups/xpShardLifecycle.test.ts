import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';
import { Match } from '../../src/shared/sim/match';
import { createStaticArenaWorld } from '../../src/shared/sim/arenaWorld';
import { RemoteEntityInterpolator, type RemoteFrame } from '../../src/client/prediction/remoteInterpolator';
import { XpShardRenderer } from '../../src/client/pickups/xpShardRenderer';

const pack = loadContentPackFromFilesystem('content');
const DT = 1 / 30;

function makeMatch(): Match {
  return new Match('xp-life', 'none', pack, createStaticArenaWorld(), 'mode.mainStage');
}

function step(m: Match, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    m.step(DT);
    if (m.state.phase === 'running') {
      m.state.tank.integrity = m.runtime.cfg.tank.maxIntegrity;
      m.state.tank.deadT = 0;
    }
  }
}

describe('XP shard lifecycle (bug-fix phase 5)', () => {
  it('spawns authoritative shards on monster death', () => {
    const m = makeMatch();
    step(m, 4);
    const def = pack.getEnemy('enemy.quaternius.ninja');
    const e = m.runtime.systems.enemies.spawnEnemyDef(def, m.state.tank.x + 3, m.state.tank.z)!;
    expect(m.state.xpShards.length).toBe(0);
    m.runtime.systems.damage.applyEnemy(e, 999999, 'test');
    m.step(DT);
    expect(m.state.xpShards.length).toBeGreaterThan(0);
    for (const shard of m.state.xpShards) {
      expect(shard.value).toBeGreaterThan(0);
      expect(shard.y).toBeGreaterThan(0);
    }
  });

  it('collects a shard once: one XP grant, one pickup event, removal from state', () => {
    const m = makeMatch();
    step(m, 4);
    const xpBefore = m.state.teamProgression.currentXp;
    m.runtime.systems.xpShards.spawn(5, m.state.tank.x, m.state.tank.z);
    expect(m.state.xpShards.length).toBe(1);
    let pickupEvents = 0;
    for (let i = 0; i < 60 && m.state.xpShards.length > 0; i++) {
      m.step(DT);
      for (const ev of m.takeEvents()) {
        if (ev.type === 'pickup' && ev.kind === 'xp') pickupEvents++;
      }
    }
    expect(m.state.xpShards.length).toBe(0);
    expect(m.state.teamProgression.currentXp).toBe(xpBefore + 5);
    expect(pickupEvents).toBe(1);
  });

  it('removes expired shards from authoritative state', () => {
    const m = makeMatch();
    step(m, 4);
    m.runtime.systems.xpShards.spawn(5, m.state.tank.x + 40, m.state.tank.z);
    expect(m.state.xpShards.length).toBe(1);
    step(m, 31);
    expect(m.state.xpShards.length).toBe(0);
  });

  it('includes xpShards in the remote-frame contract (SP and MP discrete path)', () => {
    const m = makeMatch();
    step(m, 4);
    m.runtime.systems.xpShards.spawn(7, 1, 2);
    const interp = new RemoteEntityInterpolator();
    const frame: RemoteFrame = {
      enemies: [],
      pickups: [],
      xpShards: [],
      shells: [],
      truck: { active: false, x: 0, y: 0, z: 0, yaw: 0, hp: 0, waypoint: 0, escaped: false, sirenT: 0 },
      turret: { yaw: 0, pitch: 0 },
      tank: m.state.tank,
      discrete: m.state,
      interpolated: false,
    };
    interp.fillFromDiscrete(frame, m.state);
    expect(frame.xpShards.length).toBe(1);
    expect(frame.xpShards[0].value).toBe(7);
  });

  it('renders live shards, releases slots, and plays a bounded pop on removal', () => {
    const scene = new THREE.Scene();
    const renderer = new XpShardRenderer(scene);
    const shards = [
      { id: 1, value: 5, x: 0, y: 0.6, z: 0, vx: 0, vy: 0, vz: 0, age: 0, collected: false },
      { id: 2, value: 5, x: 2, y: 0.6, z: 0, vx: 0, vy: 0, vz: 0, age: 0, collected: false },
    ];
    renderer.update(shards, 0, DT);
    const mesh = (renderer as unknown as { mesh: THREE.InstancedMesh }).mesh;
    expect(mesh.count).toBe(2);
    renderer.update([shards[0]], 0.1, DT);
    // One live shard + one pop instance.
    expect(mesh.count).toBe(2);
    for (let i = 0; i < 12; i++) renderer.update([shards[0]], 0.5 + i * DT, DT);
    // Pop expired after 0.3s of accumulated dt; only the live shard remains.
    expect(mesh.count).toBe(1);
    renderer.dispose();
    expect(scene.children.includes(mesh)).toBe(false);
  });
});
