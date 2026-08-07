/**
 * Typed wire protocol for Recoil Crew netcode (network03).
 *
 * Messages are plain JSON objects with a `t` discriminator. Every client
 * message carries `protocol` so a mismatched build is rejected loudly.
 */
import type { DriverInput, GunnerInput, ModifierId, Role } from '../types';
import type { HordeSnapshotBlock } from './horde/hordeProtocol';
import type { SelectedMonsterRun } from '../monsters/monsterRunSelection';

export interface HordeStageView {
  phase: string;
  farmingTimeRemaining: number;
  waveId: number | null;
  leaderHp: number;
  leaderMaxHp: number;
  /** Production monster loop (present only for gameplay-roster modes). */
  monster?: HordeMonsterStageView;
}

export type HordeMonsterPhase = 'FARMING' | 'BOSS_INTRO' | 'BOSS_ACTIVE' | 'RESULTS';

export interface HordeEncounterView {
  /** Slot id in the selected-run plan (selected.waveN.eliteI / selected.boss). */
  slotId: string;
  enemyId: string;
  label: string;
  hp: number;
  maxHp: number;
  alive: boolean;
  kind: 'elite' | 'boss';
}

export interface HordeMonsterStageView {
  phase: HordeMonsterPhase;
  /** Current authoritative monster level (1-13). */
  level: number;
  /** Active elite/boss encounter rows for the HUD encounter bars. */
  encounters: HordeEncounterView[];
}

/**
 * Server -> client: the authoritative selected run for the upcoming match.
 * Clients preload exactly these assets and reply with assetReady before the
 * countdown starts. `run` is null for Demo modes (no preload gate).
 */
export interface RunConfigMessage extends ProtocolEnvelope {
  t: 'runConfig';
  matchId: string;
  modeId: string;
  run: SelectedMonsterRun | null;
  /** Protocol-10 compatibility gate: authoritative content hash. */
  contentHash?: string;
  /** Protocol-10 compatibility gate: enemy-definition-order hash. */
  definitionOrderHash?: string;
}

/**
 * Progression08: selectUpgrade client message added (bumped deliberately;
 * snapshots already carry the full progression state for reconnect).
 * Protocol 9: runConfig/assetReady preload handshake for the production
 * monster loop.
 * Protocol 10 (monster-fix2): horde materialize/delta records gained
 * quantized Y, vertical velocity, airborne flag, and impulse start tick;
 * handshake now validates content-pack hash + enemy-definition-order hash.
 * Protocol 11: selected runs carry boss escort count and reconnects reuse
 * the server-selected run instead of reconstructing it client-side.
 * Protocol 12: lobby roles are always occupied by connected players and
 * two-player changes use an explicit request/accept swap handshake.
   * Protocol 13: snapshots carry the authoritative burst/recovery dash state,
   * captured direction, and temporary dash-velocity diagnostics.
   * Protocol 14: snapshots carry authoritative relic chest lifecycle timing,
   * reward candidate offers, and stable relic acquisition order.
   * Protocol 15: tank snapshots carry authoritative airborne jump and
   * AIR MASTER Dash-reuse counters for shared prediction.
   * Protocol 16: relic reveal uses per-connected-player acknowledgements
   * with no replicated auto-dismiss deadline.
   * Protocol 17: team progression snapshots include the authoritative,
   * level-up-only cumulative stat summary used by the tactical drawer.
   */
export const PROTOCOL_VERSION = 17;

export interface ProtocolEnvelope {
  protocol: number;
  t: string;
}

// Client → Server ---------------------------------------------------------

export interface CreateMessage extends ProtocolEnvelope {
  t: 'create';
  displayName?: string;
}

export interface JoinMessage extends ProtocolEnvelope {
  t: 'join';
  code: string;
  displayName?: string;
}

export interface LobbySelectSeatMessage extends ProtocolEnvelope {
  t: 'lobbySelectSeat';
  seat: 'driver' | 'gunner';
  lobbyRevision: number;
}

export interface LobbyRequestRoleSwapMessage extends ProtocolEnvelope {
  t: 'lobbyRequestRoleSwap';
  lobbyRevision: number;
}

export interface LobbyResolveRoleSwapMessage extends ProtocolEnvelope {
  t: 'lobbyResolveRoleSwap';
  requestId: number;
  accept: boolean;
  lobbyRevision: number;
}

export interface LobbyReadySetMessage extends ProtocolEnvelope {
  t: 'lobbyReadySet';
  ready: boolean;
  lobbyRevision: number;
}

export interface LobbyChatSendMessage extends ProtocolEnvelope {
  t: 'lobbyChatSend';
  text: string;
}

export interface RejoinMessage extends ProtocolEnvelope {
  t: 'rejoin';
  code: string;
  sessionId: string;
}

export interface PingMessage extends ProtocolEnvelope {
  t: 'ping';
  ts: number;
}

export interface ReadyMessage extends ProtocolEnvelope {
  t: 'ready';
  ready: boolean;
}

export interface DriverInputMessage extends ProtocolEnvelope {
  t: 'input';
  seq: number;
  driver: DriverInput;
}

export interface GunnerInputMessage extends ProtocolEnvelope {
  t: 'input';
  seq: number;
  gunner: GunnerInput;
}

/** Discrete Gunner action (immediate send, not part of the aim frame). */
export type GunnerActionType =
  | 'mgStart'
  | 'mgStop'
  | 'secondaryPressed'
  | 'secondaryReleased';

export interface GunnerActionMessage extends ProtocolEnvelope {
  t: 'action';
  actionSeq: number;
  action: GunnerActionType;
  /** Click/release-time aim (chassis-local yaw, pitch). */
  aimYaw?: number;
  aimPitch?: number;
}

export interface RematchMessage extends ProtocolEnvelope {
  t: 'rematch';
  modifier: ModifierId;
}

export interface SelectUpgradeMessage extends ProtocolEnvelope {
  t: 'selectUpgrade';
  offerId: string;
  cardIndex: number;
}

export interface SkipRelicPresentationMessage extends ProtocolEnvelope {
  t: 'skipRelicPresentation';
  acquisitionSequence: number;
}

export interface AcknowledgeRelicMessage extends ProtocolEnvelope {
  t: 'acknowledgeRelic';
  acquisitionSequence: number;
}

export interface LeaveMessage extends ProtocolEnvelope {
  t: 'leave';
}

export interface AssetReadyMessage extends ProtocolEnvelope {
  t: 'assetReady';
  matchId: string;
  /** Client-reported compatibility hashes; server rejects mismatches. */
  contentHash?: string;
  definitionOrderHash?: string;
}

export type ClientMessage =
  | CreateMessage
  | JoinMessage
  | RejoinMessage
  | PingMessage
  | ReadyMessage
  | LobbySelectSeatMessage
  | LobbyRequestRoleSwapMessage
  | LobbyResolveRoleSwapMessage
  | LobbyReadySetMessage
  | LobbyChatSendMessage
  | DriverInputMessage
  | GunnerInputMessage
  | GunnerActionMessage
  | AssetReadyMessage
  | RematchMessage
  | SelectUpgradeMessage
  | AcknowledgeRelicMessage
  | SkipRelicPresentationMessage
  | LeaveMessage;

// Server → Client ---------------------------------------------------------

export interface SnapshotMessage extends ProtocolEnvelope {
  t: 'snapshot';
  seq: number;
  serverTime: number;
  serverTick: number;
  state: unknown; // MatchState serialized; typed on the client
  lastProcessedDriverInputSeq: number;
  lastProcessedGunnerInputSeq: number;
  lastImpulseSeq: number;
  opLog: Array<{ o: number; k: 'd' | 'i'; s: number }>;
  rulesRevision?: number;
  movementRulesRevision?: number;
  movement?: unknown;
  arena?: unknown;
  /** Tiered horde replication block (replaces the full enemy array). */
  horde?: HordeSnapshotBlock;
  /** Core Loop 06 M11: stage/wave HUD state for enforced horde matches. */
  stage?: HordeStageView;
}

export interface DriverInputRelayMessage extends ProtocolEnvelope {
  t: 'driverInputRelay';
  seq: number;
  driver: DriverInput;
}

export interface GunnerActionResultMessage extends ProtocolEnvelope {
  t: 'actionResult';
  actionSeq: number;
  accepted: boolean;
  reason?: string;
}

export interface TankImpulseMessage extends ProtocolEnvelope {
  t: 'tankImpulse';
  impulseSeq: number;
  opSeq: number;
  simulationTick: number;
  source: 'recoil' | 'cannon' | 'mg' | 'external';
  sourceActionSeq?: number;
  deltaVx: number;
  deltaVy: number;
  deltaVz: number;
  deltaYawVel: number;
  deltaRoll: number;
}

export interface TimingBlockMessage extends ProtocolEnvelope {
  t: 'timing';
  serverTick: number;
  serverTime: number;
  tickDurationMs: number;
  droppedTimeMs: number;
  driftMs: number;
}

export type ServerMessage =
  | SnapshotMessage
  | DriverInputRelayMessage
  | GunnerActionResultMessage
  | TankImpulseMessage
  | TimingBlockMessage
  | RunConfigMessage
  | (ProtocolEnvelope & Record<string, unknown>);

/** Client message kind → guard for the server dispatcher. */
export function isClientMessage(raw: Record<string, unknown>): boolean {
  return typeof raw.t === 'string';
}

export function protocolOk(raw: Record<string, unknown>): boolean {
  return raw.protocol === PROTOCOL_VERSION;
}

export interface ProtocolCompatibility {
  ok: boolean;
  reason?: string;
}

/**
 * Hard protocol compatibility gate. Protocol version is enforced by the
 * transport; content-pack and enemy-definition-order hashes are enforced
 * here before any match starts (and again on reconnect). A mismatch is a
 * hard reject, never a permissive decode.
 */
export function checkProtocolCompatibility(opts: {
  clientProtocol: number;
  clientContentHash?: string;
  clientDefinitionOrderHash?: string;
  serverProtocol: number;
  serverContentHash?: string;
  serverDefinitionOrderHash?: string;
}): ProtocolCompatibility {
  if (opts.clientProtocol !== opts.serverProtocol) {
    return {
      ok: false,
      reason: `protocol version mismatch (client ${opts.clientProtocol}, server ${opts.serverProtocol})`,
    };
  }
  if (
    opts.serverContentHash !== undefined &&
    opts.clientContentHash !== opts.serverContentHash
  ) {
    return { ok: false, reason: 'content-pack hash mismatch' };
  }
  if (
    opts.serverDefinitionOrderHash !== undefined &&
    opts.clientDefinitionOrderHash !== opts.serverDefinitionOrderHash
  ) {
    return { ok: false, reason: 'enemy-definition-order hash mismatch' };
  }
  return { ok: true };
}

export type { Role };
