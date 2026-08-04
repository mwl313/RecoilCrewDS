import type { EnemyState } from '../../types';

/**
 * Core Loop 06 M9: typed horde replication records. Enemy transforms are
 * quantized and only changed fields are transmitted per tier. Materialize
 * records carry the type name so the client needs no content table; deltas
 * reference the numeric enemy id only.
 */
export interface HordeWaveState {
  waveId: number;
  state: string;
  leaderId: number;
  leaderHp: number;
  leaderMaxHp: number;
}

export interface HordeSnapshotBlock {
  seq: number;
  /** [id, type, xq, zq, yawq, hpq, maxHpq, flags] for newly seen enemies. */
  materialize: number[][];
  /** Enemy ids removed (purge/cleanup) — never a kill, no reward semantics. */
  despawn: number[];
  /** Enemy ids that died since the last snapshot. */
  death: number[];
  /** Tier 0 deltas: [id, xq, zq, yawq, hpq, flags]. */
  near: number[][];
  /** Tier 1 deltas. */
  mid: number[][];
  /** Tier 2/3 deltas (coalesced, change-driven). */
  far: number[][];
  wave: HordeWaveState | null;
}

export const HORDE_FLAG_ALIVE = 1;
export const HORDE_FLAG_TELEGRAPH = 2;
export const HORDE_FLAG_FLASH = 4;

export function quantizeXZ(v: number): number {
  return Math.round(v * 10);
}

export function dequantizeXZ(v: number): number {
  return v / 10;
}

export function quantizeYaw(v: number): number {
  return Math.round(v * 1000);
}

export function dequantizeYaw(v: number): number {
  return v / 1000;
}

export function quantizeHp(v: number): number {
  return Math.round(Math.max(0, v) * 4);
}

export function dequantizeHp(v: number): number {
  return v / 4;
}

export function flagsFor(e: EnemyState): number {
  let flags = e.alive ? HORDE_FLAG_ALIVE : 0;
  if (e.telegraph > 0) flags |= HORDE_FLAG_TELEGRAPH;
  if (e.flash > 0) flags |= HORDE_FLAG_FLASH;
  return flags;
}

export function encodeMaterialize(e: EnemyState): number[] {
  return [
    e.id,
    materializeTypeIndex(e.type),
    quantizeXZ(e.x),
    quantizeXZ(e.z),
    quantizeYaw(e.yaw),
    quantizeHp(e.hp),
    quantizeHp(e.maxHp),
    flagsFor(e),
  ];
}

export function encodeDelta(e: EnemyState): number[] {
  return [
    e.id,
    quantizeXZ(e.x),
    quantizeXZ(e.z),
    quantizeYaw(e.yaw),
    quantizeHp(e.hp),
    flagsFor(e),
  ];
}

/**
 * Small stable type codec: enemy type names are few and stable, so we map
 * them to a 1..N index in materialize records to keep bytes low.
 */
const TYPE_ORDER = ['scrapBug', 'rammer', 'gunTower', 'lootTruck', 'testHound'] as const;
type EnemyTypeName = (typeof TYPE_ORDER)[number];

export function materializeTypeIndex(type: string): number {
  const i = TYPE_ORDER.indexOf(type as EnemyTypeName);
  return i < 0 ? 0 : i + 1;
}

export function materializeTypeName(index: number): string {
  return TYPE_ORDER[Math.max(0, index - 1)] ?? 'scrapBug';
}
