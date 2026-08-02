import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ARENA, groundHeightAt } from '../shared/arena';
import { clamp, lerp, angleDiff, wrapAngle } from '../shared/math';
import { interpolateMatchState, SnapshotBuffer, type SnapshotEnvelope } from '../shared/net/interpolation';
import { BASE_CONFIG } from '../shared/config';
import { Match } from '../shared/sim/match';
import type { EnemyState, MatchState, Role, ShellState, SimEvent, TankState } from '../shared/types';
import { ArenaView } from './arenaView';
import { GameAssets, buildTankRig, getMuzzleWorld, type TankRig } from './assets';
import { AudioManager } from './audio';
import { PipCamera } from './cameras';
import { DriverPredictor } from './predictor';
import { computeWorldAim, TpsCameraController, worldYawToLocal, type TpsCameraTuning } from './tpsCamera';
import { VfxSystem } from './vfx';

/** Minimal input surface consumed by the game each frame. */
export interface InputSource {
  key(name: string): boolean;
  button(name: string): boolean;
  consumeMouse(): { dx: number; dy: number };
}

interface EnemyRig {
  group: THREE.Group;
  model: THREE.Object3D;
  head?: THREE.Object3D;
  materials: THREE.MeshStandardMaterial[];
  telegraph: THREE.Group;
  telegraphMat: THREE.MeshBasicMaterial;
  deadT: number;
}

interface PickupRig {
  group: THREE.Group;
  model: THREE.Object3D;
}

interface ShellRig {
  group: THREE.Group;
  glow: THREE.Sprite;
  kind: string;
}

export class Game {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private arena: ArenaView;
  private vfx: VfxSystem;
  private audio: AudioManager;
  private assets: GameAssets;
  private tankRig: TankRig;
  private driverCam: TpsCameraController;
  private gunnerCam: TpsCameraController;
  private activeCam: TpsCameraController;
  private pipCam = new PipCamera();
  private pipRate = 3;
  private pipFrame = 0;
  private renderPass: RenderPass | null = null;

  private snapBuffer = new SnapshotBuffer<MatchState>();
  private latest: MatchState | null = null;
  private interpState: MatchState | null = null;
  private renderTime = 0;
  private renderClockStarted = false;
  private practiceMatch: Match | null = null;
  private role: Role = 'driver';
  private mode: 'online' | 'practice' = 'online';
  private desiredTurretYawLocal = Math.PI / 2;
  private desiredTurretPitch = 0.05;
  private predictedTurretYawLocal = Math.PI / 2;
  private predictedTurretPitch = 0.05;
  private authoritativeTurretYawLocal = Math.PI / 2;
  private authoritativeTurretPitch = 0.05;
  private turretReconcileSeq = 0;
  private cannonDown = false;
  private chargeDown = false;
  private mgDown = false;
  private predictor: DriverPredictor | null = null;
  private inputEnabled = true;
  private lastPredictInput: { throttle: number; steer: number; boost: boolean; brace: boolean } = { throttle: 0, steer: 0, boost: false, brace: false };
  private lastRenderYaw = 0;
  private lastRenderTank: TankState | null = null;
  private shake = 0;
  private slowMo = 0;
  private time = 0;
  private raf = 0;
  private running = false;
  private enemyRigs = new Map<number, EnemyRig>();
  private pickupRigs = new Map<number, PickupRig>();
  private shellRigs = new Map<number, ShellRig>();
  private barrelMeshes = new Map<number, THREE.Object3D>();
  private truckRig: THREE.Group;
  private truckMarker: THREE.Group;
  private shieldMesh: THREE.Mesh;
  private braceMesh: THREE.Group;
  private fpsSamples: number[] = [];
  private lastFpsT = 0;
  private fps = 60;
  private lowFpsTimer = 0;
  private quality = 'high';
  private sentAim = { yaw: 0, pitch: 0 };
  private inputSendT = 0;
  private inputSeq = 0;
  private input: InputSource;

  onSendInput: ((msg: Record<string, unknown>) => void) | null = null;
  onPauseRequest: (() => void) | null = null;
  onFrame: ((state: MatchState) => void) | null = null;
  private practiceViewRole: Role = 'driver';
  suppressAutoInput = false;

  constructor(container: HTMLElement, assets: GameAssets, audio: AudioManager, input: InputSource, onReady: () => void) {
    this.container = container;
    this.assets = assets;
    this.audio = audio;
    this.input = input;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.domElement.id = 'game-canvas';
    container.appendChild(this.renderer.domElement);
    this.setupScene();
    this.arena = new ArenaView(assets);
    this.scene.add(this.arena.group);
    this.vfx = new VfxSystem(this.scene);
    this.tankRig = buildTankRig(assets);
    this.scene.add(this.tankRig.chassis);
    const driverTuning: Partial<TpsCameraTuning> = {
      fov: 70,
      distance: 5.2,
      shoulderOffset: 0.65,
      speedFovBonus: 5.5,
    };
    const gunnerTuning: Partial<TpsCameraTuning> = {
      fov: 68,
      distance: 4.4,
      shoulderOffset: 0.55,
      shoulderHeight: 0.3,
      verticalArm: 0.55,
      speedFovBonus: 0,
    };
    this.driverCam = new TpsCameraController(driverTuning);
    this.gunnerCam = new TpsCameraController(gunnerTuning);
    this.activeCam = this.driverCam;
    this.driverCam.resize(w / h);
    this.gunnerCam.resize(w / h);
    this.truckRig = new THREE.Group();
    this.truckRig.add(assets.models.resolve('enemy.lootTruck'));
    this.truckRig.visible = false;
    this.scene.add(this.truckRig);
    this.truckMarker = this.makeMarker(0xffd94d, 1.3);
    this.truckMarker.visible = false;
    this.scene.add(this.truckMarker);
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0x5eeaff, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.shieldMesh.visible = false;
    this.scene.add(this.shieldMesh);
    this.braceMesh = new THREE.Group();
    const braceMat = new THREE.MeshStandardMaterial({ color: 0xffc35a, roughness: 0.5, metalness: 0.4, flatShading: true });
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 1.2), braceMat);
    b1.position.set(-1.35, 0.45, 0);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 1.2), braceMat);
    b2.position.set(1.35, 0.45, 0);
    this.braceMesh.add(b1, b2);
    this.braceMesh.visible = false;
    this.scene.add(this.braceMesh);
    this.setupPost();
    window.addEventListener('resize', this.onResize);
    onReady();
    this.lastFpsT = performance.now();
  }

  private setupScene() {
    this.scene.background = new THREE.Color(0x3d4c56);
    this.scene.fog = new THREE.Fog(0x3d4c56, 60, 150);
    const hemi = new THREE.HemisphereLight(0xffe9c8, 0x3b3f45, 0.85);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffd9a0, 1.9);
    sun.position.set(26, 34, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -50;
    sun.shadow.camera.right = 50;
    sun.shadow.camera.top = 50;
    sun.shadow.camera.bottom = -50;
    sun.shadow.camera.far = 90;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x7fb4c4, 0.5);
    fill.position.set(-20, 16, -24);
    this.scene.add(fill);
    const stars = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 90 }, () => new THREE.Vector3((Math.random() - 0.5) * 240, 60 + Math.random() * 90, (Math.random() - 0.5) * 240)),
      ),
      new THREE.PointsMaterial({ color: 0x9fb6c4, size: 0.7, transparent: true, opacity: 0.5, fog: false }),
    );
    this.scene.add(stars);
  }

  private setupPost() {
    try {
      const size = new THREE.Vector2();
      this.renderer.getSize(size);
      this.composer = new EffectComposer(this.renderer);
      this.renderPass = new RenderPass(this.scene, this.activeCam.camera);
      this.composer.addPass(this.renderPass);
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.65, 0.82);
      this.composer.addPass(this.bloom);
    } catch {
      this.composer = null;
      this.renderPass = null;
    }
  }

  setRole(role: Role) {
    this.role = role;
    this.activeCam = role === 'driver' ? this.driverCam : this.gunnerCam;
    // Reuse the composer pass set; only the camera reference changes.
    if (this.renderPass) this.renderPass.camera = this.activeCam.camera;
  }

  startOnline(role: Role) {
    this.mode = 'online';
    this.setRole(role);
    this.resetEntities();
    this.snapBuffer.clear();
    this.renderClockStarted = false;
    this.renderTime = 0;
    this.predictor = null;
    this.running = true;
    this.loop();
  }

  startPractice() {
    this.mode = 'practice';
    this.setRole('driver');
    this.practiceViewRole = 'driver';
    this.practiceMatch = new Match('practice-' + Date.now(), 'none');
    this.latest = this.practiceMatch.state;
    this.interpState = this.practiceMatch.state;
    this.resetEntities();
    this.predictor = null;
    this.running = true;
    this.loop();
  }

  private resetEntities() {
    for (const rig of this.enemyRigs.values()) this.scene.remove(rig.group);
    this.enemyRigs.clear();
    for (const rig of this.pickupRigs.values()) this.scene.remove(rig.group);
    this.pickupRigs.clear();
    for (const rig of this.shellRigs.values()) this.scene.remove(rig.group);
    this.shellRigs.clear();
    this.snapBuffer.clear();
    this.renderClockStarted = false;
    this.interpState = null;
    this.truckRig.visible = false;
    this.truckMarker.visible = false;
    this.shake = 0;
    this.slowMo = 0;
  }

  setSnapshot(msg: SnapshotEnvelope<MatchState>) {
    this.latest = msg.state;
    this.snapBuffer.push(msg);
    if (msg.movement && msg.movementRulesRevision !== undefined && this.mode === 'online' && this.role === 'driver') {
      if (!this.predictor) {
        this.predictor = new DriverPredictor(BASE_CONFIG, msg.state.modifier);
      }
      this.predictor.applyMovementRules(msg.movement, msg.movementRulesRevision);
    }
    if (!this.renderClockStarted) {
      this.renderClockStarted = true;
      this.renderTime = msg.serverTime - 0.1;
    }
    if (this.role === 'driver' && this.mode === 'online') {
      if (!this.predictor) {
        this.predictor = new DriverPredictor(BASE_CONFIG, msg.state.modifier);
      }
      this.predictor.reconcile(msg.state.tank, msg.lastProcessedDriverInputSeq);
    }
    // Turret reconciliation happens on snapshot arrival (not every frame).
    if (msg.seq > this.turretReconcileSeq) {
      this.turretReconcileSeq = msg.seq;
      this.authoritativeTurretYawLocal = msg.state.turret.yaw;
      this.authoritativeTurretPitch = msg.state.turret.pitch;
      if (this.role === 'gunner' && this.mode === 'online') {
        const diff = angleDiff(this.predictedTurretYawLocal, this.authoritativeTurretYawLocal);
        if (Math.abs(diff) > 1.2) {
          this.predictedTurretYawLocal = this.authoritativeTurretYawLocal;
          this.predictedTurretPitch = this.authoritativeTurretPitch;
        } else {
          this.predictedTurretYawLocal += diff * 0.2;
          this.predictedTurretPitch += (this.authoritativeTurretPitch - this.predictedTurretPitch) * 0.2;
        }
      }
    }
  }

  handleEvent(ev: SimEvent) {
    if (ev.type === 'shot') {
      if (ev.kind === 'mg' && ev.x !== undefined && ev.tx !== undefined) {
        this.vfx.spawnTracer(ev.x, ev.y!, ev.z!, ev.x + ev.tx * 34, ev.y! + ev.ty! * 34, ev.z! + ev.tz! * 34, 0xffe08a, 0.07);
        this.audio.play('machineGun');
      } else if (ev.kind === 'cannon') {
        this.vfx.spawnFlash(ev.x!, ev.y!, ev.z!, 0xffc36a, 1.6, 0.09);
        this.vfx.spawnBurst(ev.x!, ev.y!, ev.z!, 0xffb347, 20, 7, 0.35, 0.3, 8);
        this.audio.play('cannon');
        this.addShake(0.45);
      } else if (ev.kind === 'mgStart') {
        // placeholder
      }
    } else if (ev.type === 'mgHit') {
      this.vfx.spawnBurst(ev.x!, ev.y!, ev.z!, 0xffd27a, 6, 3, 0.18, 0.2, 6);
      this.audio.play('enemyHit');
    } else if (ev.type === 'hit' && ev.kind === 'tower') {
      this.audio.play('collision');
      this.addShake(0.25);
    } else if (ev.type === 'kill') {
      this.vfx.explosion(ev.x!, ev.y!, ev.z!, 0xff6a3d, false);
      this.vfx.smoke(ev.x!, ev.y!, ev.z!);
      this.audio.play('enemyDeath');
      if (ev.kind === 'lootTruck') this.audio.play('jackpotRelease');
    } else if (ev.type === 'enemyExplosion' || ev.type === 'barrelExplode') {
      const big = (ev.value ?? 3) > 5;
      this.vfx.explosion(ev.x!, ev.y!, ev.z!, 0xff8c3b, big);
      this.vfx.smoke(ev.x!, ev.y!, ev.z!, 0x555555, 5, 1.4);
      this.audio.play('enemyDeath');
      this.addShake(big ? 0.5 : 0.3);
    } else if (ev.type === 'chainExplode') {
      this.vfx.explosion(ev.x!, ev.y!, ev.z!, 0xffa040, false);
    } else if (ev.type === 'pickup') {
      const kind = ev.kind === 'jackpot' ? 'jackpot' : ev.kind === 'heavy' ? 'heavy' : 'normal';
      const color = kind === 'jackpot' ? 0xffe98a : kind === 'heavy' ? 0x7de05a : 0x4ddb6e;
      this.vfx.spawnBurst(ev.x!, ev.y!, ev.z!, color, 16, 6, 0.3, 0.4, 5);
      this.vfx.spawnRing(ev.x!, ev.y!, ev.z!, color, 2.2, 0.3);
      this.audio.play('scrapPickup', { kind });
    } else if (ev.type === 'wipeout') {
      this.vfx.explosion(ev.x!, ev.y!, ev.z!, 0xff5533, true);
      this.vfx.smoke(ev.x!, ev.y!, ev.z!, 0x333333, 12, 2);
      this.audio.play('wipeout');
      this.addShake(1.0);
    } else if (ev.type === 'respawn') {
      this.vfx.spawnRing(ev.x!, ev.y!, ev.z!, 0x5eeaff, 4, 0.5);
      this.audio.play('ui');
    } else if (ev.type === 'jackpotCharge') {
      this.audio.play('jackpotCharge');
    } else if (ev.type === 'jackpotFire') {
      this.vfx.spawnFlash(ev.x!, ev.y!, ev.z!, 0xfff2b0, 4.5, 0.25);
      this.audio.play('jackpotRelease');
      this.addShake(1.1);
    } else if (ev.type === 'jackpotImpact') {
      this.vfx.explosion(ev.x!, ev.y!, ev.z!, 0xffe98a, true);
      this.vfx.explosion(ev.x!, ev.y!, ev.z!, 0xffa040, true);
      this.vfx.spawnRing(ev.x!, ev.y!, ev.z!, 0xfff2b0, 12, 0.9);
      this.audio.play('wipeout');
      this.addShake(1.5);
      this.slowMo = 0.75;
    } else if (ev.type === 'rammerTelegraph') {
      this.audio.play('rammerTelegraph');
    } else if (ev.type === 'towerFire') {
      this.audio.play('towerFire');
      if (ev.x !== undefined && ev.tx !== undefined) {
        this.vfx.spawnTracer(ev.x, ev.y!, ev.z!, ev.tx, ev.ty!, ev.tz!, 0xff5a4a, 0.5);
      }
    } else if (ev.type === 'truckSpawn') {
      this.audio.play('truckSiren');
    } else if (ev.type === 'truckEscape') {
      this.audio.play('collision');
    } else if (ev.type === 'crash') {
      this.audio.play('collision');
      this.addShake(0.3);
    } else if (ev.type === 'assist' || ev.type === 'link' || ev.type === 'score') {
      // HUD handles popups.
    } else if (ev.type === 'comboChange') {
      // HUD pulse.
    }
  }

  private addShake(v: number) {
    this.shake = Math.min(1.6, this.shake + v);
  }

  private makeMarker(color: number, size: number): THREE.Group {
    const g = new THREE.Group();
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(size, size * 2.4, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    cone.rotation.x = Math.PI;
    cone.position.y = size * 2;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, size * 2, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }),
    );
    pole.position.y = size;
    g.add(cone, pole);
    return g;
  }

  private getInterpState(): MatchState | null {
    if (this.mode === 'practice') return this.practiceMatch?.state ?? this.latest;
    if (this.snapBuffer.length === 0) return this.latest;
    const pair = this.snapBuffer.pick(this.renderTime);
    if (!pair) return this.latest;
    return interpolateMatchState(pair.a.state, pair.b.state, pair.alpha);
  }

  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dtRaw = Math.min(0.05, (now - this.lastFpsT) / 1000);
    this.time += dtRaw;
    const dt = dtRaw * (this.slowMo > 0 ? 0.32 : 1);
    this.slowMo = Math.max(0, this.slowMo - dtRaw);
    this.shake = Math.max(0, this.shake - dtRaw * 1.4);
    this.fps = lerp(this.fps, 1 / Math.max(0.0001, dtRaw), 0.06);
    this.fpsSamples.push(this.fps);
    if (this.fpsSamples.length > 120) this.fpsSamples.shift();
    this.adaptQuality();

    if (this.mode === 'practice' && this.practiceMatch) {
      this.stepPractice(dtRaw);
      this.latest = this.practiceMatch.state;
    }
    this.lastFpsT = now;

    if (this.mode === 'online' && this.renderClockStarted) {
      this.renderTime += dtRaw;
      const latestEnv = this.snapBuffer.latest();
      if (latestEnv && this.renderTime > latestEnv.serverTime - 0.02) {
        this.renderTime = latestEnv.serverTime - 0.02;
      }
    }
    this.interpState = this.getInterpState();
    this.lastPredictInput = this.sampleDriverInput();
    let renderTank: TankState | null = null;
    if (this.interpState) {
      if (this.mode === 'practice') {
        renderTank = this.interpState.tank;
      } else if (this.role === 'driver') {
        if (this.predictor) {
          this.predictor.sampleInput(this.lastPredictInput, dtRaw);
          this.predictor.smooth(dtRaw);
          const d = this.predictor.display;
          renderTank = {
            ...this.interpState.tank,
            x: d.x, y: d.y, z: d.z, vx: d.vx, vy: d.vy, vz: d.vz,
            yaw: d.yaw, yawVel: d.yawVel, pitch: d.pitch, roll: d.roll,
            grounded: d.grounded, boosting: d.boosting, brace: d.brace, drift: d.drift,
          };
        } else {
          renderTank = this.interpState.tank;
        }
      } else {
        renderTank = this.interpState.tank;
      }
    }
    if (this.interpState && renderTank) {
      this.syncWorld(this.interpState, renderTank, dt);
    }
    if (this.latest) this.onFrame?.(this.latest);

    // Input send for online mode.
    if (this.mode === 'online' && this.onSendInput) {
      this.inputSendT -= dtRaw;
      if (this.inputSendT <= 0) {
        this.inputSendT = 0.05;
        this.sendInputs();
      }
    }

    this.vfx.update(dt);
    this.audio.setEngine(this.latest ? Math.min(1, Math.hypot(this.latest.tank.vx, this.latest.tank.vz) / 20) : 0, this.latest?.tank.boosting ?? false);
    this.audio.setMusicIntensity(this.latest ? clamp(this.latest.time / 90 * 1.15, 0, 1.25) : 0);

    this.renderFrame(now);
  };

  private stepPractice(dt: number) {
    const m = this.practiceMatch!;
    if (m.state.phase !== 'running' || !this.inputEnabled) return;
    m.setDriverInput({
      ...this.sampleDriverInput(),
    });
    m.setGunnerInput({
      aimYaw: this.desiredTurretYawLocal,
      aimPitch: this.desiredTurretPitch,
      mg: this.mouseDown('mg'),
      cannon: this.mouseDown('cannon') && !m.state.turret.jackpotReady,
      charge: this.mouseDown('cannon') && m.state.turret.jackpotReady,
    });
    // Accumulate fixed steps.
    this.practiceAcc += dt;
    const step = 1 / 30;
    let guard = 0;
    while (this.practiceAcc >= step && guard++ < 6) {
      this.practiceAcc -= step;
      m.step(step);
      for (const ev of m.takeEvents()) {
        this.handleEvent(ev);
      }
      if ((m.state.phase as string) === 'results' && !this.practiceResultsShown) {
        this.practiceResultsShown = true;
        this.onPracticeResults?.(m.results!);
      }
    }
  }
  private practiceAcc = 0;
  private practiceResultsShown = false;
  onPracticeResults: ((results: { score: number; bestCombo: number; jackpotFired: number; kills: number; scrapCollected: number; links: number; wipeouts: number; grade: string; title: string; modifier: string }) => void) | null = null;

  private adaptQuality() {
    if (this.fpsSamples.length < 60) return;
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    if (avg < 42 && this.quality === 'high') {
      this.quality = 'low';
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      this.renderer.shadowMap.autoUpdate = false;
      if (this.bloom) this.bloom.strength = 0.18;
      this.pipRate = 5;
    } else if (avg > 55 && this.quality === 'low' && this.fpsSamples.length > 240) {
      this.quality = 'high';
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.autoUpdate = true;
      if (this.bloom) this.bloom.strength = 0.55;
      this.pipRate = 3;
      this.fpsSamples = [];
    }
  }

  private sendInputs() {
    if (!this.onSendInput) return;
    if (this.suppressAutoInput) return;
    if (this.role === 'driver') {
      const input = this.sampleDriverInput();
      const seq = ++this.inputSeq;
      this.predictor?.pushInput(seq, input);
      this.onSendInput({ t: 'input', seq, driver: input });
    } else {
      this.onSendInput({
        t: 'input',
        seq: ++this.inputSeq,
        gunner: {
          aimYaw: this.desiredTurretYawLocal,
          aimPitch: this.desiredTurretPitch,
          mg: this.mouseDown('mg'),
          cannon: this.mouseDown('cannon') && !(this.latest?.turret.jackpotReady ?? false),
          charge: this.mouseDown('cannon') && (this.latest?.turret.jackpotReady ?? false),
        },
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

  /** Test automation hook: push authoritative-bound input without local keys. */
  injectOnlineInput(role: Role, data: {
    throttle?: number;
    steer?: number;
    boost?: boolean;
    brace?: boolean;
    aimYaw?: number;
    aimPitch?: number;
    mg?: boolean;
    cannon?: boolean;
    charge?: boolean;
  }) {
    if (this.mode !== 'online' || !this.onSendInput) return;
    const msg: Record<string, unknown> = { t: 'input', seq: ++this.inputSeq };
    if (role === 'driver') {
      msg.driver = {
        throttle: data.throttle ?? 0,
        steer: data.steer ?? 0,
        boost: !!data.boost,
        brace: !!data.brace,
      };
    } else {
      msg.gunner = {
        aimYaw: data.aimYaw ?? this.desiredTurretYawLocal,
        aimPitch: data.aimPitch ?? this.desiredTurretPitch,
        mg: !!data.mg,
        cannon: !!data.cannon,
        charge: !!data.charge,
      };
    }
    this.onSendInput(msg);
  }

  recenter() {
    this.activeCam.requestRecenter(this.lastRenderYaw);
  }

  togglePracticeView() {
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

  private syncWorld(state: MatchState, renderTank: TankState, dt: number) {
    const t = renderTank;
    this.lastRenderTank = renderTank;
    const pos = new THREE.Vector3(t.x, t.y, t.z);
    const yaw = t.yaw;
    this.lastRenderYaw = yaw;
    this.tankRig.chassis.position.copy(pos);
    this.tankRig.chassis.rotation.set(-t.pitch, yaw, t.roll);
    // Authoritative turret arrives chassis-local; chassis yaw is added exactly
    // once, at world-muzzle computation.
    this.authoritativeTurretYawLocal = state.turret.yaw;
    this.authoritativeTurretPitch = state.turret.pitch;
    const usePredictedTurret = this.mode === 'practice' || this.role === 'gunner';
    this.tankRig.turret.rotation.y = usePredictedTurret ? this.predictedTurretYawLocal : this.authoritativeTurretYawLocal;
    this.tankRig.barrel.rotation.x = -(usePredictedTurret ? this.predictedTurretPitch : this.authoritativeTurretPitch);
    this.shieldMesh.position.copy(pos).add(new THREE.Vector3(0, 1.2, 0));
    this.shieldMesh.visible = t.shieldedT > 0;
    this.braceMesh.visible = t.brace;
    if (t.brace) this.braceMesh.position.copy(pos);

    // Enemies.
    const seen = new Set<number>();
    for (const e of state.enemies) {
      seen.add(e.id);
      let rig = this.enemyRigs.get(e.id);
      if (!rig) {
        rig = this.createEnemyRig(e);
        this.enemyRigs.set(e.id, rig);
      }
      rig.group.visible = e.alive || e.state === 'dead';
      if (e.alive || e.state === 'dead') {
        rig.group.position.set(e.x, e.y, e.z);
        rig.group.rotation.y = e.yaw;
        if (rig.head) rig.head.rotation.y = e.aimYaw - e.yaw;
        rig.deadT = e.alive ? 0 : rig.deadT + dt;
        if (!e.alive && rig.deadT > 1.2) rig.group.visible = false;
        // Hit flash.
        const flash = e.flash > 0 ? 1.4 : 0;
        for (const mat of rig.materials) {
          mat.emissiveIntensity = flash + (e.type === 'rammer' && e.state === 'telegraph' ? 0.7 : 0);
          mat.emissive.setHex(e.type === 'gunTower' ? 0xff3b3b : e.type === 'rammer' ? 0xffb020 : 0xff2d2d);
        }
        if (e.type === 'gunTower') {
          const telegraphOn = e.telegraph > 0;
          rig.telegraph.visible = telegraphOn;
          if (telegraphOn) {
            rig.telegraph.position.set(e.x, 0.04, e.z);
            const pulse = 0.5 + 0.5 * Math.sin(this.time * 18);
            rig.telegraphMat.opacity = 0.4 + pulse * 0.5;
          }
        }
        if (e.type === 'rammer') {
          rig.telegraph.visible = e.telegraph > 0;
          if (e.telegraph > 0) {
            rig.telegraph.position.set(e.x, 0.04, e.z);
            rig.telegraph.rotation.y = e.aimYaw;
            rig.telegraphMat.opacity = 0.45 + Math.sin(this.time * 20) * 0.3;
          }
        }
      }
    }
    for (const [id, rig] of this.enemyRigs) {
      if (!seen.has(id)) {
        this.scene.remove(rig.group);
        this.enemyRigs.delete(id);
      }
    }

    // Pickups.
    const seenPickups = new Set<number>();
    for (const p of state.pickups) {
      if (p.collected) continue;
      seenPickups.add(p.id);
      let rig = this.pickupRigs.get(p.id);
      if (!rig) {
        rig = this.createPickupRig(p.kind);
        this.pickupRigs.set(p.id, rig);
      }
      rig.group.position.set(p.x, p.y + Math.sin(this.time * 2.8 + p.id) * 0.12, p.z);
      rig.model.rotation.y += dt * 2.2;
    }
    for (const [id, rig] of this.pickupRigs) {
      if (!seenPickups.has(id)) {
        this.scene.remove(rig.group);
        this.pickupRigs.delete(id);
      }
    }

    // Shells.
    const seenShells = new Set<number>();
    for (const sh of state.shells) {
      seenShells.add(sh.id);
      let rig = this.shellRigs.get(sh.id);
      if (!rig) {
        rig = this.createShellRig(sh);
        this.shellRigs.set(sh.id, rig);
      }
      rig.group.position.set(sh.x, sh.y, sh.z);
    }
    for (const [id, rig] of this.shellRigs) {
      if (!seenShells.has(id)) {
        this.scene.remove(rig.group);
        this.shellRigs.delete(id);
      }
    }

    // Barrels.
    for (const b of state.barrels) {
      const mesh = this.barrelMeshes.get(b.id);
      if (mesh) mesh.visible = !b.exploded;
    }

    // Truck.
    const truck = state.truck;
    this.truckRig.visible = truck.active;
    if (truck.active) {
      this.truckRig.position.set(truck.x, truck.y, truck.z);
      this.truckRig.rotation.y = truck.yaw;
      this.truckMarker.position.set(truck.x, truck.y + 3.6, truck.z);
      this.truckMarker.visible = true;
      this.truckMarker.rotation.y = this.time * 2.2;
      if (Math.sin(truck.sirenT * 7) > 0.4 && Math.random() < 0.03) {
        this.audio.play('truckSiren');
      }
    } else {
      this.truckMarker.visible = false;
    }

    // Cameras: separate Driver and Gunner rigs; local only, never networked.
    const speedRatio = Math.min(1, Math.hypot(t.vx, t.vz) / 18);
    const m = this.input.consumeMouse();
    this.activeCam.applyMouseDelta(m.dx, m.dy);
    this.activeCam.setFollowPose(pos, yaw);
    this.activeCam.update(dt, this.arena.colliders, this.mode === 'practice' || this.role === 'driver' ? speedRatio : 0);
    if (this.mode === 'practice' || this.role === 'gunner') {
      // Final collision-adjusted camera center ray → world aim point →
      // chassis-local desired turret angles → finite-rate prediction.
      const groundY = state.tank.y;
      const aim = computeWorldAim(this.activeCam.camera, this.arena.colliders, groundY);
      const pivot = pos.clone().add(new THREE.Vector3(0, 1.15, 0));
      const dx = aim.x - pivot.x;
      const dz = aim.z - pivot.z;
      const flat = Math.hypot(dx, dz) || 0.001;
      const worldYaw = Math.atan2(dx, dz);
      const chassisYaw = this.mode === 'practice' ? this.practiceMatch!.state.tank.yaw : yaw;
      this.desiredTurretYawLocal = worldYawToLocal(worldYaw, chassisYaw);
      this.desiredTurretPitch = clamp(Math.atan2(aim.y - pivot.y, flat), -0.45, 0.5);
      const turnRate = 4.6;
      this.predictedTurretYawLocal += clamp(
        angleDiff(this.predictedTurretYawLocal, this.desiredTurretYawLocal),
        -turnRate * dt,
        turnRate * dt,
      );
      this.predictedTurretPitch += clamp(this.desiredTurretPitch - this.predictedTurretPitch, -turnRate * dt, turnRate * dt);
      this.tankRig.turret.rotation.y = this.predictedTurretYawLocal;
      this.tankRig.barrel.rotation.x = -this.predictedTurretPitch;
    }
    if (this.mode === 'practice') {
      this.applyPracticeWeapons(dt);
    }

    // Drift/boost dust.
    if (t.drift && t.grounded && Math.random() < 0.3) {
      const side = Math.random() > 0.5 ? 1 : -1;
      this.vfx.spawnBurst(
        t.x + Math.sin(yaw + side * Math.PI / 2) * 1.2,
        t.y + 0.15,
        t.z + Math.cos(yaw + side * Math.PI / 2) * 1.2,
        0x9a8462, 1, 1.2, 0.28, 0.5, -0.4,
      );
    }
    if (t.boosting && Math.random() < 0.5) {
      this.vfx.spawnBurst(t.x - Math.sin(yaw) * 2.2, t.y + 0.5, t.z - Math.cos(yaw) * 2.2, 0x7fd4ff, 1, 2.5, 0.22, 0.4);
    }
  }

  private applyPracticeWeapons(dt: number) {
    const m = this.practiceMatch!;
    const state = m.state;
    if (state.tank.deadT > 0) return;
    const mg = this.mouseDown('mg');
    const cannon = this.mouseDown('cannon') && !state.turret.jackpotReady;
    const charge = this.mouseDown('cannon') && state.turret.jackpotReady;
    if (mg && state.turret.mgCooldown <= 0) {
      const muzzle = this.tankRig.barrel.localToWorld(new THREE.Vector3(0, 0.75, 2.9).clone());
      this.vfx.spawnFlash(muzzle.x, muzzle.y, muzzle.z, 0xffe08a, 0.7, 0.05);
      this.audio.play('machineGun');
    }
    if (cannon && !this.cannonDown && state.turret.cannonCooldown <= 0) {
      this.tankRig.chassis.updateMatrixWorld(true);
      const muzzle = getMuzzleWorld(this.tankRig);
      this.vfx.spawnFlash(muzzle.x, muzzle.y, muzzle.z, 0xffc36a, 1.6, 0.09);
      this.audio.play('cannon');
      this.addShake(0.45);
    }
    if (charge && !this.chargeDown && state.turret.jackpotReady) {
      this.audio.play('jackpotCharge');
    }
    this.cannonDown = cannon;
    this.chargeDown = charge;
    this.mgDown = mg;
    void dt;
  }

  private createEnemyRig(e: EnemyState): EnemyRig {
    const idByType: Record<string, string> = {
      scrapBug: 'enemy.scrapBug',
      rammer: 'enemy.rammer',
      gunTower: 'enemy.gunTower',
      lootTruck: 'enemy.lootTruck',
    };
    const model = this.assets.models.resolve(idByType[e.type]).clone(true);
    const group = new THREE.Group();
    group.add(model);
    if (e.type === 'lootTruck') group.scale.setScalar(1.15);
    this.scene.add(group);
    const materials: THREE.MeshStandardMaterial[] = [];
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat && mat.isMeshStandardMaterial) materials.push(mat);
      }
    });
    let head: THREE.Object3D | undefined;
    if (e.type === 'gunTower') {
      head = model.getObjectByName('towerHead') ?? undefined;
    }
    const telegraph = new THREE.Group();
    let telegraphMat!: THREE.MeshBasicMaterial;
    if (e.type === 'rammer') {
      telegraphMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.4, depthWrite: false });
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(1.7, 0.5, 20),
        telegraphMat,
      );
      cone.rotation.x = Math.PI / 2;
      cone.position.y = 0.06;
      telegraph.add(cone);
      telegraph.visible = false;
    } else if (e.type === 'gunTower') {
      telegraphMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.6, 2.2, 28),
        telegraphMat,
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      telegraph.add(ring);
      telegraph.visible = false;
    }
    this.scene.add(telegraph);
    return { group, model, head, materials, telegraph, telegraphMat, deadT: 0 };
  }

  private createPickupRig(kind: string): PickupRig {
    const id = kind === 'jackpot' ? 'pickup.jackpotScrap' : kind === 'heavy' ? 'pickup.heavyScrap' : 'pickup.normalScrap';
    const model = this.assets.models.resolve(id).clone(true);
    const group = new THREE.Group();
    group.add(model);
    this.scene.add(group);
    return { group, model };
  }

  private createShellRig(sh: ShellState): ShellRig {
    const group = new THREE.Group();
    const mat = new THREE.SpriteMaterial({
      color: sh.kind === 'jackpot' ? 0xfff2b0 : 0xffb45e,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Sprite(mat);
    glow.scale.setScalar(sh.kind === 'jackpot' ? 1.6 : 0.7);
    group.add(glow);
    if (sh.kind === 'jackpot') {
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xfff7d0 }),
      );
      group.add(core);
    } else if (sh.kind === 'tower') {
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xff5a4a }),
      );
      group.add(core);
    } else {
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffcf8a }),
      );
      group.add(core);
    }
    this.scene.add(group);
    return { group, glow, kind: sh.kind };
  }

  private renderFrame(now: number) {
    const w = this.renderer.domElement.clientWidth || window.innerWidth;
    const h = this.renderer.domElement.clientHeight || window.innerHeight;
    // Camera shake.
    if (this.shake > 0.001) {
      const s = this.shake;
      this.activeCam.camera.position.x += (Math.random() - 0.5) * s * 0.35;
      this.activeCam.camera.position.y += (Math.random() - 0.5) * s * 0.3;
      this.activeCam.camera.position.z += (Math.random() - 0.5) * s * 0.35;
    }
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.activeCam.camera);
    }
    // PIP in the bottom-right corner.
    this.pipFrame++;
    if (this.pipFrame % this.pipRate === 0) {
      this.renderPip(w, h);
    }
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.setScissorTest(false);
  }

  private renderPip(w: number, h: number) {
    const state = this.latest;
    if (!state) return;
    const tank = state.tank;
    const pos = new THREE.Vector3(tank.x, tank.y, tank.z);
    const pipRole: 'driver' | 'gunner' = this.role === 'driver' ? 'gunner' : 'driver';
    this.pipCam.update(1 / 30, pos, tank.yaw, tank.yaw + state.turret.yaw, pipRole);
    const pr = this.renderer.getPixelRatio();
    const pw = Math.round(w * 0.2 * pr);
    const ph = Math.round(pw * 9 / 16);
    const px = Math.round((w - pw / pr - 14) * pr);
    const py = Math.round((h - ph / pr - 14) * pr);
    this.renderer.setViewport(px, py, pw, ph);
    this.renderer.setScissor(px, py, pw, ph);
    this.renderer.setScissorTest(true);
    this.renderer.render(this.scene, this.pipCam.camera);
  }

  private onResize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.driverCam.resize(w / h);
    this.gunnerCam.resize(w / h);
    if (this.composer) this.composer.setSize(w, h);
  };

  requestPause() {
    this.onPauseRequest?.();
  }

  getCanvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  projectWorld(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(x, y, z).project(this.activeCam.camera);
    const w = this.renderer.domElement.clientWidth || window.innerWidth;
    const h = this.renderer.domElement.clientHeight || window.innerHeight;
    return {
      x: ((v.x + 1) / 2) * w,
      y: ((1 - v.y) / 2) * h,
      visible: v.z < 1 && v.x > -1.15 && v.x < 1.15 && v.y > -1.15 && v.y < 1.15,
    };
  }

  /** Overlays/teardown disable gameplay input; practice sim pauses. */
  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    if (!enabled) {
      this.lastPredictInput = { throttle: 0, steer: 0, boost: false, brace: false };
    }
  }

  /** Test hook: currently rendered tank pose (predicted for online Driver). */
  getRenderTank(): { x: number; y: number; z: number; yaw: number; pitch: number; roll: number } | null {
    const t = this.lastRenderTank;
    return t ? { x: t.x, y: t.y, z: t.z, yaw: t.yaw, pitch: t.pitch, roll: t.roll } : null;
  }

  /** Test hook: current EffectComposer pass count (must not accumulate). */
  composerPassCount(): number {
    return this.composer?.passes.length ?? 0;
  }

  /** Test hook: turret spaces for direction/aim assertions. */
  getTurretSpaces() {
    return {
      desiredYawLocal: this.desiredTurretYawLocal,
      predictedYawLocal: this.predictedTurretYawLocal,
      authoritativeYawLocal: this.authoritativeTurretYawLocal,
      desiredPitch: this.desiredTurretPitch,
      predictedPitch: this.predictedTurretPitch,
    };
  }

  /** Test hook: active local camera yaw/pitch (never networked). */
  getCameraState() {
    return {
      yaw: this.activeCam.yaw,
      pitch: this.activeCam.pitch,
      recentering: this.activeCam.recentering,
      recenterTargetYaw: (this.activeCam as unknown as { recenterTargetYaw?: number }).recenterTargetYaw,
      lastRenderYaw: this.lastRenderYaw,
    };
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
