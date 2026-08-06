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
}

/**
 * Progression08: selectUpgrade client message added (bumped deliberately;
 * snapshots already carry the full progression state for reconnect).
 * Protocol 9: runConfig/assetReady preload handshake for the production
 * monster loop.
 */
export const PROTOCOL_VERSION = 9;

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
  seat: 'driver' | 'gunner' | null;
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

export interface LeaveMessage extends ProtocolEnvelope {
  t: 'leave';
}

export interface AssetReadyMessage extends ProtocolEnvelope {
  t: 'assetReady';
  matchId: string;
}

export type ClientMessage =
  | CreateMessage
  | JoinMessage
  | RejoinMessage
  | PingMessage
  | ReadyMessage
  | LobbySelectSeatMessage
  | LobbyReadySetMessage
  | LobbyChatSendMessage
  | DriverInputMessage
  | GunnerInputMessage
  | GunnerActionMessage
  | AssetReadyMessage
  | RematchMessage
  | SelectUpgradeMessage
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

export type { Role };
