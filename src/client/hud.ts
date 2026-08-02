import type { MatchState, ModifierId, Role } from '../shared/types';

export interface HudHandlers {
  onBoot(): void;
  onCreate(): void;
  onJoin(code: string): void;
  onReady(): void;
  onPractice(): void;
  onHowTo(): void;
  onBack(): void;
  onRematch(modifier: ModifierId): void;
  onLeave(): void;
  onRetry(): void;
  onMainMenu(): void;
  onResume(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = text;
  return e;
}

const MODIFIERS: { id: ModifierId; label: string; desc: string }[] = [
  { id: 'none', label: 'STANDARD', desc: 'The classic Recoil Crew experience.' },
  { id: 'doubleBarrel', label: 'DOUBLE BARREL', desc: 'Two shells, more recoil, longer cooldown.' },
  { id: 'soapTracks', label: 'SOAP TRACKS', desc: 'Lower grip and wider drifts.' },
  { id: 'moonYard', label: 'MOON YARD', desc: 'Lower gravity and longer airtime.' },
  { id: 'volatileInventory', label: 'VOLATILE INVENTORY', desc: 'Bigger barrel blasts and chains.' },
  { id: 'scrapMagnet', label: 'SCRAP MAGNET', desc: 'Stronger magnet, shorter pickup life.' },
  { id: 'overclocked', label: 'OVERCLOCKED', desc: 'Faster MG and more enemies.' },
];

export class Hud {
  root: HTMLElement;
  private screens = new Map<string, HTMLElement>();
  private hud!: HTMLElement;
  private roleChip!: HTMLElement;
  private connDot!: HTMLElement;
  private pingText!: HTMLElement;
  private timerText!: HTMLElement;
  private scoreText!: HTMLElement;
  private comboText!: HTMLElement;
  private integrityFill!: HTMLElement;
  private jackpotFill!: HTMLElement;
  private jackpotWrap!: HTMLElement;
  private speedText!: HTMLElement;
  private promptText!: HTMLElement;
  private promptSub!: HTMLElement;
  private crosshair!: HTMLElement;
  private cooldownArc!: HTMLElement;
  private pipLabel!: HTMLElement;
  private pipStatus!: HTMLElement;
  private pipFrame!: HTMLElement;
  private fpsText!: HTMLElement;
  private popups!: HTMLElement;
  private pauseBtn!: HTMLElement;
  private modifiers: Record<string, HTMLElement> = {};
  private codeInput!: HTMLInputElement;
  private joinError!: HTMLElement;
  private createCode!: HTMLElement;
  private readyBtn!: HTMLElement;
  private driverRow!: HTMLElement;
  private gunnerRow!: HTMLElement;
  private countdownEl!: HTMLElement;
  private countdownSub!: HTMLElement;
  private resultsStats!: HTMLElement;
  private resultsTitle!: HTMLElement;
  private resultsGrade!: HTMLElement;
  private rematchInfo!: HTMLElement;
  private errorMsg!: HTMLElement;
  private objectiveArrow!: HTMLElement;
  private practiceTag!: HTMLElement;
  private resultsScore!: HTMLElement;
  private braceInd!: HTMLElement;
  private menuClick = (fn: () => void) => (e: Event) => {
    e.preventDefault();
    this.sound();
    fn();
  };

  private sound() {
    const onUi = this.onUiSound;
    onUi?.();
  }
  onUiSound: (() => void) | null = null;

  constructor() {
    this.root = el('div', 'app-root');
    document.getElementById('app')!.appendChild(this.root);

    // Screens container.
    const screens = el('div', 'screens');
    this.root.appendChild(screens);
    this.makeScreens(screens);

    // HUD.
    this.hud = el('div', 'hud hidden');
    this.hud.id = 'hud';
    this.root.appendChild(this.hud);
    this.makeHud(this.hud);
  }

  private makeScreens(root: HTMLElement) {
    const boot = el('div', 'screen', '');
    boot.id = 'screen-boot';
    boot.innerHTML = `
      <div class="boot-inner">
        <div class="logo">
          <div class="logo-bar"></div>
          <h1>RECOIL CREW</h1>
          <div class="logo-sub">ONE TANK · TWO BRAINS · ZERO BRAKES</div>
        </div>
        <div class="boot-hint">CLICK TO ENTER</div>
        <div class="boot-keys">WASD DRIVE · MOUSE AIM · RIGHT-CLICK CANNON</div>
      </div>`;
    root.appendChild(boot);

    const main = el('div', 'screen', '');
    main.id = 'screen-main';
    main.innerHTML = `
      <div class="panel">
        <div class="logo small"><h1>RECOIL CREW</h1><div class="logo-sub">ONE TANK · TWO BRAINS · ZERO BRAKES</div></div>
        <button class="btn primary" data-act="create">CREATE CREW</button>
        <button class="btn" data-act="join">JOIN CREW</button>
        <button class="btn" data-act="practice">PRACTICE</button>
        <button class="btn ghost" data-act="howto">HOW TO PLAY</button>
      </div>`;
    root.appendChild(main);

    const create = el('div', 'screen', '');
    create.id = 'screen-create';
    create.innerHTML = `
      <div class="panel">
        <h2>CREATE CREW</h2>
        <div class="code-box"><span class="code" id="create-code">------</span><button class="btn small" id="copy-code">COPY</button></div>
        <div class="status-line" id="create-status">WAITING FOR GUNNER…</div>
        <button class="btn" id="create-ready">READY</button>
        <button class="btn ghost" data-act="back">BACK</button>
      </div>`;
    root.appendChild(create);

    const join = el('div', 'screen', '');
    join.id = 'screen-join';
    join.innerHTML = `
      <div class="panel">
        <h2>JOIN CREW</h2>
        <input id="join-code" maxlength="6" placeholder="AB12CD" autocomplete="off" spellcheck="false" />
        <div class="error" id="join-error"></div>
        <button class="btn primary" id="join-go">JOIN</button>
        <button class="btn ghost" data-act="back">BACK</button>
      </div>`;
    root.appendChild(join);

    const ready = el('div', 'screen', '');
    ready.id = 'screen-ready';
    ready.innerHTML = `
      <div class="panel">
        <h2>CREW LINKED</h2>
        <div class="code-box small"><span class="code" id="ready-code"></span></div>
        <div class="ready-rows">
          <div class="ready-row" id="ready-driver"><span class="dot cyan"></span>DRIVER <span class="state" id="driver-state">WAITING</span></div>
          <div class="ready-row" id="ready-gunner"><span class="dot orange"></span>GUNNER <span class="state" id="gunner-state">WAITING</span></div>
        </div>
        <button class="btn primary" id="ready-go">READY</button>
        <button class="btn ghost" data-act="back">LEAVE</button>
      </div>`;
    root.appendChild(ready);

    const countdown = el('div', 'screen', '');
    countdown.id = 'screen-countdown';
    countdown.innerHTML = `<div class="countdown-inner"><div class="countdown-number" id="countdown-n">3</div><div class="countdown-sub" id="countdown-sub">GET READY</div></div>`;
    root.appendChild(countdown);

    const results = el('div', 'screen', '');
    results.id = 'screen-results';
    results.innerHTML = `
      <div class="panel results">
        <h2>ROUND COMPLETE</h2>
        <div class="results-grade" id="results-grade">B</div>
        <div class="results-title" id="results-title">SCRAP GOBLINS</div>
        <div class="results-score" id="results-score">0</div>
        <div class="results-stats" id="results-stats"></div>
        <div class="mods-title">REMATCH MODIFIER</div>
        <div class="mods" id="mods"></div>
        <div class="rematch-info" id="rematch-info">PICK A MODIFIER TO REMATCH</div>
        <button class="btn ghost" id="leave-btn">LEAVE CREW</button>
      </div>`;
    root.appendChild(results);

    const error = el('div', 'screen', '');
    error.id = 'screen-error';
    error.innerHTML = `
      <div class="panel">
        <h2>CONNECTION LOST</h2>
        <div class="error" id="error-msg">Something went wrong.</div>
        <button class="btn primary" id="retry-btn">RETRY</button>
        <button class="btn" data-act="practice">PRACTICE</button>
        <button class="btn ghost" data-act="main">MAIN MENU</button>
      </div>`;
    root.appendChild(error);

    const pause = el('div', 'screen', '');
    pause.id = 'screen-pause';
    pause.innerHTML = `
      <div class="panel">
        <h2>PAUSED</h2>
        <button class="btn primary" id="resume-btn">RESUME</button>
        <button class="btn" data-act="practice">PRACTICE</button>
        <button class="btn ghost" data-act="main">MAIN MENU</button>
      </div>`;
    root.appendChild(pause);

    const howto = el('div', 'screen', '');
    howto.id = 'screen-howto';
    howto.innerHTML = `
      <div class="panel wide">
        <h2>HOW TO PLAY</h2>
        <div class="howto-grid">
          <div>
            <h3 class="cyan">DRIVER</h3>
            <p><b>WASD</b> drive · <b>Mouse</b> look<br/><b>Shift</b> boost &amp; drift · <b>Space</b> brace<br/><b>R</b> recenter camera</p>
            <p>Collect scrap at speed. Ram Scrap Bugs. Dodge Rammers. Brace before big shots to control recoil.</p>
          </div>
          <div>
            <h3 class="orange">GUNNER</h3>
            <p><b>Mouse</b> aim · <b>LMB</b> machine gun<br/><b>RMB</b> cannon · <b>Hold RMB</b> charge JACKPOT<br/><b>R</b> recenter camera</p>
            <p>Kill everything. Shoot the Loot Truck. Chain barrels. Coordinate shots with the Driver for Crew Links.</p>
          </div>
        </div>
        <p class="howto-foot">Both roles share one tank. The cannon physically throws the Driver around — brace or enjoy the chaos.</p>
        <button class="btn ghost" data-act="back">BACK</button>
      </div>`;
    root.appendChild(howto);

    const screenList: [string, HTMLElement][] = [
      ['boot', boot], ['main', main], ['create', create], ['join', join], ['ready', ready],
      ['countdown', countdown], ['results', results], ['error', error], ['pause', pause], ['howto', howto],
    ];
    for (const [name, node] of screenList) {
      this.screens.set(name, node);
    }

    // Wire generic actions.
    const ACT_MAP: Record<string, keyof HudHandlers> = {
      back: 'onBack',
      main: 'onMainMenu',
      practice: 'onPractice',
      howto: 'onHowTo',
    };
    root.querySelectorAll('[data-act]').forEach((node) => {
      const act = node.getAttribute('data-act');
      if (!act) return;
      const handler = ACT_MAP[act];
      if (!handler) return;
      node.addEventListener('click', ((e: Event) => {
        e.preventDefault();
        this.sound();
        (this.handlers[handler] as (() => void) | undefined)?.();
      }) as EventListener);
    });
  }

  private handlers: Partial<HudHandlers> = {};

  bind(h: HudHandlers) {
    this.handlers = h;
    document.getElementById('screen-boot')!.addEventListener('click', this.menuClick(h.onBoot));
    document.getElementById('screen-main')!.querySelector('[data-act="create"]')!.addEventListener('click', this.menuClick(h.onCreate));
    document.getElementById('screen-main')!.querySelector('[data-act="join"]')!.addEventListener('click', this.menuClick(h.onJoin.bind(null, '')));
    document.getElementById('screen-main')!.querySelector('[data-act="practice"]')!.addEventListener('click', this.menuClick(h.onPractice));
    document.getElementById('screen-main')!.querySelector('[data-act="howto"]')!.addEventListener('click', this.menuClick(h.onHowTo));
    document.getElementById('copy-code')!.addEventListener('click', this.menuClick(() => {
      const code = this.createCode.textContent ?? '';
      void navigator.clipboard?.writeText(code);
    }));
    document.getElementById('create-ready')!.addEventListener('click', this.menuClick(h.onReady));
    document.getElementById('ready-go')!.addEventListener('click', this.menuClick(h.onReady));
    document.getElementById('join-go')!.addEventListener('click', this.menuClick(() => h.onJoin(this.codeInput.value)));
    this.codeInput = document.getElementById('join-code') as HTMLInputElement;
    this.codeInput.addEventListener('input', () => {
      this.codeInput.value = this.codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      this.joinError.textContent = '';
    });
    this.codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') h.onJoin(this.codeInput.value);
    });
    this.joinError = document.getElementById('join-error')!;
    this.createCode = document.getElementById('create-code')!;
    this.readyBtn = document.getElementById('ready-go')!;
    this.driverRow = document.getElementById('ready-driver')!;
    this.gunnerRow = document.getElementById('ready-gunner')!;
    this.countdownEl = document.getElementById('countdown-n')!;
    this.countdownSub = document.getElementById('countdown-sub')!;
    this.resultsGrade = document.getElementById('results-grade')!;
    this.resultsTitle = document.getElementById('results-title')!;
    this.resultsStats = document.getElementById('results-stats')!;
    this.rematchInfo = document.getElementById('rematch-info')!;
    this.errorMsg = document.getElementById('error-msg')!;
    document.getElementById('retry-btn')!.addEventListener('click', this.menuClick(h.onRetry));
    document.getElementById('resume-btn')!.addEventListener('click', this.menuClick(h.onResume));
    document.getElementById('leave-btn')!.addEventListener('click', this.menuClick(h.onLeave));
    this.resultsScore = document.getElementById('results-score')!;
    const mods = document.getElementById('mods')!;
    for (const m of MODIFIERS) {
      const chip = el('button', 'mod', m.label);
      chip.title = m.desc;
      chip.dataset.mod = m.id;
      chip.addEventListener('click', this.menuClick(() => h.onRematch(m.id)));
      mods.appendChild(chip);
      this.modifiers[m.id] = chip;
    }
  }

  private makeHud(hud: HTMLElement) {
    hud.innerHTML = `
      <div class="hud-top">
        <div class="hud-left">
          <div class="role-chip" id="role-chip">DRIVER</div>
          <span class="conn-dot" id="conn-dot" title="connection"></span>
          <span class="ping" id="ping">--ms</span>
          <span class="practice-tag hidden" id="practice-tag">PRACTICE</span>
        </div>
        <div class="hud-timer"><span id="timer">90</span></div>
        <div class="hud-right">
          <div class="score"><span id="score">0</span></div>
          <div class="combo" id="combo">×1</div>
        </div>
      </div>
      <div class="hud-bottom">
        <div class="hud-bars">
          <div class="bar-row"><span class="bar-label">INTEGRITY</span><div class="bar"><div class="bar-fill integrity" id="integrity"></div></div></div>
          <div class="bar-row"><span class="bar-label">JACKPOT</span><div class="bar jackpot-bar" id="jackpot-bar"><div class="bar-fill jackpot" id="jackpot"></div></div></div>
          <div class="charge-row hidden" id="charge-row"><div class="charge-label">CHARGING</div><div class="bar"><div class="bar-fill charge" id="charge-fill"></div></div></div>
        </div>
        <div class="hud-speed">
          <div class="speed-num"><span id="speed">0</span><small>KM/H</small></div>
          <div class="brace-ind" id="brace-ind">BRACE</div>
        </div>
      </div>
      <div class="hud-center">
        <div class="crosshair hidden" id="crosshair"><div class="ch-dot"></div><div class="ch-ring" id="ch-ring"></div></div>
        <div class="prompt" id="prompt"></div>
        <div class="prompt-sub" id="prompt-sub"></div>
      </div>
      <div class="objective hidden" id="objective-arrow">▼</div>
      <div class="pip" id="pip">
        <div class="pip-label" id="pip-label">GUNNER FEED</div>
        <div class="pip-status" id="pip-status">--</div>
      </div>
      <div class="fps" id="fps"></div>
      <div class="popups" id="popups"></div>
      <button class="pause-btn" id="pause-btn" title="menu">☰</button>
    `;
    this.roleChip = document.getElementById('role-chip')!;
    this.connDot = document.getElementById('conn-dot')!;
    this.pingText = document.getElementById('ping')!;
    this.practiceTag = document.getElementById('practice-tag')!;
    this.timerText = document.getElementById('timer')!;
    this.scoreText = document.getElementById('score')!;
    this.comboText = document.getElementById('combo')!;
    this.integrityFill = document.getElementById('integrity')!;
    this.jackpotFill = document.getElementById('jackpot')!;
    this.jackpotWrap = document.getElementById('jackpot-bar')!;
    this.speedText = document.getElementById('speed')!;
    this.promptText = document.getElementById('prompt')!;
    this.promptSub = document.getElementById('prompt-sub')!;
    this.crosshair = document.getElementById('crosshair')!;
    this.cooldownArc = document.getElementById('ch-ring')!;
    this.pipLabel = document.getElementById('pip-label')!;
    this.pipStatus = document.getElementById('pip-status')!;
    this.pipFrame = document.getElementById('pip')!;
    this.fpsText = document.getElementById('fps')!;
    this.popups = document.getElementById('popups')!;
    this.objectiveArrow = document.getElementById('objective-arrow')!;
    this.braceInd = document.getElementById('brace-ind')!;
    document.getElementById('pause-btn')!.addEventListener('click', () => this.handlers.onResume?.());
  }

  showScreen(name: string) {
    for (const [key, node] of this.screens) {
      node.classList.toggle('hidden', key !== name);
    }
    this.hud.classList.toggle('hidden', name !== 'game');
    if (name !== 'game') this.hud.classList.add('hidden');
  }

  setGameScreen(show: boolean) {
    for (const [, node] of this.screens) node.classList.add('hidden');
    this.hud.classList.toggle('hidden', !show);
  }

  setTheme(role: Role) {
    const theme = role === 'driver' ? 'driver' : 'gunner';
    this.root.dataset.theme = theme;
    this.roleChip.textContent = role.toUpperCase();
  }

  setCreateCode(code: string) {
    this.createCode.textContent = code;
    document.getElementById('ready-code')!.textContent = code;
  }

  updateLobby(driverReady: boolean, gunnerReady: boolean, myRole: Role) {
    document.getElementById('driver-state')!.textContent = driverReady ? 'READY' : 'WAITING';
    document.getElementById('gunner-state')!.textContent = gunnerReady ? 'READY' : 'WAITING';
    this.driverRow.classList.toggle('ready', driverReady);
    this.gunnerRow.classList.toggle('ready', gunnerReady);
    const mine = myRole === 'driver' ? driverReady : gunnerReady;
    this.readyBtn.textContent = mine ? 'READY ✓' : 'READY';
  }

  showCountdown(n: number) {
    if (n <= 0) {
      this.countdownEl.textContent = 'GO!';
      this.countdownSub.textContent = '';
    } else {
      this.countdownEl.textContent = String(n);
      this.countdownSub.textContent = n === 3 ? 'GET READY' : n === 2 ? 'DRIVER · GUNNER' : 'BRACE YOURSELF';
    }
    this.countdownEl.classList.remove('pop');
    void this.countdownEl.offsetWidth;
    this.countdownEl.classList.add('pop');
  }

  hideCountdown() {
    this.screens.get('countdown')!.classList.add('hidden');
  }

  showError(message: string) {
    this.errorMsg.textContent = message;
    this.showScreen('error');
  }

  showJoinError(message: string) {
    this.joinError.textContent = message;
  }

  showResults(results: { score: number; bestCombo: number; jackpotFired: number; kills: number; scrapCollected: number; links: number; wipeouts: number; grade: string; title: string; modifier: string }, rematch: { driver: boolean; gunner: boolean; modifier: string }) {
    this.resultsGrade.textContent = results.grade;
    this.resultsTitle.textContent = results.title;
    this.resultsScore.textContent = results.score.toLocaleString();
    this.resultsStats.innerHTML = `
      <div><span>BEST COMBO</span><b>×${results.bestCombo}</b></div>
      <div><span>JACKPOT</span><b>${results.jackpotFired}</b></div>
      <div><span>KILLS</span><b>${results.kills}</b></div>
      <div><span>SCRAP</span><b>${results.scrapCollected}</b></div>
      <div><span>CREW LINKS</span><b>${results.links}</b></div>
      <div><span>WIPEOUTS</span><b>${results.wipeouts}</b></div>`;
    this.updateRematch(rematch);
    this.showScreen('results');
    this.onUiSound?.();
  }

  updateRematch(rematch: { driver: boolean; gunner: boolean; modifier: string }) {
    for (const [id, chip] of Object.entries(this.modifiers)) {
      chip.classList.toggle('selected', id === rematch.modifier);
      chip.classList.toggle('mine', id === rematch.modifier);
    }
    const both = rematch.driver && rematch.gunner;
    this.rematchInfo.textContent = both
      ? 'BOTH READY — REMATCH INCOMING'
      : `DRIVER ${rematch.driver ? 'READY' : 'PICKING'} · GUNNER ${rematch.gunner ? 'READY' : 'PICKING'}`;
    this.rematchInfo.classList.toggle('ready', both);
  }

  update(
    state: MatchState,
    opts: {
      role: Role;
      peerConnected: boolean;
      ping: number;
      fps: number;
      pointerLocked: boolean;
      practice: boolean;
      objective: { x: number; y: number; visible: boolean } | null;
    },
  ) {
    const t = state.tank;
    const remaining = Math.max(0, Math.ceil(state.duration - state.time));
    this.timerText.textContent = String(remaining);
    this.timerText.classList.toggle('urgent', remaining <= 5);
    this.scoreText.textContent = Math.floor(state.stats.score).toLocaleString();
    this.comboText.textContent = `×${state.combo.multiplier}`;
    this.comboText.classList.toggle('hot', state.combo.multiplier >= 3);
    this.integrityFill.style.width = `${t.integrity}%`;
    this.integrityFill.classList.toggle('low', t.integrity < 35);
    this.jackpotFill.style.width = `${state.stats.jackpotMeter}%`;
    this.jackpotWrap.classList.toggle('ready', state.turret.jackpotReady);
    this.speedText.textContent = String(Math.round(Math.hypot(t.vx, t.vz) * 3.6));
    this.braceInd.classList.toggle('on', t.brace);
    this.connDot.classList.toggle('off', !opts.peerConnected);
    this.pingText.textContent = `${Math.round(opts.ping)}ms`;
    this.fpsText.textContent = `${Math.round(opts.fps)} FPS`;
    this.practiceTag.classList.toggle('hidden', !opts.practice);

    // Prompts.
    const jp = state.turret.jackpotReady;
    let prompt = '';
    let sub = '';
    if (jp) {
      if (opts.role === 'driver') {
        prompt = 'JACKPOT READY';
        sub = 'HOLD SPACE TO BRACE';
      } else {
        prompt = 'JACKPOT READY';
        sub = 'HOLD RIGHT MOUSE TO CHARGE';
      }
      this.promptText.classList.add('jackpot');
    } else {
      this.promptText.classList.remove('jackpot');
      if (state.time < 8) {
        prompt = opts.role === 'driver' ? 'DRIVE · COLLECT SCRAP' : 'FIRE · KILL ENEMIES';
        sub = opts.role === 'driver' ? 'WASD + SHIFT + SPACE' : 'LMB MG · RMB CANNON';
      } else if (state.time > 40 && state.truck.active) {
        prompt = 'LOOT TRUCK';
        sub = 'DESTROY IT FOR JACKPOT SCRAP';
      }
    }
    this.promptText.textContent = prompt;
    this.promptSub.textContent = sub;

    // Charge bar.
    const charging = state.turret.chargeT > 0;
    document.getElementById('charge-row')!.classList.toggle('hidden', !charging);
    document.getElementById('charge-fill')!.style.width = `${Math.min(100, (state.turret.chargeT / 1.0) * 100)}%`;

    // Crosshair + cooldown.
    const isGunner = opts.role === 'gunner';
    this.crosshair.classList.toggle('hidden', !isGunner && !opts.practice);
    if (isGunner || opts.practice) {
      const cd = Math.max(0, state.turret.cannonCooldown / 1.6);
      const deg = 360 * (1 - cd);
      this.cooldownArc.style.background = `conic-gradient(from 0deg, rgba(255,162,59,0.95) ${deg}deg, rgba(255,255,255,0.12) ${deg}deg)`;
    }
    if (!opts.pointerLocked && !opts.practice) {
      this.promptText.textContent = 'CLICK TO AIM';
      this.promptSub.textContent = '';
    }

    // PIP.
    const pipRole: Role = opts.role === 'driver' ? 'gunner' : 'driver';
    this.pipLabel.textContent = `${pipRole.toUpperCase()} FEED`;
    const action = this.partnerAction(state, pipRole);
    this.pipStatus.textContent = action;
    this.pipFrame.classList.toggle('jackpot', state.turret.jackpotReady);

    // Objective arrow.
    if (opts.objective && opts.objective.visible && state.truck.active) {
      this.objectiveArrow.classList.remove('hidden');
      this.objectiveArrow.style.left = `${opts.objective.x}px`;
      this.objectiveArrow.style.top = `${opts.objective.y}px`;
    } else {
      this.objectiveArrow.classList.add('hidden');
    }
  }

  private partnerAction(state: MatchState, role: Role): string {
    const t = state.tank;
    if (role === 'driver') {
      if (t.deadT > 0) return 'WIPED OUT';
      if (t.brace) return 'BRACING';
      if (t.boosting) return 'BOOSTING';
      if (t.drift) return 'DRIFTING';
      if (Math.hypot(t.vx, t.vz) > 2) return 'DRIVING';
      return 'STATIONARY';
    }
    if (t.deadT > 0) return 'WIPED OUT';
    if (state.turret.chargeT > 0) return 'CHARGING';
    if (state.turret.jackpotReady) return 'CANNON READY';
    if (state.turret.cannonCooldown > 1.2) return 'RELOADING';
    if (state.turret.mgCooldown < 0.05 && state.turret.mgFiring) return 'FIRING';
    return 'AIMING';
  }

  floatText(text: string, kind = 'score') {
    const p = el('div', `float ${kind}`, text);
    p.style.left = `${50 + (Math.random() - 0.5) * 24}%`;
    p.style.top = `${34 + (Math.random() - 0.5) * 16}%`;
    this.popups.appendChild(p);
    setTimeout(() => p.remove(), 1400);
  }

  comboPulse() {
    this.comboText.classList.remove('pulse');
    void this.comboText.offsetWidth;
    this.comboText.classList.add('pulse');
  }

  onEvent(ev: { type: string; label?: string; value?: number; kind?: string }) {
    if (ev.type === 'comboChange') this.comboPulse();
    if (ev.type === 'score' || ev.type === 'kill' || ev.type === 'link' || ev.type === 'assist') {
      if (ev.label) this.floatText(ev.label, ev.type === 'kill' ? 'kill' : ev.type === 'link' ? 'link' : 'score');
    }
  }
}
