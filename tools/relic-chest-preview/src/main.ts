import './styles.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PRESENTATION_ASSET_CATALOG } from '@app/generated/presentationContent.generated';
import {
  RELIC_CHEST_ASSET_ID,
  RelicChestPresentation,
  type RelicChestDiagnostics,
} from '@app/client/relics/relicChestPresentation';

interface PreviewBridge {
  ready: boolean;
  setProgress(value: number): void;
  setRays(visible: boolean): void;
  setLighting(mode: 'neutral' | 'game'): void;
  setCaptureLabel(label: string): void;
  getDiagnostics(): RelicChestDiagnostics | null;
}

declare global {
  interface Window { __relicChestPreview: PreviewBridge; }
}

const viewport = document.getElementById('viewport') as HTMLElement;
const progressInput = document.getElementById('progress') as HTMLInputElement;
const progressValue = document.getElementById('progress-value') as HTMLOutputElement;
const raysInput = document.getElementById('rays') as HTMLInputElement;
const lightingInput = document.getElementById('lighting') as HTMLSelectElement;
const diagnosticsElement = document.getElementById('diagnostics') as HTMLDListElement;
const materialsElement = document.getElementById('materials') as HTMLDListElement;
const statusElement = document.getElementById('status') as HTMLElement;
const captureLabel = document.getElementById('capture-label') as HTMLElement;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111820);
const camera = new THREE.PerspectiveCamera(43, 1, 0.05, 50);
const qaCameraPosition = new THREE.Vector3(-1.55, 1.12, 2.05);
const qaCameraTarget = new THREE.Vector3(0, 0.42, 0);
camera.position.copy(qaCameraPosition);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.appendChild(renderer.domElement);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.target.copy(qaCameraTarget);
orbit.minDistance = 1.25;
orbit.maxDistance = 8;

const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x2a3037, roughness: 0.92, metalness: 0 });
const ground = new THREE.Mesh(new THREE.CircleGeometry(3.4, 64), groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.004;
ground.receiveShadow = true;
scene.add(ground);

const neutralLights = new THREE.Group();
const neutralAmbient = new THREE.HemisphereLight(0xffffff, 0x566170, 1.55);
const neutralFillAmbient = new THREE.AmbientLight(0xffffff, 0.75);
const neutralKey = new THREE.DirectionalLight(0xffffff, 2.25);
neutralKey.position.set(3, 4.5, 4);
neutralKey.castShadow = true;
neutralKey.shadow.mapSize.set(1024, 1024);
const neutralFill = new THREE.DirectionalLight(0xc8ddff, 0.9);
neutralFill.position.set(-3, 2.5, 1);
neutralLights.add(neutralAmbient, neutralFillAmbient, neutralKey, neutralFill);
scene.add(neutralLights);

const gameLights = new THREE.Group();
const gameAmbient = new THREE.HemisphereLight(0x92baff, 0x25222e, 0.9);
const gameFill = new THREE.AmbientLight(0x9fb5d0, 0.65);
const gameKey = new THREE.DirectionalLight(0xffd08a, 2.7);
gameKey.position.set(3.5, 5, 2.5);
gameKey.castShadow = true;
gameKey.shadow.mapSize.set(1024, 1024);
const gameRim = new THREE.DirectionalLight(0x5f86ff, 1.15);
gameRim.position.set(-3, 2, -3);
gameLights.add(gameAmbient, gameFill, gameKey, gameRim);
gameLights.visible = false;
scene.add(gameLights);

let presentation: RelicChestPresentation | null = null;
let diagnosticsElapsed = 0;

function setLighting(mode: 'neutral' | 'game'): void {
  neutralLights.visible = mode === 'neutral';
  gameLights.visible = mode === 'game';
  renderer.toneMapping = mode === 'neutral' ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  scene.background = new THREE.Color(mode === 'neutral' ? 0x111820 : 0x192238);
  lightingInput.value = mode;
}

function setProgress(value: number): void {
  presentation?.setOpenProgress(value);
  const progress = THREE.MathUtils.clamp(value, 0, 1);
  progressInput.value = String(progress);
  captureLabel.textContent = `${progress === 0 ? 'CLOSED' : progress === 1 ? 'FULLY OPEN' : `${Math.round(progress * 100)}% OPEN`} · RAYS ${raysInput.checked ? 'ON' : 'OFF'}`;
  renderDiagnostics();
}

function setRays(visible: boolean): void {
  presentation?.setRaysVisible(visible);
  raysInput.checked = visible;
  const progress = presentation?.getOpenProgress() ?? 0;
  captureLabel.textContent = `${progress === 0 ? 'CLOSED' : progress === 1 ? 'FULLY OPEN' : `${Math.round(progress * 100)}% OPEN`} · RAYS ${visible ? 'ON' : 'OFF'}`;
  renderDiagnostics();
}

function renderDiagnostics(): void {
  const data = presentation?.getDiagnostics();
  if (!data) return;
  progressValue.value = data.openProgress.toFixed(3);
  diagnosticsElement.innerHTML = rows({
    openProgress: data.openProgress.toFixed(3),
    'lid curve': data.easedLidProgress.toFixed(3),
    'lid rotation': `${data.lidRotationDegrees.toFixed(2)}°`,
    'final lid angle': `${data.finalLidAngleDegrees.toFixed(2)}°`,
    'ray opacity': data.rayOpacity.toFixed(3),
    'ray width': data.rayWidth.toFixed(3),
    'ray spread': data.raySpread.toFixed(3),
    'ray length': data.rayLength.toFixed(3),
    'rays visible': data.raysVisible ? 'yes' : 'no',
    'chest glow': data.chestGlowOpacity.toFixed(3),
    'glow phase': data.chestGlowPhase.toFixed(3),
  });
}

function rows(values: Record<string, string>): string {
  return Object.entries(values).map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`).join('');
}

function renderMaterialDiagnostics(root: THREE.Object3D): void {
  const materials = new Map<string, THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const assigned = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of assigned) {
      if (!material.name.startsWith('RelicChest')) materials.set(material.name, material);
    }
  });
  const textureEntries: string[] = [];
  for (const material of materials.values()) {
    if (!(material instanceof THREE.MeshStandardMaterial) || !material.map) continue;
    textureEntries.push(`${material.name}: ${material.map.colorSpace || 'linear/unset'}`);
  }
  materialsElement.innerHTML = rows({
    materials: [...materials.keys()].sort().join(', '),
    'material count': String(materials.size),
    'color textures': textureEntries.length ? textureEntries.join('; ') : 'none in source',
    'non-color maps': 'none in source',
    'global tint': 'none',
    'chest emissive': 'none',
  });
}

window.__relicChestPreview = {
  ready: false,
  setProgress,
  setRays,
  setLighting,
  setCaptureLabel(label: string) { captureLabel.textContent = label; },
  getDiagnostics: () => presentation?.getDiagnostics() ?? null,
};

progressInput.addEventListener('input', () => setProgress(Number(progressInput.value)));
raysInput.addEventListener('change', () => setRays(raysInput.checked));
lightingInput.addEventListener('change', () => setLighting(lightingInput.value as 'neutral' | 'game'));
document.getElementById('play-open')?.addEventListener('click', () => presentation?.open());
document.getElementById('play-close')?.addEventListener('click', () => presentation?.close());
document.getElementById('reset')?.addEventListener('click', () => {
  presentation?.reset();
  progressInput.value = '0';
  captureLabel.textContent = 'CLOSED · RAYS ON';
  renderDiagnostics();
});

const asset = PRESENTATION_ASSET_CATALOG.project.find((entry) => entry.id === RELIC_CHEST_ASSET_ID);
if (!asset?.file) throw new Error(`Catalog asset '${RELIC_CHEST_ASSET_ID}' has no file`);

new GLTFLoader().load(
  asset.file,
  (gltf) => {
    scene.add(gltf.scene);
    gltf.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
    presentation = new RelicChestPresentation(gltf.scene);
    presentation.setOpenProgress(0);
    renderMaterialDiagnostics(presentation.root);
    renderDiagnostics();
    statusElement.textContent = `Ready · ${RELIC_CHEST_ASSET_ID}`;
    window.__relicChestPreview.ready = true;
  },
  undefined,
  (error) => {
    statusElement.textContent = `Load failed: ${String(error)}`;
    statusElement.classList.add('error');
  },
);

setLighting('neutral');
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const deltaSeconds = Math.min(clock.getDelta(), 0.05);
  if (presentation?.update(deltaSeconds)) {
    progressInput.value = String(presentation.getOpenProgress());
    diagnosticsElapsed += deltaSeconds;
    if (diagnosticsElapsed >= 0.1) {
      diagnosticsElapsed = 0;
      renderDiagnostics();
    }
  }
  orbit.update();
  renderer.render(scene, camera);
});

const resizeObserver = new ResizeObserver(() => {
  const width = Math.max(1, viewport.clientWidth);
  const height = Math.max(1, viewport.clientHeight);
  camera.aspect = width / height;
  const compactStageScale = THREE.MathUtils.clamp(500 / height, 1, 2.25);
  camera.position.copy(qaCameraPosition).sub(qaCameraTarget).multiplyScalar(compactStageScale).add(qaCameraTarget);
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
});
resizeObserver.observe(viewport);
