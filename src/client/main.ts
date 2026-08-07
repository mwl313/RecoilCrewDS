import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import '@fontsource/barlow-condensed/latin-700-italic.css';
import '@fontsource/barlow-condensed/latin-800-italic.css';
import '@fontsource/barlow-condensed/latin-900-italic.css';
import './styles.css';
import './ui/index.css';
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
import { SINGLE_PLAYER_SESSION } from '../shared/session/gameSessionKind';
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
import type { RunConfigMessage } from '../shared/net/protocol';
import {
  checkProtocolCompatibility,
  PROTOCOL_VERSION,
} from '../shared/net/protocol';
import { ENEMY_DEFINITION_ORDER_HASH } from '../generated/enemyDefinitionIndex.generated';
import { createPlayerSettingsStore } from './settings/playerSettingsStore';
import { PlayerSettingsController } from './settings/playerSettingsController';
import type { ClientLobbyState, CrewSeat, LobbyChatMessage } from '../shared/lobby/lobbyTypes';
import {
  resolveSelectedMonsterRun,
  resolveSelectedPreloadAssetIds,
} from '../shared/monsters/monsterPreload';
import { resolveMonsterDimensionsForDefId } from '../shared/monsters/monsterNormalization';
import { urbanAssetIds } from '../shared/mapgen/urbanLayout';
import { netcodeMetrics } from './netcode/netcodeMetrics';

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
let lastPreloadedMatchId = '';
let latestRunConfig: RunConfigMessage | null = null;
let activeSinglePlayerModeId = SINGLE_PLAYER_SESSION.rulesModeId;
let localPlayerId = '';
let lobbyState: ClientLobbyState | null = null;
let lobbyChat: LobbyChatMessage[] = [];

const params = new URLSearchParams(window.location.search);
const TEST_MODE = params.has('test');
const DEBUG_MODE = (params.has('debug') || TEST_MODE) && !params.has('nodebug');
const FORCED_SEED = params.has('seed') ? Number(params.get('seed')) : null;
const FORCED_MAP_ID = (() => {
  const value = params.get('map');
  if (value === 'urban200') return 'map.urban200Prototype';
  if (value === 'urban400') return 'map.urban400Prototype';
  return value?.startsWith('map.') ? value : undefined;
})();

hud.bind({
  onBoot: () => {
    audio.unlock();
    hud.onUiSound = () => audio.play('ui');
    // A mid-round rejoin can finish while the title-exit choreography is
    // still pending. Never let that delayed callback reopen the menu over an
    // already-active game/HUD.
    if (flow === 'game') {
      hud.setGameScreen(true);
      return;
    }
    if (flow === 'results') return;
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
  onLobbyRequestRoleSwap: () => {
    net.send({ t: 'lobbyRequestRoleSwap', lobbyRevision: lobbyState?.revision ?? 0 });
  },
  onLobbyResolveRoleSwap: (requestId, accept) => {
    net.send({ t: 'lobbyResolveRoleSwap', requestId, accept, lobbyRevision: lobbyState?.revision ?? 0 });
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
    lobbyState = null;
    lobbyChat = [];
    hud.leaveLobbyToMultiplayer();
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
        const compat = checkProtocolCompatibility({
          clientProtocol: PROTOCOL_VERSION,
          clientContentHash: CLIENT_CONTENT_PACK.hash,
          clientDefinitionOrderHash: ENEMY_DEFINITION_ORDER_HASH,
          serverProtocol: PROTOCOL_VERSION,
          serverContentHash: (msg.content as { hash?: string } | undefined)?.hash,
          serverDefinitionOrderHash: msg.definitionOrderHash as string | undefined,
        });
        if (!compat.ok) {
          showProtocolError(compat.reason ?? 'incompatible build');
        } else if (!mapGateFailed) {
          const reconnectMatchId = msg.matchId as string | undefined;
          if (reconnectMatchId) {
            latestRunConfig = {
              protocol: PROTOCOL_VERSION,
              t: 'runConfig',
              matchId: reconnectMatchId,
              modeId: (msg.modeId as string | undefined) ?? 'mode.mainStage',
              run: (msg.run as RunConfigMessage['run']) ?? null,
              contentHash: (msg.content as { hash?: string } | undefined)?.hash,
              definitionOrderHash: msg.definitionOrderHash as string | undefined,
            };
          }
          const reconnectConfig = latestRunConfig?.matchId === reconnectMatchId ? latestRunConfig : null;
          void (async () => {
            if (reconnectConfig?.run) {
              const loaded = assets ?? (await assetsPromise);
              await loaded.preloadModels(resolveSelectedPreloadAssetIds(CLIENT_CONTENT_PACK, reconnectConfig.run));
              lastPreloadedMatchId = reconnectMatchId ?? '';
            }
            await resumeOnline(msg.arena as ArenaMetadata, phase === 'results', reconnectMatchId);
          })();
        }
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
      const localSeat = lobbyState.players.find((player) => player.playerId === localPlayerId)?.seat;
      if (localSeat) {
        role = localSeat;
        hud.setTheme(role);
      }
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
    case 'runConfig': {
      const config = msg as unknown as RunConfigMessage;
      latestRunConfig = config;
      const compat = checkProtocolCompatibility({
        clientProtocol: PROTOCOL_VERSION,
        clientContentHash: CLIENT_CONTENT_PACK.hash,
        clientDefinitionOrderHash: ENEMY_DEFINITION_ORDER_HASH,
        serverProtocol: PROTOCOL_VERSION,
        serverContentHash: config.contentHash,
        serverDefinitionOrderHash: config.definitionOrderHash,
      });
      if (!compat.ok) {
        showProtocolError(compat.reason ?? 'incompatible build');
        return;
      }
      // The server waits for assetReady before starting the countdown.
      // Preload exactly the selected run; a null run (Demo) is ready
      // immediately. Errors never stall a crew — the server also has an
      // explicit readiness timeout.
      void (async () => {
        try {
          if (config.run) {
            const loaded = assets ?? (await assetsPromise);
            await loaded.preloadModels(resolveSelectedPreloadAssetIds(CLIENT_CONTENT_PACK, config.run));
          }
        } catch (error) {
          console.warn('[runConfig] asset preload failed; proceeding anyway', error);
        } finally {
          lastPreloadedMatchId = config.matchId;
          net.send({
            t: 'assetReady',
            matchId: config.matchId,
            contentHash: CLIENT_CONTENT_PACK.hash,
            definitionOrderHash: ENEMY_DEFINITION_ORDER_HASH,
          });
        }
      })();
      break;
    }
    case 'start':
      {
        const compat = checkProtocolCompatibility({
          clientProtocol: PROTOCOL_VERSION,
          clientContentHash: CLIENT_CONTENT_PACK.hash,
          clientDefinitionOrderHash: ENEMY_DEFINITION_ORDER_HASH,
          serverProtocol: PROTOCOL_VERSION,
          serverContentHash: (msg.content as { hash?: string } | undefined)?.hash,
          serverDefinitionOrderHash: msg.definitionOrderHash as string | undefined,
        });
        if (!compat.ok) {
          showProtocolError(compat.reason ?? 'incompatible build');
          break;
        }
      }
      if (msg.arena) {
        void startOnlineWithArena(role, msg.arena as ArenaMetadata, msg.matchId as string | undefined);
      } else {
        void startOnline(role, null, msg.matchId as string | undefined);
      }
      hud.hideCountdown();
      break;
    case 'snapshot': {
      const meta = msg.arena as ArenaMetadata | undefined;
      if (meta && !mapGateFailed) {
        if (!arenaSession) {
          void resumeOnline(meta, false, (msg.state as MatchState | undefined)?.matchId);
        } else if (meta.arenaChecksum !== arenaSession.metadata.arenaChecksum) {
          showMapError('checksum');
        }
      }
      const horde = msg.horde as HordeSnapshotBlock | undefined;
      latestStageView = msg.stage as HordeStageView | undefined;
      const snapshotState = msg.state as MatchState | undefined;
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
  const { bundle, fallbackBundle } = resolveClientMapBundle(FORCED_MAP_ID);
  const roomCode = FORCED_SEED !== null ? `SEED${FORCED_SEED}` : 'SINGLE';
  try {
    const session = selectArenaSession({
      roomCode,
      matchIndex: singlePlayerMatchIndex,
      bundle,
      fallbackBundle,
    });
    // Visual/collision QA hook: start on an authored roof without changing
    // the normal prototype spawn order. It is inert outside explicit test mode.
    if (TEST_MODE && params.get('urbanSpawn') === 'roof' && session.arena.urbanLayout) {
      const roof = session.arena.urbanLayout.buildings[0];
      session.world.spawnPoints.unshift({ x: roof.x, z: roof.z });
    }
    return session;
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

async function startOnlineWithArena(r: Role, meta: ArenaMetadata, matchId?: string): Promise<void> {
  const session = buildSessionFromMetadata(meta);
  if ('error' in session) {
    showMapError(session.error);
    return;
  }
  arenaSession = session;
  await startOnline(r, session.world, matchId);
}

/** Hard protocol/content compatibility failure: never start the match. */
function showProtocolError(reason: string): void {
  hud.showError(`Incompatible build: ${reason}. Reload to update.`);
  input.setEnabled(false);
  game?.setInputEnabled(false);
  input.releaseLock();
  flow = 'error';
  arenaSession = null;
  mapGateFailed = true;
}

async function resumeOnline(meta: ArenaMetadata, results: boolean, matchId?: string): Promise<void> {
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
  await startOnline(role, session.world, matchId);
  if (results) flow = 'results';
}

async function startOnline(r: Role, world: ArenaWorld | null, matchId?: string): Promise<void> {
  sessionKind = 'multiplayer';
  if (!game) game = await createGame(world ?? arenaSession?.world ?? createStaticArenaWorld());
  if (matchId && matchId !== lastPreloadedMatchId) {
    const config = latestRunConfig?.matchId === matchId ? latestRunConfig : null;
    await game.preloadMonsterRun(CLIENT_CONTENT_PACK, config?.run ?? null);
    lastPreloadedMatchId = matchId;
  }
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
  const matchId = 'single-' + Date.now();
  const spModeId =
    params.get('mode') === 'demo' ? 'mode.singlePlayerScoreAttack' : SINGLE_PLAYER_SESSION.rulesModeId;
  activeSinglePlayerModeId = spModeId;
  if (session.arena?.urbanLayout) {
    const loaded = assets ?? (await assetsPromise);
    assets = loaded;
    await loaded.preloadModels(urbanAssetIds(session.arena.urbanLayout));
  }
  game = await createGame(session.world);
  const selectedRun = resolveSelectedMonsterRun(CLIENT_CONTENT_PACK, matchId, spModeId);
  await game.preloadMonsterRun(CLIENT_CONTENT_PACK, selectedRun);
  lastPreloadedMatchId = matchId;
  attachGameCallbacks(game);
  game.onSinglePlayerResults = (results) => {
    hud.showSinglePlayerResults(results as never);
    input.releaseLock();
    flow = 'results';
  };
  game.startSinglePlayer(CLIENT_CONTENT_PACK, session.world, matchId, spModeId);
  game.suppressAutoInput = TEST_MODE;
  if (TEST_MODE && params.get('urbanView') === 'overview' && session.arena?.urbanLayout) {
    game.setUrbanOverview(session.arena.widthMeters);
  }
  if (TEST_MODE && params.has('qualityMetrics')) {
    window.setInterval(() => {
      if (game) document.body.dataset.qualityMetrics = JSON.stringify(game.qualityDiagnostics());
    }, 250);
  }
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
    rules: {
      ...game?.getHudRules(),
      progressionEnabled: hudProgressionEnabled(),
    },
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

function hudProgressionEnabled(): boolean {
  const modeId = sessionKind === 'singlePlayer'
    ? activeSinglePlayerModeId
    : latestRunConfig?.modeId ?? 'mode.mainStage';
  try {
    return CLIENT_CONTENT_PACK.getMode(modeId).progression === true;
  } catch {
    return false;
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
    role: () => role,
    create: () => net.send({ t: 'create' }),
    join: (code: string) => net.send({ t: 'join', code }),
    joinWithName: (code: string, name: string) => net.send({ t: 'join', code, displayName: name }),
    rejoin: (code: string, sid: string) => net.send({ t: 'rejoin', code, sessionId: sid }),
    ready: () => net.send({ t: 'ready', ready: true }),
    lobby: {
      state: () => lobbyState,
      chat: () => lobbyChat,
      playerId: () => localPlayerId,
      seat: (seat: CrewSeat) =>
        net.send({ t: 'lobbySelectSeat', seat, lobbyRevision: lobbyState?.revision ?? 0 }),
      requestRoleSwap: () =>
        net.send({ t: 'lobbyRequestRoleSwap', lobbyRevision: lobbyState?.revision ?? 0 }),
      resolveRoleSwap: (requestId: number, accept: boolean) =>
        net.send({ t: 'lobbyResolveRoleSwap', requestId, accept, lobbyRevision: lobbyState?.revision ?? 0 }),
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
    netcodeMetrics: () => netcodeMetrics.snapshot(),
    suppressPresentationFrames: (suppressed: boolean) => game?.setPresentationFramesSuppressedForTest(suppressed),
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
    monster: {
      run: () => {
        if (latestRunConfig?.run) return latestRunConfig.run;
        const m = game?.singlePlayerMatch;
        if (!m) return null;
        return m.runtime.systems.monsterRun;
      },
      enemies: () =>
        game?.singlePlayerMatch?.state.enemies.map((e) => ({
          id: e.id,
          defId: e.defId ?? '',
          hp: e.hp,
          maxHp: e.maxHp,
          alive: e.alive,
        })) ?? [],
      damage: (id: number, amount: number) => {
        const runtime = game?.singlePlayerMatch?.runtime;
        const enemy = runtime?.state.enemies.find((e) => e.id === id);
        if (!runtime || !enemy) return -1;
        runtime.damageEnemy(enemy, amount, 'test');
        return enemy.hp;
      },
      stageView: () => game?.getSinglePlayerStageView() ?? null,
      phase: () => game?.singlePlayerMatch?.runtime.systems.stage.state.phase ?? null,
      healTank: () => {
        const m = game?.singlePlayerMatch;
        if (!m) return;
        m.state.tank.integrity = m.runtime.cfg.tank.maxIntegrity;
        m.state.tank.deadT = 0;
      },
      resultsState: () => {
        const m = game?.singlePlayerMatch;
        if (!m) return null;
        return {
          results: m.results,
          shown: (game as unknown as { singlePlayerResultsShown: boolean }).singlePlayerResultsShown,
        };
      },
    },
    stageView: () => latestStageView ?? null,
    testDamage: (defId: string, amount: number) => {
      net.send({ t: 'testDamageEnemyByDef', defId, amount });
    },
    testHealTank: () => {
      net.send({ t: 'testHealTank' });
    },
    testImpulse: (defId: string, horizontal: number, vertical: number) => {
      net.send({ t: 'testImpulseEnemyByDef', defId, horizontal, vertical });
    },
    xp: {
      spawn: (count: number) => {
        const m = game?.singlePlayerMatch;
        if (!m) return 0;
        const t = m.state.tank;
        for (let i = 0; i < count; i++) {
          m.runtime.systems.xpShards.spawn(
            1,
            t.x + Math.sin(i * 0.7) * 6,
            t.z + Math.cos(i * 0.7) * 6,
          );
        }
        return m.state.xpShards.length;
      },
      stats: () => {
        const renderer = (game as unknown as {
          xpShards: {
            liveCount: number;
            popCount: number;
            overflow: number;
            capacity: number;
            mesh: { count: number };
            overflowIndicator: { visible: boolean };
          };
        })?.xpShards;
        if (!renderer) return null;
        return {
          liveCount: renderer.liveCount,
          popCount: renderer.popCount,
          overflow: renderer.overflow,
          capacity: renderer.capacity,
          drawCount: renderer.mesh.count,
          overflowVisible: renderer.overflowIndicator.visible,
        };
      },
    },
    monsterSpawn: (defId: string, x: number, z: number) => {
      const m = game?.singlePlayerMatch;
      if (!m) return -1;
      const def = m.runtime.rules.enemies.get(defId);
      if (!def) return -1;
      const e = m.runtime.systems.enemies.spawnEnemyDef(def, x, z);
      return e?.id ?? -1;
    },
    monsterImpulse: (id: number, horizontal: number, vertical: number) => {
      const m = game?.singlePlayerMatch;
      if (!m) return false;
      const e = m.state.enemies.find((x) => x.id === id);
      if (!e) return false;
      const def = m.runtime.systems.enemies.defFor(e);
      const dx = m.state.tank.x - e.x;
      const dz = m.state.tank.z - e.z;
      const d = Math.hypot(dx, dz) || 1;
      m.runtime.systems.enemyImpulses.apply(e, def, dx / d, dz / d, horizontal, vertical, 'cannon');
      return true;
    },
    enemyById: (id: number) => {
      const m = game?.singlePlayerMatch;
      const e = m?.state.enemies.find((x) => x.id === id);
      if (!e) return null;
      return { id: e.id, defId: e.defId ?? '', x: e.x, y: e.y, z: e.z, alive: e.alive };
    },
    enemyRenderY: (id: number) => {
      const registry = (game as unknown as {
        registry: { enemyRigs: Map<number, { group: { position: { y: number } } }> };
      })?.registry;
      return registry?.enemyRigs.get(id)?.group.position.y ?? null;
    },
    enemyReplicated: (defId: string) => {
      const s = latestState;
      if (!s) return null;
      const e = s.enemies.find((x) => x.defId === defId && x.alive);
      return e ? { id: e.id, y: e.y, defId: e.defId ?? '', alive: e.alive } : null;
    },
    monsterDims: (defId: string) => {
      try {
        const d = resolveMonsterDimensionsForDefId(defId);
        return { collisionRadius: d.collisionRadius, finalHeight: d.finalHeight };
      } catch {
        return null;
      }
    },
    monsterSemantic: (id: number) => {
      const m = game?.singlePlayerMatch;
      return m ? m.runtime.systems.enemies.semanticFor(id).action : null;
    },
    arena: () => arenaSession?.metadata ?? null,
    run: () => latestRunConfig?.run ?? null,
    runConfig: () => latestRunConfig,
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
