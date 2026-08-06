import type { HordeReplicationPolicyDefinition } from '../../content/schemas/horde';
import type { EnemyState, EnemyType } from '../../types';
import {
  dequantizeHp,
  dequantizeXZ,
  dequantizeYaw,
  decodeSector,
  encodeDelta,
  encodeMaterialize,
  flagsFor,
  HORDE_FLAG_ALIVE,
  HORDE_FLAG_FLASH,
  HORDE_FLAG_TELEGRAPH,
  materializeTypeName,
  presentationProfileIdForIndex,
  semanticActionIdForIndex,
  semanticActionIndex,
  quantizeHp,
  quantizeXZ,
  quantizeYaw,
  type HordeSnapshotBlock,
  type HordeWaveState,
} from './hordeProtocol';
import type { HordeSectorState } from '../../horde/hordeSectors';
import { encodeSector } from './hordeProtocol';

interface LastRecord {
  xq: number;
  zq: number;
  yawq: number;
  hpq: number;
  flags: number;
  alive: boolean;
  nextAt: number;
}

export interface HordeReplicationStats {
  enemyBytes: number;
  serializeMs: number;
  deltaQueue: number;
}

const SNAPSHOT_HZ = 20;

/**
 * Server-side tiered horde replication tracker. New enemies materialize
 * once; tier 0/1 deltas are rate-limited per enemy; far (2/3) deltas are
 * coalesced to the latest state and sent only when changed. Critical
 * events (death, spawn, purge) are never delayed by backpressure.
 */
export class HordeReplicationTracker {
  private readonly last = new Map<number, LastRecord>();
  private readonly lastCue = new Map<number, number>();
  private seq = 0;
  private frame = 0;
  private lastSectors = '';
  stats: HordeReplicationStats = { enemyBytes: 0, serializeMs: 0, deltaQueue: 0 };
  private readonly policy: HordeReplicationPolicyDefinition;

  constructor(policy: HordeReplicationPolicyDefinition) {
    this.policy = policy;
  }

  track(
    enemies: readonly EnemyState[],
    time: number,
    wave: HordeWaveState | null,
    tierOf: (e: EnemyState) => 0 | 1 | 2 | 3,
    sectors: readonly HordeSectorState[] = [],
  ): HordeSnapshotBlock {
    const t0 = performanceNow();
    this.frame++;
    const seen = new Set<number>();
    const block: HordeSnapshotBlock = {
      seq: ++this.seq,
      materialize: [],
      cues: [],
      despawn: [],
      death: [],
      near: [],
      mid: [],
      far: [],
      sectors: [],
      wave,
    };
    const sectorKey = JSON.stringify(sectors.map((s) => [s.sectorId, s.count, s.centerX, s.centerZ, s.waveId]));
    if (sectorKey !== this.lastSectors) {
      block.sectors = sectors.map(encodeSector);
      this.lastSectors = sectorKey;
    }
    const nearEvery = Math.max(1, Math.round(SNAPSHOT_HZ / this.policy.nearHz));
    const midEvery = Math.max(1, Math.round(SNAPSHOT_HZ / this.policy.midHz));
    const farEvery = Math.max(1, Math.round(SNAPSHOT_HZ / this.policy.farHz));
    let queue = 0;

    for (const e of enemies) {
      seen.add(e.id);
      this.pushCue(block, e);
      if (!e.alive) {
        const prev = this.last.get(e.id);
        if (prev && prev.alive) block.death.push(e.id);
        this.lastCue.delete(e.id);
        this.last.delete(e.id);
        continue;
      }
      const tier = tierOf(e);
      const prev = this.last.get(e.id);
      const flags = flagsFor(e);
      const rec: LastRecord = {
        xq: quantizeXZ(e.x),
        zq: quantizeXZ(e.z),
        yawq: quantizeYaw(e.yaw),
        hpq: quantizeHp(e.hp),
        flags,
        alive: true,
        nextAt: 0,
      };
      if (!prev) {
        block.materialize.push(encodeMaterialize(e));
        this.last.set(e.id, { ...rec, nextAt: time + 1 / this.policy.nearHz });
        queue++;
        continue;
      }
      const changed = prev.xq !== rec.xq || prev.zq !== rec.zq || prev.yawq !== rec.yawq || prev.hpq !== rec.hpq || prev.flags !== rec.flags;
      const due = time >= prev.nextAt;
      if (tier === 0 && (due || changed) && this.frame % nearEvery === 0) {
        block.near.push(encodeDelta(e));
        this.last.set(e.id, { ...rec, nextAt: time + 1 / this.policy.nearHz });
        queue++;
      } else if (tier === 1 && (due || changed) && this.frame % midEvery === 0) {
        block.mid.push(encodeDelta(e));
        this.last.set(e.id, { ...rec, nextAt: time + 1 / this.policy.midHz });
        queue++;
      } else if (tier >= 2 && changed && this.frame % farEvery === 0) {
        block.far.push(encodeDelta(e));
        this.last.set(e.id, { ...rec, nextAt: time + 1 / this.policy.farHz });
        queue++;
      } else {
        this.last.set(e.id, { ...rec, nextAt: prev.nextAt });
      }
    }
    // Removed enemies -> despawn (purge/cleanup); dead enemies -> death.
    for (const [id, prev] of [...this.last]) {
      if (!seen.has(id)) {
        if (prev.alive) block.despawn.push(id);
        this.lastCue.delete(id);
        this.last.delete(id);
      }
    }
    this.stats.deltaQueue = queue;
    this.stats.enemyBytes = JSON.stringify(block).length;
    this.stats.serializeMs = performanceNow() - t0;
    return block;
  }

  /** Emit a semantic presentation cue exactly once per sequence change. */
  private pushCue(block: HordeSnapshotBlock, e: EnemyState): void {
    const cue = e.actionCue;
    if (!cue) return;
    const actionIndex = semanticActionIndex(cue.actionId);
    if (actionIndex === 0) return;
    if (this.lastCue.get(e.id) === cue.sequence) return;
    this.lastCue.set(e.id, cue.sequence);
    block.cues.push([
      e.id,
      cue.sequence,
      actionIndex,
      Math.max(0, Math.round(cue.startedAtTick)),
      Math.max(0, Math.round(cue.durationTicks)),
    ]);
  }

  reset(): void {
    this.last.clear();
    this.lastCue.clear();
    this.seq = 0;
    this.frame = 0;
    this.stats = { enemyBytes: 0, serializeMs: 0, deltaQueue: 0 };
  }
}

/**
 * Client-side horde replication state. Applies materialize/death/despawn/
 * delta blocks into a persistent enemy map so the presenter can interpolate
 * remote enemies without receiving the full array every snapshot.
 */
export class HordeReplicationClient {
  readonly enemies = new Map<number, EnemyState>();
  readonly sectors = new Map<number, HordeSectorState>();

  constructor(
    private readonly groundY: (x: number, z: number) => number,
  ) {}

  apply(block: HordeSnapshotBlock, time: number): EnemyState[] {
    for (const rec of block.materialize) {
      const [id, typeIndex, xq, zq, yawq, hpq, maxHpq, , profileIndex] = rec;
      const x = dequantizeXZ(xq);
      const z = dequantizeXZ(zq);
      const type = materializeTypeName(typeIndex) as EnemyType;
      const enemy: EnemyState = {
        id,
        type,
        defId: typeDefId(type),
        x,
        y: this.groundY(x, z),
        z,
        yaw: dequantizeYaw(yawq),
        hp: dequantizeHp(hpq),
        maxHp: dequantizeHp(maxHpq ?? hpq),
        state: 'hunt',
        stateT: 0,
        aimYaw: 0,
        speed: 0,
        alive: true,
        telegraph: 0,
        flash: 0,
        spawnT: time,
        hitCd: 0,
        ...(presentationProfileIdForIndex(profileIndex)
          ? { presentationProfileId: presentationProfileIdForIndex(profileIndex) }
          : {}),
      };
      this.enemies.set(id, enemy);
    }
    this.sectors.clear();
    for (const rec of block.sectors) {
      const sector = decodeSector(rec);
      this.sectors.set(sector.sectorId, sector);
    }
    for (const rec of block.cues) {
      const [id, sequence, actionIndex, startTick, durationTicks] = rec;
      const enemy = this.enemies.get(id);
      const actionId = semanticActionIdForIndex(actionIndex);
      if (!enemy || !actionId) continue;
      enemy.actionCue = {
        sequence,
        actionId,
        startedAtTick: startTick,
        durationTicks,
      };
    }
    for (const id of block.death) {
      const e = this.enemies.get(id);
      if (e) {
        e.alive = false;
        e.state = 'dead';
        e.stateT = 0;
      }
    }
    for (const id of block.despawn) {
      this.enemies.delete(id);
    }
    for (const records of [block.near, block.mid, block.far]) {
      for (const rec of records) {
        const [id, xq, zq, yawq, hpq, flags] = rec;
        const e = this.enemies.get(id);
        if (!e) continue;
        e.x = dequantizeXZ(xq);
        e.z = dequantizeXZ(zq);
        e.y = this.groundY(e.x, e.z);
        e.yaw = dequantizeYaw(yawq);
        e.hp = dequantizeHp(hpq);
        e.alive = (flags & HORDE_FLAG_ALIVE) !== 0;
        e.telegraph = (flags & HORDE_FLAG_TELEGRAPH) !== 0 ? 0.5 : 0;
        e.flash = (flags & HORDE_FLAG_FLASH) !== 0 ? 0.12 : 0;
      }
    }
    return [...this.enemies.values()];
  }

  reset(): void {
    this.enemies.clear();
    this.sectors.clear();
  }
}

function typeDefId(type: EnemyType): string {
  switch (type) {
    case 'scrapBug':
      return 'enemy.scrapBug';
    case 'rammer':
      return 'enemy.rammer';
    case 'gunTower':
      return 'enemy.gunTower';
    case 'lootTruck':
      return 'enemy.lootTruck';
    default:
      return `enemy.${type}`;
  }
}

function performanceNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
