import * as THREE from 'three';
import { clamp } from '../../shared/math';
import { BASE_CONFIG } from '../../shared/config';
import { Match } from '../../shared/sim/match';
import type { ArenaSessionResult } from '../../shared/mapgen/arenaSession';
import type { ArenaWorld } from '../../shared/sim/arenaWorld';
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
import { netcodeMetrics, F4Overlay } from '../netcode/netcodeMetrics';
import { DRIVER_INPUT_INTERVAL, GUNNER_AIM_INTERVAL } from '../../shared/net/tuning';
import type { GunnerActionType } from '../../shared/net/protocol';
import type { TankImpulseWire } from '../../shared/effects/tankImpulseSystem';
import type { DriverInput } from '../../shared/types';

/**
 * GameClient: thin coordinator. It owns the frame loop, practice stepping,
 * and module wiring; rendering, entity views, cameras, prediction, network
 * presentation, event routing, PIP, and quality live in focused modules.
 * There are no ordinary gameplay content branches here.
 */
export class GameClient {
  readonly world: RenderWorld;
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
  readonly arenaWorld: ArenaWorld;

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
  private readonly pendingLocalActions = new Map<number, { action: GunnerActionType; at: number }>();
  private f4: F4Overlay | null = null;
  private inputEnabled = true;
  private lastPredictInput: { throttle: number; steer: number; dashPressed: boolean; jumpPressed: boolean } = { throttle: 0, steer: 0, dashPressed: false, jumpPressed: false };
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
    arenaWorld: ArenaWorld;
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
    this.arenaWorld = deps.arenaWorld;
  }

  /** Awaits assets, then builds the full client (called after load()). */
  static async create(
    container: HTMLElement,
    assets: AssetService,
    audio: AudioManager,
    input: InputSource,
    onReady: () => void,
    world: ArenaWorld,
  ): Promise<GameClient> {
    const renderWorld = new RenderWorld(container, assets, world);
    const factory = new EntityViewFactory(assets);
    const registry = new EntityViewRegistry(renderWorld.scene, factory);
    const tankRig = assets.tankRig();
    renderWorld.scene.add(tankRig.chassis);
    const truckRig = new THREE.Group();
    truckRig.add(assets.model('enemy.lootTruck'));
    truckRig.visible = false;
    renderWorld.scene.add(truckRig);
    registry.registerTruckRig(truckRig, renderWorld.scene);
    for (const barrel of world.barrels) {
      const mesh = assets.model('prop.explosiveBarrel').clone(true);
      mesh.position.set(barrel.x, 0.55, barrel.z);
      renderWorld.scene.add(mesh);
      registry.registerBarrel(barrel.id, mesh);
    }
    const cameras = new CameraManager();
    cameras.resize((container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight));
    let gameRef: GameClient | null = null;
    const prediction = new PredictionController('driver', { send: (msg) => gameRef?.onSendInput?.(msg) });
    prediction.setGround(world);
    const deps = {
      container,
      assets,
      audio,
      input,
      world: renderWorld,
      registry,
      cameras,
      prediction,
      presenter: null as unknown as NetworkStatePresenter,
      router: null as unknown as PresentationEventRouter,
      pip: null as unknown as PipRenderer,
      quality: null as unknown as QualityManager,
      tankRig,
      arenaWorld: world,
    };
    const router = new PresentationEventRouter(assets, renderWorld.vfx, audio, cameras, {
      isPresented: (seq) => gameRef?.isActionPresented(seq) ?? false,
      confirm: (seq) => gameRef?.confirmAction(seq),
      reject: (seq) => gameRef?.rejectAction(seq),
    });
    const pip = new PipRenderer(renderWorld);
    const quality = new QualityManager({
      setPixelRatio: (r) => renderWorld.setPixelRatio(r),
      setShadows: (e) => renderWorld.setShadows(e),
      setBloomStrength: (s) => renderWorld.setBloomStrength(s),
      setPipRate: (r) => {
        pip.pipRate = r;
      },
      setPipScale: (s) => {
        pip.pipScale = s;
      },
    });
    quality.reset();
    const presenter = new NetworkStatePresenter({
      world: renderWorld,
      assets,
      registry,
      tankRig,
      cameras,
      prediction,
      colliders: () => renderWorld.arena.colliders,
      cameraQuery: () => renderWorld.arena.cameraQuery,
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
    game.f4 = new F4Overlay();
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
    this.prediction.setGround(this.arenaWorld);
    this.running = true;
    this.loop();
  }

  startPractice(): void {
    this.mode = 'practice';
    this.practiceViewRole = 'driver';
    this.practiceMatch = new Match('practice-' + Date.now(), 'none', undefined, this.arenaWorld);
    const turret = this.practiceMatch.runtime.rules.loadout.turret;
    this.prediction.setTurretRates(turret.turnRate, turret.pitchFollowRate ?? 8);
    this.prediction.setMovementRules(this.practiceMatch.runtime.rules.movementBlock());
    this.presenter.latest = this.practiceMatch.state;
    this.presenter.remoteFrame = null;
    this.setRole('driver');
    this.resetState();
    this.prediction.setGround(this.arenaWorld);
    this.running = true;
    this.loop();
  }

  /**
   * Phase 3: swap the authoritative arena (rematch / practice reroll /
   * reconnect). Rebuilds the arena view, resets prediction/presenter, and
   * recreates the local Practice match on the new world.
   */
  applyArenaSession(session: ArenaSessionResult): void {
    this.world.rebuildArena(session.world);
    this.resetState();
    this.prediction.setGround(session.world);
    if (this.mode === 'practice') {
      this.practiceMatch = new Match('practice-' + Date.now(), 'none', undefined, session.world);
      this.prediction.setMovementRules(this.practiceMatch.runtime.rules.movementBlock());
    }
  }

  /**
   * Resolved HUD denominators: replicated online weapon/tank values when
   * available, local practice rules otherwise, BASE_CONFIG as the final
   * fallback (never hardcoded presentation numbers).
   */
  getHudRules(): { maxIntegrity: number; cannonCooldown: number; jackpotChargeTime: number } {
    const block = this.prediction.movementRules();
    const tank = block?.tank;
    const weapon = block?.weapon;
    return {
      maxIntegrity: tank?.maxIntegrity ?? BASE_CONFIG.tank.maxIntegrity,
      cannonCooldown: weapon?.cannonCooldown ?? BASE_CONFIG.weapons.cannonCooldown,
      jackpotChargeTime: weapon?.jackpotChargeTime ?? BASE_CONFIG.weapons.jackpotChargeTime,
    };
  }

  handleTankImpulse(wire: TankImpulseWire): void {
    this.presenter.handleTankImpulse(wire);
  }

  handleDriverRelay(seq: number, driver: DriverInput): void {
    this.presenter.handleDriverRelay(seq, driver);
  }

  handleActionResult(actionSeq: number, accepted: boolean): void {
    if (accepted) {
      // Keep the pending entry: the tagged authoritative shot/impulse event
      // confirms (and suppresses) the local presentation.
      netcodeMetrics.markActionLatency(performance.now() - (this.pendingLocalActions.get(actionSeq)?.at ?? performance.now()));
      return;
    }
    this.prediction.rejectAction(actionSeq);
    this.pendingLocalActions.delete(actionSeq);
  }

  predictionDebug() {
    return this.prediction.predictionDebug();
  }

  isActionPresented(actionSeq: number): boolean {
    return this.pendingLocalActions.has(actionSeq);
  }

  confirmAction(actionSeq: number): void {
    this.prediction.confirmAction(actionSeq);
    this.pendingLocalActions.delete(actionSeq);
  }

  rejectAction(actionSeq: number): void {
    this.prediction.rejectAction(actionSeq);
    this.pendingLocalActions.delete(actionSeq);
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
    this.pendingLocalActions.clear();
    this.cannonDown = false;
    this.chargeDown = false;
    this.mgDown = false;
  }

  setSnapshot(msg: { seq: number; serverTime: number; state: MatchState; lastProcessedDriverInputSeq: number; lastProcessedGunnerInputSeq: number; lastImpulseSeq?: number; opLog?: unknown; serverTick?: number; tickDurationMs?: number; droppedTimeMs?: number; driftMs?: number; outboundBuffered?: number; rulesRevision?: number; movementRulesRevision?: number; movement?: unknown }): void {
    this.presenter.setSnapshot(msg as never);
  }

  handleEvent(ev: SimEvent): void {
    // The online Driver already received immediate local feedback from
    // prediction; skip the authoritative duplicate for jump/dash.
    if (this.mode === 'online' && this.role === 'driver' && (ev.type === 'jump' || ev.type === 'dash')) {
      return;
    }
    this.router.handleEvent(ev);
  }

  private stepPractice(dt: number): void {
    const m = this.practiceMatch!;
    if (m.state.phase !== 'running' || !this.inputEnabled) return;
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
      // Each practice sim step gets its own sequenced input frame. Sampling
      // at step time means a press can never be overwritten by a neutral
      // frame before a step consumes it.
      const frame = this.sampleDriverInput();
      m.setDriverInput({ ...frame });
      // The frame is created; clear the latches so holding never repeats.
      this.input.clearDriverEdges();
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

    this.lastPredictInput = this.sampleDriverInput();
    if (this.mode === 'practice' && this.practiceMatch) {
      this.stepPractice(dtRaw);
      this.presenter.latest = this.practiceMatch.state;
    }
    if (this.mode === 'online') this.presenter.advanceRenderClock(dtRaw);
    this.presenter.computeRemote();
    let renderTank: TankState | null = null;
    const frame = this.presenter.remoteFrame;
    if (frame) {
      if (this.mode === 'practice') {
        renderTank = frame.tank;
      } else {
        if (this.prediction.isPredictionDisabled()) {
          // Wrong-ground / pathological divergence fallback: render the
          // authoritative tank instead of jittering.
          renderTank = frame.tank;
        } else if (this.role === 'driver') {
          this.prediction.sampleDriver(this.lastPredictInput, dtRaw);
          renderTank = this.prediction.renderTank(frame.tank);
          this.playLocalDriverActions(renderTank);
        } else {
          // Gunner: shared tank prediction from server-relayed Driver input.
          this.prediction.sampleRelayed(dtRaw);
          renderTank = this.prediction.renderTank(frame.tank);
        }
      }
    }
    if (frame && renderTank) this.presenter.syncWorld(frame, renderTank, dt);
    if (this.presenter.latest) this.onFrame?.(this.presenter.latest);

    this.pollGunnerActions();
    this.prediction.retransmitPendingActions(performance.now());
    // Fade optimistic presentations that never received a confirming event.
    for (const [seq, entry] of [...this.pendingLocalActions]) {
      if (performance.now() - entry.at > 1500) this.pendingLocalActions.delete(seq);
    }
    const pending = this.prediction.metricsPending();
    netcodeMetrics.pendingInputs = pending.inputs;
    netcodeMetrics.pendingImpulses = pending.impulses;
    netcodeMetrics.pendingActions = pending.actions;
    netcodeMetrics.pendingAimFrames = pending.aim;
    netcodeMetrics.predictorDisabledReason = this.prediction.predictorDisabledReason();
    this.f4?.update(now);

    if (this.mode === 'online' && this.onSendInput) {
      this.inputSendT -= dtRaw;
      if (this.inputSendT <= 0) {
        this.inputSendT = this.role === 'driver' ? DRIVER_INPUT_INTERVAL : GUNNER_AIM_INTERVAL;
        this.sendInputs();
      }
    }

    this.world.vfx.update(dt);
    const latest = this.presenter.latest;
    this.audio.setEngine(latest ? Math.min(1, Math.hypot(latest.tank.vx, latest.tank.vz) / 20) : 0);
    this.audio.setMusicIntensity(latest ? clamp(latest.time / 90 * 1.15, 0, 1.25) : 0);
    this.renderFrame();
  };

  private renderFrame(): void {
    const w = this.world.renderer.domElement.clientWidth || window.innerWidth;
    const h = this.world.renderer.domElement.clientHeight || window.innerHeight;
    this.cameras.applyShake();
    const renderT0 = performance.now();
    this.world.render(this.cameras.activeCam.camera);
    netcodeMetrics.mainRenderMs = performance.now() - renderT0;
    if (this.presenter.latest) {
      const pipT0 = performance.now();
      const tank = this.presenter.getPredictedTank() ?? this.presenter.latest.tank;
      this.pip.update(1 / 30, tank, this.presenter.latest.turret.yaw, this.role);
      netcodeMetrics.pipRenderMs = performance.now() - pipT0;
    }
    this.world.resetViewport(w, h);
  }

  private sendInputs(): void {
    if (!this.onSendInput || this.suppressAutoInput) return;
    if (this.role === 'driver') {
      // Re-sample at send time: a key pressed since the frame sample must
      // still land in this sequenced frame (never lost between sends).
      const fresh = this.sampleDriverInput();
      this.lastPredictInput = { ...fresh };
      this.prediction.sendDriver({ ...fresh });
      // The sequenced network frame is created; the latched edges must not
      // leak into the next frame (holding the key never repeats).
      this.input.clearDriverEdges();
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

  private sampleDriverInput(): { throttle: number; steer: number; dashPressed: boolean; jumpPressed: boolean } {
    if (!this.inputEnabled) return { throttle: 0, steer: 0, dashPressed: false, jumpPressed: false };
    return {
      throttle: this.keyAxis('forward') - this.keyAxis('back'),
      steer: this.keyAxis('right') - this.keyAxis('left'),
      dashPressed: this.input.edge('dash'),
      jumpPressed: this.input.edge('jump'),
    };
  }

  injectOnlineInput(role: Role, data: {
    throttle?: number;
    steer?: number;
    dashPressed?: boolean;
    jumpPressed?: boolean;
    aimYaw?: number;
    aimPitch?: number;
    primary?: boolean;
    secondary?: boolean;
    ability?: boolean;
  }): void {
    if (this.mode !== 'online' || !this.onSendInput) return;
    if (role === 'driver') {
      const input = {
        throttle: data.throttle ?? 0,
        steer: data.steer ?? 0,
        dashPressed: data.dashPressed === true,
        jumpPressed: data.jumpPressed === true,
      };
      this.onSendInput({ t: 'input', seq: this.prediction.nextSeq(), driver: input });
    } else {
      const turret = this.prediction.getTurretSpaces();
      this.onSendInput({
        t: 'input',
        seq: this.prediction.nextSeq(),
        gunner: {
          aimYaw: data.aimYaw ?? turret.desiredYawLocal,
          aimPitch: data.aimPitch ?? turret.desiredPitch,
          primary: data.primary === true,
          secondary: data.secondary === true && !(this.presenter.latest?.turret.jackpotReady ?? false),
          ability: data.ability === true && (this.presenter.latest?.turret.jackpotReady ?? false),
        },
      });
    }
  }

  /** Immediate local jump/dash feedback for the predicted Driver. */
  private playLocalDriverActions(tank: TankState): void {
    for (const action of this.prediction.takeLocalDriverActions()) {
      if (action === 'jump') {
        this.world.vfx.spawnJumpDust(tank.x, tank.y, tank.z);
        this.audio.play('jump');
      } else if (action === 'dash') {
        this.world.vfx.spawnDashBurst(tank.x, tank.y, tank.z, tank.yaw);
        this.audio.play('dash');
      }
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
      this.lastPredictInput = { throttle: 0, steer: 0, dashPressed: false, jumpPressed: false };
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

  /**
   * Milestone 2: discrete Gunner actions bypass the periodic timer. Edge
   * detection runs every rendered frame so very short clicks are never lost
   * between 50 ms send frames.
   */
  private pollGunnerActions(): void {
    if (this.mode !== 'online' || this.role !== 'gunner' || !this.onSendInput || this.suppressAutoInput) return;
    const latest = this.presenter.latest;
    const jackpotReady = latest?.turret.jackpotReady ?? false;
    const mg = this.mouseDown('primary');
    const cannon = this.mouseDown('secondary') && !jackpotReady;
    const charge = this.mouseDown('secondary') && jackpotReady;
    if (mg && !this.mgDown) this.fireGunnerAction('mgStart');
    if (!mg && this.mgDown) this.fireGunnerAction('mgStop');
    if (cannon && !this.cannonDown && (latest?.turret.cannonCooldown ?? 0) <= 0) {
      this.fireGunnerAction('cannonPressed', true);
    }
    if (charge && !this.chargeDown) this.fireGunnerAction('abilityStart');
    if (!charge && this.chargeDown) this.fireGunnerAction('abilityRelease');
    this.mgDown = mg;
    this.cannonDown = cannon;
    this.chargeDown = charge;
  }

  private fireGunnerAction(action: GunnerActionType, presentLocally = false): void {
    const actionSeq = this.prediction.sendGunnerAction(action);
    if (presentLocally) {
      this.pendingLocalActions.set(actionSeq, { action, at: performance.now() });
      this.playLocalGunnerAction(action);
    }
  }

  /** Same-frame local weapon presentation (presentation only, no damage). */
  private playLocalGunnerAction(action: GunnerActionType): void {
    const latest = this.presenter.latest;
    this.tankRig.chassis.updateMatrixWorld(true);
    const muzzle = this.tankRig.barrel.localToWorld(new THREE.Vector3(0, 0.75, 2.9).clone());
    if (action === 'cannonPressed') {
      this.world.vfx.spawnFlash(muzzle.x, muzzle.y, muzzle.z, 0xffc36a, 1.6, 0.09);
      this.world.vfx.spawnBurst(muzzle.x, muzzle.y, muzzle.z, 0xffc36a, 12, 0.5, 0.35, 0.3, 8);
      this.audio.play('cannon');
      this.cameras.addImpulse(0.45);
    } else if (action === 'mgStart') {
      if ((latest?.turret.mgCooldown ?? 1) <= 0) {
        this.audio.play('machineGun');
        this.world.vfx.spawnFlash(muzzle.x, muzzle.y, muzzle.z, 0xffe08a, 0.7, 0.05);
      }
    } else if (action === 'abilityStart') {
      this.audio.play('jackpotCharge');
    }
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
    this.world.arena.dispose();
    this.registry.reset();
    this.world.dispose();
  }
}
