import * as THREE from 'three';
import { clamp, lerp, angleDiff, wrapAngle } from '../../shared/math';
import { SnapshotBuffer, interpolateMatchState, type SnapshotEnvelope } from '../../shared/net/interpolation';
import type { AssetService, TankRig } from '../assets';
import type { AudioManager } from '../audio';
import type { Collider } from '../arenaView';
import type { EnemyState, MatchState, Role, SimEvent, TankState } from '../../shared/types';
import type { CameraManager } from './cameraManager';
import type { EntityViewRegistry } from './entityViewRegistry';
import type { PredictionController } from './predictionController';
import type { RenderWorld } from './renderWorld';

export interface InputSource {
  key(name: string): boolean;
  button(name: string): boolean;
  consumeMouse(): { dx: number; dy: number };
}

export interface PresenterDeps {
  world: RenderWorld;
  assets: AssetService;
  registry: EntityViewRegistry;
  tankRig: TankRig;
  cameras: CameraManager;
  prediction: PredictionController;
  colliders: Collider[];
  input: InputSource;
  audio: AudioManager;
  mode: () => 'online' | 'practice';
  role: () => Role;
  practiceMatch: () => { state: MatchState } | null;
  time: () => number;
  applyPracticeWeapons(dt: number): void;
}

/**
 * NetworkStatePresenter owns snapshot buffering/interpolation (separate from
 * prediction) and syncs authoritative state into entity views, cameras, and
 * prediction. It never decides gameplay outcomes.
 */
export class NetworkStatePresenter {
  private readonly snapBuffer = new SnapshotBuffer<MatchState>();
  latest: MatchState | null = null;
  interpState: MatchState | null = null;
  private renderTime = 0;
  private renderClockStarted = false;
  private lastRenderTank: TankState | null = null;

  constructor(private readonly deps: PresenterDeps) {}

  setSnapshot(msg: SnapshotEnvelope<MatchState>): void {
    this.latest = msg.state;
    this.snapBuffer.push(msg);
    if (this.deps.mode() === 'online') {
      this.deps.prediction.applyMovementRules(msg.movement, msg.movementRulesRevision, msg.state.modifier);
    }
    if (!this.renderClockStarted) {
      this.renderClockStarted = true;
      this.renderTime = msg.serverTime - 0.1;
    }
    this.deps.prediction.reconcile(msg.state, msg.lastProcessedDriverInputSeq);
    this.deps.prediction.reconcileTurret(msg.seq, msg.state);
  }

  handleEvent(ev: SimEvent): void {
    void ev;
  }

  advanceRenderClock(dtRaw: number): void {
    if (this.deps.mode() !== 'online' || !this.renderClockStarted) return;
    this.renderTime += dtRaw;
    const latestEnv = this.snapBuffer.latest();
    if (latestEnv && this.renderTime > latestEnv.serverTime - 0.02) {
      this.renderTime = latestEnv.serverTime - 0.02;
    }
  }

  getInterpState(): MatchState | null {
    if (this.deps.mode() === 'practice') return this.deps.practiceMatch()?.state ?? this.latest;
    if (this.snapBuffer.length === 0) return this.latest;
    const pair = this.snapBuffer.pick(this.renderTime);
    if (!pair) return this.latest;
    return interpolateMatchState(pair.a.state, pair.b.state, pair.alpha);
  }

  computeInterp(): void {
    this.interpState = this.getInterpState();
  }

  syncWorld(state: MatchState, renderTank: TankState, dt: number): void {
    const deps = this.deps;
    const t = renderTank;
    this.lastRenderTank = renderTank;
    const pos = new THREE.Vector3(t.x, t.y, t.z);
    const yaw = t.yaw;
    deps.tankRig.chassis.position.copy(pos);
    deps.tankRig.chassis.rotation.set(-t.pitch, yaw, t.roll);
    const usePredictedTurret = deps.mode() === 'practice' || deps.role() === 'gunner';
    const turretSpaces = deps.prediction.getTurretSpaces();
    deps.tankRig.turret.rotation.y = usePredictedTurret ? turretSpaces.predictedYawLocal : turretSpaces.authoritativeYawLocal;
    deps.tankRig.barrel.rotation.x = -(usePredictedTurret ? turretSpaces.predictedPitch : turretSpaces.authoritativePitch);
    deps.registry.shieldMesh.position.copy(pos).add(new THREE.Vector3(0, 1.2, 0));
    deps.registry.shieldMesh.visible = t.shieldedT > 0;
    deps.registry.braceMesh.visible = t.brace;
    if (t.brace) deps.registry.braceMesh.position.copy(pos);

    const registry = deps.registry;
    const seen = new Set<number>();
    for (const e of state.enemies) {
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
    for (const p of state.pickups) {
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
    for (const sh of state.shells) {
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

    const truck = state.truck;
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
    deps.cameras.update(dt, pos, yaw, deps.mode() === 'practice' || deps.role() === 'driver' ? speedRatio : 0, deps.colliders, mouse);
    if (deps.mode() === 'practice' || deps.role() === 'gunner') {
      const groundY = state.tank.y;
      const aim = deps.cameras.computeAim(deps.cameras.activeCam.camera, deps.colliders, groundY);
      const pivot = pos.clone().add(new THREE.Vector3(0, 1.15, 0));
      const dx = aim.x - pivot.x;
      const dz = aim.z - pivot.z;
      const flat = Math.hypot(dx, dz) || 0.001;
      const worldYaw = Math.atan2(dx, dz);
      const chassisYaw = deps.mode() === 'practice' ? deps.practiceMatch()!.state.tank.yaw : yaw;
      const pitch = clamp(Math.atan2(aim.y - pivot.y, flat), -0.45, 0.5);
      deps.prediction.updateTurretTarget(worldYaw, pitch, chassisYaw, dt);
      deps.tankRig.turret.rotation.y = deps.prediction.getTurretSpaces().predictedYawLocal;
      deps.tankRig.barrel.rotation.x = -deps.prediction.getTurretSpaces().predictedPitch;
    }
    if (deps.mode() === 'practice') {
      deps.applyPracticeWeapons(dt);
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
    if (t.boosting && Math.random() < 0.5) {
      deps.world.vfx.spawnBurst(t.x - Math.sin(yaw) * 2.2, t.y + 0.5, t.z - Math.cos(yaw) * 2.2, 0x7fd4ff, 1, 2.5, 0.22, 0.4);
    }
  }

  getRenderTank(): { x: number; y: number; z: number; yaw: number; pitch: number; roll: number } | null {
    const t = this.lastRenderTank;
    return t ? { x: t.x, y: t.y, z: t.z, yaw: t.yaw, pitch: t.pitch, roll: t.roll } : null;
  }

  reset(): void {
    this.snapBuffer.clear();
    this.latest = null;
    this.interpState = null;
    this.renderClockStarted = false;
    this.renderTime = 0;
    this.lastRenderTank = null;
  }
}
