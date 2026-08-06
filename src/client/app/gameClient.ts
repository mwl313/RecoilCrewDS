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
import { PredictionController } from './predictionController';
import { PresentationEventRouter } from './presentationEventRouter';
import { QualityManager } from './qualityManager';
import { RenderWorld } from './renderWorld';
import { netcodeMetrics, F4Overlay } from '../netcode/netcodeMetrics';
import { DRIVER_INPUT_INTERVAL, GUNNER_AIM_INTERVAL } from '../../shared/net/tuning';
import type { GunnerActionType } from '../../shared/net/protocol';
import type { TankImpulseWire } from '../../shared/effects/tankImpulseSystem';
import type { DriverInput } from '../../shared/types';
import type { ContentPack } from '../../shared/content/contentPack';
import { MULTIPLAYER_SESSION, SINGLE_PLAYER_SESSION, type GameSessionContext } from '../../shared/session/gameSessionKind';
import type { TankRigRulesBlock } from '../../shared/stats/rulesRevision';
import { getMuzzleWorld } from '../assets';
import type { TrajectoryReticleResult } from '../aim/trajectoryReticleProjector';
import { ProgressionOverlay } from '../progression/progressionOverlay';
import { AggregateSectorRenderer, type AggregateSectorRecord } from '../enemies/aggregateSectorRenderer';
import { resolveEnemyPresentation } from '../animation/enemyPresentationResolver';
import { XpShardRenderer } from '../pickups/xpShardRenderer';
import { stageViewForMatch } from '../../shared/monsters/monsterStageView';
import {
  resolveSelectedPreloadAssetIds,
} from '../../shared/monsters/monsterPreload';
import type { SelectedMonsterRun } from '../../shared/monsters/monsterRunSelection';

/**
 * GameClient: thin coordinator. It owns the frame loop, single-player
 * stepping, and module wiring; rendering, entity views, cameras, prediction,
 * network presentation, event routing, and quality live in focused modules.
 * There are no ordinary gameplay content branches here.
 */
export class GameClient {
  readonly world: RenderWorld;
  private readonly registry: EntityViewRegistry;
  private readonly cameras: CameraManager;
  private readonly prediction: PredictionController;
  private readonly presenter: NetworkStatePresenter;
  private readonly assets: AssetService;
  private readonly router: PresentationEventRouter;
  private readonly quality: QualityManager;
  private tankRig: TankRig;
  private readonly audio: AudioManager;
  private readonly input: InputSource;
  private readonly container: HTMLElement;
  readonly arenaWorld: ArenaWorld;

  singlePlayerMatch: Match | null = null;
  role: Role = 'driver';
  session: GameSessionContext = MULTIPLAYER_SESSION;
  time = 0;
  private raf = 0;
  private running = false;
  private slowMo = 0;
  private singlePlayerAcc = 0;
  private singlePlayerResultsShown = false;
  private contentPack: ContentPack | null = null;
  private secondaryDown = false;
  private mgDown = false;
  private chargeHoldStart = 0;
  private chargeHoldActive = false;
  private chargeSoundStarted = false;
  private readonly pendingLocalActions = new Map<number, { action: GunnerActionType; at: number }>();
  private f4: F4Overlay | null = null;
  private inputEnabled = true;
  private lastPredictInput: { throttle: number; steer: number; dashPressed: boolean; jumpPressed: boolean } = { throttle: 0, steer: 0, dashPressed: false, jumpPressed: false };
  private inputSendT = 0;
  suppressAutoInput = false;
  private progressionOverlay: ProgressionOverlay | null = null;
  private readonly aggregateSectors: AggregateSectorRenderer;
  private readonly xpShards: XpShardRenderer;
  private latestSectors: AggregateSectorRecord[] = [];
  private singlePlayerModeId = SINGLE_PLAYER_SESSION.rulesModeId;

  onSendInput: ((msg: Record<string, unknown>) => void) | null = null;
  onPauseRequest: (() => void) | null = null;
  onFrame: ((state: MatchState) => void) | null = null;
  onTrajectoryReticle: ((result: TrajectoryReticleResult) => void) | null = null;
  onSinglePlayerResults: ((results: { score: number; bestCombo: number; chargedCannonShots: number; fullChargeShots: number; kills: number; scrapCollected: number; links: number; wipeouts: number; grade: string; title: string; modifier: string }) => void) | null = null;

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
    quality: QualityManager;
    tankRig: TankRig;
    arenaWorld: ArenaWorld;
  }) {
    this.assets = deps.assets;
    this.container = deps.container;
    this.world = deps.world;
    this.registry = deps.registry;
    this.cameras = deps.cameras;
    this.prediction = deps.prediction;
    this.presenter = deps.presenter;
    this.router = deps.router;
    this.quality = deps.quality;
    this.tankRig = deps.tankRig;
    this.audio = deps.audio;
    this.input = deps.input;
    this.arenaWorld = deps.arenaWorld;
    this.aggregateSectors = new AggregateSectorRenderer(
      deps.world.scene,
      this.assets,
      (sector) => {
        const resolution = resolveEnemyPresentation({
          presentationProfileId: sector.presentationProfileId,
          type: sector.enemyDefId ? sector.enemyDefId.replace(/^enemy\./, '') : '',
        });
        return resolution.profile.aggregateModelAssetId ? resolution.profile : null;
      },
      512,
      (x, z) => this.arenaWorld.groundHeightAt(x, z),
    );
    this.xpShards = new XpShardRenderer(deps.world.scene);
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
      quality: null as unknown as QualityManager,
      tankRig,
      arenaWorld: world,
    };
    const router = new PresentationEventRouter(assets, renderWorld.vfx, audio, cameras, {
      isPresented: (seq) => gameRef?.isActionPresented(seq) ?? false,
      confirm: (seq) => gameRef?.confirmAction(seq),
      reject: (seq) => gameRef?.rejectAction(seq),
    });
    const quality = new QualityManager({
      setPixelRatio: (r) => renderWorld.setPixelRatio(r),
      setShadows: (e) => renderWorld.setShadows(e),
      setBloomStrength: (s) => renderWorld.setBloomStrength(s),
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
      onTankRig: (block) => gameRef?.applyTankRigBlock(block),
      onTrajectoryReticle: (result) => gameRef?.onTrajectoryReticle?.(result),
      session: () => gameRef!.session,
      role: () => gameRef!.role,
      singlePlayerMatch: () => gameRef!.singlePlayerMatch,
      time: () => gameRef!.time,
      applySinglePlayerWeapons: (dt) => gameRef!.applySinglePlayerWeapons(dt),
      animationQuality: () => quality.quality,
    });
    deps.presenter = presenter;
    deps.router = router;
    deps.quality = quality;
    const game = new GameClient(deps);
    gameRef = game;
    game.progressionOverlay = new ProgressionOverlay(container, {
      selectUpgrade: (index) => gameRef!.submitUpgrade(index),
      skipRelicPresentation: () => gameRef!.skipRelicPresentation(),
      relicInfo: (relicId) => {
        const relic = gameRef!.contentPack?.getRelic(relicId);
        return relic ? { label: relic.label, description: relic.description } : null;
      },
    });
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
    this.session = MULTIPLAYER_SESSION;
    this.cameras.setSinglePlayerMode(false);
    this.setRole(role);
    this.resetState();
    this.prediction.setGround(this.arenaWorld);
    this.running = true;
    this.loop();
  }

  /** Single Player: one local ContentPack-driven match with combined controls. */
  startSinglePlayer(pack: ContentPack, world: ArenaWorld, matchId?: string, modeId?: string): void {
    this.contentPack = pack;
    this.session = SINGLE_PLAYER_SESSION;
    this.singlePlayerModeId = modeId ?? SINGLE_PLAYER_SESSION.rulesModeId;
    this.cameras.setSinglePlayerMode(true);
    const resolvedMatchId = matchId ?? 'single-' + Date.now();
    this.singlePlayerMatch = new Match(
      resolvedMatchId,
      'none',
      pack,
      world,
      this.singlePlayerModeId,
    );
    const turret = this.singlePlayerMatch.runtime.rules.loadout.turret;
    this.prediction.setTurretRates(turret.turnRate, turret.pitchFollowRate ?? 8);
    this.prediction.setMovementRules(this.singlePlayerMatch.runtime.rules.movementBlock());
    this.applyTankRig(this.singlePlayerMatch.runtime.rules.tank.rig);
    this.presenter.latest = this.singlePlayerMatch.state;
    this.presenter.remoteFrame = null;
    this.setRole('driver');
    this.resetState();
    this.prediction.setGround(this.arenaWorld);
    this.running = true;
    this.loop();
  }

  /**
   * Stage-selective preload for the authoritative selected run. Only the
   * assets used by the run are fetched; Demo and optional monsters are
   * never preloaded here.
   */
  async preloadMonsterRun(pack: ContentPack, run: SelectedMonsterRun | null): Promise<void> {
    if (!run) return;
    await this.assets.preloadModels(resolveSelectedPreloadAssetIds(pack, run));
  }

  /**
   * Phase 3: swap the authoritative arena (rematch / Single Player reroll /
   * reconnect). Rebuilds the arena view, resets prediction/presenter, and
   * recreates the local Single Player match on the new world.
   */
  applyArenaSession(session: ArenaSessionResult): void {
    this.world.rebuildArena(session.world);
    this.resetState();
    this.prediction.setGround(session.world);
    if (this.session.kind === 'singlePlayer' && this.contentPack) {
      this.singlePlayerMatch = new Match(
        'single-' + Date.now(),
        'none',
        this.contentPack,
        session.world,
        this.singlePlayerModeId,
      );
      this.prediction.setMovementRules(this.singlePlayerMatch.runtime.rules.movementBlock());
      this.applyTankRig(this.singlePlayerMatch.runtime.rules.tank.rig);
    }
  }

  /** Replicated rig block (online) → rebuild the visual tank rig. */
  applyTankRigBlock(block: TankRigRulesBlock): void {
    this.applyTankRig(block.rig);
  }

  /** Rebuild the visual tank rig from resolved data (no hardcoded pivots). */
  private applyTankRig(rig: TankRig['rigDefinition']): void {
    const next = this.assets.tankRig(rig);
    this.installTankRig(next);
  }

  private installTankRig(next: TankRig): void {
    this.world.scene.remove(this.tankRig.chassis);
    this.tankRig = next;
    this.presenter.setTankRig(next);
    this.world.scene.add(next.chassis);
  }

  /**
   * Resolved HUD denominators: replicated online weapon/tank values when
   * available, local Single Player rules otherwise, BASE_CONFIG as the final
   * fallback (never hardcoded presentation numbers).
   */
  getHudRules(): { maxIntegrity: number; cannonCooldown: number; chargeTapMaxSeconds: number; chargeFullSeconds: number } {
    const block = this.prediction.movementRules();
    const tank = block?.tank;
    const weapon = block?.weapon;
    return {
      maxIntegrity: tank?.maxIntegrity ?? BASE_CONFIG.tank.maxIntegrity,
      cannonCooldown: weapon?.cannonCooldown ?? BASE_CONFIG.weapons.cannonCooldown,
      chargeTapMaxSeconds: weapon?.chargeTapMaxSeconds ?? BASE_CONFIG.weapons.chargeTapMaxSeconds,
      chargeFullSeconds: weapon?.chargeFullSeconds ?? BASE_CONFIG.weapons.chargeFullSeconds,
    };
  }

  /** Core Loop 06 M11: stage HUD view for the local Single Player match. */
  getSinglePlayerStageView(): {
    phase: string;
    farmingTimeRemaining: number;
    waveId: number | null;
    leaderHp: number;
    leaderMaxHp: number;
    monster?: {
      phase: 'FARMING' | 'BOSS_INTRO' | 'BOSS_ACTIVE' | 'RESULTS';
      level: number;
      encounters: Array<{
        slotId: string;
        enemyId: string;
        label: string;
        hp: number;
        maxHp: number;
        alive: boolean;
        kind: 'elite' | 'boss';
      }>;
    };
  } | undefined {
    const m = this.singlePlayerMatch;
    if (!m) return undefined;
    return stageViewForMatch(m.runtime);
  }

  /** Core Loop 06 M11: horde debug metrics (single player match only). */
  getHordeDebug(): {
    phase: string;
    farmingTimeRemaining: number;
    waveId: number | null;
    leaderHp: number;
    leaderMaxHp: number;
    ambient: number;
    wave: number;
    boss: number;
    sectors: number;
    spawnBudget: number;
    anchorFailures: number;
    tierCounts: [number, number, number, number];
  } | null {
    const m = this.singlePlayerMatch;
    const horde = m?.runtime.systems.horde;
    if (!m || !horde) return null;
    const systems = m.runtime.systems;
    const stage = systems.stage.state;
    const runtime =
      horde.currentWaveId !== null ? systems.waves.waves.get(horde.currentWaveId) : undefined;
    const leader = runtime ? m.state.enemies.find((e) => e.id === runtime.leaderId) : undefined;
    const counts = { ambient: 0, wave: 0, boss: 0 };
    const tierCounts: [number, number, number, number] = [0, 0, 0, 0];
    for (const e of m.state.enemies) {
      if (!e.alive) continue;
      const cls = e.ownership?.populationClass ?? 'ambient';
      counts[cls as keyof typeof counts] = (counts[cls as keyof typeof counts] ?? 0) + 1;
      tierCounts[systems.enemies.tierFor(e)]++;
    }
    const sectorTally = systems.hordeSectors.tally();
    return {
      phase: stage.phase,
      farmingTimeRemaining: stage.farmingTimeRemaining,
      waveId: stage.activeWaveId,
      leaderHp: leader?.hp ?? 0,
      leaderMaxHp: leader?.maxHp ?? 0,
      ambient: counts.ambient + sectorTally.byClass.ambient.entities,
      wave: counts.wave + sectorTally.byClass.wave.entities,
      boss: counts.boss + sectorTally.byClass.boss.entities,
      sectors: systems.hordeSectors.sectors.size,
      spawnBudget: horde.spawnBudget,
      anchorFailures: horde.anchorFailures,
      tierCounts,
    };
  }

  handleTankImpulse(wire: TankImpulseWire): void {
    this.presenter.handleTankImpulse(wire);
  }

  handleDriverRelay(seq: number, driver: DriverInput): void {
    this.presenter.handleDriverRelay(seq, driver);
  }

  handleActionResult(actionSeq: number, accepted: boolean): void {
    const pending = this.pendingLocalActions.get(actionSeq);
    if (accepted) {
      // A charging press only becomes real when the server accepts it, so a
      // press during cooldown can never start a local charge.
      if (pending?.action === 'secondaryPressed' && (this.presenter.latest?.build.capabilities.includes('cannon.charge') ?? false)) {
        this.chargeHoldStart = performance.now();
        this.chargeHoldActive = true;
        this.chargeSoundStarted = false;
      }
      // Keep the pending entry: the tagged authoritative shot/impulse event
      // confirms (and suppresses) the local presentation.
      netcodeMetrics.markActionLatency(performance.now() - (this.pendingLocalActions.get(actionSeq)?.at ?? performance.now()));
      return;
    }
    this.prediction.rejectAction(actionSeq);
    this.pendingLocalActions.delete(actionSeq);
    this.chargeHoldActive = false;
    this.chargeHoldStart = 0;
    this.stopChargeSound();
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
    this.aggregateSectors.reset();
    this.xpShards.reset();
    this.singlePlayerAcc = 0;
    this.singlePlayerResultsShown = false;
    this.slowMo = 0;
    this.time = 0;
    this.pendingLocalActions.clear();
    this.secondaryDown = false;
    this.mgDown = false;
    this.chargeHoldStart = 0;
    this.chargeHoldActive = false;
    this.chargeSoundStarted = false;
  }

  setSnapshot(msg: {
    seq: number;
    serverTime: number;
    state: MatchState;
    lastProcessedDriverInputSeq: number;
    lastProcessedGunnerInputSeq: number;
    lastImpulseSeq?: number;
    opLog?: unknown;
    serverTick?: number;
    tickDurationMs?: number;
    droppedTimeMs?: number;
    driftMs?: number;
    outboundBuffered?: number;
    rulesRevision?: number;
    movementRulesRevision?: number;
    movement?: unknown;
    sectors?: AggregateSectorRecord[];
  }): void {
    this.latestSectors = msg.sectors ?? [];
    this.presenter.setSnapshot(msg as never);
  }

  private collectAggregateSectors(): AggregateSectorRecord[] {
    if (this.session.kind === 'singlePlayer' && this.singlePlayerMatch) {
      const sectors = this.singlePlayerMatch.runtime.systems.hordeSectors.sectors;
      return [...sectors.values()].map((s) => ({
        sectorId: s.sectorId,
        x: s.centerX,
        z: s.centerZ,
        count: s.count,
        enemyDefId: s.enemyDefId,
        presentationSeed: s.presentationSeed,
      }));
    }
    return this.latestSectors;
  }

  handleEvent(ev: SimEvent): void {
    // The online Driver already received immediate local feedback from
    // prediction; skip the authoritative duplicate for jump/dash.
    if (this.session.kind === 'multiplayer' && this.role === 'driver' && (ev.type === 'jump' || ev.type === 'dash')) {
      return;
    }
    this.router.handleEvent(ev);
  }

  private stepSinglePlayer(dt: number): void {
    const m = this.singlePlayerMatch!;
    // The match can enter results between frames (deferred event drain,
    // direct damage paths). Notify exactly once before the running-only
    // guard so the results screen always appears.
    if (m.state.phase === 'results' && !this.singlePlayerResultsShown) {
      this.singlePlayerResultsShown = true;
      this.onSinglePlayerResults?.(m.results!);
      return;
    }
    if (m.state.phase !== 'running' || !this.inputEnabled) return;
    const turret = this.prediction.getTurretSpaces();
    m.setGunnerInput({
      aimYaw: turret.desiredYawLocal,
      aimPitch: turret.desiredPitch,
      primary: this.mouseDown('primary'),
      secondary: this.mouseDown('secondary'),
    });
    this.singlePlayerAcc += dt;
    const step = 1 / 30;
    let guard = 0;
    while (this.singlePlayerAcc >= step && guard++ < 6) {
      this.singlePlayerAcc -= step;
      // Each Single Player sim step gets its own sequenced input frame. Sampling
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
      if ((m.state.phase as string) === 'results' && !this.singlePlayerResultsShown) {
        this.singlePlayerResultsShown = true;
        this.onSinglePlayerResults?.(m.results!);
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
    if (this.session.kind === 'singlePlayer' && this.singlePlayerMatch) {
      this.stepSinglePlayer(dtRaw);
      this.presenter.latest = this.singlePlayerMatch.state;
    }
    if (this.session.networked) this.presenter.advanceRenderClock(dtRaw);
    if (this.session.kind === 'singlePlayer' && this.singlePlayerMatch) {
      this.singlePlayerMatch.checkProgressionTimeout(performance.now());
    }
    this.presenter.computeRemote();
    let renderTank: TankState | null = null;
    const frame = this.presenter.remoteFrame;
    if (frame) {
      if (this.session.kind === 'singlePlayer') {
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
    if (this.presenter.latest) {
      this.onFrame?.(this.presenter.latest);
      this.updateProgressionOverlay();
      const latest = this.presenter.latest;
      this.aggregateSectors.update(this.collectAggregateSectors(), latest.tank.x, latest.tank.z);
    }

    this.pollGunnerActions();
    this.updateChargeSound();
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

    if (this.session.networked && this.onSendInput) {
      this.inputSendT -= dtRaw;
      if (this.inputSendT <= 0) {
        this.inputSendT = this.role === 'driver' ? DRIVER_INPUT_INTERVAL : GUNNER_AIM_INTERVAL;
        this.sendInputs();
      }
    }

    this.world.vfx.update(dt);
    const shards = this.presenter.remoteFrame?.xpShards ?? this.presenter.latest?.xpShards ?? [];
    this.xpShards.update(shards, this.time, dt);
    const latest = this.presenter.latest;
    this.audio.setEngine(latest ? Math.min(1, Math.hypot(latest.tank.vx, latest.tank.vz) / 20) : 0);
    this.audio.setMusicIntensity(latest ? clamp(latest.time / 90 * 1.15, 0, 1.25) : 0);
    this.renderFrame();
  };

  private renderFrame(): void {
    this.cameras.applyShake();
    const renderT0 = performance.now();
    this.world.render(this.cameras.activeCam.camera);
    netcodeMetrics.mainRenderMs = performance.now() - renderT0;
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
        secondary: this.mouseDown('secondary'),
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
  }): void {
    if (!this.session.networked || !this.onSendInput) return;
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
          secondary: data.secondary === true,
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

  private keyDown(name: string): boolean {
    return this.input.key(name);
  }

  private keyAxis(name: string): number {
    return this.input.key(name) ? 1 : 0;
  }

  private mouseDown(name: string): boolean {
    return this.input.button(name);
  }

  applySinglePlayerWeapons(dt: number): void {
    const m = this.singlePlayerMatch!;
    const state = m.state;
    if (state.tank.deadT > 0) return;
    // Single Player drives the same authoritative WeaponSystem state machine
    // through discrete secondary actions (capability gates hold/release).
    const secondary = this.mouseDown('secondary');
    const charging = state.build.capabilities.includes('cannon.charge');
    const turret = this.prediction.getTurretSpaces();
    if (secondary && !this.secondaryDown) {
      if (state.turret.cannonCooldown <= 0) {
        m.applyGunnerAction('secondaryPressed', undefined, {
          aimYaw: turret.desiredYawLocal,
          aimPitch: turret.desiredPitch,
        });
      }
      if (charging && state.turret.cannonCooldown <= 0) {
        this.chargeHoldStart = performance.now();
        this.chargeHoldActive = true;
        this.chargeSoundStarted = false;
      }
    } else if (!secondary && this.secondaryDown) {
      m.applyGunnerAction('secondaryReleased', undefined, {
        aimYaw: turret.desiredYawLocal,
        aimPitch: turret.desiredPitch,
      });
      this.chargeHoldActive = false;
      this.chargeHoldStart = 0;
      this.stopChargeSound();
    }
    this.secondaryDown = secondary;
    void dt;
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    if (!enabled) {
      this.lastPredictInput = { throttle: 0, steer: 0, dashPressed: false, jumpPressed: false };
      this.chargeHoldActive = false;
      this.chargeHoldStart = 0;
      this.stopChargeSound();
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
    if (this.session.kind !== 'multiplayer' || this.role !== 'gunner' || !this.onSendInput || this.suppressAutoInput) return;
    const latest = this.presenter.latest;
    const mg = this.mouseDown('primary');
    const secondary = this.mouseDown('secondary');
    const charging = latest?.build.capabilities.includes('cannon.charge') ?? false;
    const canCharge = (latest?.turret.cannonCooldown ?? 0) <= 0;
    if (mg && !this.mgDown) this.fireGunnerAction('mgStart');
    if (!mg && this.mgDown) this.fireGunnerAction('mgStop');
    if (secondary && !this.secondaryDown) {
      if (!charging || canCharge) {
        this.fireGunnerAction('secondaryPressed', true);
      }
    }
    if (!secondary && this.secondaryDown) {
      if (this.chargeHoldActive || !charging) {
        this.fireGunnerAction('secondaryReleased', true);
      }
      this.chargeHoldActive = false;
      this.chargeHoldStart = 0;
      this.stopChargeSound();
    }
    this.mgDown = mg;
    this.secondaryDown = secondary;
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
    const muzzle = getMuzzleWorld(this.tankRig);
    const charging = latest?.build.capabilities.includes('cannon.charge') ?? false;
    if (action === 'secondaryPressed') {
      if (charging) {
        this.chargeSoundStarted = false;
        return;
      }
      this.world.vfx.spawnFlash(muzzle.x, muzzle.y, muzzle.z, 0xffc36a, 1.6, 0.09);
      this.world.vfx.spawnBurst(muzzle.x, muzzle.y, muzzle.z, 0xffc36a, 12, 0.5, 0.35, 0.3, 8);
      this.audio.play('cannon');
      this.cameras.addImpulse(0.45);
    } else if (action === 'secondaryReleased') {
      // Release presentation; charge scaling/visuals land in M6/M8.
      this.world.vfx.spawnFlash(muzzle.x, muzzle.y, muzzle.z, 0xffc36a, 1.6, 0.09);
      this.world.vfx.spawnBurst(muzzle.x, muzzle.y, muzzle.z, 0xffc36a, 12, 0.5, 0.35, 0.3, 8);
      this.audio.play('cannon');
      this.cameras.addImpulse(0.45);
    } else if (action === 'mgStart') {
      if ((latest?.turret.mgCooldown ?? 1) <= 0) {
        this.audio.play('machineGun');
        this.world.vfx.spawnFlash(muzzle.x, muzzle.y, muzzle.z, 0xffe08a, 0.7, 0.05);
      }
    }
  }

  getTurretSpaces() {
    return this.prediction.getTurretSpaces();
  }

  /** Local predicted charge view for the HUD (same-frame while holding). */
  getLocalChargeView(): { unlocked: boolean; held: boolean; ratio: number; full: boolean } | null {
    const latest = this.presenter.latest;
    const unlocked = latest?.build.capabilities.includes('cannon.charge') ?? false;
    if (!unlocked) return { unlocked: false, held: false, ratio: 0, full: false };
    const block = this.prediction.movementRules();
    const tapMax = block?.weapon?.chargeTapMaxSeconds ?? BASE_CONFIG.weapons.chargeTapMaxSeconds;
    const full = block?.weapon?.chargeFullSeconds ?? BASE_CONFIG.weapons.chargeFullSeconds;
    const held = this.chargeHoldActive;
    const heldSeconds = held ? Math.min(full, (performance.now() - this.chargeHoldStart) / 1000) : 0;
    const ratio = held ? Math.max(0, Math.min(1, (heldSeconds - tapMax) / Math.max(0.001, full - tapMax))) : 0;
    return { unlocked, held, ratio, full: ratio >= 1 };
  }

  /** Send/submit the selected upgrade card (authoritative path). */
  submitUpgrade(cardIndex: number): void {
    const latest = this.presenter.latest;
    const selection = latest?.teamProgression.activeSelection;
    if (!selection || latest?.matchFlow !== 'upgradeSelection') return;
    if (this.session.kind === 'singlePlayer' && this.singlePlayerMatch) {
      this.singlePlayerMatch.submitProgressionSelection('single', selection.offerId, cardIndex);
    } else if (this.onSendInput) {
      this.onSendInput({ t: 'selectUpgrade', offerId: selection.offerId, cardIndex });
    }
  }

  /** Request skip/acknowledgement of the shared relic reveal (idempotent). */
  skipRelicPresentation(): void {
    const latest = this.presenter.latest;
    const selection = latest?.teamProgression.activeSelection;
    if (!selection || selection.kind !== 'relic' || latest?.matchFlow !== 'relicSelection') return;
    const acquisitionSequence = selection.relicResult?.acquisitionSequence ?? 0;
    if (this.session.kind === 'singlePlayer' && this.singlePlayerMatch) {
      this.singlePlayerMatch.skipProgressionRelic(acquisitionSequence, performance.now());
    } else if (this.onSendInput) {
      this.onSendInput({ t: 'skipRelicPresentation', acquisitionSequence });
    }
  }

  private updateProgressionOverlay(): void {
    const latest = this.presenter.latest;
    if (!latest || !this.progressionOverlay) return;
    const role = this.session.kind === 'singlePlayer' ? 'single' : this.role;
    this.progressionOverlay.update(latest, role, performance.now());
    let debug = '';
    try {
      const dbg = this.singlePlayerMatch
        ? this.singlePlayerMatch.runtime.systems.progression.debugState()
        : null;
      if (dbg) {
        debug =
          `flow=${dbg.flow} stage=${dbg.stagePhase}\n` +
          `level=${dbg.team.level} xp=${dbg.team.currentXp}/${dbg.team.xpForNextLevel} pending=${dbg.team.pendingLevelUps}\n` +
          `chests=${dbg.chestsOpened} offer=${dbg.activeOfferId ?? '-'} timeout=${Math.round(dbg.timeoutMs / 1000)}s\n` +
          `relics=${JSON.stringify(dbg.relicStacks)}\n` +
          `roadkill=${JSON.stringify(dbg.roadkill)}`;
      }
    } catch {
      debug = '';
    }
    this.progressionOverlay.updateDebug(debug);
  }

  /**
   * Charge sound starts only after the hold passes the tap threshold (a tap
   * is silent) and stops the moment the shot launches/cancels.
   */
  private updateChargeSound(): void {
    const latest = this.presenter.latest;
    if (latest?.tank.deadT && latest.tank.deadT > 0) {
      this.chargeHoldActive = false;
      this.chargeHoldStart = 0;
      this.stopChargeSound();
      return;
    }
    if (this.chargeHoldActive && (latest?.turret.cannonCooldown ?? 0) > 0) {
      // Authoritative cooldown while holding means the press was rejected or
      // stale; never let a charge continue through cooldown.
      this.chargeHoldActive = false;
      this.chargeHoldStart = 0;
      this.stopChargeSound();
      return;
    }
    if (!this.chargeHoldActive || this.chargeSoundStarted) return;
    const block = this.prediction.movementRules();
    const tapMax = block?.weapon?.chargeTapMaxSeconds ?? BASE_CONFIG.weapons.chargeTapMaxSeconds;
    if (performance.now() - this.chargeHoldStart >= tapMax * 1000) {
      this.audio.play('cannonChargeStart');
      this.chargeSoundStarted = true;
    }
  }

  private stopChargeSound(): void {
    this.chargeSoundStarted = false;
    this.audio.stopCannonCharge();
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
    this.stopChargeSound();
    this.aggregateSectors.reset();
    this.xpShards.dispose();
    this.world.arena.dispose();
    this.registry.reset();
    this.progressionOverlay?.dispose();
    this.progressionOverlay = null;
    this.world.dispose();
  }
}
