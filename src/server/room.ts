import { GAME } from '../shared/config';
import { Match } from '../shared/sim/match';
import { computeResults } from '../shared/sim/results';
import type { DriverInput, GunnerInput, MatchResults, ModifierId, Role } from '../shared/types';

export interface SocketLike {
  send(msg: unknown): void;
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
  countdownT: number;
  snapshotT: number;
  snapshotSeq: number;
  lastCountdownShown: number;
  createdAt: number;
}

export interface ManagerEvents {
  onSend?(socket: SocketLike, msg: Record<string, unknown>): void;
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

function sanitizeDriver(raw: unknown): DriverInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const throttle = typeof r.throttle === 'number' && Number.isFinite(r.throttle) ? Math.max(-1, Math.min(1, r.throttle)) : 0;
  const steer = typeof r.steer === 'number' && Number.isFinite(r.steer) ? Math.max(-1, Math.min(1, r.steer)) : 0;
  return {
    throttle,
    steer,
    boost: !!r.boost,
    brace: !!r.brace,
  };
}

function sanitizeGunner(raw: unknown): GunnerInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const aimYaw = typeof r.aimYaw === 'number' && Number.isFinite(r.aimYaw) ? r.aimYaw : 0;
  const aimPitch = typeof r.aimPitch === 'number' && Number.isFinite(r.aimPitch) ? Math.max(-1.5, Math.min(1.5, r.aimPitch)) : 0;
  return {
    aimYaw,
    aimPitch,
    mg: !!r.mg,
    cannon: !!r.cannon,
    charge: !!r.charge,
  };
}

export class RoomManager {
  rooms = new Map<string, Room>();
  clients = new Map<string, Client>();
  private events: ManagerEvents = {};
  private now: () => number;
  private contentMeta: ContentMetadata | null;

  constructor(opts: { events?: ManagerEvents; now?: () => number; content?: ContentMetadata | null } = {}) {
    this.events = opts.events ?? {};
    this.now = opts.now ?? (() => Date.now());
    this.contentMeta = opts.content ?? null;
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
      countdownT: 0,
      snapshotT: 0,
      snapshotSeq: 0,
      lastCountdownShown: 3,
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
      this.sendWithSocket(socket, { t: 'error', code: 'not_found', message: 'That crew is gone. Create a new one or practice.' });
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
        this.send(candidate, { t: 'joined', code, role: candidate.role, sessionId: candidate.sessionId, phase: room.phase });
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
      if (driver) room.match.setDriverInput(driver);
    } else if (client.role === 'gunner') {
      const gunner = sanitizeGunner(raw.gunner);
      if (gunner) room.match.setGunnerInput(gunner);
    }
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
        room.match.step(dt);
        const events = room.match.takeEvents();
        for (const ev of events) {
          this.broadcast(room, { t: 'event', event: ev });
        }
        room.snapshotT += dt;
        if (room.snapshotT >= 1 / GAME.snapshotHz) {
          room.snapshotT = 0;
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
    room.match = new Match(room.code + '-' + this.now(), room.rematchModifier);
    room.phase = 'running';
    room.snapshotT = 0;
    room.ready = { driver: false, gunner: false };
    const startMsg: Record<string, unknown> = {
      t: 'start',
      matchId: room.match.state.matchId,
      modifier: room.rematchModifier,
    };
    if (room.content) startMsg.content = room.content;
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
    this.broadcast(room, {
      t: 'snapshot',
      seq: room.snapshotSeq,
      serverTime: room.match.state.time,
      serverTick: room.snapshotSeq,
      lastProcessedDriverInputSeq: room.driver?.inputSeq ?? 0,
      lastProcessedGunnerInputSeq: room.gunner?.inputSeq ?? 0,
      state: room.match.state,
    });
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
