import './styles.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AssetService } from '@app/client/assets';
import { EnemyAnimationController } from '@app/client/animation/enemyAnimationController';
import {
  auditMonsterMaterials,
  prepareMonsterMaterials,
} from '@app/client/materials/monsterMaterialPolicy';
import { ENEMY_ANIMATION_PRESENTATION_PROFILES } from '@app/generated/enemyAnimationContent.generated';
import { resolveEnemyPresentation } from '@app/client/animation/enemyPresentationResolver';

const viewport = document.getElementById('viewport') as HTMLElement;
const controls = document.getElementById('controls') as HTMLElement;
const info = document.getElementById('info') as HTMLElement;
const profileLabel = document.getElementById('profile-label') as HTMLElement;
document.body.classList.add('material-debug');
profileLabel.textContent = 'MONSTER MATERIAL PIPELINE';
controls.innerHTML = `
  <h3>Comparison contract</h3>
  <p>All three views use the same GLB, camera, pose, transform, and source base color.</p>
  <ol><li>Unlit / base color</li><li>Neutral PBR</li><li>Production game lighting</li></ol>
  <p>Use <code>?materialDebug=1&amp;profile=&lt;id&gt;</code> to select another profile.</p>
`;

const params = new URLSearchParams(window.location.search);
const requestedProfile = params.get('profile') ?? 'enemyPresentation.quaternius.mushnub.hero';
const profileId = ENEMY_ANIMATION_PRESENTATION_PROFILES[requestedProfile]
  ? requestedProfile
  : Object.keys(ENEMY_ANIMATION_PRESENTATION_PROFILES)[0];
const resolution = resolveEnemyPresentation({ presentationProfileId: profileId, type: '' });
const assetId = resolution.profile.nearModelAssetId;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x53636b);
scene.fog = new THREE.Fog(0x53636b, 115, 190);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
camera.position.set(0, 3.6, 13.5);
camera.layers.enableAll();
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
viewport.appendChild(renderer.domElement);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 1.5, 0);
orbit.enablePan = false;

const neutralHemi = new THREE.HemisphereLight(0xffffff, 0xa7adaa, 1.6);
neutralHemi.layers.set(1);
const neutralKey = new THREE.DirectionalLight(0xffffff, 1.25);
neutralKey.position.set(7, 10, 8);
neutralKey.layers.set(1);
scene.add(neutralHemi, neutralKey);

const gameHemi = new THREE.HemisphereLight(0xfff5e8, 0x87918d, 1.45);
gameHemi.layers.set(2);
const gameSun = new THREE.DirectionalLight(0xffddad, 1.35);
gameSun.position.set(26, 34, 12);
gameSun.layers.set(2);
gameSun.castShadow = true;
const gameFill = new THREE.DirectionalLight(0xa7d3dc, 0.85);
gameFill.position.set(-20, 16, -24);
gameFill.layers.set(2);
scene.add(gameHemi, gameSun, gameFill);

const labelLayer = document.createElement('div');
labelLayer.className = 'material-labels';
labelLayer.innerHTML = '<span>UNLIT / BASE COLOR</span><span>NEUTRAL PBR</span><span>GAME LIGHTING</span>';
viewport.appendChild(labelLayer);

const controllers: EnemyAnimationController[] = [];
const assets = await AssetService.load();
await assets.preloadModels([assetId]);
const sourceAudit = auditMonsterMaterials(assets.modelAsset(assetId).scene);
const xs = [-3.8, 0, 3.8];
const models = xs.map((x, index) => {
  const instance = assets.createModelInstance(assetId, { cloneMaterials: true });
  const root = instance.root;
  if (index === 0) convertToUnlit(root);
  else prepareMonsterMaterials(root);
  root.layers.set(index);
  root.traverse((child) => child.layers.set(index));
  normalizeForPanel(root, x);
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = index === 2;
    mesh.receiveShadow = index === 2;
  });
  scene.add(root);
  if (resolution.animationProfile && (instance.skinned || instance.source.animations.length > 0)) {
    const controller = EnemyAnimationController.create(resolution.animationProfile, instance, 0.23);
    controller.previewRole('idle');
    controllers.push(controller);
  }
  return root;
});

for (let index = 0; index < 3; index++) {
  const mat = new THREE.MeshStandardMaterial({ color: index === 2 ? 0x53615a : 0x737b77, roughness: 0.9 });
  mat.fog = index === 2;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.65, 40), mat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(xs[index], 0.005, 0);
  floor.layers.set(index);
  floor.receiveShadow = index === 2;
  scene.add(floor);
}

const correctedAudit = auditMonsterMaterials(models[1]);
const diagnostics = {
  profileId,
  assetId,
  source: sourceAudit,
  corrected: correctedAudit,
  renderer: {
    outputColorSpace: renderer.outputColorSpace,
    toneMapping: renderer.toneMapping,
    exposure: renderer.toneMappingExposure,
  },
  gameLighting: {
    hemisphere: { sky: '#fff5e8', ground: '#87918d', intensity: 1.45 },
    sun: { color: '#ffddad', intensity: 1.35 },
    fill: { color: '#a7d3dc', intensity: 0.85 },
    fog: { color: '#53636b', near: 115, far: 190 },
  },
};
(window as unknown as Record<string, unknown>).__monsterMaterialDebug = diagnostics;
info.textContent = JSON.stringify(diagnostics, null, 2);

const clock = new THREE.Clock();
function frame(): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  for (const controller of controllers) controller.advance(dt);
  orbit.update();
  renderer.render(scene, camera);
}

function resize(): void {
  const width = viewport.clientWidth || window.innerWidth;
  const height = viewport.clientHeight || window.innerHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
frame();

function convertToUnlit(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const basic = source.map((material) => {
      const pbr = material as THREE.MeshStandardMaterial;
      return new THREE.MeshBasicMaterial({
        color: pbr.color?.clone() ?? new THREE.Color(0xffffff),
        map: pbr.map ?? null,
        vertexColors: pbr.vertexColors ?? false,
        transparent: pbr.transparent,
        opacity: pbr.opacity,
        alphaTest: pbr.alphaTest,
        side: pbr.side,
        fog: false,
      });
    });
    mesh.material = Array.isArray(mesh.material) ? basic : basic[0];
  });
}

function normalizeForPanel(root: THREE.Object3D, x: number): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const scale = 3.1 / Math.max(0.001, size.y);
  root.scale.multiplyScalar(scale);
  root.updateMatrixWorld(true);
  const scaled = new THREE.Box3().setFromObject(root);
  const center = scaled.getCenter(new THREE.Vector3());
  root.position.x += x - center.x;
  root.position.y += -scaled.min.y;
  root.position.z += -center.z;
}
