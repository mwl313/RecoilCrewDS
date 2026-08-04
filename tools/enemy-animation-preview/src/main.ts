import './styles.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AssetService } from '@app/client/assets';
import { EnemyAnimationController } from '@app/client/animation/enemyAnimationController';
import { createAnimationClipResolver, resetClipResolverWarnings } from '@app/client/animation/animationClipResolver';
import { animationTelemetry, resetAnimationTelemetry } from '@app/client/animation/animationTelemetry';
import { disposeOwnedMaterials } from '@app/client/animation/animationCleanup';
import { resolveEnemyPresentation } from '@app/client/animation/enemyPresentationResolver';
import { AnimationLodManager } from '@app/client/animation/animationLodSelector';
import {
  ENEMY_ANIMATION_ANIMATION_PROFILES,
  ENEMY_ANIMATION_CONTENT,
  ENEMY_ANIMATION_PRESENTATION_PROFILES,
} from '@app/generated/enemyAnimationContent.generated';
import { ENEMY_ANIMATION_ROLES, type EnemyAnimationRole } from '@app/shared/animation/animationRoles';
import type { EnemyAnimationLodTier } from '@app/shared/animation/animationProfileTypes';

const viewport = document.getElementById('viewport') as HTMLElement;
const controlsPanel = document.getElementById('controls') as HTMLElement;
const info = document.getElementById('info') as HTMLElement;
const profileLabel = document.getElementById('profile-label') as HTMLElement;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a3640);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
camera.position.set(8, 6, 10);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.appendChild(renderer.domElement);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 1.5, 0);

const hemi = new THREE.HemisphereLight(0xffe9c8, 0x3b3f45, 0.8);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9a0, 1.6);
sun.position.set(10, 14, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);
const ground = new THREE.GridHelper(40, 20, 0x4d6a78, 0x334a56);
ground.position.y = 0.01;
scene.add(ground);

const boundsHelper = new THREE.Box3Helper(new THREE.Box3(), 0xffb347);
const axesHelper = new THREE.AxesHelper(2);
const skeletonHelper = new THREE.SkeletonHelper(new THREE.Object3D());
skeletonHelper.visible = false;
scene.add(boundsHelper, axesHelper, skeletonHelper);

const state = {
  profileId: Object.keys(ENEMY_ANIMATION_PRESENTATION_PROFILES)[0],
  variant: 'near' as 'near' | 'far',
  role: 'idle' as EnemyAnimationRole,
  playing: true,
  loop: true,
  speed: 1,
  scrub: 0,
  hitFlash: false,
  moveSpeed: 0,
  attackCue: false,
  death: false,
  showSkeleton: false,
  showBounds: false,
  showOrigin: false,
  showGround: true,
  shadows: true,
  lodPreview: 'near' as 'near' | 'mid' | 'far',
  spawnCount: 1,
};

let assets: AssetService | null = null;
let hero: EnemyAnimationController | null = null;
let heroModel: THREE.Object3D | null = null;
let copies: EnemyAnimationController[] = [];
let copyModels: THREE.Object3D[] = [];
let updateMs = 0;
let cueSequence = 0;
const clock = new THREE.Clock();
const midAccumulator = new Map<number, number>();
const lodManager = new AnimationLodManager(
  ENEMY_ANIMATION_CONTENT.lodPolicies['animationLod.defaultHorde'] ??
    ENEMY_ANIMATION_CONTENT.lodPolicies[Object.keys(ENEMY_ANIMATION_CONTENT.lodPolicies)[0]],
);

function resolveCurrent() {
  return resolveEnemyPresentation({ presentationProfileId: state.profileId, type: '' });
}

function clearHero(): void {
  if (hero) {
    hero.dispose();
    hero = null;
  }
  if (heroModel) {
    disposeOwnedMaterials(heroModel);
    scene.remove(heroModel);
    heroModel = null;
  }
}

function clearCopies(): void {
  for (const c of copies) {
    c.dispose();
    disposeOwnedMaterials(c.model.root);
    scene.remove(c.model.root);
  }
  copies = [];
  copyModels = [];
}

function rebuildScene(): void {
  resetAnimationTelemetry();
  resetClipResolverWarnings();
  clearHero();
  clearCopies();
  const resolution = resolveCurrent();
  profileLabel.textContent = `${resolution.profile.label} (${resolution.profileId})`;
  const far = state.variant === 'far';
  const assetId = far && resolution.profile.farModelAssetId
    ? resolution.profile.farModelAssetId
    : resolution.profile.nearModelAssetId;
  const instance = assets!.createModelInstance(assetId, { cloneMaterials: true });
  heroModel = instance.root;
  scene.add(heroModel);
  if (!far && resolution.animationProfile && (instance.skinned || instance.source.animations.length > 0)) {
    hero = EnemyAnimationController.create(resolution.animationProfile, instance, 0.123);
  }
  hero?.previewRole(state.role);
  spawnCopies();
  updateHelpers();
}

function spawnCopies(): void {
  clearCopies();
  const resolution = resolveCurrent();
  const count = state.spawnCount - 1;
  if (count <= 0) return;
  const far = state.variant === 'far';
  for (let i = 0; i < count; i++) {
    const assetId = far && resolution.profile.farModelAssetId
      ? resolution.profile.farModelAssetId
      : resolution.profile.nearModelAssetId;
    const instance = assets!.createModelInstance(assetId, { cloneMaterials: true });
    const angle = (i / count) * Math.PI * 2;
    const radius = 3 + (i % 3);
    instance.root.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    instance.root.rotation.y = -angle;
    scene.add(instance.root);
    copyModels.push(instance.root);
    if (!far && resolution.animationProfile && (instance.skinned || instance.source.animations.length > 0)) {
      const c = EnemyAnimationController.create(resolution.animationProfile, instance, (i + 2) / (count + 2));
      c.previewRole(state.role);
      copies.push(c);
    }
  }
}

function updateHelpers(): void {
  if (!heroModel) return;
  skeletonHelper.visible = state.showSkeleton;
  if (state.showSkeleton) {
    scene.remove(skeletonHelper);
    skeletonHelper.root = heroModel;
    scene.add(skeletonHelper);
    skeletonHelper.update();
  }
  boundsHelper.visible = state.showBounds;
  if (state.showBounds) {
    boundsHelper.box.setFromObject(heroModel);
    boundsHelper.box.union(new THREE.Box3(new THREE.Vector3(-2, -0.1, -2), new THREE.Vector3(2, 3, 2)));
    boundsHelper.updateMatrixWorld();
  }
  axesHelper.visible = state.showOrigin;
  ground.visible = state.showGround;
  renderer.shadowMap.enabled = state.shadows;
  sun.castShadow = state.shadows;
  heroModel.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = state.shadows;
    mesh.receiveShadow = state.shadows;
  });
}

function updateAnimations(dt: number): void {
  const resolution = resolveCurrent();
  const t0 = performance.now();
  const far = state.variant === 'far';
  const attacking = state.attackCue;
  const presentationState = {
    alive: !state.death,
    state: attacking ? 'telegraph' : state.moveSpeed > 0.1 ? 'hunt' : 'idle',
    stateT: 0,
    speed: state.moveSpeed,
    telegraph: attacking ? 0.5 : 0,
    flash: state.hitFlash ? 0.1 : 0,
    airborne: false,
    cue: state.attackCue
      ? { sequence: ++cueSequence, actionId: 'enemy.attack.primary', startedAtTick: Math.round(clock.elapsedTime * 30), durationTicks: 30 }
      : null,
    currentTick: Math.round(clock.elapsedTime * 30),
  };

  const updateOne = (c: EnemyAnimationController, dtMs: number): void => {
    if (state.playing) {
      c.update(presentationState, dtMs);
    } else if (c.instance.currentAction) {
      c.instance.currentAction.time = state.scrub * c.instance.currentAction.getClip().duration;
      c.instance.mixer.update(0);
    }
  };

  if (hero) updateOne(hero, state.lodPreview === 'mid' ? 0 : dt);
  if (state.lodPreview === 'mid' && hero) {
    const acc = (midAccumulator.get(0) ?? 0) + dt;
    const interval = 1 / 12;
    if (acc >= interval) {
      hero.updateMixerWithDelta(acc);
      midAccumulator.set(0, 0);
    } else {
      midAccumulator.set(0, acc);
    }
  }
  if (state.lodPreview === 'far') {
    if (heroModel) {
      heroModel.rotation.z = Math.sin(clock.elapsedTime * 2) * 0.03;
      heroModel.position.y = Math.abs(Math.sin(clock.elapsedTime * 3)) * 0.06;
    }
  }
  if (!far) {
    for (const c of copies) updateOne(c, dt);
  }
  updateMs = performance.now() - t0;
}

function renderDiagnostics(): void {
  const resolution = resolveCurrent();
  const profile = resolution.profile;
  const animationProfile = resolution.animationProfile;
  const lines: string[] = [];
  lines.push(`profile: ${profile.id}`);
  lines.push(`near: ${profile.nearModelAssetId}${profile.farModelAssetId ? `\nfar: ${profile.farModelAssetId}` : ''}`);
  lines.push(`animation profile: ${animationProfile?.id ?? 'none'}`);
  lines.push(`resolved clips:`);
  if (animationProfile) {
    for (const [role, name] of Object.entries(animationProfile.clips)) {
      lines.push(`  ${role} -> ${name}`);
    }
  } else {
    lines.push('  (none)');
  }
  if (heroModel) {
    let meshes = 0;
    let triangles = 0;
    let materials = 0;
    let bones = 0;
    const matSet = new Set<THREE.Material>();
    heroModel.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        meshes++;
        const geo = mesh.geometry;
        const index = geo.getIndex();
        triangles += index ? index.count / 3 : geo.attributes.position.count / 3;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) matSet.add(m);
      }
      if ((o as THREE.Bone).isBone) bones++;
    });
    materials = matSet.size;
    lines.push(`model: ${meshes} meshes, ${Math.round(triangles)} triangles, ${materials} materials, ${bones} bones`);
    lines.push(`clips: ${hero?.model.source.animations.length ?? 0}`);
  }
  lines.push(`mixers: ${animationTelemetry.liveMixers} (hero + ${copies.length} copies)`);
  lines.push(`animation update: ${updateMs.toFixed(3)} ms`);
  lines.push(`draw calls: ${renderer.info.render.calls}`);
  lines.push(`triangles rendered: ${renderer.info.render.triangles}`);
  const activeLod = state.lodPreview;
  lines.push(`active LOD: ${activeLod} (near/mid have mixer, far has none)`);
  lines.push(`telemetry: mixers=${animationTelemetry.liveMixers} skinned=${animationTelemetry.liveSkinnedRoots} far=${animationTelemetry.liveRigidFarRoots} materials=${animationTelemetry.ownedMaterialClones}`);
  lines.push(`warnings: ${animationTelemetry.warnings}`);
  info.innerHTML = lines.join('\n');
}

function loop(): void {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  updateAnimations(dt);
  orbit.update();
  renderer.render(scene, camera);
  renderDiagnostics();
}

function resize(): void {
  const w = viewport.clientWidth || window.innerWidth;
  const h = viewport.clientHeight || window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function buildControls(): void {
  controlsPanel.textContent = '';
  const addLabel = (text: string): HTMLElement => {
    const label = document.createElement('label');
    label.textContent = text;
    controlsPanel.appendChild(label);
    return label;
  };
  const addSelect = (label: string, values: string[], get: () => string, set: (v: string) => void): void => {
    const sel = document.createElement('select');
    for (const v of values) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      sel.appendChild(opt);
    }
    sel.value = get();
    sel.addEventListener('change', () => {
      set(sel.value);
      rebuildScene();
    });
    addLabel(label).appendChild(sel);
  };
  const addNumber = (label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void): void => {
    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(get());
    input.addEventListener('change', () => set(Number(input.value)));
    addLabel(label).appendChild(input);
  };
  const addToggle = (label: string, get: () => boolean, set: (v: boolean) => void, rebuild = false): void => {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = get();
    box.addEventListener('change', () => {
      set(box.checked);
      if (rebuild) rebuildScene();
      else updateHelpers();
    });
    const labelEl = addLabel(label);
    labelEl.prepend(box);
  };

  addSelect('Presentation profile', Object.keys(ENEMY_ANIMATION_PRESENTATION_PROFILES), () => state.profileId, (v) => (state.profileId = v));
  addSelect('Model variant', ['near', 'far'], () => state.variant, (v) => (state.variant = v as 'near' | 'far'));
  addSelect('Semantic role', ENEMY_ANIMATION_ROLES as unknown as string[], () => state.role, (v) => {
    state.role = v as EnemyAnimationRole;
    hero?.previewRole(state.role);
    for (const c of copies) c.previewRole(state.role);
  });
  addSelect('LOD preview', ['near', 'mid', 'far'], () => state.lodPreview, (v) => (state.lodPreview = v as 'near' | 'mid' | 'far'));

  addToggle('Play', () => state.playing, (v) => (state.playing = v));
  addToggle('Loop', () => state.loop, (v) => {
    state.loop = v;
    const a = hero?.instance.currentAction;
    if (a) a.setLoop(state.loop ? THREE.LoopRepeat : THREE.LoopOnce, state.loop ? Infinity : 1);
  });
  addToggle('Skeleton helper', () => state.showSkeleton, (v) => (state.showSkeleton = v));
  addToggle('Bounds', () => state.showBounds, (v) => (state.showBounds = v));
  addToggle('Origin', () => state.showOrigin, (v) => (state.showOrigin = v));
  addToggle('Ground plane', () => state.showGround, (v) => (state.showGround = v));
  addToggle('Shadows', () => state.shadows, (v) => (state.shadows = v));
  addToggle('Hit flash', () => state.hitFlash, (v) => (state.hitFlash = v));
  addToggle('Attack cue', () => state.attackCue, (v) => (state.attackCue = v));
  addToggle('Death', () => state.death, (v) => {
    state.death = v;
    if (v) hero?.previewRole('death');
  });

  addNumber('Playback speed', 0.1, 4, 0.1, () => state.speed, (v) => {
    state.speed = v;
    const a = hero?.instance.currentAction;
    if (a) a.timeScale = v;
  });
  addNumber('Movement speed', 0, 12, 0.5, () => state.moveSpeed, (v) => (state.moveSpeed = v));
  addNumber('Spawn count', 1, 50, 1, () => state.spawnCount, (v) => {
    state.spawnCount = v;
    rebuildScene();
  });

  const scrub = document.createElement('input');
  scrub.type = 'range';
  scrub.min = '0';
  scrub.max = '1';
  scrub.step = '0.001';
  scrub.value = String(state.scrub);
  scrub.addEventListener('input', () => {
    state.scrub = Number(scrub.value);
    state.playing = false;
  });
  const scrubLabel = addLabel('Scrub normalized time');
  scrubLabel.appendChild(scrub);

  const restart = document.createElement('button');
  restart.textContent = 'Restart';
  restart.addEventListener('click', () => {
    state.playing = true;
    hero?.previewRole(state.role);
    for (const c of copies) c.previewRole(state.role);
  });
  controlsPanel.appendChild(restart);
}

window.addEventListener('resize', resize);
buildControls();
void AssetService.load().then((a) => {
  assets = a;
  rebuildScene();
  resize();
  loop();
});
