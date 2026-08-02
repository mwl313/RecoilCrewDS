import * as THREE from 'three';
import { ARENA } from '../../shared/arena';
import { clamp } from '../../shared/math';
import { Match } from '../../shared/sim/match';
import type { MatchState, Role, SimEvent, TankState } from '../../shared/types';
import type { AssetService, TankRig } from '../assets';
import type { AudioManager } from '../audio';
import type { InputSource } from './networkStatePresenter';
import { NetworkStatePresenter } from './networkStatePresenter';
import { CameraManager } from './cameraManager';
import { EntityViewFactory } from './entityViewFactory';
import { EntityViewRegistry } from './entityViewRegistry';
import { PipRenderer } from './pipRenderer';
import { PredictionController } from './predictionController';
import { PresentationEventRouter } from './presentationEventRouter';
import { QualityManager } from './qualityManager';
import { RenderWorld } from './renderWorld';

/**
 * GameClient: thin coordinator. It owns the frame loop, practice stepping,
 * and module wiring; rendering, entity views, cameras, prediction, network
 * presentation, event routing, PIP, and quality live in focused modules.
 * There are no ordinary gameplay content branches here.
 */
export class GameClient {
  private readonly world: RenderWorld;
  private readonly registry: EntityViewRegistry;
  private readonly cameras: CameraManager;
  private readonly prediction: PredictionController;
  private readonly presenter: NetworkStatePresenter;
  private readonly router: PresentationEventRouter;
  private readonly pip: PipRenderer;
  private readonly quality: QualityManager;
  private readonly tankRig: TankRig;
  private readonly audio: AudioManager;
  private readonly input: InputSource;
  private readonly container: HTMLElement;

  practiceMatch: Match | null = null;
  role: Role = 'driver';
  mode: 'online' | 'practice' = 'online';
  time = 0;
  private raf = 0;
  private running = false;
  private slowMo = 0;
  private practiceAcc = 0;
  private practiceResultsShown = false;
  private practiceViewRole: Role = 'driver';
  private cannonDown = false;
  private chargeDown = false;
  private mgDown = false;
  private inputEnabled = true;
  private lastPredictInput: { throttle: number; steer: number; boost: boolean; brace: boolean } = { throttle: 0, steer: 0, boost: false, brace: false };
  private inputSendT = 0;
  suppressAutoInput = false;

  onSendInput: ((msg: Record<string, unknown>) => void) | null = null;
  onPauseRequest: (() => void) | null = null;
  onFrame: ((state: MatchState) => void) | null = null;
  onPracticeResults: ((results: { score: number; bestCombo: number; jackpotFired: number; kills: number; scrapCollected: number; links: number; wipeouts: number; grade: string; title: string; modifier: string }) => void) | null = null;

  private constructor(deps: {
    container: HTMLElement;
    assets: AssetService;
    audio: AudioManager;
    input: InputSource;
    world: RenderWorld;
    registry: EntityViewRegistry;
    cameras: CameraManager;
    prediction: PredictionController;
    presenter: NetworkStatePresenter;
    router: PresentationEventRouter;
    pip: PipRenderer;
    quality: QualityManager;
    tankRig: TankRig;
  }) {
    this.container = deps.container;
    this.world = deps.world;
    this.registry = deps.registry;
    this.cameras = deps.cameras;
    this.prediction = deps.prediction;
    this.presenter = deps.presenter;
    this.router = deps.router;
    this.pip = deps.pip;
    this.quality = deps.quality;
    this.tankRig = deps.tankRig;
    this.audio = deps.audio;
    this.input = deps.input;
  }

  /** Awaits assets, then builds the full client (called after load()). */
  static async create(
    container: HTMLElement,
    assets: AssetService,
    audio: AudioManager,
    input: InputSource,
    onReady: () => void,
  ): Promise<GameClient> {
    const world = new RenderWorld(container, assets);
    const factory = new EntityViewFactory(assets);
    const registry = new EntityViewRegistry(world.scene, factory);
    const tankRig = assets.tankRig();
    world.scene.add(tankRig.chassis);
    const truckRig = new THREE.Group();
    truckRig.add(assets.model('enemy.lootTruck'));
    truckRig.visible = false;
    world.scene.add(truckRig);
    registry.registerTruckRig(truckRig, world.scene);
    for (const barrel of ARENA.barrels) {
      const mesh = assets.model('prop.explosiveBarrel').clone(true);
      mesh.position.set(barrel.x, 0.55, barrel.z);
      world.scene.add(mesh);
      registry.registerBarrel(barrel.id, mesh);
    }
    const cameras = new CameraManager();
    cameras.resize((container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight));
    let gameRef: GameClient | null = null;
    const prediction = new PredictionController('driver', { send: (msg) => gameRef?.onSendInput?.(msg) });
    const deps = {
      container,
      assets,
      audio,
      input,
      world,
      registry,
      cameras,
      prediction,
      presenter: null as unknown as NetworkStatePresenter,
      router: null as unknown as PresentationEventRouter,
      pip: null as unknown as PipRenderer,
      quality: null as unknown as QualityManager,
      tankRig,
    };
    const router = new PresentationEventRouter(assets, world.vfx, audio, cameras);
    const pip = new PipRenderer(world);
    const quality = new QualityManager({
      setPixelRatio: (r) => world.setPixelRatio(r),
      setShadows: (e) => world.setShadows(e),
      setBloomStrength: (s) => world.setBloomStrength(s),
      setPipRate: (r) => {
        pip.pipRate = r;
      },
    });
    const presenter = new NetworkStatePresenter({
      world,
      assets,
      registry,
      tankRig,
      cameras,
      prediction,
      colliders: world.arena.colliders,
      input,
      audio,
      mode: () => gameRef!.mode,
      role: () => gameRef!.role,
      practiceMatch: () => gameRef!.practiceMatch,
      time: () => gameRef!.time,
      applyPracticeWeapons: (dt) => gameRef!.applyPracticeWeapons(dt),
    });
    deps.presenter = presenter;
    deps.router = router;
    deps.pip = pip;
    deps.quality = quality;
    const game = new GameClient(deps);
    gameRef = game;
    game.onReadyHook = onReady;
    return game;
  }

  private onReadyHook: (() => void) | null = null;

  setRole(role: Role): void {
    this.role = role;
    this.cameras.setRole(role);
    this.prediction.setRole(role);
    this.world.setCamera(this.cameras.activeCam.camera);
  }

  startOnline(role: Role): void {
    this.mode = 'online';
    this.setRole(role);
    this.resetState();
    this.running = true;
    this.loop();
  }

  startPractice(): void {
    this.mode = 'practice';
    this.practiceViewRole = 'driver';
    this.practiceMatch = new Match('practice-' + Date.now(), 'none');
    const turret = this.practiceMatch.runtime.rules.loadout.turret;
    this.prediction.setTurretRates(turret.turnRate, turret.pitchFollowRate ?? 8);
    this.presenter.latest = this.practiceMatch.state;
    this.presenter.interpState = this.practiceMatch.state;
    this.setRole('driver');
    this.resetState();
    this.running = true;
    this.loop();
  }

  private resetState(): void {
    this.registry.reset();
    this.presenter.reset();
    this.prediction.reset();
    this.pip.reset();
    this.practiceAcc = 0;
    this.practiceResultsShown = false;
    this.slowMo = 0;
    this.time = 0;
  }

  setSnapshot(msg: { seq: number; serverTime: number; state: MatchState; lastProcessedDriverInputSeq: number; lastProcessedGunnerInputSeq: number; rulesRevision?: number; movementRulesRevision?: number; movement?: unknown }): void {
    this.presenter.setSnapshot(msg as never);
  }

  handleEvent(ev: SimEvent): void {
    this.router.handleEvent(ev);
  }

  private stepPractice(dt: number): void {
    const m = this.practiceMatch!;
    if (m.state.phase !== 'running' || !this.inputEnabled) return;
    m.setDriverInput({ ...this.sampleDriverInput() });
    const turret = this.prediction.getTurretSpaces();
    m.setGunnerInput({
      aimYaw: turret.desiredYawLocal,
      aimPitch: turret.desiredPitch,
      primary: this.mouseDown('primary'),
      secondary: this.mouseDown('secondary') && !m.state.turret.jackpotReady,
      ability: this.mouseDown('secondary') && m.state.turret.jackpotReady,
    });
    this.practiceAcc += dt;
    const step = 1 / 30;
    let guard = 0;
    while (this.practiceAcc >= step && guard++ < 6) {
      this.practiceAcc -= step;
      m.step(step);
      for (const ev of m.takeEvents()) {
        this.router.handleEvent(ev);
        this.onHudEvent?.(ev);
      }
      if ((m.state.phase as string) === 'results' && !this.practiceResultsShown) {
        this.practiceResultsShown = true;
        this.onPracticeResults?.(m.results!);
      }
    }
  }

  onHudEvent: ((ev: SimEvent) => void) | null = null;

  private loop = (): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dtRaw = this.quality.beginFrame(now);
    this.time += dtRaw;
    const dt = dtRaw * (this.slowMo > 0 ? 0.32 : 1);
    this.slowMo = Math.max(0, this.slowMo - dtRaw);
    this.cameras.tickShake(dtRaw);

    if (this.mode === 'practice' && this.practiceMatch) {
      this.stepPractice(dtRaw);
      this.presenter.latest = this.practiceMatch.state;
    }
    if (this.mode === 'online') this.presenter.advanceRenderClock(dtRaw);
    this.presenter.computeInterp();
    this.lastPredictInput = this.sampleDriverInput();
    let renderTank: TankState | null = null;
    const interp = this.presenter.interpState;
    if (interp) {
      if (this.mode === 'practice') {
        renderTank = interp.tank;
      } else if (this.role === 'driver') {
        this.prediction.sampleDriver(this.lastPredictInput, dtRaw);
        renderTank = this.prediction.renderTank(interp.tank);
      } else {
        renderTank = interp.tank;
      }
    }
    if (interp && renderTank) this.presenter.syncWorld(interp, renderTank, dt);
    if (this.presenter.latest) this.onFrame?.(this.presenter.latest);

    if (this.mode === 'online' && this.onSendInput) {
      this.inputSendT -= dtRaw;
      if (this.inputSendT <= 0) {
        this.inputSendT = 0.05;
        this.sendInputs();
      }
    }

    this.world.vfx.update(dt);
    const latest = this.presenter.latest;
    this.audio.setEngine(latest ? Math.min(1, Math.hypot(latest.tank.vx, latest.tank.vz) / 20) : 0, latest?.tank.boosting ?? false);
    this.audio.setMusicIntensity(latest ? clamp(latest.time / 90 * 1.15, 0, 1.25) : 0);
    this.renderFrame();
  };

  private renderFrame(): void {
    const w = this.world.renderer.domElement.clientWidth || window.innerWidth;
    const h = this.world.renderer.domElement.clientHeight || window.innerHeight;
    this.cameras.applyShake();
    this.world.render(this.cameras.activeCam.camera);
    if (this.presenter.latest) {
      this.pip.update(1 / 30, this.presenter.latest, this.role);
    }
    this.world.resetViewport(w, h);
  }

  private sendInputs(): void {
    if (!this.onSendInput || this.suppressAutoInput) return;
    if (this.role === 'driver') {
      this.prediction.sendDriver(this.sampleDriverInput());
    } else {
      const latest = this.presenter.latest;
      const turret = this.prediction.getTurretSpaces();
      this.prediction.sendGunner({
        aimYaw: turret.desiredYawLocal,
        aimPitch: turret.desiredPitch,
        primary: this.mouseDown('primary'),
        secondary: this.mouseDown('secondary') && !(latest?.turret.jackpotReady ?? false),
        ability: this.mouseDown('secondary') && (latest?.turret.jackpotReady ?? false),
      });
    }
  }

  private sampleDriverInput(): { throttle: number; steer: number; boost: boolean; brace: boolean } {
    if (!this.inputEnabled) return { throttle: 0, steer: 0, boost: false, brace: false };
    return {
      throttle: this.keyAxis('forward') - this.keyAxis('back'),
      steer: this.keyAxis('right') - this.keyAxis('left'),
      boost: this.keyDown('boost'),
      brace: this.keyDown('brace'),
    };
  }

  injectOnlineInput(role: Role, data: {
    throttle?: number;
    steer?: number;
    boost?: boolean;
    brace?: boolean;
    aimYaw?: number;
    aimPitch?: number;
    primary?: boolean;
    secondary?: boolean;
    ability?: boolean;
    /** Legacy test-hook aliases (mapped to generic actions). */
    mg?: boolean;
    cannon?: boolean;
    charge?: boolean;
  }): void {
    if (this.mode !== 'online' || !this.onSendInput) return;
    if (role === 'driver') {
      const input = {
        throttle: data.throttle ?? 0,
        steer: data.steer ?? 0,
        boost: !!data.boost,
        brace: !!data.brace,
      };
      this.onSendInput({ t: 'input', seq: this.prediction.nextSeq(), driver: input });
    } else {
      const turret = this.prediction.getTurretSpaces();
      // Test hook compat: legacy mg/cannon/charge keys map to generic actions.
      const mg = data.mg ?? data.primary;
      const cannon = data.cannon ?? data.secondary;
      const charge = data.charge ?? data.ability;
      this.onSendInput({
        t: 'input',
        seq: this.prediction.nextSeq(),
        gunner: {
          aimYaw: data.aimYaw ?? turret.desiredYawLocal,
          aimPitch: data.aimPitch ?? turret.desiredPitch,
          primary: !!mg,
          secondary: !!cannon && !(this.presenter.latest?.turret.jackpotReady ?? false),
          ability: !!charge && (this.presenter.latest?.turret.jackpotReady ?? false),
        },
      });
    }
  }

  recenter(): void {
    this.cameras.recenter(this.presenter.getRenderTank()?.yaw ?? 0);
  }

  togglePracticeView(): void {
    this.practiceViewRole = this.practiceViewRole === 'driver' ? 'gunner' : 'driver';
    this.setRole(this.practiceViewRole);
  }

  private keyDown(name: string): boolean {
    return this.input.key(name);
  }

  private keyAxis(name: string): number {
    return this.input.key(name) ? 1 : 0;
  }

  private mouseDown(name: string): boolean {
    return this.input.button(name);
  }

  applyPracticeWeapons(dt: number): void {
    const m = this.practiceMatch!;
    const state = m.state;
    if (state.tank.deadT > 0) return;
    const mg = this.mouseDown('primary');
    const cannon = this.mouseDown('secondary') && !state.turret.jackpotReady;
    const charge = this.mouseDown('secondary') && state.turret.jackpotReady;
    if (mg && state.turret.mgCooldown <= 0) {
      const muzzle = this.tankRig.barrel.localToWorld(new THREE.Vector3(0, 0.75, 2.9).clone());
      this.world.vfx.spawnFlash(muzzle.x, muzzle.y, muzzle.z, 0xffe08a, 0.7, 0.05);
      this.audio.play('machineGun');
    }
    if (cannon && !this.cannonDown && state.turret.cannonCooldown <= 0) {
      this.tankRig.chassis.updateMatrixWorld(true);
      const muzzle = this.tankRig.barrel.localToWorld(new THREE.Vector3(0, 0.75, 2.9).clone());
      this.world.vfx.spawnFlash(muzzle.x, muzzle.y, muzzle.z, 0xffc36a, 1.6, 0.09);
      this.audio.play('cannon');
      this.cameras.addImpulse(0.45);
    }
    if (charge && !this.chargeDown && state.turret.jackpotReady) {
      this.audio.play('jackpotCharge');
    }
    this.cannonDown = cannon;
    this.chargeDown = charge;
    this.mgDown = mg;
    void dt;
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    if (!enabled) {
      this.lastPredictInput = { throttle: 0, steer: 0, boost: false, brace: false };
    }
  }

  getCanvas(): HTMLCanvasElement {
    return this.world.renderer.domElement;
  }

  projectWorld(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(x, y, z).project(this.cameras.activeCam.camera);
    const w = this.world.renderer.domElement.clientWidth || window.innerWidth;
    const h = this.world.renderer.domElement.clientHeight || window.innerHeight;
    return {
      x: ((v.x + 1) / 2) * w,
      y: ((1 - v.y) / 2) * h,
      visible: v.z < 1 && v.x > -1.15 && v.x < 1.15 && v.y > -1.15 && v.y < 1.15,
    };
  }

  getRenderTank(): { x: number; y: number; z: number; yaw: number; pitch: number; roll: number } | null {
    return this.presenter.getRenderTank();
  }

  getTurretSpaces() {
    return this.prediction.getTurretSpaces();
  }

  getCameraState() {
    return this.cameras.getCameraState();
  }

  composerPassCount(): number {
    return this.world.composerPassCount();
  }

  destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.registry.reset();
    this.world.dispose();
  }
}
