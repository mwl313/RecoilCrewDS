import * as THREE from 'three';
import { clamp, lerp, angleDiff, wrapAngle } from '../../shared/math';
import { SnapshotBuffer, type SnapshotEnvelope } from '../../shared/net/interpolation';
import type { AssetService, TankRig } from '../assets';
import type { AudioManager } from '../audio';
import type { Collider } from '../arenaView';
import type { CameraCollisionQuery } from '../cameraCollision';
import type { EnemyState, MatchState, Role, SimEvent, TankState } from '../../shared/types';
import type { CameraManager } from './cameraManager';
import type { EntityViewRegistry } from './entityViewRegistry';
import type { PredictionController } from './predictionController';
import type { RenderWorld } from './renderWorld';
import { RemoteEntityInterpolator, type RemoteFrame } from '../prediction/remoteInterpolator';
import type { TankImpulseWire } from '../../shared/effects/tankImpulseSystem';
import type { DriverInput } from '../../shared/types';
import type { OpEntry } from '../../shared/sim/opLog';
import { netcodeMetrics } from '../netcode/netcodeMetrics';
import type { GameSessionContext } from '../../shared/session/gameSessionKind';
import type { TankRigRulesBlock } from '../../shared/stats/rulesRevision';
import { solveTurretAim } from '../../shared/vehicle/tankRigGeometry';
import { projectTrajectoryReticle, type TrajectoryReticleResult } from '../aim/trajectoryReticleProjector';

export interface InputSource {
  key(name: string): boolean;
  button(name: string): boolean;
  edge(name: 'dash' | 'jump'): boolean;
  clearDriverEdges(): void;
  consumeMouse(): { dx: number; dy: number };
}

export interface PresenterDeps {
  world: RenderWorld;
  assets: AssetService;
  registry: EntityViewRegistry;
  tankRig: TankRig;
  cameras: CameraManager;
  prediction: PredictionController;
  colliders: () => Collider[];
  cameraQuery: () => CameraCollisionQuery | null;
  input: InputSource;
  audio: AudioManager;
  onTankRig?: (block: TankRigRulesBlock) => void;
  onTrajectoryReticle?: (result: TrajectoryReticleResult) => void;
  session: () => GameSessionContext;
  role: () => Role;
  singlePlayerMatch: () => { state: MatchState } | null;
  time: () => number;
  applySinglePlayerWeapons(dt: number): void;
}

/**
 * NetworkStatePresenter owns snapshot buffering/interpolation (separate from
 * prediction) and syncs authoritative state into entity views, cameras, and
 * prediction. It never decides gameplay outcomes.
 */
export class NetworkStatePresenter {
  private readonly snapBuffer = new SnapshotBuffer<MatchState>();
  latest: MatchState | null = null;
  remoteFrame: RemoteFrame | null = null;
  private renderTime = 0;
  private renderClockStarted = false;
  private lastRenderTank: TankState | null = null;
  private readonly remote = new RemoteEntityInterpolator();
  private readonly frame: RemoteFrame = {
    enemies: [],
    pickups: [],
    shells: [],
    truck: { active: false, x: 0, y: 0, z: 0, yaw: 0, hp: 0, waypoint: 0, escaped: false, sirenT: 0 },
    turret: { yaw: 0, pitch: 0 },
    tank: undefined as never,
    discrete: undefined as never,
    interpolated: false,
  };

  private tankRig: TankRig;
  private tankRigRevision = 0;

  constructor(private readonly deps: PresenterDeps) {
    this.tankRig = deps.tankRig;
  }

  /** Swap the resolved tank rig (Single Player start / replicated block). */
  setTankRig(rig: TankRig): void {
    this.tankRig = rig;
  }

  setSnapshot(msg: SnapshotEnvelope<MatchState> & {
    lastImpulseSeq?: number;
    opLog?: OpEntry[];
    serverTick?: number;
    tickDurationMs?: number;
    droppedTimeMs?: number;
    driftMs?: number;
    outboundBuffered?: number;
  }): void {
    const t0 = performance.now();
    this.latest = msg.state;
    this.snapBuffer.push(msg);
    netcodeMetrics.serverTick = msg.serverTick ?? 0;
    netcodeMetrics.serverTickDurationMs = msg.tickDurationMs ?? 0;
    netcodeMetrics.serverDroppedMs = msg.droppedTimeMs ?? 0;
    netcodeMetrics.serverDriftMs = msg.driftMs ?? 0;
    netcodeMetrics.outboundBuffered = msg.outboundBuffered ?? 0;
    if (msg.serverTime !== undefined) {
      netcodeMetrics.renderDelayMs = Math.max(0, this.renderTime - msg.serverTime) * 1000;
    }
    if (this.deps.session().networked) {
      this.deps.prediction.applyMovementRules(msg.movement, msg.movementRulesRevision, msg.state.modifier);
      const block = msg.movement?.tankRig;
      if (block && block.revision !== this.tankRigRevision) {
        this.tankRigRevision = block.revision;
        this.deps.onTankRig?.(block);
      }
    }
    if (!this.renderClockStarted) {
      this.renderClockStarted = true;
      this.renderTime = msg.serverTime - 0.1;
    }
    this.deps.prediction.reconcile(msg.state, msg.lastProcessedDriverInputSeq, {
      impulseAckSeq: msg.lastImpulseSeq,
      opLog: msg.opLog,
    });
    this.deps.prediction.reconcileTurret(msg.state, msg.lastProcessedGunnerInputSeq);
    netcodeMetrics.snapshotHandleMs = performance.now() - t0;
  }

  handleEvent(ev: SimEvent): void {
    void ev;
  }

  /** Exact tank impulse → both predictors apply immediately (once). */
  handleTankImpulse(wire: TankImpulseWire): void {
    this.deps.prediction.applyImpulse(wire);
  }

  /** Server-relayed sanitized Driver input → Gunner shared predictor. */
  handleDriverRelay(seq: number, driver: DriverInput): void {
    if (this.deps.session().kind === 'multiplayer' && this.deps.role() === 'gunner') {
      this.deps.prediction.pushRelayInput(seq, driver);
    }
  }

  advanceRenderClock(dtRaw: number): void {
    if (!this.deps.session().networked || !this.renderClockStarted) return;
    this.renderTime += dtRaw;
    const latestEnv = this.snapBuffer.latest();
    if (latestEnv && this.renderTime > latestEnv.serverTime - 0.02) {
      this.renderTime = latestEnv.serverTime - 0.02;
    }
  }

  /** Fill the reusable remote frame (no whole MatchState allocation). */
  computeRemote(): void {
    const t0 = performance.now();
    if (this.deps.session().kind === 'singlePlayer') {
      const state = this.deps.singlePlayerMatch()?.state ?? this.latest;
      if (state) {
        this.remote.fillFromDiscrete(this.frame, state);
        this.remoteFrame = this.frame;
      }
    } else if (this.snapBuffer.length > 0) {
      const pair = this.snapBuffer.pick(this.renderTime);
      if (pair) {
        this.remote.setEndpoints(pair.a, pair.b, pair.alpha);
        this.remote.fill(this.frame);
        this.remoteFrame = this.frame;
      } else {
        this.remoteFrame = this.latest ? this.frame : null;
        if (this.latest) this.remote.fillFromDiscrete(this.frame, this.latest);
      }
    } else if (this.latest) {
      this.remote.fillFromDiscrete(this.frame, this.latest);
      this.remoteFrame = this.frame;
    }
    netcodeMetrics.interpMs = performance.now() - t0;
  }

  syncWorld(frame: RemoteFrame, renderTank: TankState, dt: number): void {
    const t0 = performance.now();
    const deps = this.deps;
    const t = renderTank;
    const state = frame.discrete;
    this.lastRenderTank = renderTank;
    const pos = new THREE.Vector3(t.x, t.y, t.z);
    const yaw = t.yaw;
    this.tankRig.chassis.position.copy(pos);
    this.tankRig.chassis.rotation.set(-t.pitch, yaw, t.roll);
    const usePredictedTurret = deps.session().kind === 'singlePlayer' || deps.role() === 'gunner';
    const turretSpaces = deps.prediction.getTurretSpaces();
    if (usePredictedTurret) {
      this.tankRig.turret.rotation.y = turretSpaces.predictedYawLocal;
      this.tankRig.barrel.rotation.x = -turretSpaces.predictedPitch;
    } else {
      // Driver online: the gunner's world aim is already in every snapshot.
      // Interpolate it client-side and re-derive the local yaw against the
      // predicted chassis, so the turret moves in real time (60 fps, still
      // sticky to the gunner's aim) with zero extra network traffic.
      const worldAim = wrapAngle(yaw + frame.turret.yaw);
      this.tankRig.turret.rotation.y = wrapAngle(worldAim - yaw);
      this.tankRig.barrel.rotation.x = -frame.turret.pitch;
    }
    deps.registry.shieldMesh.position.copy(pos).add(new THREE.Vector3(0, 1.2, 0));
    deps.registry.shieldMesh.visible = t.shieldedT > 0;

    const registry = deps.registry;
    const seen = new Set<number>();
    for (const e of frame.enemies) {
      seen.add(e.id);
      let rig = registry.enemyRigs.get(e.id);
      if (!rig) rig = registry.createEnemy(e);
      rig.group.visible = e.alive || e.state === 'dead';
      if (e.alive || e.state === 'dead') {
        rig.group.position.set(e.x, e.y, e.z);
        rig.group.rotation.y = e.yaw;
        if (rig.head) rig.head.rotation.y = e.aimYaw - e.yaw;
        rig.deadT = e.alive ? 0 : rig.deadT + dt;
        if (!e.alive && rig.deadT > 1.2) rig.group.visible = false;
        const flash = e.flash > 0 ? 1.4 : 0;
        for (const mat of rig.materials) {
          mat.emissiveIntensity = flash + (e.type === 'rammer' && e.state === 'telegraph' ? 0.7 : 0);
          mat.emissive.setHex(e.type === 'gunTower' ? 0xff3b3b : e.type === 'rammer' ? 0xffb020 : 0xff2d2d);
        }
        if (e.type === 'gunTower' && e.telegraph > 0) {
          rig.telegraph.visible = true;
          rig.telegraph.position.set(e.x, 0.04, e.z);
          rig.telegraphMat.opacity = 0.4 + (0.5 + 0.5 * Math.sin(deps.time() * 18)) * 0.5;
        } else if (e.type === 'rammer' && e.telegraph > 0) {
          rig.telegraph.visible = true;
          rig.telegraph.position.set(e.x, 0.04, e.z);
          rig.telegraph.rotation.y = e.aimYaw;
          rig.telegraphMat.opacity = 0.45 + Math.sin(deps.time() * 20) * 0.3;
        } else {
          rig.telegraph.visible = false;
        }
      }
    }
    for (const id of [...registry.enemyRigs.keys()]) {
      if (!seen.has(id)) registry.removeEnemy(id);
    }

    const seenPickups = new Set<number>();
    for (const p of frame.pickups) {
      if (p.collected) continue;
      seenPickups.add(p.id);
      let rig = registry.pickupRigs.get(p.id);
      if (!rig) rig = registry.createPickup(p);
      rig.group.position.set(p.x, p.y + Math.sin(deps.time() * 2.8 + p.id) * 0.12, p.z);
      rig.model.rotation.y += dt * 2.2;
    }
    for (const id of [...registry.pickupRigs.keys()]) {
      if (!seenPickups.has(id)) registry.removePickup(id);
    }

    const seenShells = new Set<number>();
    for (const sh of frame.shells) {
      seenShells.add(sh.id);
      let rig = registry.shellRigs.get(sh.id);
      if (!rig) rig = registry.createShell(sh);
      rig.group.position.set(sh.x, sh.y, sh.z);
    }
    for (const id of [...registry.shellRigs.keys()]) {
      if (!seenShells.has(id)) registry.removeShell(id);
    }

    for (const b of state.barrels) {
      const mesh = registry.barrelMeshes.get(b.id);
      if (mesh) mesh.visible = !b.exploded;
    }

    const truck = frame.truck;
    registry.truckRig.visible = truck.active;
    if (truck.active) {
      registry.truckRig.position.set(truck.x, truck.y, truck.z);
      registry.truckRig.rotation.y = truck.yaw;
      registry.truckMarker.position.set(truck.x, truck.y + 3.6, truck.z);
      registry.truckMarker.visible = true;
      registry.truckMarker.rotation.y = deps.time() * 2.2;
      if (Math.sin(truck.sirenT * 7) > 0.4 && Math.random() < 0.03) {
        deps.audio.play('truckSiren');
      }
    } else {
      registry.truckMarker.visible = false;
    }

    const speedRatio = Math.min(1, Math.hypot(t.vx, t.vz) / 18);
    const mouse = deps.input.consumeMouse();
    deps.cameras.update(dt, pos, yaw, deps.session().kind === 'singlePlayer' || deps.role() === 'driver' ? speedRatio : 0, deps.cameraQuery(), mouse);
    if (deps.session().kind === 'singlePlayer' || deps.role() === 'gunner') {
      const groundY = renderTank.y;
      const aim = deps.cameras.computeAim(deps.cameras.activeCam.camera, deps.cameraQuery(), groundY);
      const chassisYaw = deps.session().kind === 'singlePlayer' ? frame.tank.yaw : yaw;
      const limits = deps.prediction.turretPitchLimits();
      const solved = solveTurretAim(
        { x: pos.x, y: pos.y, z: pos.z, yaw },
        this.tankRig.rigDefinition,
        { x: aim.x, y: aim.y, z: aim.z },
        { minPitch: limits.minPitch, maxPitch: limits.maxPitch },
      );
      const worldYaw = wrapAngle(yaw + solved.desiredYawLocal);
      deps.prediction.updateTurretTarget(worldYaw, solved.desiredPitch, chassisYaw, dt);
      const predictedTurret = deps.prediction.getTurretSpaces();
      this.tankRig.turret.rotation.y = predictedTurret.predictedYawLocal;
      this.tankRig.barrel.rotation.x = -predictedTurret.predictedPitch;
      deps.onTrajectoryReticle?.(
        projectTrajectoryReticle({
          camera: deps.cameras.activeCam.camera,
          renderWidth: deps.world.renderer.domElement.clientWidth || window.innerWidth,
          renderHeight: deps.world.renderer.domElement.clientHeight || window.innerHeight,
          tank: { x: t.x, y: t.y, z: t.z, yaw },
          turretLocalYaw: predictedTurret.predictedYawLocal,
          turretPitch: predictedTurret.predictedPitch,
          rig: this.tankRig.rigDefinition,
          cameraQuery: deps.cameraQuery(),
          desiredPoint: { x: aim.x, y: aim.y, z: aim.z },
        }),
      );
    }
    if (deps.session().kind === 'singlePlayer') {
      deps.applySinglePlayerWeapons(dt);
    }

    if (t.drift && t.grounded && Math.random() < 0.3) {
      const side = Math.random() > 0.5 ? 1 : -1;
      deps.world.vfx.spawnBurst(
        t.x + Math.sin(yaw + side * Math.PI / 2) * 1.2,
        t.y + 0.15,
        t.z + Math.cos(yaw + side * Math.PI / 2) * 1.2,
        0x9a8462, 1, 1.2, 0.28, 0.5, -0.4,
      );
    }
    netcodeMetrics.worldSyncMs = performance.now() - t0;
  }

  getRenderTank(): { x: number; y: number; z: number; yaw: number; pitch: number; roll: number } | null {
    const t = this.lastRenderTank;
    return t ? { x: t.x, y: t.y, z: t.z, yaw: t.yaw, pitch: t.pitch, roll: t.roll } : null;
  }

  /** Full predicted tank state (used by PIP and diagnostics). */
  getPredictedTank(): TankState | null {
    return this.lastRenderTank;
  }

  reset(): void {
    this.snapBuffer.clear();
    this.latest = null;
    this.remoteFrame = null;
    this.remote.reset();
    this.renderClockStarted = false;
    this.renderTime = 0;
    this.lastRenderTank = null;
  }
}
