import type { EnemyState } from '../../types';
import type { HordeSectorState } from '../../horde/hordeSectors';
import type { PopulationClass } from '../../horde/spawnOwnership';
import { ENEMY_ANIMATION_PRESENTATION_PROFILE_ORDER } from '../../../generated/enemyAnimationContent.generated';
import {
  ENEMY_DEFINITION_INDEX,
  ENEMY_DEFINITION_ORDER,
  ENEMY_FORMATION_ROLE_ORDER,
  ENEMY_RUNTIME_TYPE_BY_DEF_ID,
} from '../../../generated/enemyDefinitionIndex.generated';
import { ENEMY_DEFINITION_SIZE_TIER } from '../../../generated/monsterDimensions.generated';

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
  /**
   * Materialize: [id, defIndex, xq, zq, yawq, hpq, maxHpq, flags,
   * profileIndex, yq, vyq, impulseTick, classIndex, waveId, leaderId,
   * ownershipFlags, formationRoleIndex] for newly seen enemies.
   */
  materialize: number[][];
  /** Semantic presentation cues: [id, sequence, actionIndex, startTick, durationTicks]. */
  cues: number[][];
  /** Enemy ids removed (purge/cleanup) — never a kill, no reward semantics. */
  despawn: number[];
  /** Enemy ids that died since the last snapshot. */
  death: number[];
  /** Tier 0 deltas: [id, xq, zq, yawq, hpq, flags, yq, vyq, impulseTick]. */
  near: number[][];
  /** Tier 1 deltas: [id, xq, zq, yawq, hpq, flags, yq, vyq, impulseTick]. */
  mid: number[][];
  /** Tier 2/3 deltas (coalesced, change-driven, terrain-projected): [id, xq, zq, yawq, hpq, flags]. */
  far: number[][];
  /**
   * Aggregate far sectors: [sectorId, defIndex, count, xq, zq, flowDxq,
   * flowDzq, classIndex, waveId, threatq, leaderId, sectorFlags]. The final
   * fields are append-only so protocol-12 tactical consumers remain valid.
   */
  sectors: number[][];
  wave: HordeWaveState | null;
}

export const HORDE_FLAG_ALIVE = 1;
export const HORDE_FLAG_TELEGRAPH = 2;
export const HORDE_FLAG_FLASH = 4;
/** Vertical state is replicated: impulseGrounded === false while set. */
export const HORDE_FLAG_AIRBORNE = 8;

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

/** Vertical position, 0.025 m precision. */
export function quantizeY(v: number): number {
  return Math.round((Number.isFinite(v) ? v : 0) * 40);
}

export function dequantizeY(v: number): number {
  return v / 40;
}

/** Vertical velocity, 0.0625 m/s precision. */
export function quantizeVy(v: number): number {
  return Math.round((Number.isFinite(v) ? v : 0) * 16);
}

export function dequantizeVy(v: number): number {
  return v / 16;
}

/** Impulse start tick (30 Hz sim), 0 = no recent impulse. */
export function quantizeImpulseTick(lastImpulseT: number | undefined): number {
  return lastImpulseT === undefined || lastImpulseT <= 0
    ? 0
    : Math.max(0, Math.round(lastImpulseT * 30));
}

export function dequantizeImpulseTick(tick: number): number | undefined {
  return tick > 0 ? tick / 30 : undefined;
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
  if (e.impulseGrounded === false) flags |= HORDE_FLAG_AIRBORNE;
  return flags;
}

export function encodeMaterialize(e: EnemyState): number[] {
  return [
    e.id,
    enemyDefinitionIndex(e.defId ?? ''),
    quantizeXZ(e.x),
    quantizeXZ(e.z),
    quantizeYaw(e.yaw),
    quantizeHp(e.hp),
    quantizeHp(e.maxHp),
    flagsFor(e),
    presentationProfileIndex(e),
    quantizeY(e.y),
    quantizeVy(e.impulseVy ?? 0),
    quantizeImpulseTick(e.lastImpulseT),
    ...encodeOwnership(e),
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

/** 0 = unknown; otherwise 1-based index into the generated definition order. */
export function enemyDefinitionIndex(defId: string): number {
  return ENEMY_DEFINITION_INDEX[defId] ?? 0;
}

export function enemyDefinitionIdForIndex(index: number): string | undefined {
  if (!Number.isInteger(index) || index <= 0) return undefined;
  return ENEMY_DEFINITION_ORDER[index - 1];
}

/** Exact client type: generated from content for every definition. */
export function typeForDefinitionId(defId: string): string {
  const type = ENEMY_RUNTIME_TYPE_BY_DEF_ID[defId];
  if (!type) throw new Error(`unknown enemy definition id '${defId}'`);
  return type;
}

// ------------------------------------------------------------- ownership

/** Compact ownership class index: 0 = no ownership, 1..4 = population class. */
const OWNERSHIP_CLASS_ORDER = ['none', 'ambient', 'wave', 'boss', 'special'] as const;

export const OWNERSHIP_FLAG_LEADER = 1;
export const OWNERSHIP_FLAG_PURGE = 2;
export const OWNERSHIP_FLAG_BOSS = 4;
export const OWNERSHIP_FLAG_ELITE = 8;
export const OWNERSHIP_FLAG_MAINTENANCE = 16;
export const OWNERSHIP_FLAG_REWARD_SUPPRESSED = 32;

/** Presentation priority: 0 = ordinary, 1 = elite, 2 = boss. */
export function ownershipPriority(e: EnemyState): 0 | 1 | 2 {
  const meta = e.defId ? ENEMY_DEFINITION_SIZE_TIER[e.defId] : undefined;
  if (!meta) return 0;
  return meta.tier === 'boss' ? 2 : meta.tier === 'elite' ? 1 : 0;
}

/**
 * Compact ownership metadata appended to each materialize record:
 * [classIndex, waveId, leaderId, ownershipFlags, formationRoleIndex].
 * waveId/leaderId use 0 for null; formationRoleIndex is 1-based into the
 * generated role order (0 = none). Ownership flag bit layout:
 *   bit0 leader/featured, bit1 purgeOnLeaderDeath,
 *   bit2 boss priority, bit3 elite priority.
 */
export function encodeOwnership(e: EnemyState): number[] {
  const o = e.ownership;
  const priority = ownershipPriority(e);
  let flags = 0;
  if (o?.leaderId === e.id) flags |= OWNERSHIP_FLAG_LEADER;
  if (o?.purgeOnLeaderDeath) flags |= OWNERSHIP_FLAG_PURGE;
  if (priority === 2) flags |= OWNERSHIP_FLAG_BOSS;
  if (priority === 1) flags |= OWNERSHIP_FLAG_ELITE;
  if (o?.maintenanceSummon) flags |= OWNERSHIP_FLAG_MAINTENANCE;
  if (o?.rewardSuppressed) flags |= OWNERSHIP_FLAG_REWARD_SUPPRESSED;
  return [
    o ? Math.max(0, OWNERSHIP_CLASS_ORDER.indexOf(o.populationClass)) : 0,
    o?.waveId ?? 0,
    o?.leaderId ?? 0,
    flags,
    o?.formationRole ? ENEMY_FORMATION_ROLE_ORDER.indexOf(o.formationRole) + 1 : 0,
  ];
}

/** Semantic presentation actions (Idle/Walk/Attack/Death) with a tiny codec. */
const SEMANTIC_ACTION_ORDER = [
  'enemy.semantic.idle',
  'enemy.semantic.walk',
  'enemy.semantic.attack',
  'enemy.semantic.death',
] as const;

export function semanticActionIndex(actionId: string): number {
  const i = SEMANTIC_ACTION_ORDER.indexOf(actionId as (typeof SEMANTIC_ACTION_ORDER)[number]);
  return i < 0 ? 0 : i + 1;
}

export function semanticActionIdForIndex(index: number): string | undefined {
  if (!Number.isInteger(index) || index <= 0) return undefined;
  return SEMANTIC_ACTION_ORDER[index - 1];
}

export function encodeDelta(e: EnemyState, withVertical = true): number[] {
  const base = [
    e.id,
    quantizeXZ(e.x),
    quantizeXZ(e.z),
    quantizeYaw(e.yaw),
    quantizeHp(e.hp),
    flagsFor(e),
  ];
  if (!withVertical) return base;
  base.push(
    quantizeY(e.y),
    quantizeVy(e.impulseVy ?? 0),
    quantizeImpulseTick(e.lastImpulseT),
  );
  return base;
}

const CLASS_ORDER: PopulationClass[] = ['ambient', 'wave', 'boss', 'special'];
const SECTOR_FLAG_PURGE = 1;
const SECTOR_FLAG_MAINTENANCE = 2;
const SECTOR_FLAG_REWARD_SUPPRESSED = 4;

export function encodeSector(s: HordeSectorState): number[] {
  return [
    s.sectorId,
    enemyDefinitionIndex(s.enemyDefId),
    s.count,
    quantizeXZ(s.centerX),
    quantizeXZ(s.centerZ),
    Math.round(s.flowDx * 100),
    Math.round(s.flowDz * 100),
    Math.max(0, CLASS_ORDER.indexOf(s.populationClass)),
    s.waveId ?? 0,
    quantizeHp(s.threat),
    s.leaderId ?? 0,
    (s.purgeOnLeaderDeath ? SECTOR_FLAG_PURGE : 0) |
      (s.maintenanceSummon ? SECTOR_FLAG_MAINTENANCE : 0) |
      (s.rewardSuppressed ? SECTOR_FLAG_REWARD_SUPPRESSED : 0),
  ];
}

export function decodeSector(rec: number[]): HordeSectorState {
  const [sectorId, defIndex, count, xq, zq, flowDxq, flowDzq, classIndex, waveId, threatq, leaderId = 0, sectorFlags = 0] = rec;
  const enemyDefId = enemyDefinitionIdForIndex(defIndex) ?? '';
  return {
    sectorId,
    enemyDefId,
    count,
    centerX: dequantizeXZ(xq),
    centerZ: dequantizeXZ(zq),
    flowDx: flowDxq / 100,
    flowDz: flowDzq / 100,
    populationClass: CLASS_ORDER[Math.max(0, Math.min(CLASS_ORDER.length - 1, classIndex))] ?? 'ambient',
    waveId: waveId === 0 ? null : waveId,
    leaderId: leaderId === 0 ? null : leaderId,
    purgeOnLeaderDeath: (sectorFlags & SECTOR_FLAG_PURGE) !== 0,
    maintenanceSummon: (sectorFlags & SECTOR_FLAG_MAINTENANCE) !== 0,
    rewardSuppressed: (sectorFlags & SECTOR_FLAG_REWARD_SUPPRESSED) !== 0,
    threat: dequantizeHp(threatq),
    presentationSeed: sectorId,
  };
}
