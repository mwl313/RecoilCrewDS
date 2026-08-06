import { GAME } from '../shared/config';
import type { ArenaMetadata, ArenaSessionResult } from '../shared/mapgen/arenaSession';
import { selectArenaSessionFromPack } from '../shared/mapgen/arenaSession';
import { Match } from '../shared/sim/match';
import type { ArenaWorld } from '../shared/sim/arenaWorld';
import type { ContentPack } from '../shared/content/contentPack';
import type { DriverInput, GunnerInput, MatchResults, ModifierId, Role } from '../shared/types';
import { SNAPSHOT_INTERVAL, NET_TUNING } from '../shared/net/tuning';
import { HordeReplicationTracker } from '../shared/net/horde/hordeReplication';
import type { HordeWaveState } from '../shared/net/horde/hordeProtocol';
import {
  checkProtocolCompatibility,
  PROTOCOL_VERSION,
  type GunnerActionType,
} from '../shared/net/protocol';
import type { TankImpulseWire } from '../shared/effects/tankImpulseSystem';
import { opLogTail } from '../shared/sim/opLog';
import { ENEMY_DEFINITION_ORDER_HASH } from '../generated/enemyDefinitionIndex.generated';
import type {
  ClientLobbyState,
  CrewSeat,
  LobbyChatMessage,
  LobbyPlayerInternal,
} from '../shared/lobby/lobbyTypes';
import { LOBBY_CHAT_BURST, LOBBY_CHAT_MAX_MESSAGES, LOBBY_CHAT_REFILL_SECONDS, LOBBY_COUNTDOWN_SECONDS } from '../shared/lobby/lobbyTypes';
import { computeStartEligibility } from '../shared/lobby/lobbyEligibility';
import { isCrewSeat, seatConflict, validateChatText } from '../shared/lobby/lobbyValidation';
import { validateNickname } from '../shared/lobby/nicknameValidation';
import { generateDefaultNickname } from '../shared/lobby/nicknamePool';
import { stageViewForMatch } from '../shared/monsters/monsterStageView';
import { resolveSelectedMonsterRun } from '../shared/monsters/monsterPreload';

export interface SocketLike {
  send(msg: unknown): void;
  /** Pre-serialized broadcast (identical payload for both sockets). */
  sendText?(text: string): void;
  close(code?: number, reason?: string): void;
}

export interface ServerToClient {
  send(socket: SocketLike, msg: Record<string, unknown>): void;
}

export interface Client {
  id: string;
  sessionId: string;
  role: Role | null;
  room: Room | null;
  socket: SocketLike | null;
  lastMsgAt: number;
  lastInputAt: number;
  inputSeq: number;
  actionSeq: number;
  disconnectedAt: number | null;
  graceLeft: number;
}

export type RoomPhase = 'lobby' | 'loading' | 'countdown' | 'running' | 'results';

/** Content pack metadata broadcast to clients (Phase 1, additive). */
export interface ContentMetadata {
  packId: string;
  version: string;
  hash: string;
  modeId: string;
}

export interface Room {
  code: string;
  driver: Client | null;
  gunner: Client | null;
  /** Lobby V2 generic crew state (authoritative; driver/gunner mirror seats). */
  players: LobbyPlayerInternal[];
  hostPlayerId: string;
  lobbyRevision: number;
  lobbyPhase: 'lobby' | 'countdown';
  /** Production preload gate: elapsed seconds waiting for assetReady. */
  loadingT: number;
  /** Match id reserved before the countdown so run selection is stable. */
  pendingMatchId: string | null;
  assetReady: { driver: boolean; gunner: boolean };
  countdownEndsAtWallMs: number | null;
  chat: LobbyChatMessage[];
  chatSequence: number;
  chatTokens: Map<string, LobbyChatTokens>;
  phase: RoomPhase;
  match: Match | null;
  content: ContentMetadata | null;
  ready: { driver: boolean; gunner: boolean };
  rematch: { driver: ModifierId | null; gunner: ModifierId | null };
  rematchModifier: ModifierId;
  /** Deterministic map seed index: 0 = first round, +1 per rematch. */
  matchIndex: number;
  /** Match-scoped generated arena (Phase 3). */
  arenaSession: ArenaSessionResult | null;
  countdownT: number;
  snapshotT: number;
  snapshotSeq: number;
  simTick: number;
  lastMovementRulesRevision: number;
  lastCountdownShown: number;
  lastDriverRelayEdges: { dash: boolean; jump: boolean };
  hordeReplication: HordeReplicationTracker | null;
  createdAt: number;
}

interface LobbyChatTokens {
  tokens: number;
  lastRefillWallMs: number;
}

export interface ManagerEvents {
  onSend?(socket: SocketLike, msg: Record<string, unknown>): void;
}

export interface LoopMetrics {
  tickDurationMs: number;
  droppedTimeMs: number;
  driftMs: number;
  outboundBuffered: number;
}

const CODE_ALPHABET = GAME.roomCodeAlphabet;
/** Production preload gate: proceed after this many seconds regardless. */
const ASSET_READY_TIMEOUT_SECONDS = 15;
/**
 * Test-only server damage hook, enabled exclusively on qualification
 * servers (ALLOW_TEST_DAMAGE=1). Never enabled in production deployments;
 * it exists so the automated two-client e2e can complete a full run.
 */
const TEST_DAMAGE_ENABLED = process.env.ALLOW_TEST_DAMAGE === '1';

function randomCode(): string {
  let out = '';
  for (let i = 0; i < GAME.roomCodeLength; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

function waveStateFor(match: Match): HordeWaveState | null {
  const horde = match.runtime.systems.horde;
  if (!horde || horde.currentWaveId === null) return null;
  const runtime = match.runtime.systems.waves.waves.get(horde.currentWaveId);
  if (!runtime) return null;
  const leader = match.state.enemies.find((e) => e.id === runtime.leaderId);
  return {
    waveId: runtime.waveId,
    state: runtime.state,
    leaderId: runtime.leaderId,
    leaderHp: leader?.hp ?? 0,
    leaderMaxHp: leader?.maxHp ?? 0,
  };
}

function stageViewFor(match: Match) {
  return stageViewForMatch(match.runtime);
}

function sanitizeDriver(raw: unknown): DriverInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const throttle = typeof r.throttle === 'number' && Number.isFinite(r.throttle) ? Math.max(-1, Math.min(1, r.throttle)) : 0;
  const steer = typeof r.steer === 'number' && Number.isFinite(r.steer) ? Math.max(-1, Math.min(1, r.steer)) : 0;
  return {
    throttle,
    steer,
    // Action edges accept only explicit booleans; anything else is treated
    // as "not pressed" so clients can never manufacture extra edges.
    dashPressed: r.dashPressed === true,
    jumpPressed: r.jumpPressed === true,
  };
}

function sanitizeGunner(raw: unknown): GunnerInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const aimYaw = typeof r.aimYaw === 'number' && Number.isFinite(r.aimYaw) ? r.aimYaw : 0;
  const aimPitch = typeof r.aimPitch === 'number' && Number.isFinite(r.aimPitch) ? Math.max(-1.5, Math.min(1.5, r.aimPitch)) : 0;
  const gunner: GunnerInput = {
    aimYaw,
    aimPitch,
    primary: !!r.primary,
    secondary: !!r.secondary,
  };
  return gunner;
}

const GUNNER_ACTIONS: readonly GunnerActionType[] = [
  'mgStart',
  'mgStop',
  'secondaryPressed',
  'secondaryReleased',
];

export class RoomManager {
  rooms = new Map<string, Room>();
  clients = new Map<string, Client>();
  private events: ManagerEvents = {};
  private now: () => number;
  private contentMeta: ContentMetadata | null;
  private pack: ContentPack | null;
  private loopMetrics: LoopMetrics = { tickDurationMs: 0, droppedTimeMs: 0, driftMs: 0, outboundBuffered: 0 };

  constructor(opts: {
    events?: ManagerEvents;
    now?: () => number;
    content?: ContentMetadata | null;
    pack?: ContentPack | null;
  } = {}) {
    this.events = opts.events ?? {};
    this.now = opts.now ?? (() => Date.now());
    this.contentMeta = opts.content ?? null;
    this.pack = opts.pack ?? null;
  }

  send(client: Client | null, msg: Record<string, unknown>) {
    if (!client?.socket) return;
    try {
      if (this.events.onSend) {
        this.events.onSend(client.socket, msg);
      } else {
        client.socket.send(msg);
      }
    } catch {
      // Socket failure handled by the transport layer.
    }
  }

  /** Broadcast one pre-serialized payload to both sockets. */
  sendSerialized(room: Room, text: string): void {
    const sendTo = (client: Client | null): void => {
      if (!client?.socket) return;
      try {
        if (client.socket.sendText) client.socket.sendText(text);
        else client.socket.send(JSON.parse(text));
      } catch {
        // transport layer
      }
    };
    sendTo(room.driver);
    sendTo(room.gunner);
  }

  setLoopMetrics(metrics: LoopMetrics): void {
    this.loopMetrics = metrics;
  }

  create(socket: SocketLike, displayName?: string): Client {
    if (this.rooms.size >= GAME.maxRooms) {
      this.sendWithSocket(socket, { t: 'error', code: 'limit', message: 'Server is full right now. Try again in a moment.' });
      throw new Error('room limit reached');
    }
    let code = randomCode();
    let guard = 0;
    while (this.rooms.has(code) && guard++ < 50) code = randomCode();
    const client: Client = {
      id: randomId(),
      sessionId: randomId(),
      role: 'driver',
      room: null,
      socket,
      lastMsgAt: this.now(),
      lastInputAt: this.now(),
      inputSeq: 0,
      actionSeq: 0,
      disconnectedAt: null,
      graceLeft: 0,
    };
    const playerId = randomId();
    const normalizedName = this.normalizeOrGenerate(displayName);
    const room: Room = {
      code,
      driver: client,
      gunner: null,
      players: [
        {
          playerId,
          sessionId: client.sessionId,
          displayName: normalizedName,
          connected: true,
          reconnectDeadlineWallMs: null,
          seat: 'driver',
          ready: false,
          joinedSequence: 1,
        },
      ],
      hostPlayerId: playerId,
      lobbyRevision: 1,
      lobbyPhase: 'lobby',
      loadingT: 0,
      pendingMatchId: null,
      assetReady: { driver: false, gunner: false },
      countdownEndsAtWallMs: null,
      chat: [],
      chatSequence: 0,
      chatTokens: new Map(),
      phase: 'lobby',
      match: null,
      content: this.contentMeta,
      ready: { driver: false, gunner: false },
      rematch: { driver: null, gunner: null },
      rematchModifier: 'none',
      matchIndex: 0,
      arenaSession: null,
      countdownT: 0,
      snapshotT: 0,
      snapshotSeq: 0,
      simTick: 0,
      lastMovementRulesRevision: -1,
      lastCountdownShown: 3,
      lastDriverRelayEdges: { dash: false, jump: false },
      hordeReplication: null,
      createdAt: this.now(),
    };
    client.room = room;
    this.rooms.set(code, room);
    this.clients.set(client.id, client);
    const lobby = this.buildLobbyState(room);
    this.send(client, {
      t: 'created',
      code,
      role: 'driver',
      sessionId: client.sessionId,
      playerId,
      displayName: normalizedName,
      seat: 'driver',
      hostPlayerId: playerId,
      phase: 'lobby',
      lobby,
      chat: room.chat,
    });
    return client;
  }

  join(codeRaw: string, socket: SocketLike, displayName?: string): Client {
    const code = codeRaw.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      this.sendWithSocket(socket, { t: 'error', code: 'not_found', message: `No crew found with code ${code}. Check the code and try again.` });
      throw new Error('room not found');
    }
    if (room.gunner && room.gunner.socket) {
      this.sendWithSocket(socket, { t: 'error', code: 'full', message: 'That crew already has a Gunner.' });
      throw new Error('room full');
    }
    if (room.phase !== 'lobby') {
      // Allow joining only while waiting; an in-progress crew cannot be joined.
      this.sendWithSocket(socket, { t: 'error', code: 'started', message: 'That crew is already in a round.' });
      throw new Error('room started');
    }
    const client: Client = {
      id: randomId(),
      sessionId: randomId(),
      role: 'gunner',
      room,
      socket,
      lastMsgAt: this.now(),
      lastInputAt: this.now(),
      inputSeq: 0,
      actionSeq: 0,
      disconnectedAt: null,
      graceLeft: 0,
    };
    if (room.players.length >= 2) {
      this.sendWithSocket(socket, { t: 'error', code: 'full', message: 'That crew already has two players.' });
      throw new Error('room full');
    }
    room.gunner = client;
    const playerId = randomId();
    const normalizedName = this.normalizeOrGenerate(displayName);
    room.players.push({
      playerId,
      sessionId: client.sessionId,
      displayName: normalizedName,
      connected: true,
      reconnectDeadlineWallMs: null,
      seat: 'gunner',
      ready: false,
      joinedSequence: room.players.reduce((max, p) => Math.max(max, p.joinedSequence), 0) + 1,
    });
    room.lobbyRevision++;
    this.clients.set(client.id, client);
    const lobby = this.buildLobbyState(room);
    this.send(client, {
      t: 'joined',
      code,
      role: 'gunner',
      sessionId: client.sessionId,
      playerId,
      displayName: normalizedName,
      seat: 'gunner',
      hostPlayerId: room.hostPlayerId,
      phase: room.phase,
      lobby,
      chat: room.chat,
    });
    this.broadcastLobby(room);
    this.broadcastPeers(room);
    return client;
  }

  rejoin(codeRaw: string, sessionId: string, socket: SocketLike): Client | null {
    const code = codeRaw.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      this.sendWithSocket(socket, { t: 'error', code: 'not_found', message: 'That crew is gone. Create a new one or play Single Player.' });
      return null;
    }
    const player = room.players.find((p) => p.sessionId === sessionId);
    const candidate = player
      ? room.driver?.sessionId === sessionId
        ? room.driver
        : room.gunner?.sessionId === sessionId
          ? room.gunner
          : null
      : null;
    if (player && candidate) {
      candidate.socket = socket;
      candidate.disconnectedAt = null;
      candidate.graceLeft = 0;
      candidate.lastMsgAt = this.now();
      candidate.lastInputAt = this.now();
      this.clients.set(candidate.id, candidate);
      player.connected = true;
      player.reconnectDeadlineWallMs = null;
      // Mid-round reconnects (running/results) keep the crew ready so a
      // rematch can proceed; lobby reconnects must re-ready explicitly.
      player.ready = room.phase === 'running' || room.phase === 'results';
      // Restore seat → match slot references (unchanged client role).
      if (player.seat === 'driver') room.driver = candidate;
      else if (player.seat === 'gunner') room.gunner = candidate;
      this.cancelCountdown(room, 'reconnect');
      room.lobbyRevision++;
      const lobby = this.buildLobbyState(room);
      this.send(candidate, {
        t: 'joined',
        code,
        role: candidate.role,
        sessionId: candidate.sessionId,
        playerId: player.playerId,
        displayName: player.displayName,
        seat: player.seat,
        hostPlayerId: room.hostPlayerId,
        phase: room.phase,
        arena: room.arenaSession?.metadata ?? null,
        ...((room.phase === 'running' || room.phase === 'results') && room.content
          ? {
              content: room.content,
              definitionOrderHash: ENEMY_DEFINITION_ORDER_HASH,
              matchId: room.match?.state.matchId,
              modeId: this.contentMeta?.modeId ?? 'mode.mainStage',
              run: room.match?.runtime.systems.monsterRun ?? null,
            }
          : {}),
        lobby,
        chat: room.chat,
      });
      this.broadcastLobby(room);
      this.broadcastPeers(room);
      return candidate;
    }
    this.sendWithSocket(socket, { t: 'error', code: 'session', message: 'That session is no longer valid. Create or join a new crew.' });
    return null;
  }

  disconnect(client: Client) {
    if (!client.room) return;
    const room = client.room;
    const player = room.players.find((p) => p.sessionId === client.sessionId);
    if (player) {
      player.connected = false;
      player.reconnectDeadlineWallMs = this.now() + GAME.reconnectGrace * 1000;
      player.ready = false;
    }
    client.socket = null;
    client.disconnectedAt = this.now();
    client.graceLeft = GAME.reconnectGrace;
    this.cancelCountdown(room, 'disconnect');
    room.lobbyRevision++;
    this.broadcastLobby(room);
    this.broadcastPeers(room);
  }

  handle(socket: SocketLike, raw: Record<string, unknown>) {
    const client = this.getClient(socket);
    const t = raw.t;
    if (t === 'create') {
      if (client?.room) return;
      this.create(socket, typeof raw.displayName === 'string' ? raw.displayName : undefined);
      return;
    }
    if (t === 'join') {
      if (typeof raw.code !== 'string') return;
      if (client?.room) return;
      this.join(raw.code, socket, typeof raw.displayName === 'string' ? raw.displayName : undefined);
      return;
    }
    if (t === 'rejoin') {
      if (typeof raw.code !== 'string' || typeof raw.sessionId !== 'string') return;
      this.rejoin(raw.code, raw.sessionId, socket);
      return;
    }
    if (t === 'ping') {
      this.send(client, { t: 'pong', ts: raw.ts ?? Date.now() });
      return;
    }
    if (!client?.room) {
      this.sendWithSocket(socket, { t: 'error', code: 'no_room', message: 'Create or join a crew first.' });
      return;
    }
    const room = client.room;
    if (t === 'ready') {
      // Legacy compatibility: map the old ready message onto Lobby V2.
      this.handleLobbyReady(client, raw.ready === true, room.lobbyRevision);
      return;
    }
    if (t === 'lobbySelectSeat') {
      if (room.phase !== 'lobby' && room.phase !== 'countdown') return;
      const seat = isCrewSeat(raw.seat) ? raw.seat : raw.seat === null ? null : undefined;
      if (seat === undefined) {
        this.send(client, { t: 'error', code: 'invalid_seat', message: 'Unknown crew role.' });
        return;
      }
      const revision = typeof raw.lobbyRevision === 'number' ? raw.lobbyRevision : room.lobbyRevision;
      const result = this.handleLobbySeat(client, seat, revision);
      if (!result.accepted && result.reason) {
        this.send(client, { t: 'error', code: result.reason, message: result.message });
      }
      return;
    }
    if (t === 'lobbyReadySet') {
      if (room.phase !== 'lobby' && room.phase !== 'countdown') return;
      const ready = raw.ready === true;
      const revision = typeof raw.lobbyRevision === 'number' ? raw.lobbyRevision : room.lobbyRevision;
      const result = this.handleLobbyReady(client, ready, revision);
      if (!result.accepted && result.reason) {
        this.send(client, { t: 'error', code: result.reason, message: result.message });
      }
      return;
    }
    if (t === 'lobbyChatSend') {
      if (room.phase !== 'lobby' && room.phase !== 'countdown') return;
      this.handleLobbyChat(client, typeof raw.text === 'string' ? raw.text : '');
      return;
    }
    if (t === 'input') {
      this.applyInput(client, raw);
      return;
    }
    if (t === 'action') {
      this.applyGunnerAction(client, raw);
      return;
    }
    if (t === 'selectUpgrade') {
      if (room.phase !== 'running' || !room.match || !client.role) return;
      const offerId = typeof raw.offerId === 'string' ? raw.offerId : '';
      const cardIndex = typeof raw.cardIndex === 'number' ? raw.cardIndex : -1;
      room.match.submitProgressionSelection(client.role, offerId, cardIndex);
      return;
    }
    if (t === 'skipRelicPresentation') {
      if (room.phase !== 'running' || !room.match || !client.role) return;
      const acquisitionSequence = typeof raw.acquisitionSequence === 'number' ? raw.acquisitionSequence : -1;
      // Either player may skip the shared reveal; the command is idempotent
      // on the authority and can never alter the predetermined result.
      room.match.skipProgressionRelic(acquisitionSequence, this.now());
      return;
    }
    if (t === 'rematch') {
      if (room.phase !== 'results' || !client.role || !room.match) return;
      const modifier = typeof raw.modifier === 'string' && raw.modifier.length > 0 ? (raw.modifier as ModifierId) : 'none';
      room.rematch[client.role] = modifier;
      room.rematchModifier = modifier;
      this.broadcastResults(room);
      if (room.rematch.driver && room.rematch.gunner) {
        room.rematch = { driver: null, gunner: null };
        room.ready = { driver: false, gunner: false };
        if (this.isProductionRoom()) {
          this.beginProductionLoading(room);
        } else {
          this.beginCountdown(room, room.rematchModifier);
        }
      }
      return;
    }
    if (t === 'assetReady') {
      if (room.phase !== 'loading' || !client.role) return;
      if (raw.matchId !== room.pendingMatchId) return;
      if (this.contentMeta) {
        const compat = checkProtocolCompatibility({
          // The WebSocket transport enforces the protocol version before
          // dispatch; the room-level gate validates the content hashes.
          clientProtocol: PROTOCOL_VERSION,
          clientContentHash:
            typeof raw.contentHash === 'string' ? raw.contentHash : undefined,
          clientDefinitionOrderHash:
            typeof raw.definitionOrderHash === 'string' ? raw.definitionOrderHash : undefined,
          serverProtocol: PROTOCOL_VERSION,
          serverContentHash: this.contentMeta.hash,
          serverDefinitionOrderHash: ENEMY_DEFINITION_ORDER_HASH,
        });
        if (!compat.ok) {
          const reason = compat.reason ?? 'incompatible client';
          this.sendWithSocket(socket, {
            t: 'error',
            code: 'compatibility',
            message: reason,
          });
          socket.close(1008, reason);
          this.cancelCountdown(room, 'compatibility');
          return;
        }
      }
      room.assetReady[client.role] = true;
      if (room.assetReady.driver && room.assetReady.gunner) this.beginCountdown(room);
      return;
    }
    if (t === 'testDamageEnemyByDef') {
      if (!TEST_DAMAGE_ENABLED || room.phase !== 'running' || !room.match) return;
      const defId = typeof raw.defId === 'string' ? raw.defId : '';
      const amount = typeof raw.amount === 'number' && Number.isFinite(raw.amount) ? raw.amount : 0;
      const enemy = room.match.state.enemies.find((e) => e.defId === defId && e.alive);
      if (enemy && amount > 0) room.match.runtime.damageEnemy(enemy, amount, 'test');
      return;
    }
    if (t === 'testHealTank') {
      if (!TEST_DAMAGE_ENABLED || room.phase !== 'running' || !room.match) return;
      room.match.state.tank.integrity = room.match.runtime.cfg.tank.maxIntegrity;
      room.match.state.tank.deadT = 0;
      return;
    }
    if (t === 'testImpulseEnemyByDef') {
      if (!TEST_DAMAGE_ENABLED || room.phase !== 'running' || !room.match) return;
      const defId = typeof raw.defId === 'string' ? raw.defId : '';
      const horizontal = typeof raw.horizontal === 'number' ? raw.horizontal : 0;
      const vertical = typeof raw.vertical === 'number' ? raw.vertical : 0;
      const enemy = room.match.state.enemies.find((e) => e.defId === defId && e.alive);
      const def = room.match.runtime.systems.enemies.defById(defId);
      if (!enemy || !def) return;
      const t = room.match.state.tank;
      const dx = t.x - enemy.x;
      const dz = t.z - enemy.z;
      const d = Math.hypot(dx, dz) || 1;
      room.match.runtime.systems.enemyImpulses.apply(
        enemy,
        def,
        dx / d,
        dz / d,
        horizontal,
        vertical,
        'cannon',
      );
      return;
    }
    if (t === 'leave') {
      this.removeClient(client);
      return;
    }
  }

  applyInput(client: Client, raw: Record<string, unknown>) {
    const room = client.room;
    if (!room || room.phase !== 'running' || !room.match || !client.role) return;
    const seq = typeof raw.seq === 'number' ? raw.seq : 0;
    if (seq <= client.inputSeq) return; // sequence protection
    client.inputSeq = seq;
    client.lastInputAt = this.now();
    if (client.role === 'driver') {
      const driver = sanitizeDriver(raw.driver);
      if (driver) {
        room.match.setDriverInput(driver, seq);
        // Relay only sanitized, accepted Driver input to the Gunner so the
        // Gunner can predict the shared tank without trusting the Driver.
        // Edges are normalized per frame so the Gunner predictor applies
        // jump/dash exactly once (matching the server's edge latch).
        const relay: DriverInput = {
          ...driver,
          dashPressed: driver.dashPressed && !room.lastDriverRelayEdges.dash,
          jumpPressed: driver.jumpPressed && !room.lastDriverRelayEdges.jump,
        };
        room.lastDriverRelayEdges = { dash: driver.dashPressed, jump: driver.jumpPressed };
        this.send(room.gunner, { t: 'driverInputRelay', seq, driver: relay });
      }
    } else if (client.role === 'gunner') {
      const gunner = sanitizeGunner(raw.gunner);
      if (gunner) room.match.setGunnerInput(gunner, seq);
    }
  }

  applyGunnerAction(client: Client, raw: Record<string, unknown>) {
    const room = client.room;
    if (!room || room.phase !== 'running' || !room.match || client.role !== 'gunner') return;
    const actionSeq = typeof raw.actionSeq === 'number' ? raw.actionSeq : 0;
    if (actionSeq <= client.actionSeq) return; // sequence protection
    const action = raw.action as GunnerActionType;
    if (!GUNNER_ACTIONS.includes(action)) {
      this.send(client, { t: 'actionResult', actionSeq, accepted: false, reason: 'unknown_action' });
      return;
    }
    client.actionSeq = actionSeq;
    const result = room.match.applyGunnerAction(action, actionSeq, {
      aimYaw: raw.aimYaw as number | undefined,
      aimPitch: raw.aimPitch as number | undefined,
    });
    this.send(client, { t: 'actionResult', actionSeq, accepted: result.accepted, reason: result.reason });
  }

  /** Advance all rooms. dt in seconds. */
  tick(dt: number) {
    const now = this.now();
    for (const room of this.rooms.values()) {
      // Disconnect grace for every lobby player (including seatless).
      for (const player of [...room.players]) {
        const client = room.driver?.sessionId === player.sessionId
          ? room.driver
          : room.gunner?.sessionId === player.sessionId
            ? room.gunner
            : null;
        if (client && !client.socket) {
          client.graceLeft -= dt;
          if (client.graceLeft <= 0) {
            this.removeClient(client);
          }
        }
      }
      if (!room.driver && !room.gunner) {
        this.rooms.delete(room.code);
        continue;
      }
      // Host migration after grace expiry.
      this.migrateHostIfNeeded(room, now);
      if (room.phase === 'countdown') {
        room.countdownT -= dt;
        const shown = Math.ceil(room.countdownT);
        if (shown !== room.lastCountdownShown && shown >= 0 && shown <= 3) {
          room.lastCountdownShown = shown;
          this.broadcast(room, { t: 'countdown', n: shown });
        }
        if (
          room.countdownT <= 0 ||
          (room.countdownEndsAtWallMs !== null && now >= room.countdownEndsAtWallMs)
        ) {
          const eligibility = computeStartEligibility({
            players: room.players,
            contentAvailable: this.contentAvailable(),
          });
          if (eligibility.eligible) {
            this.broadcast(room, { t: 'countdown', n: 0 });
            room.lobbyPhase = 'lobby';
            room.countdownEndsAtWallMs = null;
            try {
              this.startMatch(room);
            } catch (error) {
              // A mode/content resolution failure must never take down the
              // whole server; return the crew to the lobby instead.
              console.error(`[room ${room.code}] match start failed; returning to lobby`, error);
              room.phase = 'lobby';
              room.pendingMatchId = null;
              room.countdownT = 0;
              this.broadcastLobby(room);
            }
          } else {
            this.cancelCountdown(room, 'eligibility');
          }
        }
      } else if (room.phase === 'loading') {
        // Production preload gate: proceed after explicit client readiness
        // or the documented timeout so a stuck client cannot stall a crew.
        room.loadingT += dt;
        if (room.loadingT >= ASSET_READY_TIMEOUT_SECONDS) {
          this.beginCountdown(room);
        }
      } else if (room.phase === 'running' && room.match) {
        for (const client of [room.driver, room.gunner]) {
          if (client && client.socket && now - client.lastInputAt > GAME.inputTimeout * 1000) {
            if (client.role === 'driver') room.match.clearDriverInput();
            else if (client.role === 'gunner') room.match.clearGunnerInput();
          }
        }
        room.match.checkProgressionTimeout(now);
        room.simTick++;
        room.match.step(dt);
        const events = room.match.takeEvents();
        for (const ev of events) {
          this.broadcast(room, { t: 'event', event: ev });
        }
        for (const impulse of room.match.takeImpulseEvents()) {
          this.broadcastImpulse(room, impulse);
        }
        room.snapshotT += dt;
        if (room.snapshotT >= SNAPSHOT_INTERVAL) {
          // Interval subtraction (not reset-to-zero): keeps true 20 Hz.
          room.snapshotT -= SNAPSHOT_INTERVAL;
          this.broadcastSnapshot(room);
        }
        if (room.match.state.phase === 'results') {
          room.phase = 'results';
          this.broadcastSnapshot(room);
          this.broadcastResults(room);
        }
      }
    }
  }

  private startMatch(room: Room) {
    const matchIndex = room.matchIndex;
    room.matchIndex = matchIndex + 1;
    const matchId = room.pendingMatchId ?? room.code + '-' + this.now();
    room.pendingMatchId = null;
    let world: ArenaWorld | undefined;
    if (this.pack) {
      const session = selectArenaSessionFromPack(this.pack, {
        roomCode: room.code,
        matchIndex,
      });
      room.arenaSession = session;
      world = session.world;
    } else {
      room.arenaSession = null;
    }
    // Production multiplayer runs the main-stage horde loop. The room's
    // content metadata is authoritative when present (tests and fixture
    // servers keep the Demo mode); the live server pins mode.mainStage.
    const modeId = this.contentMeta?.modeId ?? (this.pack ? 'mode.mainStage' : undefined);
    room.match = this.pack
      ? new Match(matchId, room.rematchModifier, this.pack, world, modeId)
      : new Match(matchId, room.rematchModifier, undefined, world);
    const hordeDef = room.match.rules.hordeDirector;
    room.hordeReplication =
      hordeDef && hordeDef.enforceStage === true && room.match.runtime.systems.horde
        ? new HordeReplicationTracker(room.match.runtime.systems.horde.resolved.policies.replication)
        : null;
    room.phase = 'running';
    room.snapshotT = 0;
    room.ready = { driver: false, gunner: false };
    const startMsg: Record<string, unknown> = {
      t: 'start',
      matchId: room.match.state.matchId,
      modifier: room.rematchModifier,
      protocolVersion: PROTOCOL_VERSION,
      definitionOrderHash: ENEMY_DEFINITION_ORDER_HASH,
    };
    if (room.content) startMsg.content = room.content;
    if (room.arenaSession) startMsg.arena = room.arenaSession.metadata;
    this.broadcast(room, startMsg);
    this.broadcastSnapshot(room);
  }

  private broadcastResults(room: Room) {
    if (!room.match?.results) return;
    const results: MatchResults = room.match.results;
    this.broadcast(room, {
      t: 'results',
      results,
      rematch: {
        driver: !!room.rematch.driver,
        gunner: !!room.rematch.gunner,
        modifier: room.rematchModifier,
      },
    });
  }

  private broadcastSnapshot(room: Room) {
    if (!room.match) return;
    room.snapshotSeq++;
    const rules = room.match.rules;
    const arena: ArenaMetadata | null = room.arenaSession?.metadata ?? null;
    const opState = room.match.opState;
    const hordeBlock = room.hordeReplication && room.match
      ? room.hordeReplication.track(
          room.match.state.enemies,
          room.match.state.time,
          waveStateFor(room.match),
          (e) => room.match!.runtime.systems.enemies.tierFor(e),
          [...room.match.runtime.systems.hordeSectors.sectors.values()],
        )
      : null;
    const state = hordeBlock
      ? { ...room.match.state, enemies: [] }
      : room.match.state;
    const msg: Record<string, unknown> = {
      t: 'snapshot',
      seq: room.snapshotSeq,
      serverTime: room.match.state.time,
      serverTick: room.simTick,
      lastProcessedDriverInputSeq: opState.lastDriverInputSeq,
      lastProcessedGunnerInputSeq: opState.lastGunnerInputSeq,
      lastImpulseSeq: opState.lastImpulseSeq,
      opLog: opLogTail(opState),
      state,
      ...(hordeBlock ? { horde: hordeBlock } : {}),
      ...(hordeBlock ? { stage: stageViewFor(room.match) } : {}),
      rulesRevision: rules.rulesRevision,
      movementRulesRevision: rules.movementRulesRevision,
      tickDurationMs: this.loopMetrics.tickDurationMs,
      droppedTimeMs: this.loopMetrics.droppedTimeMs,
      driftMs: this.loopMetrics.driftMs,
      outboundBuffered: this.loopMetrics.outboundBuffered,
      arena,
    };
    if (rules.movementRulesRevision !== room.lastMovementRulesRevision) {
      room.lastMovementRulesRevision = rules.movementRulesRevision;
      msg.movement = rules.movementBlock();
    }
    this.broadcastSerialized(room, msg);
  }

  private broadcastImpulse(room: Room, impulse: TankImpulseWire): void {
    this.broadcastSerialized(room, { t: 'tankImpulse', ...impulse } as Record<string, unknown>);
  }

  private broadcastSerialized(room: Room, msg: Record<string, unknown>): void {
    this.sendSerialized(room, JSON.stringify(msg));
  }

  private broadcastLobby(room: Room) {
    const lobby = this.buildLobbyState(room);
    const msg = { t: 'lobbyState', lobby, chat: room.chat };
    for (const client of this.clients.values()) {
      if (client.room !== room || !client.socket) continue;
      if (room.players.some((p) => p.sessionId === client.sessionId)) {
        this.send(client, msg);
      }
    }
  }

  private normalizeOrGenerate(raw: unknown): string {
    if (typeof raw === 'string') {
      const result = validateNickname(raw);
      if (result.valid) return result.normalized;
    }
    return generateDefaultNickname();
  }

  private buildLobbyState(room: Room): ClientLobbyState {
    const eligibility = computeStartEligibility({
      players: room.players,
      contentAvailable: this.contentAvailable(),
    });
    return {
      revision: room.lobbyRevision,
      roomCode: room.code,
      phase: room.lobbyPhase,
      hostPlayerId: room.hostPlayerId,
      players: room.players.map((p) => ({
        playerId: p.playerId,
        displayName: p.displayName,
        connected: p.connected,
        reconnecting: !p.connected,
        seat: p.seat,
        ready: p.ready,
      })),
      settings: { gameplayType: 'sharedTank', modeId: this.contentMeta?.modeId ?? 'mode.demoScoreAttack' },
      countdownEndsAtWallMs: room.countdownEndsAtWallMs,
      startEligibility: eligibility,
    };
  }

  private cancelCountdown(room: Room, reason: string): void {
    if (
      room.lobbyPhase !== 'countdown' &&
      room.phase !== 'countdown' &&
      room.phase !== 'loading'
    ) {
      return;
    }
    room.lobbyPhase = 'lobby';
    room.phase = 'lobby';
    room.countdownEndsAtWallMs = null;
    room.countdownT = 0;
    room.loadingT = 0;
    room.pendingMatchId = null;
    room.assetReady = { driver: false, gunner: false };
    void reason;
    this.broadcastLobby(room);
  }

  /** True when the live mode uses a gameplay roster (production loop). */
  private isProductionRoom(): boolean {
    if (!this.pack) return false;
    const modeId = this.contentMeta?.modeId ?? 'mode.mainStage';
    try {
      return resolveSelectedMonsterRun(this.pack, 'probe', modeId) !== null;
    } catch {
      return false;
    }
  }

  /**
   * Production preload gate: reserve the match id, broadcast the
   * authoritative selected run, and wait for client assetReady before the
   * countdown. Demo rooms never enter this phase.
   */
  private beginProductionLoading(room: Room): void {
    if (!this.pack) {
      this.beginCountdown(room);
      return;
    }
    const modeId = this.contentMeta?.modeId ?? 'mode.mainStage';
    const matchId = room.code + '-' + this.now();
    const run = resolveSelectedMonsterRun(this.pack, matchId, modeId);
    room.phase = 'loading';
    room.lobbyPhase = 'lobby';
    room.loadingT = 0;
    room.pendingMatchId = matchId;
    room.assetReady = { driver: false, gunner: false };
    room.lastCountdownShown = 3;
    this.broadcast(room, {
      t: 'runConfig',
      matchId,
      modeId,
      run,
      ...(this.contentMeta
        ? {
            contentHash: this.contentMeta.hash,
            definitionOrderHash: ENEMY_DEFINITION_ORDER_HASH,
          }
        : {}),
    });
    room.lobbyRevision++;
    this.broadcastLobby(room);
  }

  private beginCountdown(room: Room, modifier?: ModifierId): void {
    room.lobbyPhase = 'countdown';
    room.phase = 'countdown';
    room.countdownEndsAtWallMs = this.now() + LOBBY_COUNTDOWN_SECONDS * 1000;
    room.countdownT = LOBBY_COUNTDOWN_SECONDS;
    room.lastCountdownShown = 3;
    room.loadingT = 0;
    room.assetReady = { driver: false, gunner: false };
    const msg: Record<string, unknown> = { t: 'countdown', n: 3 };
    if (modifier !== undefined) msg.modifier = modifier;
    this.broadcast(room, msg);
    room.lobbyRevision++;
    this.broadcastLobby(room);
  }

  private contentAvailable(): boolean {
    // The server either runs with a validated pack or the documented legacy
    // fallback; both are playable. Kept as a policy seam for future modes.
    return true;
  }

  private handleLobbySeat(
    client: Client,
    seat: CrewSeat | null,
    revision: number,
  ): { accepted: boolean; reason?: string; message?: string } {
    const room = client.room;
    const player = room?.players.find((p) => p.sessionId === client.sessionId);
    if (!room || !player) return { accepted: false, reason: 'no_room' };
    if (room.phase !== 'lobby' && room.phase !== 'countdown') {
      return { accepted: false, reason: 'not_lobby', message: 'Seats can only change before the match starts.' };
    }
    if (typeof revision !== 'number' || revision < room.lobbyRevision) {
      return { accepted: false, reason: 'stale', message: 'Lobby state changed; refresh and try again.' };
    }
    if (seat !== null && seatConflict(room.players, seat, player.playerId)) {
      return { accepted: false, reason: 'seat_occupied', message: 'That crew role is already taken.' };
    }
    player.seat = seat;
    if (room.driver?.sessionId === client.sessionId) room.driver = null;
    if (room.gunner?.sessionId === client.sessionId) room.gunner = null;
    if (seat === 'driver') room.driver = client;
    if (seat === 'gunner') room.gunner = client;
    // Match input routing uses Client.role; keep it in sync with the seat.
    client.role = seat;
    for (const p of room.players) p.ready = false;
    room.lobbyRevision++;
    this.cancelCountdown(room, 'seat_change');
    this.broadcastLobby(room);
    return { accepted: true };
  }

  private handleLobbyReady(
    client: Client,
    ready: boolean,
    revision: number,
  ): { accepted: boolean; reason?: string; message?: string } {
    const room = client.room;
    const player = room?.players.find((p) => p.sessionId === client.sessionId);
    if (!room || !player) return { accepted: false, reason: 'no_room' };
    if (typeof revision !== 'number' || revision < room.lobbyRevision) {
      return { accepted: false, reason: 'stale', message: 'Lobby state changed; refresh and try again.' };
    }
    if (ready && room.lobbyPhase === 'countdown') {
      return { accepted: false, reason: 'countdown_active', message: 'Countdown already started.' };
    }
    if (ready && player.seat === null) {
      return { accepted: false, reason: 'seat_required', message: 'Choose a crew role before Ready.' };
    }
    player.ready = ready;
    if (!ready) {
      this.cancelCountdown(room, 'unready');
      room.lobbyRevision++;
      this.broadcastLobby(room);
      return { accepted: true };
    }
    room.lobbyRevision++;
    this.broadcastLobby(room);
    const eligibility = computeStartEligibility({ players: room.players, contentAvailable: this.contentAvailable() });
    if (eligibility.eligible) {
      if (this.isProductionRoom()) {
        this.beginProductionLoading(room);
      } else {
        this.beginCountdown(room);
      }
    }
    return { accepted: true };
  }

  private handleLobbyChat(client: Client, rawText: string): void {
    const room = client.room;
    const player = room?.players.find((p) => p.sessionId === client.sessionId);
    if (!room || !player || !player.connected) return;
    const validation = validateChatText(rawText);
    if (!validation.valid) return;
    const now = this.now();
    let bucket = room.chatTokens.get(client.sessionId) ?? { tokens: LOBBY_CHAT_BURST, lastRefillWallMs: now };
    const elapsedSeconds = Math.max(0, (now - bucket.lastRefillWallMs) / 1000);
    bucket.tokens = Math.min(LOBBY_CHAT_BURST, bucket.tokens + elapsedSeconds / LOBBY_CHAT_REFILL_SECONDS);
    bucket.lastRefillWallMs = now;
    if (bucket.tokens < 1) {
      this.send(client, { t: 'error', code: 'rate_limited', message: 'Chat is rate limited — slow down.' });
      return;
    }
    bucket.tokens -= 1;
    room.chatTokens.set(client.sessionId, bucket);
    room.chat.push({
      messageId: ++room.chatSequence,
      playerId: player.playerId,
      displayName: player.displayName,
      text: validation.normalized,
      sentAtWallMs: now,
    });
    if (room.chat.length > LOBBY_CHAT_MAX_MESSAGES) room.chat.splice(0, room.chat.length - LOBBY_CHAT_MAX_MESSAGES);
    this.broadcastLobby(room);
  }

  private migrateHostIfNeeded(room: Room, now: number): void {
    if (room.players.length === 0) return;
    const hostConnected = room.players.some((p) => p.playerId === room.hostPlayerId && p.connected);
    if (hostConnected) return;
    const host = room.players.find((p) => p.playerId === room.hostPlayerId);
    if (host && host.reconnectDeadlineWallMs !== null && now < host.reconnectDeadlineWallMs) return;
    const nextHost = [...room.players]
      .filter((p) => p.connected)
      .sort((a, b) => a.joinedSequence - b.joinedSequence)[0];
    if (nextHost) {
      room.hostPlayerId = nextHost.playerId;
      room.lobbyRevision++;
      this.broadcastLobby(room);
    }
  }

  private broadcastPeers(room: Room) {
    this.broadcast(room, {
      t: 'peer',
      driverConnected: !!room.driver?.socket,
      gunnerConnected: !!room.gunner?.socket,
    });
  }

  private broadcast(room: Room, msg: Record<string, unknown>) {
    this.send(room.driver, msg);
    this.send(room.gunner, msg);
  }

  private removeClient(client: Client) {
    const room = client.room;
    if (!room) return;
    if (room.driver === client) room.driver = null;
    if (room.gunner === client) room.gunner = null;
    const playerIndex = room.players.findIndex((p) => p.sessionId === client.sessionId);
    if (playerIndex >= 0) {
      const removedPlayerId = room.players[playerIndex].playerId;
      room.players.splice(playerIndex, 1);
      if (room.hostPlayerId === removedPlayerId) {
        const nextHost = [...room.players]
          .filter((p) => p.connected)
          .sort((a, b) => a.joinedSequence - b.joinedSequence)[0];
        if (nextHost) room.hostPlayerId = nextHost.playerId;
      }
    }
    this.clients.delete(client.id);
    client.room = null;
    client.socket?.close(1000, 'left');
    this.cancelCountdown(room, 'leave');
    room.lobbyRevision++;
    this.broadcastLobby(room);
    this.broadcastPeers(room);
    if (!room.driver && !room.gunner) {
      this.rooms.delete(room.code);
    }
  }

  getClient(socket: SocketLike): Client | null {
    for (const client of this.clients.values()) {
      if (client.socket === socket) return client;
    }
    return null;
  }

  private sendWithSocket(socket: SocketLike, msg: Record<string, unknown>) {
    try {
      if (this.events.onSend) this.events.onSend(socket, msg);
      else socket.send(msg);
    } catch {
      // ignore
    }
  }
}
