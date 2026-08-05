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
import { CLIENT_CONTENT_PACK } from '../generated/contentPack.generated';
import type { GameSessionKind } from '../shared/session/gameSessionKind';
import type { ArenaMetadata, ArenaSessionResult } from '../shared/mapgen/arenaSession';
import {
  reconstructArenaSession,
  resolveClientMapBundle,
  selectArenaSession,
} from '../shared/mapgen/arenaSession';
import { createStaticArenaWorld, type ArenaWorld } from '../shared/sim/arenaWorld';
import type { MatchState, Role } from '../shared/types';
import type { MovementRulesBlock } from '../shared/stats/rulesRevision';
import { HordeReplicationClient } from '../shared/net/horde/hordeReplication';
import type { HordeSnapshotBlock } from '../shared/net/horde/hordeProtocol';
import type { HordeStageView } from '../shared/net/protocol';
import { createPlayerSettingsStore } from './settings/playerSettingsStore';
import { PlayerSettingsController } from './settings/playerSettingsController';
import type { ClientLobbyState, CrewSeat, LobbyChatMessage } from '../shared/lobby/lobbyTypes';

const assetsPromise = AssetService.load();
const audio = new AudioManager();
const hud = new Hud();
const hudController = new HudController(hud);
const net = new NetClient();
const input = new InputManager();
const playerSettings = new PlayerSettingsController(createPlayerSettingsStore());

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
let sessionKind: GameSessionKind = 'multiplayer';
// Application state ownership (Refractor 02 audit P1-1): `flow` is the
// authoritative application state machine. SceneFlowPresenter owns the
// presentation side (scene runtimes, transitions, hybrid worlds, actions)
// and mirrors `flow` through showState() for scene selection only.
let flow: 'boot' | 'main' | 'settings' | 'create' | 'join' | 'lobby' | 'ready' | 'game' | 'results' | 'error' = 'boot';
let lastPingSent = 0;
let pingMs = 0;
let latestState: MatchState | null = null;
let hordeClient: HordeReplicationClient | null = null;
let latestStageView: HordeStageView | undefined;
let peerConnected = false;
let lastFps = 60;
let arenaSession: ArenaSessionResult | null = null;
let singlePlayerMatchIndex = 0;
let debugOverlay: DebugOverlay | null = null;
let pendingChecksumOverride: number | null = null;
let mapGateFailed = false;
let localPlayerId = '';
let lobbyState: ClientLobbyState | null = null;
let lobbyChat: LobbyChatMessage[] = [];

const params = new URLSearchParams(window.location.search);
const TEST_MODE = params.has('test');
const DEBUG_MODE = params.has('debug') || TEST_MODE;
const FORCED_SEED = params.has('seed') ? Number(params.get('seed')) : null;

hud.bind({
  onBoot: () => {
    audio.unlock();
    hud.onUiSound = () => audio.play('ui');
    hud.setMainMenuNickname(playerSettings.currentNickname);
    hud.showScreen('main');
    flow = 'main';
  },
  onCreate: () => {
    net.send({ t: 'create', displayName: playerSettings.currentNickname });
    flow = 'create';
  },
  onJoin: (code) => {
    if (!code) {
      hud.showScreen('join');
      flow = 'join';
      return;
    }
    net.send({ t: 'join', code, displayName: playerSettings.currentNickname });
    flow = 'join';
  },
  onReady: () => {
    net.send({ t: 'ready', ready: true });
  },
  onOpenSettings: () => {
    hud.setSettingsContext({ nicknameDraft: playerSettings.draftNickname, settingsError: '' });
    hud.showScreen('settings');
    flow = 'settings';
  },
  onRandomizeNickname: () => {
    const draft = playerSettings.randomize();
    hud.setSettingsContext({ nicknameDraft: draft, settingsError: '' });
  },
  onSaveSettings: (nickname) => {
    playerSettings.setDraft(nickname);
    const result = playerSettings.save();
    if (!result.valid) {
      const message =
        result.reason === 'empty'
          ? 'Choose a nickname.'
          : result.reason === 'too_long'
            ? 'Nickname must be 20 characters or fewer.'
            : 'Nickname contains unsupported control characters.';
      hud.setSettingsContext({ settingsError: message });
      return;
    }
    hud.setMainMenuNickname(playerSettings.currentNickname);
    hud.showScreen('main');
    flow = 'main';
  },
  onCancelSettings: () => {
    playerSettings.cancel();
    hud.showScreen('main');
    flow = 'main';
  },
  onLobbySeat: (seat) => {
    net.send({ t: 'lobbySelectSeat', seat, lobbyRevision: lobbyState?.revision ?? 0 });
  },
  onLobbyReadyToggle: () => {
    const me = lobbyState?.players.find((p) => p.playerId === localPlayerId);
    net.send({ t: 'lobbyReadySet', ready: !(me?.ready ?? false), lobbyRevision: lobbyState?.revision ?? 0 });
  },
  onLobbyChatSend: (text) => {
    net.send({ t: 'lobbyChatSend', text });
  },
  onCopyRoomCode: (code) => {
    void navigator.clipboard?.writeText(code).then(() => {
      const btn = document.getElementById('copy-code');
      if (!btn) return;
      btn.textContent = 'COPIED';
      setTimeout(() => {
        if (document.getElementById('copy-code') === btn) btn.textContent = 'COPY';
      }, 1400);
    });
  },
  onStartSinglePlayer: () => {
    void startSinglePlayer();
  },
  onRestartSinglePlayer: () => {
    void startSinglePlayer();
  },
  onHowTo: () => {
    hud.showScreen('howto');
  },
  onBack: () => {
    if (flow === 'create' || flow === 'join' || flow === 'lobby') {
      net.send({ t: 'leave' });
      hud.hideLobby();
      lobbyState = null;
      lobbyChat = [];
    }
    hud.showScreen('main');
    flow = 'main';
  },
  onRematch: (modifier) => {
    net.send({ t: 'rematch', modifier });
  },
  onLeave: () => {
    net.send({ t: 'leave' });
    teardownGame();
    hud.hideLobby();
    lobbyState = null;
    lobbyChat = [];
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
    hud.hideLobby();
    lobbyState = null;
    lobbyChat = [];
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
      localPlayerId = msg.playerId as string;
      lobbyState = msg.lobby as ClientLobbyState;
      lobbyChat = (msg.chat as LobbyChatMessage[]) ?? [];
      hud.setCreateCode(roomCode);
      hud.setTheme('driver');
      hud.showLobby(lobbyState, lobbyChat, localPlayerId);
      flow = 'lobby';
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
      localPlayerId = msg.playerId as string;
      lobbyState = msg.lobby as ClientLobbyState;
      lobbyChat = (msg.chat as LobbyChatMessage[]) ?? [];
      hud.setCreateCode(roomCode);
      hud.setTheme(role);
      hud.showLobby(lobbyState, lobbyChat, localPlayerId);
      flow = 'lobby';
      break;
    }
    case 'lobbyState': {
      lobbyState = msg.lobby as ClientLobbyState;
      lobbyChat = (msg.chat as LobbyChatMessage[]) ?? [];
      if (flow === 'lobby') {
        hud.updateLobbyState(lobbyState, lobbyChat, localPlayerId);
      } else if (flow === 'create' || flow === 'ready') {
        hud.showLobby(lobbyState, lobbyChat, localPlayerId);
        flow = 'lobby';
      }
      break;
    }
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
      const horde = msg.horde as HordeSnapshotBlock | undefined;
      latestStageView = msg.stage as HordeStageView | undefined;
      let sectors: Array<{
        sectorId: number;
        x: number;
        z: number;
        count: number;
        enemyDefId: string;
        presentationSeed: number;
      }> = [];
      if (horde) {
        if (!hordeClient) {
          hordeClient = new HordeReplicationClient(
            (x, z) => (game ? game.arenaWorld.groundHeightAt(x, z) : 0),
          );
        }
        latestState = {
          ...(msg.state as MatchState),
          enemies: hordeClient.apply(horde, Number(msg.serverTime)),
        };
        sectors = [...hordeClient.sectors.values()].map((s) => ({
          sectorId: s.sectorId,
          x: s.centerX,
          z: s.centerZ,
          count: s.count,
          enemyDefId: s.enemyDefId,
          presentationSeed: s.presentationSeed,
        }));
      } else {
        latestState = msg.state as MatchState;
        hordeClient?.reset();
      }
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
        sectors,
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
      else if (flow === 'create') hud.showCreateError(String((msg as { message?: unknown }).message ?? 'Unknown error'));
      break;
    case 'pong':
      pingMs = Date.now() - lastPingSent;
      break;
  }
};

net.onStatus = (connected) => {
  // A network disconnect must never interrupt an active Single Player match.
  if (!connected && sessionKind === 'singlePlayer') return;
  if (!connected && (flow === 'game' || flow === 'results')) {
    hud.showError('Connection lost. Retry to rejoin your crew, or play Single Player.');
    input.setEnabled(false);
    game?.setInputEnabled(false);
    input.releaseLock();
    flow = 'error';
  } else if (!connected && flow === 'join') {
    hud.showJoinError('Cannot reach the server. Is it running?');
  } else if (!connected && flow === 'create') {
    hud.showError('Connection lost. Create your crew again.');
    flow = 'error';
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

function buildSinglePlayerSession(): ArenaSessionResult {
  const { bundle, fallbackBundle } = resolveClientMapBundle();
  const roomCode = FORCED_SEED !== null ? `SEED${FORCED_SEED}` : 'SINGLE';
  try {
    return selectArenaSession({
      roomCode,
      matchIndex: singlePlayerMatchIndex,
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
  sessionKind = 'multiplayer';
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

async function startSinglePlayer(): Promise<void> {
  teardownGame();
  sessionKind = 'singlePlayer';
  const session = buildSinglePlayerSession();
  arenaSession = session.metadata ? session : null;
  singlePlayerMatchIndex++;
  game = await createGame(session.world);
  attachGameCallbacks(game);
  game.onSinglePlayerResults = (results) => {
    hud.showSinglePlayerResults(results as never);
    input.releaseLock();
    flow = 'results';
  };
  game.startSinglePlayer(CLIENT_CONTENT_PACK, session.world);
  game.suppressAutoInput = TEST_MODE;
  hud.setTheme('singlePlayer');
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
  g.onTrajectoryReticle = (result) => hud.setTrajectoryReticle(result.x, result.y, result.visible, result.blocked);
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
  sessionKind = 'multiplayer';
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
    session: {
      kind: sessionKind,
      showRoleIdentity: sessionKind === 'multiplayer',
      showPeerStatus: sessionKind === 'multiplayer',
    },
    localCharge: g.getLocalChargeView() ?? undefined,
    rules: game?.getHudRules(),
    objective,
    stage: sessionKind === 'singlePlayer' ? game?.getSinglePlayerStageView() : latestStageView ?? undefined,
  });
  debugOverlay?.refreshHorde();
  if (input.consumeRecenter()) g.recenter();
  if (input.consumeEscape()) {
    if (input.locked) input.releaseLock();
    else showPause();
  }
  const now = Date.now();
  if (sessionKind === 'multiplayer' && now - lastPingSent > 2500) {
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
    joinWithName: (code: string, name: string) => net.send({ t: 'join', code, displayName: name }),
    rejoin: (code: string, sid: string) => net.send({ t: 'rejoin', code, sessionId: sid }),
    ready: () => net.send({ t: 'ready', ready: true }),
    lobby: {
      state: () => lobbyState,
      chat: () => lobbyChat,
      playerId: () => localPlayerId,
      seat: (seat: CrewSeat | null) =>
        net.send({ t: 'lobbySelectSeat', seat, lobbyRevision: lobbyState?.revision ?? 0 }),
      readyToggle: () =>
        net.send({
          t: 'lobbyReadySet',
          ready: !(lobbyState?.players.find((p) => p.playerId === localPlayerId)?.ready ?? false),
          lobbyRevision: lobbyState?.revision ?? 0,
        }),
      sendChat: (text: string) => net.send({ t: 'lobbyChatSend', text }),
    },
    settings: {
      nickname: () => playerSettings.currentNickname,
      randomize: () => playerSettings.randomize(),
      save: (name: string) => {
        playerSettings.setDraft(name);
        return playerSettings.save();
      },
    },
    rematch: (modifier: string) => net.send({ t: 'rematch', modifier }),
    leave: () => net.send({ t: 'leave' }),
    setAutoInput: (enabled: boolean) => {
      if (game) game.suppressAutoInput = !enabled;
    },
    renderTank: () => game?.getRenderTank() ?? null,
    turretSpaces: () => game?.getTurretSpaces() ?? null,
    cameraState: () => game?.getCameraState() ?? null,
    composerPasses: () => game?.composerPassCount() ?? 0,
    renderCount: () => game?.world.renderCount ?? 0,
    setInputEnabled: (enabled: boolean) => {
      input.setEnabled(enabled);
      game?.setInputEnabled(enabled);
    },
    inputState: () => input.debugState(),
    driverInput: () => game?.singlePlayerMatch?.getDriverInput() ?? null,
    predictionDebug: () => game?.predictionDebug() ?? null,
    progression: {
      xp: (value: number) => game?.singlePlayerMatch?.runtime.systems.progression.addXp(value),
      submitUpgrade: (index: number) => game?.submitUpgrade(index),
      chest: (x: number, z: number) =>
        game?.singlePlayerMatch?.runtime.systems.progression.spawnChest('map', x, z)?.id ?? 0,
      openChest: (id: number) =>
        game?.singlePlayerMatch?.runtime.systems.progression.openChest(id, Date.now()),
      skipRelic: () => game?.skipRelicPresentation(),
    },
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
