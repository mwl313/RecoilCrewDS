import type { EnemyState } from '../../types';
import type { HordeSectorState } from '../../horde/hordeSectors';
import type { PopulationClass } from '../../horde/spawnOwnership';
import { ENEMY_ANIMATION_PRESENTATION_PROFILE_ORDER } from '../../../generated/enemyAnimationContent.generated';

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
  /** [id, type, xq, zq, yawq, hpq, maxHpq, flags, profileIndex] for newly seen enemies. */
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
  /**
   * Aggregate far sectors: [sectorId, typeIndex, count, xq, zq, flowDxq,
   * flowDzq, classIndex, waveId, threatq].
   */
  sectors: number[][];
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
    presentationProfileIndex(e),
  ];
}

/** 0 = legacy/type default; otherwise 1-based index into the profile order. */
export function presentationProfileIndex(e: EnemyState): number {
  if (!e.presentationProfileId) return 0;
  const i = ENEMY_ANIMATION_PRESENTATION_PROFILE_ORDER.indexOf(e.presentationProfileId);
  return i < 0 ? 0 : i + 1;
}

export function presentationProfileIdForIndex(index: number): string | undefined {
  if (!Number.isInteger(index) || index <= 0) return undefined;
  return ENEMY_ANIMATION_PRESENTATION_PROFILE_ORDER[index - 1];
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

const CLASS_ORDER: PopulationClass[] = ['ambient', 'wave', 'boss', 'special'];

export function encodeSector(s: HordeSectorState): number[] {
  return [
    s.sectorId,
    materializeTypeIndex(s.enemyDefId.startsWith('enemy.scrapBug') ? 'scrapBug' : s.enemyDefId.replace('enemy.', '')),
    s.count,
    quantizeXZ(s.centerX),
    quantizeXZ(s.centerZ),
    Math.round(s.flowDx * 100),
    Math.round(s.flowDz * 100),
    Math.max(0, CLASS_ORDER.indexOf(s.populationClass)),
    s.waveId ?? 0,
    quantizeHp(s.threat),
  ];
}

export function decodeSector(rec: number[]): HordeSectorState {
  const [sectorId, typeIndex, count, xq, zq, flowDxq, flowDzq, classIndex, waveId, threatq] = rec;
  const typeName = materializeTypeName(typeIndex);
  return {
    sectorId,
    enemyDefId: typeName === 'scrapBug' ? 'enemy.scrapBug' : `enemy.${typeName}`,
    count,
    centerX: dequantizeXZ(xq),
    centerZ: dequantizeXZ(zq),
    flowDx: flowDxq / 100,
    flowDz: flowDzq / 100,
    populationClass: CLASS_ORDER[Math.max(0, Math.min(CLASS_ORDER.length - 1, classIndex))] ?? 'ambient',
    waveId: waveId === 0 ? null : waveId,
    threat: dequantizeHp(threatq),
    presentationSeed: sectorId,
  };
}
