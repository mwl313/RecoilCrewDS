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
import { computeWeaponMountWorldPose, resolveTerrainSafeMuzzle } from '../../shared/vehicle/tankRigGeometry';
import { projectTrajectoryReticle, type TrajectoryReticleResult } from '../aim/trajectoryReticleProjector';
import { ProgressionOverlay } from '../progression/progressionOverlay';
import { AggregateSectorRenderer, type AggregateSectorRecord } from '../enemies/aggregateSectorRenderer';
import { resolveEnemyPresentation } from '../animation/enemyPresentationResolver';
import { XpShardRenderer } from '../pickups/xpShardRenderer';
import { stageViewForMatch } from '../../shared/monsters/monsterStageView';
import {
  resolveSelectedPreloadAssetIds,
} from '../../shared/monsters/monsterPreload';
import type { SelectedMonsterRun } from '../../shared/monsters/monsterRunSelection';
import { interpolateSinglePlayerTank } from '../prediction/singlePlayerTankInterpolator';
import { RelicChestWorldRenderer } from '../relics/relicChestWorldRenderer';
import { RELIC_CHEST_ASSET_ID } from '../relics/relicChestPresentation';
import { RelicInventoryRail } from '../progression/relicInventoryRail';
import { ProgressionInputContext } from '../progression/progressionInputContext';
import { EnemyWorldUiLayer } from '../worldUi/enemyWorldUiLayer';
import { TacticalDrawer } from '../tactical/tacticalDrawer';
import {
  presentRelicDescription,
  type RelicEffectTemplateLookup,
} from '../../shared/presentation/relicDescriptionPresentation';
import type { RelicDefinition } from '../../shared/content/schemas/progression';
import { TankDamageFeedbackLayer } from '../presentation/tankDamageFeedback';
import { localization } from '../localization/localizationService';
import { relicKey } from '../localization/contentKeys';
import type { MachineGunMuzzlePose } from '../weapons/machineGunPresentation';

const SINGLE_PLAYER_STEP = 1 / 30;

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
  private singlePlayerPreviousTank: TankState | null = null;
  /** Last valid rendered chassis anchor; camera input still advances without a fresh frame. */
  private lastCameraTank: TankState | null = null;
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
  private suppressPresentationFramesForTest = false;
  private progressionOverlay: ProgressionOverlay | null = null;
  private readonly progressionInput: ProgressionInputContext;
  private relicInventoryRail: RelicInventoryRail | null = null;
  private readonly aggregateSectors: AggregateSectorRenderer;
  private readonly xpShards: XpShardRenderer;
  private relicChestRenderer: RelicChestWorldRenderer | null = null;
  private enemyWorldUi: EnemyWorldUiLayer | null = null;
  private tacticalDrawer: TacticalDrawer | null = null;
  private readonly tankDamageFeedback: TankDamageFeedbackLayer;
  private latestSectors: AggregateSectorRecord[] = [];
  private readonly singlePlayerSectorBuffer: AggregateSectorRecord[] = [];
  private singlePlayerModeId = SINGLE_PLAYER_SESSION.rulesModeId;

  onSendInput: ((msg: Record<string, unknown>) => void) | null = null;
  onPauseRequest: (() => void) | null = null;
  onFrame: ((state: MatchState) => void) | null = null;
  onTrajectoryReticle: ((result: TrajectoryReticleResult) => void) | null = null;
  onSinglePlayerResults: ((results: { score: number; bestCombo: number; chargedCannonShots: number; fullChargeShots: number; kills: number; scrapCollected: number; links: number; wipeouts: number; grade: string; title: string; modifier: string }) => void) | null = null;

  setUrbanOverview(sizeMeters: number): void {
    this.cameras.setOverview(sizeMeters);
    const fog = this.world.scene.fog;
    if (fog && 'far' in fog) {
      fog.near = sizeMeters * 1.25;
      fog.far = sizeMeters * 2.4;
    }
  }

  qualityDiagnostics(): ReturnType<RenderWorld['qualityDiagnostics']> & { fps: number } {
    return { ...this.world.qualityDiagnostics(), fps: Number(this.quality.currentFps.toFixed(2)) };
  }

  /** Client-observed horde replication population for browser qualification. */
  replicationPopulationDiagnostics(): { near: number; mid: number; far: number; sectors: number; sectorEntities: number } {
    const latest = this.presenter.latest;
    if (!latest) return { near: 0, mid: 0, far: 0, sectors: 0, sectorEntities: 0 };
    const counts = { near: 0, mid: 0, far: 0, sectors: this.latestSectors.length, sectorEntities: 0 };
    for (const enemy of latest.enemies) {
      if (!enemy.alive) continue;
      const distance = Math.hypot(enemy.x - latest.tank.x, enemy.z - latest.tank.z);
      if (distance <= 52) counts.near++;
      else if (distance <= 105) counts.mid++;
      else counts.far++;
    }
    counts.sectorEntities = this.latestSectors.reduce((sum, sector) => sum + sector.count, 0);
    return counts;
  }

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
    tankDamageFeedback: TankDamageFeedbackLayer;
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
    this.progressionInput = new ProgressionInputContext(deps.input);
    this.arenaWorld = deps.arenaWorld;
    this.tankDamageFeedback = deps.tankDamageFeedback;
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
    const registry = new EntityViewRegistry(
      renderWorld.scene,
      factory,
      (x, z) => world.groundHeightAt(x, z),
    );
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
    const tankDamageFeedback = new TankDamageFeedbackLayer(container);
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
      tankDamageFeedback,
    };
    const router = new PresentationEventRouter(assets, renderWorld.vfx, audio, cameras, {
      isPresented: (seq) => gameRef?.isActionPresented(seq) ?? false,
      confirm: (seq) => gameRef?.confirmAction(seq),
      reject: (seq) => gameRef?.rejectAction(seq),
    }, tankDamageFeedback, () => gameRef?.machineGunMuzzlePose() ?? null);
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
      prediction,
      audio,
      onTankRig: (block) => gameRef?.applyTankRigBlock(block),
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
    game.enemyWorldUi = new EnemyWorldUiLayer(container);
    game.tacticalDrawer = new TacticalDrawer(container, world);
    game.progressionOverlay = new ProgressionOverlay(container, {
      selectUpgrade: (index) => gameRef!.submitUpgrade(index),
      acknowledgeRelic: () => gameRef!.acknowledgeRelicPresentation(),
      relicInfo: (relicId) => {
        const relic = gameRef!.contentPack?.getRelic(relicId);
        return relic
          ? {
              label: localization.t(relicKey(relic.id, 'name'), {}, relic.label),
              description: localizedRelicDescription(
                relic,
                (templateId) => gameRef!.contentPack?.getRelicEffectTemplate(templateId),
              ),
              iconId: relic.iconId,
              iconUrl: gameRef!.assets.assetUrl(relic.iconId),
            }
          : null;
      },
      rewardSound: (name, detail) => {
        const sounds = {
          levelImpact: 'rewardLevelImpact', tick: 'rewardTick', cardLock: 'rewardCardLock',
          focus: 'rewardFocus', confirm: 'rewardConfirm', relicLock: 'relicLock', exit: 'rewardExit',
        } as const;
        gameRef!.audio.play(sounds[name], { kind: detail?.rarity, charge: detail?.progress });
      },
      duckLegendary: () => gameRef!.audio.duckForReward({ depth: 0.72, attackMs: 18, holdMs: 82, releaseMs: 520 }),
      rewardImpact: (intensity) => gameRef!.cameras.addImpulse(intensity),
    });
    game.relicInventoryRail = new RelicInventoryRail(container, (relicId) => {
      const relic = gameRef!.contentPack?.getRelic(relicId);
      return relic
        ? {
            label: localization.t(relicKey(relic.id, 'name'), {}, relic.label),
            description: localizedRelicDescription(
              relic,
              (templateId) => gameRef!.contentPack?.getRelicEffectTemplate(templateId),
            ),
            rarity: relic.rarity,
            iconId: relic.iconId,
            iconUrl: gameRef!.assets.assetUrl(relic.iconId),
          }
        : null;
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
    this.contentPack = pack;
    const preloadIds = run ? resolveSelectedPreloadAssetIds(pack, run) : [];
    await this.assets.preloadModels([...preloadIds, RELIC_CHEST_ASSET_ID]);
    const progression = pack.getProgressionDefinition('progression.mainStage');
    this.relicChestRenderer?.dispose();
    this.relicChestRenderer = new RelicChestWorldRenderer(
      this.world.scene,
      this.assets,
      pack.getRelicChestSpawnPolicy(progression.relicChestSpawnPolicyId),
    );
  }

  /**
   * Phase 3: swap the authoritative arena (rematch / Single Player reroll /
   * reconnect). Rebuilds the arena view, resets prediction/presenter, and
   * recreates the local Single Player match on the new world.
   */
  applyArenaSession(session: ArenaSessionResult): void {
    this.world.rebuildArena(session.world);
    this.tacticalDrawer?.rebuild(session.world);
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
      this.resetSinglePlayerRenderPose();
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
    if (this.session.kind === 'singlePlayer' && this.singlePlayerMatch) {
      return {
        maxIntegrity: this.singlePlayerMatch.runtime.rules.resolver.resolve('tank.maxIntegrity'),
        cannonCooldown: this.singlePlayerMatch.runtime.rules.resolver.resolve('match.cannonCooldown'),
        chargeTapMaxSeconds: this.singlePlayerMatch.runtime.rules.config.weapons.chargeTapMaxSeconds,
        chargeFullSeconds: this.singlePlayerMatch.runtime.rules.config.weapons.chargeFullSeconds,
      };
    }
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
    special: number;
    global: number;
    ordinaryGlobal: number;
    within45: number;
    within70: number;
    ordinaryWithin45: number;
    ordinaryWithin70: number;
    close: number;
    ranged: number;
    specialist: number;
    sectors: number;
    sectorMovement: number;
    recycledPerSecond: number;
    recycleReason: string;
    globalDeficit: number;
    nearbyDeficit: number;
    nearbyTargetMinimum: number;
    nearbyTargetMaximum: number;
    angularCounts: number[];
    lastDirections: string[];
    pendingSubgroups: number;
    maintenanceSummons: number;
    persistentRecovery: string;
    rewardSuppressedKills: number;
    clearRate: number;
    clearRateIncomeMultiplier: number;
    entityTarget: number;
    threatTarget: number;
    spawnIncome: number;
    spawnBudget: number;
    lastPack: string | null;
    lastPackSize: number;
    lastAnchorDistance: number;
    anchorFailures: number;
    waveActiveEntities: number;
    waveActiveThreat: number;
    waveMaximumEntities: number;
    waveMaximumThreat: number;
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
    const counts = { ambient: 0, wave: 0, boss: 0, special: 0 };
    const tierCounts: [number, number, number, number] = [0, 0, 0, 0];
    for (const e of m.state.enemies) {
      if (!e.alive) continue;
      const cls = e.ownership?.populationClass ?? 'ambient';
      counts[cls as keyof typeof counts] = (counts[cls as keyof typeof counts] ?? 0) + 1;
      tierCounts[systems.enemies.tierFor(e)]++;
    }
    const sectorTally = systems.hordeSectors.tally();
    const density = horde.densityTelemetry();
    return {
      phase: stage.phase,
      farmingTimeRemaining: stage.farmingTimeRemaining,
      waveId: stage.activeWaveId,
      leaderHp: leader?.hp ?? 0,
      leaderMaxHp: leader?.maxHp ?? 0,
      ambient: counts.ambient + sectorTally.byClass.ambient.entities,
      wave: counts.wave + sectorTally.byClass.wave.entities,
      boss: counts.boss + sectorTally.byClass.boss.entities,
      special: counts.special + sectorTally.byClass.special.entities,
      global: density.globalEnemyCount,
      ordinaryGlobal: density.globalOrdinaryCount,
      within45: density.nearbyEnemyCount45,
      within70: density.nearbyEnemyCount70,
      ordinaryWithin45: density.nearbyOrdinaryCount45,
      ordinaryWithin70: density.nearbyOrdinaryCount70,
      close: density.close,
      ranged: density.ranged,
      specialist: density.specialist,
      sectors: systems.hordeSectors.sectors.size,
      sectorMovement: density.sectorMovementProgress,
      recycledPerSecond: density.recycledUnitsPerSecond,
      recycleReason: density.recycleReason,
      globalDeficit: density.globalOrdinaryDeficit,
      nearbyDeficit: density.nearbyOrdinaryDeficit,
      nearbyTargetMinimum: density.nearbyTargetMinimum,
      nearbyTargetMaximum: density.nearbyTargetMaximum,
      angularCounts: density.angularSectorCounts,
      lastDirections: density.lastAnchorDirections,
      pendingSubgroups: density.pendingSubgroups,
      maintenanceSummons: density.maintenanceSummonCount,
      persistentRecovery: Object.entries(density.persistentRecoveryStage)
        .map(([id, state]) => `${id}:${state}`)
        .join(',') || '-',
      rewardSuppressedKills: density.rewardSuppressedKills,
      clearRate: density.clearRatePerSecond,
      clearRateIncomeMultiplier: density.clearRateIncomeMultiplier,
      entityTarget: horde.currentEntityTarget,
      threatTarget: horde.currentThreatTarget,
      spawnIncome: horde.currentSpawnIncome,
      spawnBudget: horde.spawnBudget,
      lastPack: horde.lastSelectedPack,
      lastPackSize: horde.lastPackSize,
      lastAnchorDistance: horde.lastAnchorDistance,
      anchorFailures: horde.anchorFailures,
      waveActiveEntities: runtime?.activeWaveEntities ?? 0,
      waveActiveThreat: runtime?.activeWaveThreat ?? 0,
      waveMaximumEntities: runtime?.maximumActiveWaveEntities ?? 0,
      waveMaximumThreat: runtime?.maximumActiveWaveThreat ?? 0,
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
    this.enemyWorldUi?.reset();
    this.router.reset();
    this.tacticalDrawer?.close();
    this.singlePlayerAcc = 0;
    this.resetSinglePlayerRenderPose();
    this.lastCameraTank = this.singlePlayerMatch ? { ...this.singlePlayerMatch.state.tank } : null;
    this.cameras.resetTransientState();
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

  private resetSinglePlayerRenderPose(): void {
    this.singlePlayerPreviousTank = this.singlePlayerMatch
      ? { ...this.singlePlayerMatch.state.tank }
      : null;
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

  private collectAggregateSectors(): readonly AggregateSectorRecord[] {
    if (this.session.kind === 'singlePlayer' && this.singlePlayerMatch) {
      const sectors = this.singlePlayerMatch.runtime.systems.hordeSectors.sectors;
      let index = 0;
      for (const sector of sectors.values()) {
        let record = this.singlePlayerSectorBuffer[index];
        if (!record) {
          record = {
            sectorId: sector.sectorId,
            x: sector.centerX,
            z: sector.centerZ,
            count: sector.count,
            enemyDefId: sector.enemyDefId,
            presentationSeed: sector.presentationSeed,
          };
          this.singlePlayerSectorBuffer.push(record);
        } else {
          record.sectorId = sector.sectorId;
          record.x = sector.centerX;
          record.z = sector.centerZ;
          record.count = sector.count;
          record.enemyDefId = sector.enemyDefId;
          record.presentationSeed = sector.presentationSeed;
        }
        index++;
      }
      this.singlePlayerSectorBuffer.length = index;
      return this.singlePlayerSectorBuffer;
    }
    return this.latestSectors;
  }

  handleEvent(ev: SimEvent): void {
    // The online Driver already received immediate local feedback from
    // prediction; skip the authoritative duplicate for jump/dash.
    if (this.session.kind === 'multiplayer' && this.role === 'driver' && (ev.type === 'jump' || ev.type === 'dash')) {
      return;
    }
    this.presenter.handleEvent(ev);
    this.enemyWorldUi?.handleEvent(
      ev,
      this.cameras.activeCam.camera,
      this.presenter.latest?.enemies ?? [],
      this.presenter.latest?.matchFlow ?? 'playing',
    );
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
    const step = SINGLE_PLAYER_STEP;
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
      this.singlePlayerPreviousTank = { ...m.state.tank };
      m.step(step);
      for (const ev of m.takeEvents()) {
        this.enemyWorldUi?.handleEvent(ev, this.cameras.activeCam.camera, m.state.enemies, m.state.matchFlow);
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
    this.router.update(now);

    this.syncProgressionInputContext();

    this.lastPredictInput = this.sampleDriverInput();
    if (this.session.kind === 'singlePlayer' && this.singlePlayerMatch) {
      this.stepSinglePlayer(dtRaw);
      this.presenter.latest = this.singlePlayerMatch.state;
    }
    if (this.session.networked) this.presenter.advanceRenderClock(dtRaw);
    if (this.session.kind === 'singlePlayer' && this.singlePlayerMatch) {
      this.singlePlayerMatch.checkProgressionTimeout(Date.now());
    }
    this.presenter.computeRemote();
    // Single Player may enter progression during the simulation step above;
    // close the input boundary before camera/weapon presentation this frame.
    this.syncProgressionInputContext();
    const tacticalToggle = this.input.consumeTacticalToggle?.() ?? false;
    const tacticalState = this.presenter.latest;
    if (tacticalState?.matchFlow === 'playing' && this.inputEnabled) {
      if (tacticalToggle) this.tacticalDrawer?.toggle();
    } else {
      this.tacticalDrawer?.close();
    }
    let renderTank: TankState | null = null;
    const frame = this.suppressPresentationFramesForTest ? null : this.presenter.remoteFrame;
    if (frame) {
      if (this.session.kind === 'singlePlayer') {
        renderTank = interpolateSinglePlayerTank(
          this.singlePlayerPreviousTank,
          frame.tank,
          this.singlePlayerAcc / SINGLE_PLAYER_STEP,
        );
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
    if (renderTank) this.lastCameraTank = { ...renderTank };
    this.updateCameraAndAim(renderTank ?? this.lastCameraTank, dtRaw);
    const audioCamera = this.cameras.getCameraState();
    this.audio.setListenerPose({
      x: audioCamera.position.x,
      y: audioCamera.position.y,
      z: audioCamera.position.z,
      yaw: audioCamera.yaw,
    });
    if (frame && renderTank) this.presenter.syncWorld(frame, renderTank, dt);
    if (this.presenter.latest) {
      const latest = this.presenter.latest;
      this.onFrame?.(latest);
      this.updateProgressionOverlay();
      this.relicInventoryRail?.update(latest);
      const sectors = this.collectAggregateSectors();
      this.aggregateSectors.update(sectors, latest.tank.x, latest.tank.z);
      this.relicChestRenderer?.sync(latest.chests, latest.time, Date.now(), dtRaw);
      this.tacticalDrawer?.update({
        state: latest,
        tank: renderTank ?? this.presenter.getRenderTank(),
        role: this.session.kind === 'singlePlayer' ? 'single' : this.role,
        sectors,
      });
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
    if (latest) {
      let nearbyCount = 0;
      let distanceTotal = 0;
      for (const enemy of latest.enemies) {
        if (!enemy.alive) continue;
        const distance = Math.hypot(enemy.x - audioCamera.position.x, enemy.z - audioCamera.position.z);
        if (distance > 100) continue;
        nearbyCount++;
        distanceTotal += distance;
      }
      this.audio.setHordePresence(nearbyCount, nearbyCount > 0 ? distanceTotal / nearbyCount : 100);
    } else {
      this.audio.setHordePresence(0, 100);
    }
    this.enemyWorldUi?.update(
      frame?.enemies ?? latest?.enemies ?? [],
      this.cameras.activeCam.camera,
      renderTank,
      performance.now(),
      latest?.matchFlow ?? 'playing',
    );
    this.renderFrame();
  };

  /**
   * RAF owns pointer deltas, camera pose, world aim, and reticle projection.
   * A skipped network/simulation frame therefore cannot batch mouse input or
   * interrupt local camera motion; the last rendered tank is a stable anchor.
   */
  private updateCameraAndAim(renderTank: TankState | null, dtRaw: number): void {
    const mouse = this.input.consumeMouse();
    if (!this.inputEnabled) return;
    if (!renderTank) {
      this.cameras.applyMouseDelta(mouse);
      return;
    }

    const pos = new THREE.Vector3(renderTank.x, renderTank.y, renderTank.z);
    const speedRatio = Math.min(1, Math.hypot(renderTank.vx, renderTank.vz) / 18);
    const cameraQuery = this.world.arena.cameraQuery;
    this.cameras.update(
      dtRaw,
      pos,
      renderTank.yaw,
      this.session.kind === 'singlePlayer' || this.role === 'driver' ? speedRatio : 0,
      cameraQuery,
      mouse,
    );

    if (this.session.kind !== 'singlePlayer' && this.role !== 'gunner') return;

    const groundHeightAt = (x: number, z: number) => this.prediction.groundHeightAt(x, z);
    const aim = this.cameras.computeAim(this.cameras.activeCam.camera, cameraQuery, groundHeightAt);
    const limits = this.prediction.turretPitchLimits();
    const solved = this.cameras.resolveWeaponAim(
      { x: renderTank.x, y: renderTank.y, z: renderTank.z, yaw: renderTank.yaw },
      this.tankRig.rigDefinition,
      aim,
      limits,
    );
    const worldYaw = renderTank.yaw + solved.desiredYawLocal;
    this.prediction.updateTurretTarget(worldYaw, solved.desiredPitch, renderTank.yaw, dtRaw);
    const predictedTurret = this.prediction.getTurretSpaces();
    const weapon = this.prediction.movementRules()?.weapon;
    this.onTrajectoryReticle?.(
      projectTrajectoryReticle({
        camera: this.cameras.activeCam.camera,
        renderWidth: this.world.renderer.domElement.clientWidth || window.innerWidth,
        renderHeight: this.world.renderer.domElement.clientHeight || window.innerHeight,
        tank: { x: renderTank.x, y: renderTank.y, z: renderTank.z, yaw: renderTank.yaw },
        turretLocalYaw: predictedTurret.predictedYawLocal,
        turretPitch: predictedTurret.predictedPitch,
        rig: this.tankRig.rigDefinition,
        cameraQuery,
        groundHeightAt,
        projectile: {
          speed: weapon?.cannonSpeed ?? BASE_CONFIG.weapons.cannonSpeed,
          gravity: weapon?.cannonGravity ?? BASE_CONFIG.weapons.cannonGravity,
          life: weapon?.cannonLife ?? BASE_CONFIG.weapons.cannonLife,
        },
        desiredPoint: aim,
      }),
    );
  }

  private renderFrame(): void {
    this.cameras.applyShake();
    const renderT0 = performance.now();
    this.world.render(this.cameras.activeCam.camera);
    netcodeMetrics.mainRenderMs = performance.now() - renderT0;
  }

  private sendInputs(): void {
    if (!this.onSendInput || this.suppressAutoInput || this.progressionInput.active()) return;
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
    if (!this.inputEnabled || this.progressionInput.active()) return { throttle: 0, steer: 0, dashPressed: false, jumpPressed: false };
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
    if (this.progressionInput.active()) return;
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
      this.tacticalDrawer?.close();
      this.lastPredictInput = { throttle: 0, steer: 0, dashPressed: false, jumpPressed: false };
      this.chargeHoldActive = false;
      this.chargeHoldStart = 0;
      this.stopChargeSound();
    }
  }

  /** Test hook for proving RAF camera ownership through missing presentation frames. */
  setPresentationFramesSuppressedForTest(suppressed: boolean): void {
    this.suppressPresentationFramesForTest = suppressed;
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
    if (this.session.kind !== 'multiplayer' || this.role !== 'gunner' || !this.onSendInput || this.suppressAutoInput || this.progressionInput.active()) return;
    const latest = this.presenter.latest;
    const mg = this.mouseDown('primary');
    const secondary = this.mouseDown('secondary');
    const charging = latest?.build.capabilities.includes('cannon.charge') ?? false;
    const canCharge = (latest?.turret.cannonCooldown ?? 0) <= 0;
    if (mg && !this.mgDown) this.fireGunnerAction('mgStart', true);
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
    if (presentLocally && this.playLocalGunnerAction(action)) {
      this.pendingLocalActions.set(actionSeq, { action, at: performance.now() });
    }
  }

  /** Same-frame local weapon presentation (presentation only, no damage). */
  private playLocalGunnerAction(action: GunnerActionType): boolean {
    const latest = this.presenter.latest;
    this.tankRig.chassis.updateMatrixWorld(true);
    let muzzle: { x: number; y: number; z: number } = getMuzzleWorld(this.tankRig);
    const tank = this.presenter.getRenderTank();
    if (tank) {
      const turret = this.prediction.getTurretSpaces();
      const mount = computeWeaponMountWorldPose(
        tank,
        { yaw: turret.predictedYawLocal, pitch: turret.predictedPitch },
        this.tankRig.rigDefinition,
      );
      muzzle = resolveTerrainSafeMuzzle(mount, (x, z) => this.prediction.groundHeightAt(x, z));
    }
    const charging = latest?.build.capabilities.includes('cannon.charge') ?? false;
    if (action === 'secondaryPressed') {
      if (charging) {
        this.chargeSoundStarted = false;
        return false;
      }
      this.world.vfx.spawnFlash(muzzle.x, muzzle.y, muzzle.z, 0xffc36a, 1.6, 0.09);
      this.world.vfx.spawnBurst(muzzle.x, muzzle.y, muzzle.z, 0xffc36a, 12, 0.5, 0.35, 0.3, 8);
      this.audio.playLocal('playerCannon', { chargeRatio: 0 });
      this.cameras.addImpulse(0.45);
      return true;
    } else if (action === 'secondaryReleased') {
      const chargeRatio = this.getLocalChargeView()?.ratio ?? 0;
      this.world.vfx.spawnFlash(muzzle.x, muzzle.y, muzzle.z, 0xffc36a, 1.6, 0.09);
      this.world.vfx.spawnBurst(muzzle.x, muzzle.y, muzzle.z, 0xffc36a, 12, 0.5, 0.35, 0.3, 8);
      this.audio.playLocal('playerCannon', { chargeRatio });
      this.cameras.addImpulse(0.45);
      return true;
    } else if (action === 'mgStart') {
      if ((latest?.turret.mgCooldown ?? 1) <= 0) {
        this.router.presentPredictedMachineGunShot(muzzle);
        return true;
      }
    }
    return false;
  }

  /** Latest visible/predicted barrel pose used only to de-lag hitscan VFX. */
  private machineGunMuzzlePose(): MachineGunMuzzlePose | null {
    const singlePlayer = this.session.kind === 'singlePlayer' ? this.singlePlayerMatch : null;
    const tank = singlePlayer?.state.tank ?? this.lastCameraTank;
    if (!tank) return null;
    const turret = singlePlayer
      ? { yaw: singlePlayer.state.turret.yaw, pitch: singlePlayer.state.turret.pitch }
      : this.role === 'gunner'
        ? (() => {
            const predicted = this.prediction.getTurretSpaces();
            return { yaw: predicted.predictedYawLocal, pitch: predicted.predictedPitch };
          })()
        : { yaw: this.tankRig.turret.rotation.y, pitch: -this.tankRig.barrel.rotation.x };
    const mount = computeWeaponMountWorldPose(tank, turret, this.tankRig.rigDefinition);
    const origin = resolveTerrainSafeMuzzle(mount, (x, z) => this.prediction.groundHeightAt(x, z));
    return {
      origin,
      direction: mount.direction,
    };
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
      const result = this.singlePlayerMatch.submitProgressionSelection('single', selection.offerId, cardIndex);
      // Single Player authority resolves synchronously. Restore gameplay input
      // in the same event turn so the first post-overlay mouse delta is not
      // consumed by the now-closed card selector before the next RAF.
      if (result.accepted) this.syncProgressionInputContext();
    } else if (this.onSendInput) {
      this.onSendInput({ t: 'selectUpgrade', offerId: selection.offerId, cardIndex });
    }
  }

  /** Acknowledge the shared relic reveal (idempotent per connected player). */
  acknowledgeRelicPresentation(): void {
    const latest = this.presenter.latest;
    const selection = latest?.teamProgression.activeSelection;
    if (!selection || selection.kind !== 'relic' || latest?.matchFlow !== 'relicSelection') return;
    const acquisitionSequence = selection.relicResult?.acquisitionSequence ?? 0;
    if (this.session.kind === 'singlePlayer' && this.singlePlayerMatch) {
      const result = this.singlePlayerMatch.acknowledgeProgressionRelic(
        'single',
        acquisitionSequence,
        ['single'],
        Date.now(),
      );
      if (result.accepted) this.syncProgressionInputContext();
    } else if (this.onSendInput) {
      this.onSendInput({ t: 'acknowledgeRelic', acquisitionSequence });
    }
  }

  /** Legacy automation facade retained while tests migrate to acknowledge. */
  skipRelicPresentation(): void {
    this.acknowledgeRelicPresentation();
  }

  private syncProgressionInputContext(): void {
    const latest = this.presenter.latest;
    const selection = latest?.teamProgression.activeSelection;
    const previousActive = this.progressionInput.active();
    if (latest?.matchFlow === 'upgradeSelection' && selection?.kind === 'upgrade') {
      this.progressionInput.sync('upgrade', selection.offerId);
    } else if (latest?.matchFlow === 'relicOpening') {
      const chest = latest.chests.find((entry) => entry.lifecycle === 'opening');
      this.progressionInput.sync('relic', `opening:${chest?.id ?? 'unknown'}`);
      // Opening has no UI action; discard click/Space edges so they cannot
      // skip the newly-created reveal on the following frame.
      this.input.consumeProgressionInput();
    } else if (latest?.matchFlow === 'relicSelection' && selection?.kind === 'relic') {
      this.progressionInput.sync('relic', String(selection.relicResult?.acquisitionSequence ?? selection.offerId));
    } else {
      this.progressionInput.sync('none');
    }
    if (!previousActive && this.progressionInput.active()) {
      this.mgDown = false;
      this.secondaryDown = false;
      this.chargeHoldActive = false;
      this.chargeHoldStart = 0;
      this.input.clearDriverEdges();
      this.stopChargeSound();
    }
  }

  private updateProgressionOverlay(): void {
    const latest = this.presenter.latest;
    if (!latest || !this.progressionOverlay) return;
    const role = this.session.kind === 'singlePlayer' ? 'single' : this.role;
    this.progressionOverlay.update(latest, role, Date.now());
    this.progressionOverlay.handleInput(this.input.consumeProgressionInput());
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

  audioDiagnostics() {
    return this.audio.debugStats();
  }

  composerPassCount(): number {
    return this.world.composerPassCount();
  }

  tacticalDiagnostics(): { open: boolean; chassisYaw: number; renderedEffects: number } | null {
    return this.tacticalDrawer?.diagnostics() ?? null;
  }

  worldFeedbackDiagnostics(): { queued: number; popups: Array<{ kind: string; amount: number; source: string }> } {
    return {
      queued: this.enemyWorldUi?.queuedCount ?? 0,
      popups: this.enemyWorldUi?.popups.items.map(({ kind, amount, source }) => ({ kind, amount, source })) ?? [],
    };
  }

  setApronEnabledForTest(enabled: boolean): void {
    this.world.setApronEnabled(enabled);
    this.world.resetQualityDiagnostics();
  }

  destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.stopChargeSound();
    this.aggregateSectors.reset();
    this.xpShards.dispose();
    this.world.arena.dispose();
    this.registry.dispose();
    this.progressionOverlay?.dispose();
    this.progressionOverlay = null;
    this.relicInventoryRail?.dispose();
    this.relicInventoryRail = null;
    this.relicChestRenderer?.dispose();
    this.relicChestRenderer = null;
    this.enemyWorldUi?.dispose();
    this.enemyWorldUi = null;
    this.tankDamageFeedback.dispose();
    this.tacticalDrawer?.dispose();
    this.tacticalDrawer = null;
    this.world.dispose();
  }
}

function localizedRelicDescription(
  relic: RelicDefinition,
  templateFor: RelicEffectTemplateLookup,
): string {
  const presented = presentRelicDescription(
    relic,
    templateFor,
    (key, params, fallback) => localization.t(key, params, fallback),
  );
  // Structured presenters own their interpolation. All other relics resolve
  // through the typed content catalog and retain authored copy as fallback.
  return presented !== relic.description
    ? presented
    : localization.t(relicKey(relic.id, 'description'), {}, presented);
}
