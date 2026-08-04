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
import type { GunnerActionType } from '../shared/net/protocol';
import type { TankImpulseWire } from '../shared/effects/tankImpulseSystem';
import { opLogTail } from '../shared/sim/opLog';

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

export type RoomPhase = 'lobby' | 'countdown' | 'running' | 'results';

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

function stageViewFor(match: Match): {
  phase: string;
  farmingTimeRemaining: number;
  waveId: number | null;
  leaderHp: number;
  leaderMaxHp: number;
} {
  const stage = match.runtime.systems.stage.state;
  const horde = match.runtime.systems.horde;
  const runtime =
    horde && horde.currentWaveId !== null
      ? match.runtime.systems.waves.waves.get(horde.currentWaveId)
      : undefined;
  const leader = runtime ? match.state.enemies.find((e) => e.id === runtime.leaderId) : undefined;
  return {
    phase: stage.phase,
    farmingTimeRemaining: stage.farmingTimeRemaining,
    waveId: stage.activeWaveId,
    leaderHp: leader?.hp ?? 0,
    leaderMaxHp: leader?.maxHp ?? 0,
  };
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

  create(socket: SocketLike): Client {
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
    const room: Room = {
      code,
      driver: client,
      gunner: null,
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
    this.send(client, { t: 'created', code, role: 'driver', sessionId: client.sessionId, phase: 'lobby' });
    return client;
  }

  join(codeRaw: string, socket: SocketLike): Client {
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
    room.gunner = client;
    this.clients.set(client.id, client);
    this.send(client, { t: 'joined', code, role: 'gunner', sessionId: client.sessionId, phase: room.phase });
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
    for (const candidate of [room.driver, room.gunner]) {
      if (candidate && candidate.sessionId === sessionId) {
        candidate.socket = socket;
        candidate.disconnectedAt = null;
        candidate.graceLeft = 0;
        candidate.lastMsgAt = this.now();
        candidate.lastInputAt = this.now();
        this.clients.set(candidate.id, candidate);
        this.send(candidate, {
          t: 'joined',
          code,
          role: candidate.role,
          sessionId: candidate.sessionId,
          phase: room.phase,
          arena: room.arenaSession?.metadata ?? null,
        });
        this.broadcastPeers(room);
        return candidate;
      }
    }
    this.sendWithSocket(socket, { t: 'error', code: 'session', message: 'That session is no longer valid. Create or join a new crew.' });
    return null;
  }

  disconnect(client: Client) {
    if (!client.room) return;
    client.socket = null;
    client.disconnectedAt = this.now();
    client.graceLeft = GAME.reconnectGrace;
    this.broadcastPeers(client.room);
  }

  handle(socket: SocketLike, raw: Record<string, unknown>) {
    const client = this.getClient(socket);
    const t = raw.t;
    if (t === 'create') {
      if (client?.room) return;
      this.create(socket);
      return;
    }
    if (t === 'join') {
      if (typeof raw.code !== 'string') return;
      if (client?.room) return;
      this.join(raw.code, socket);
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
      if (client.role === 'driver') room.ready.driver = !!raw.ready;
      else if (client.role === 'gunner') room.ready.gunner = !!raw.ready;
      this.broadcastLobby(room);
      if (room.phase === 'lobby' && room.ready.driver && room.ready.gunner && room.driver && room.gunner) {
        room.phase = 'countdown';
        room.countdownT = 3.4;
        room.lastCountdownShown = 3;
        this.broadcast(room, { t: 'countdown', n: 3 });
      }
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
        room.phase = 'countdown';
        room.countdownT = 3.4;
        room.ready = { driver: false, gunner: false };
        room.lastCountdownShown = 3;
        this.broadcast(room, { t: 'countdown', n: 3, modifier: room.rematchModifier });
      }
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
      // Disconnect grace.
      for (const client of [room.driver, room.gunner]) {
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
      if (room.phase === 'countdown') {
        room.countdownT -= dt;
        const shown = Math.ceil(room.countdownT);
        if (shown !== room.lastCountdownShown && shown >= 0 && shown <= 3) {
          room.lastCountdownShown = shown;
          this.broadcast(room, { t: 'countdown', n: shown });
        }
        if (room.countdownT <= 0) {
          this.broadcast(room, { t: 'countdown', n: 0 });
          this.startMatch(room);
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
    room.match = this.pack
      ? new Match(room.code + '-' + this.now(), room.rematchModifier, this.pack, world)
      : new Match(room.code + '-' + this.now(), room.rematchModifier, undefined, world);
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
    this.broadcast(room, {
      t: 'lobby',
      code: room.code,
      phase: room.phase,
      driverReady: room.ready.driver,
      gunnerReady: room.ready.gunner,
    });
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
    this.clients.delete(client.id);
    client.room = null;
    client.socket?.close(1000, 'left');
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
