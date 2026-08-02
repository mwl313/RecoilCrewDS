import './styles.css';
import { Game } from './game';
import { InputManager } from './input';
import { Hud } from './hud';
import { NetClient } from './net';
import { AudioManager } from './audio';
import { GameAssets } from './assets';
import type { MatchState, Role } from '../shared/types';

const assets = new GameAssets();
const audio = new AudioManager();
const hud = new Hud();
const net = new NetClient();
const input = new InputManager();

let game: Game | null = null;
let role: Role = 'driver';
let sessionId = '';
let roomCode = '';
let inGame = false;
let practice = false;
let flow: 'boot' | 'main' | 'create' | 'join' | 'ready' | 'game' | 'results' = 'boot';
let lastPingSent = 0;
let pingMs = 0;
let latestState: MatchState | null = null;
let peerConnected = false;
let lastFps = 60;
const TEST_MODE = new URLSearchParams(window.location.search).has('test');

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
    startPractice();
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
      startPractice();
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
      startOnline(role);
      hud.hideCountdown();
      break;
    case 'snapshot':
      latestState = msg.state as MatchState;
      game?.setSnapshot({
        seq: Number(msg.seq),
        serverTime: Number(msg.serverTime),
        state: latestState,
        lastProcessedDriverInputSeq: Number(msg.lastProcessedDriverInputSeq ?? 0),
        lastProcessedGunnerInputSeq: Number(msg.lastProcessedGunnerInputSeq ?? 0),
      });
      break;
    case 'event':
      game?.handleEvent(msg.event as never);
      hud.onEvent(msg.event as never);
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
    flow = 'main';
  } else if (!connected && flow === 'join') {
    hud.showJoinError('Cannot reach the server. Is it running?');
  }
};

function startOnline(r: Role) {
  practice = false;
  if (!game) {
    game = new Game(document.getElementById('app')!, assets, audio, input, () => undefined);
    attachGameCallbacks(game);
  }
  game.suppressAutoInput = TEST_MODE;
  game.startOnline(r);
  hud.setGameScreen(true);
  hud.setTheme(r);
  inGame = true;
  flow = 'game';
  input.setEnabled(true);
  game.setInputEnabled(true);
  input.requestLock();
}

function startPractice() {
  teardownGame();
  practice = true;
  game = new Game(document.getElementById('app')!, assets, audio, input, () => undefined);
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
}

function attachGameCallbacks(g: Game) {
  input.attach(g.getCanvas());
  input.onLockChange = onLockChange;
  g.onSendInput = (m) => net.send(m);
  g.onPauseRequest = () => showPause();
  g.onFrame = onFrame;
}

function teardownGame() {
  if (game) {
    game.setInputEnabled(false);
    game.destroy();
    game = null;
  }
  inGame = false;
  practice = false;
  latestState = null;
  input.releaseLock();
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

function onFrame(state: MatchState) {
  if (!game) return;
  latestState = state;
  const truck = state.truck;
  let objective: { x: number; y: number; visible: boolean } | null = null;
  if (truck.active) {
    objective = game.projectWorld(truck.x, truck.y + 2.4, truck.z);
  }
  hud.update(state, {
    role,
    peerConnected,
    ping: pingMs,
    fps: lastFps,
    pointerLocked: input.locked,
    practice,
    objective,
  });
  if (input.consumeSwap() && practice) game.togglePracticeView();
  if (input.consumeRecenter()) game.recenter();
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
    const fps = (game as unknown as { fps: number }).fps;
    if (fps) lastFps = fps;
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
    flow: () => flow,
    create: () => net.send({ t: 'create' }),
    join: (code: string) => net.send({ t: 'join', code }),
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
  };
}
