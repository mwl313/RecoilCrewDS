import './styles.css';
import { GameClient } from './app/gameClient';
import { InputManager } from './input';
import { Hud } from './hud';
import { NetClient } from './net';
import { AudioManager } from './audio';
import { AssetService } from './assets';
import { HudController } from './app/hudController';
import { DebugOverlay } from './app/debugOverlay';
import { PresentationWorld } from './presentation/presentationWorld';
import type { ArenaMetadata, ArenaSessionResult } from '../shared/mapgen/arenaSession';
import {
  reconstructArenaSession,
  resolveClientMapBundle,
  selectArenaSession,
} from '../shared/mapgen/arenaSession';
import { createStaticArenaWorld, type ArenaWorld } from '../shared/sim/arenaWorld';
import type { MatchState, Role } from '../shared/types';
import type { MovementRulesBlock } from '../shared/stats/rulesRevision';

const assetsPromise = AssetService.load();
const audio = new AudioManager();
const hud = new Hud();
const hudController = new HudController(hud);
const net = new NetClient();
const input = new InputManager();

void assetsPromise.then((loadedAssets) => {
  const lowQuality =
    params.has('lowq') ||
    (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  hud.setPresentationFactory(
    TEST_MODE || lowQuality
      ? null
      : (scene, container) => new PresentationWorld(scene, container, loadedAssets),
  );
  hud.setAssetUrlResolver((id) => loadedAssets.assetUrl(id));
});

let assets: AssetService | null = null;
let game: GameClient | null = null;
let role: Role = 'driver';
let sessionId = '';
let roomCode = '';
let inGame = false;
let practice = false;
// Application state ownership (Refractor 02 audit P1-1): `flow` is the
// authoritative application state machine. SceneFlowPresenter owns the
// presentation side (scene runtimes, transitions, hybrid worlds, actions)
// and mirrors `flow` through showState() for scene selection only.
let flow: 'boot' | 'main' | 'create' | 'join' | 'ready' | 'game' | 'results' | 'error' = 'boot';
let lastPingSent = 0;
let pingMs = 0;
let latestState: MatchState | null = null;
let peerConnected = false;
let lastFps = 60;
let arenaSession: ArenaSessionResult | null = null;
let practiceMatchIndex = 0;
let debugOverlay: DebugOverlay | null = null;
let pendingChecksumOverride: number | null = null;
let mapGateFailed = false;

const params = new URLSearchParams(window.location.search);
const TEST_MODE = params.has('test');
const DEBUG_MODE = params.has('debug') || TEST_MODE;
const FORCED_SEED = params.has('seed') ? Number(params.get('seed')) : null;

hud.bind({
  onBoot: () => {
    audio.unlock();
    hud.onUiSound = () => audio.play('ui');
    hud.showScreen('main');
    flow = 'main';
  },
  onCreate: () => {
    net.send({ t: 'create' });
    hud.showScreen('create');
    flow = 'create';
  },
  onJoin: (code) => {
    if (!code) {
      hud.showScreen('join');
      flow = 'join';
      return;
    }
    net.send({ t: 'join', code });
    flow = 'join';
  },
  onReady: () => {
    net.send({ t: 'ready', ready: true });
  },
  onPractice: () => {
    void startPractice();
  },
  onHowTo: () => {
    hud.showScreen('howto');
  },
  onBack: () => {
    if (flow === 'create' || flow === 'join') net.send({ t: 'leave' });
    hud.showScreen('main');
    flow = 'main';
  },
  onRematch: (modifier) => {
    if (practice) {
      void startPractice();
      return;
    }
    net.send({ t: 'rematch', modifier });
  },
  onLeave: () => {
    net.send({ t: 'leave' });
    teardownGame();
    hud.showScreen('main');
    flow = 'main';
  },
  onRetry: () => {
    teardownGame();
    net.reopen();
    hud.showScreen('create');
    flow = 'create';
  },
  onMainMenu: () => {
    teardownGame();
    net.send({ t: 'leave' });
    hud.showScreen('main');
    flow = 'main';
  },
  onResume: () => {
    if (!game) return;
    hud.setGameScreen(true);
    input.setEnabled(true);
    game.setInputEnabled(true);
    if (flow === 'game') {
      input.requestLock();
    }
  },
  onPause: () => {
    showPause();
  },
});

net.onMessage = (msg) => {
  switch (msg.t) {
    case 'created':
      role = 'driver';
      sessionId = msg.sessionId as string;
      roomCode = msg.code as string;
      hud.setCreateCode(roomCode);
      hud.setTheme('driver');
      hud.showScreen('create');
      hud.updateLobby(false, false, 'driver');
      flow = 'create';
      break;
    case 'joined': {
      role = msg.role as Role;
      sessionId = msg.sessionId as string;
      roomCode = msg.code as string;
      const phase = msg.phase as string;
      if ((phase === 'running' || phase === 'results') && msg.arena) {
        // Mid-round reconnect (same page refresh or rejoin).
        if (!mapGateFailed) void resumeOnline(msg.arena as ArenaMetadata, phase === 'results');
        break;
      }
      hud.setCreateCode(roomCode);
      hud.setTheme(role);
      hud.showScreen('ready');
      flow = 'ready';
      break;
    }
    case 'lobby':
      hud.updateLobby(!!msg.driverReady, !!msg.gunnerReady, role);
      if (flow === 'create' || flow === 'ready') hud.setCreateCode(msg.code as string);
      break;
    case 'peer':
      peerConnected = !!msg.driverConnected && !!msg.gunnerConnected;
      break;
    case 'countdown':
      hud.showScreen('countdown');
      hud.showCountdown(Number(msg.n));
      break;
    case 'start':
      if (msg.arena) {
        void startOnlineWithArena(role, msg.arena as ArenaMetadata);
      } else {
        void startOnline(role, null);
      }
      hud.hideCountdown();
      break;
    case 'snapshot': {
      const meta = msg.arena as ArenaMetadata | undefined;
      if (meta && !mapGateFailed) {
        if (!arenaSession) {
          void resumeOnline(meta, false);
        } else if (meta.arenaChecksum !== arenaSession.metadata.arenaChecksum) {
          showMapError('checksum');
        }
      }
      latestState = msg.state as MatchState;
      game?.setSnapshot({
        seq: Number(msg.seq),
        serverTime: Number(msg.serverTime),
        state: latestState,
        lastProcessedDriverInputSeq: Number(msg.lastProcessedDriverInputSeq ?? 0),
        lastProcessedGunnerInputSeq: Number(msg.lastProcessedGunnerInputSeq ?? 0),
        lastImpulseSeq: Number(msg.lastImpulseSeq ?? 0),
        opLog: msg.opLog as never,
        serverTick: Number(msg.serverTick ?? 0),
        tickDurationMs: Number(msg.tickDurationMs ?? 0),
        droppedTimeMs: Number(msg.droppedTimeMs ?? 0),
        driftMs: Number(msg.driftMs ?? 0),
        outboundBuffered: Number(msg.outboundBuffered ?? 0),
        rulesRevision: msg.rulesRevision === undefined ? undefined : Number(msg.rulesRevision),
        movementRulesRevision:
          msg.movementRulesRevision === undefined ? undefined : Number(msg.movementRulesRevision),
        movement: msg.movement as MovementRulesBlock | undefined,
      });
      break;
    }
    case 'event':
      game?.handleEvent(msg.event as never);
      hud.onEvent(msg.event as never);
      break;
    case 'driverInputRelay':
      game?.handleDriverRelay(Number(msg.seq ?? 0), msg.driver as never);
      break;
    case 'tankImpulse':
      game?.handleTankImpulse(msg as never);
      break;
    case 'actionResult':
      game?.handleActionResult(Number(msg.actionSeq ?? 0), msg.accepted === true);
      break;
    case 'results': {
      hud.showResults(msg.results as never, msg.rematch as never);
      input.setEnabled(false);
      game?.setInputEnabled(false);
      input.releaseLock();
      flow = 'results';
      break;
    }
    case 'error':
      hud.showJoinError(String((msg as { message?: unknown }).message ?? 'Unknown error'));
      if (flow === 'join') hud.showScreen('join');
      break;
    case 'pong':
      pingMs = Date.now() - lastPingSent;
      break;
  }
};

net.onStatus = (connected) => {
  if (!connected && (flow === 'game' || flow === 'results')) {
    hud.showError('Connection lost. Retry to rejoin your crew, or jump into practice.');
    input.setEnabled(false);
    game?.setInputEnabled(false);
    input.releaseLock();
    flow = 'error';
  } else if (!connected && flow === 'join') {
    hud.showJoinError('Cannot reach the server. Is it running?');
  }
};

/** Reconstruct the server's arena on the client and gate on checksum. */
function buildSessionFromMetadata(meta: ArenaMetadata): ArenaSessionResult | { error: string } {
  const { bundle, fallbackBundle } = resolveClientMapBundle(meta.mapProfileId);
  const effective = pendingChecksumOverride !== null ? { ...meta, arenaChecksum: pendingChecksumOverride } : meta;
  pendingChecksumOverride = null;
  const result = reconstructArenaSession(effective, bundle, fallbackBundle);
  if (!result.ok) return { error: result.reason };
  return result.session;
}

function buildPracticeSession(): ArenaSessionResult {
  const { bundle, fallbackBundle } = resolveClientMapBundle();
  const roomCode = FORCED_SEED !== null ? `SEED${FORCED_SEED}` : 'PRACTICE';
  try {
    return selectArenaSession({
      roomCode,
      matchIndex: practiceMatchIndex,
      bundle,
      fallbackBundle,
    });
  } catch {
    return {
      arena: undefined as never,
      world: createStaticArenaWorld(),
      metadata: null as never,
      generationMs: 0,
    };
  }
}

function showMapError(reason: string): void {
  const labels: Record<string, string> = {
    version: 'Map generator version mismatch — reload to update.',
    profile: 'Map profile mismatch — reload to rejoin.',
    checksum: 'Map checksum mismatch — reload to rejoin.',
    validation: 'Map validation failed on this client — reload to rejoin.',
  };
  hud.showError(labels[reason] ?? 'Map synchronization failed — reload to rejoin.');
  input.setEnabled(false);
  game?.setInputEnabled(false);
  input.releaseLock();
  flow = 'error';
  arenaSession = null;
  mapGateFailed = true;
}

async function startOnlineWithArena(r: Role, meta: ArenaMetadata): Promise<void> {
  const session = buildSessionFromMetadata(meta);
  if ('error' in session) {
    showMapError(session.error);
    return;
  }
  arenaSession = session;
  await startOnline(r, session.world);
}

async function resumeOnline(meta: ArenaMetadata, results: boolean): Promise<void> {
  if (arenaSession && arenaSession.metadata.arenaChecksum === meta.arenaChecksum) {
    // Same active map: resume the existing game.
    if (game) {
      hud.setGameScreen(true);
      hud.setTheme(role);
      input.setEnabled(true);
      game.setInputEnabled(true);
      flow = 'game';
      if (results) flow = 'results';
      return;
    }
  }
  const session = buildSessionFromMetadata(meta);
  if ('error' in session) {
    showMapError(session.error);
    return;
  }
  arenaSession = session;
  if (game) {
    game.applyArenaSession(session);
  }
  await startOnline(role, session.world);
  if (results) flow = 'results';
}

async function startOnline(r: Role, world: ArenaWorld | null): Promise<void> {
  practice = false;
  if (!game) game = await createGame(world ?? arenaSession?.world ?? createStaticArenaWorld());
  attachGameCallbacks(game);
  game.suppressAutoInput = TEST_MODE;
  game.startOnline(r);
  hud.setGameScreen(true);
  hud.setTheme(r);
  inGame = true;
  flow = 'game';
  input.setEnabled(true);
  game.setInputEnabled(true);
  input.requestLock();
  attachDebugOverlay();
}

async function startPractice(): Promise<void> {
  teardownGame();
  practice = true;
  const session = buildPracticeSession();
  arenaSession = session.metadata ? session : null;
  practiceMatchIndex++;
  game = await createGame(session.world);
  attachGameCallbacks(game);
  game.onPracticeResults = (results) => {
    hud.showResults(results as never, { driver: true, gunner: true, modifier: 'none' });
    input.releaseLock();
    flow = 'results';
  };
  game.startPractice();
  game.suppressAutoInput = TEST_MODE;
  hud.setTheme('driver');
  hud.setGameScreen(true);
  inGame = true;
  flow = 'game';
  input.setEnabled(true);
  game.setInputEnabled(true);
  input.requestLock();
  attachDebugOverlay();
}

async function createGame(world: ArenaWorld): Promise<GameClient> {
  const loaded = assets ?? (await assetsPromise);
  assets = loaded;
  const created = await GameClient.create(document.getElementById('app')!, loaded, audio, input, () => undefined, world);
  created.onHudEvent = (ev) => hud.onEvent(ev as never);
  return created;
}

function attachGameCallbacks(g: GameClient) {
  input.attach(g.getCanvas());
  input.onLockChange = onLockChange;
  g.onSendInput = (m) => net.send(m);
  g.onPauseRequest = () => showPause();
  g.onFrame = (state) => onFrame(g, state);
}

function teardownGame() {
  if (game) {
    game.setInputEnabled(false);
    game.destroy();
    game = null;
  }
  debugOverlay?.dispose();
  debugOverlay = null;
  input.setEnabled(false);
  inGame = false;
  practice = false;
  latestState = null;
  arenaSession = null;
  mapGateFailed = false;
  input.releaseLock();
}

function attachDebugOverlay(): void {
  if (!DEBUG_MODE || !game || !arenaSession) return;
  if (!debugOverlay) debugOverlay = new DebugOverlay(game, arenaSession);
  else debugOverlay.setSession(arenaSession);
}

function showPause() {
  if (flow !== 'game') return;
  input.setEnabled(false);
  game?.setInputEnabled(false);
  hud.showScreen('pause');
}

function onLockChange(locked: boolean) {
  if (locked && flow === 'game') {
    input.setEnabled(true);
    game?.setInputEnabled(true);
    hud.setGameScreen(true);
  }
}

function onFrame(g: GameClient, state: MatchState) {
  latestState = state;
  const objective = hudController.projectObjective(state, (x, y, z) => g.projectWorld(x, y, z));
  hudController.update(state, {
    role,
    peerConnected,
    ping: pingMs,
    fps: lastFps,
    pointerLocked: input.locked,
    practice,
    rules: game?.getHudRules(),
    objective,
  });
  if (input.consumeSwap() && practice) g.togglePracticeView();
  if (input.consumeRecenter()) g.recenter();
  if (input.consumeEscape()) {
    if (input.locked) input.releaseLock();
    else showPause();
  }
  const now = Date.now();
  if (now - lastPingSent > 2500) {
    lastPingSent = now;
    net.send({ t: 'ping', ts: now });
  }
}

setInterval(() => {
  if (game) {
    const value = (game as unknown as { quality: { currentFps: number } }).quality?.currentFps ?? 0;
    if (value) lastFps = value;
  }
}, 500);

net.connect();
hud.showScreen('boot');

// Headless/automation hooks used by the e2e suite and manual smoke checks.
if (TEST_MODE) {
  (window as unknown as Record<string, unknown>).__recoil = {
    input: (role: Role, data: unknown) => game?.injectOnlineInput(role, data as never),
    state: () => latestState,
    code: () => roomCode,
    sessionId: () => sessionId,
    flow: () => flow,
    create: () => net.send({ t: 'create' }),
    join: (code: string) => net.send({ t: 'join', code }),
    rejoin: (code: string, sid: string) => net.send({ t: 'rejoin', code, sessionId: sid }),
    ready: () => net.send({ t: 'ready', ready: true }),
    rematch: (modifier: string) => net.send({ t: 'rematch', modifier }),
    leave: () => net.send({ t: 'leave' }),
    setAutoInput: (enabled: boolean) => {
      if (game) game.suppressAutoInput = !enabled;
    },
    renderTank: () => game?.getRenderTank() ?? null,
    turretSpaces: () => game?.getTurretSpaces() ?? null,
    cameraState: () => game?.getCameraState() ?? null,
    composerPasses: () => game?.composerPassCount() ?? 0,
    setInputEnabled: (enabled: boolean) => {
      input.setEnabled(enabled);
      game?.setInputEnabled(enabled);
    },
    inputState: () => input.debugState(),
    driverInput: () => game?.practiceMatch?.getDriverInput() ?? null,
    predictionDebug: () => game?.predictionDebug() ?? null,
    arena: () => arenaSession?.metadata ?? null,
    obstacles: () => arenaSession?.world.obstacles.map((o) => ({ x: o.x, z: o.z, w: o.w, d: o.d })) ?? [],
    groundHeightAt: (x: number, z: number) => arenaSession?.world.groundHeightAt(x, z) ?? 0,
    sceneStats: () => {
      const scene = (game as unknown as { world: { scene: { children: unknown[] } } })?.world?.scene;
      return scene ? { children: scene.children.length } : null;
    },
    /** Test-only: corrupt the next reconstruction so the checksum gate fails. */
    corruptArenaChecksum: (value: number) => {
      pendingChecksumOverride = value;
    },
  };
}
