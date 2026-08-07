import './styles.css';
import * as THREE from 'three';
import { AssetService } from '@app/client/assets';
import { EnemyAnimationController } from '@app/client/animation/enemyAnimationController';
import { disposeOwnedMaterials } from '@app/client/animation/animationCleanup';
import { resolveEnemyPresentation } from '@app/client/animation/enemyPresentationResolver';
import { animationTelemetry, resetAnimationTelemetry } from '@app/client/animation/animationTelemetry';
import { prepareMonsterMaterials } from '@app/client/materials/monsterMaterialPolicy';
import { createAssetInstancedHost } from '@app/client/enemies/assetInstancedHost';
import { InstancedEnemyRenderer } from '@app/client/enemies/instancedEnemyRenderer';
import { AggregateSectorRenderer, type AggregateSectorRecord } from '@app/client/enemies/aggregateSectorRenderer';
import type { EnemyState } from '@app/shared/types';

type ScenarioName = 'fullNear' | 'mixed' | 'reducedMid' | 'animatedFar' | 'combatPressure' | 'aggregateFar';
interface ScenarioSpec { name: ScenarioName; count: number }

const viewport = document.getElementById('viewport') as HTMLElement;
const controls = document.getElementById('controls') as HTMLElement;
const info = document.getElementById('info') as HTMLElement;
const profileLabel = document.getElementById('profile-label') as HTMLElement;
document.body.classList.add('capacity-benchmark');
profileLabel.textContent = 'ENEMY CAPACITY BENCHMARK';
controls.innerHTML = '<h3>Automated matrix</h3><p>100 / 250 / 500 / 750 enemies across full-near, mixed, reduced-mid, animated-far, combat-pressure, and aggregate-far presentation.</p><p id="bench-progress">starting…</p>';
const progress = document.getElementById('bench-progress') as HTMLElement;

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(1);
const width = Number(new URLSearchParams(location.search).get('width') ?? 1280);
const height = Number(new URLSearchParams(location.search).get('height') ?? 720);
renderer.setSize(width, height, false);
viewport.appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 350);
camera.position.set(0, 64, 88);
camera.lookAt(0, 0, 0);

const assets = await AssetService.load();
const common = resolveEnemyPresentation({ presentationProfileId: 'enemyPresentation.quaternius.mushnub.common', type: '' });
const elite = resolveEnemyPresentation({ presentationProfileId: 'enemyPresentation.quaternius.demon-high-detail.hero', type: '' });
const boss = resolveEnemyPresentation({ presentationProfileId: 'enemyPresentation.quaternius.dragon-evolved.hero', type: '' });
const preload = [
  common.profile.nearModelAssetId,
  common.profile.farModelAssetId!,
  common.profile.aggregateModelAssetId!,
  elite.profile.nearModelAssetId,
  boss.profile.nearModelAssetId,
];
await assets.preloadModels(preload);

const gl = renderer.getContext() as WebGL2RenderingContext;
const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
const gpuTimer = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
const hardware = {
  userAgent: navigator.userAgent,
  resolution: `${width}x${height}`,
  devicePixelRatio: window.devicePixelRatio,
  rendererPixelRatio: renderer.getPixelRatio(),
  gpuVendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
  gpuRenderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
  gpuTimerSupported: Boolean(gpuTimer),
};

const counts = [100, 250, 500, 750];
const names: ScenarioName[] = ['fullNear', 'mixed', 'reducedMid', 'animatedFar', 'combatPressure', 'aggregateFar'];
const specs: ScenarioSpec[] = counts.flatMap((count) => names.map((name) => ({ name, count })));
const results: Record<string, unknown> = {};
for (let index = 0; index < specs.length; index++) {
  const spec = specs[index];
  progress.textContent = `${index + 1}/${specs.length}: ${spec.name} × ${spec.count}`;
  results[`${spec.name}.${spec.count}`] = await runScenario(spec);
  info.textContent = JSON.stringify({ hardware, progress: progress.textContent, results }, null, 2);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const payload = { format: 1, capturedAt: new Date().toISOString(), hardware, results };
(window as unknown as Record<string, unknown>).__capacityBenchmark = payload;
progress.textContent = 'complete';
info.textContent = JSON.stringify(payload, null, 2);

async function runScenario(spec: ScenarioSpec): Promise<Record<string, unknown>> {
  resetAnimationTelemetry();
  const scene = makeScene();
  const controllers: Array<{ controller: EnemyAnimationController; tier: 'near' | 'mid' }> = [];
  let farRenderer: InstancedEnemyRenderer | null = null;
  let farEnemies: EnemyState[] = [];
  let aggregate: AggregateSectorRenderer | null = null;
  const heapStart = browserHeap();

  const distribution = distributionFor(spec);
  addControllers(scene, common, distribution.near, 'near', controllers, 0);
  addControllers(scene, common, distribution.mid, 'mid', controllers, distribution.near);
  if (distribution.far > 0) {
    const host = createAssetInstancedHost(scene, assets, common.profile.farModelAssetId!, distribution.far, { castShadow: false, receiveShadow: false });
    farRenderer = new InstancedEnemyRenderer(host, distribution.far);
    farEnemies = Array.from({ length: distribution.far }, (_, i) => enemy(i + 1, distribution.near + distribution.mid + i, spec.count));
    for (const enemyState of farEnemies) farRenderer!.upsert(enemyState, 0);
  }
  if (spec.name === 'combatPressure') {
    addControllers(scene, elite, 1, 'near', controllers, spec.count + 1, true);
    addControllers(scene, boss, 1, 'near', controllers, spec.count + 2, true);
    addPressurePoints(scene, Math.min(300, Math.ceil(spec.count * 0.5)), 0xffb04a, 0.18);
    addPressurePoints(scene, Math.min(400, spec.count), 0x7dffbd, 0.11);
  }
  if (spec.name === 'aggregateFar') {
    aggregate = new AggregateSectorRenderer(scene, assets, () => common.profile, 512);
    const sectors: AggregateSectorRecord[] = Array.from({ length: Math.ceil(spec.count / 8) }, (_, i) => {
      const p = layoutPoint(i, Math.ceil(spec.count / 8));
      return { sectorId: i + 1, x: p.x, z: p.z, count: Math.min(8, spec.count - i * 8), presentationSeed: i * 17 };
    });
    aggregate.update(sectors, 0, 0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    aggregate.update(sectors, 0, 0);
  }

  const frameMs: number[] = [];
  const updateMs: number[] = [];
  const renderMs: number[] = [];
  const gpuMs: number[] = [];
  const pendingQueries: WebGLQuery[] = [];
  const warmup = 12;
  const samples = 60;
  for (let frame = 0; frame < warmup + samples; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const frameStart = performance.now();
    const updateStart = performance.now();
    const attacking = frame % 90 < 12;
    for (let i = 0; i < controllers.length; i++) {
      const item = controllers[i];
      if (item.tier === 'near' || frame % 5 === 0) {
        item.controller.syncState({
          alive: true,
          state: attacking ? 'telegraph' : 'hunt',
          stateT: 0,
          speed: 3 + (i % 3),
          telegraph: attacking ? 0.5 : 0,
          flash: 0,
          airborne: false,
        });
      }
      item.controller.advance(1 / 60);
    }
    if (farRenderer) {
      for (const enemyState of farEnemies) {
        enemyState.telegraph = attacking ? 0.5 : 0;
        enemyState.state = attacking ? 'telegraph' : 'hunt';
        farRenderer.upsert(enemyState, 1 / 60);
      }
    }
    const updateEnd = performance.now();
    const query = gpuTimer ? gl.createQuery() : null;
    if (query && gpuTimer) {
      gl.beginQuery(gpuTimer.TIME_ELAPSED_EXT, query);
      pendingQueries.push(query);
    }
    const renderStart = performance.now();
    renderer.render(scene, camera);
    const renderEnd = performance.now();
    if (query && gpuTimer) gl.endQuery(gpuTimer.TIME_ELAPSED_EXT);
    collectGpuQueries(gl, gpuTimer, pendingQueries, gpuMs);
    if (frame >= warmup) {
      updateMs.push(updateEnd - updateStart);
      renderMs.push(renderEnd - renderStart);
      frameMs.push(renderEnd - frameStart);
    }
  }
  for (let i = 0; i < 8 && pendingQueries.length > 0; i++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    collectGpuQueries(gl, gpuTimer, pendingQueries, gpuMs);
  }

  let skinnedMeshes = 0;
  let shadowCasters = 0;
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) skinnedMeshes++;
    if (mesh.isMesh && mesh.castShadow) shadowCasters++;
  });
  const result = {
    population: spec.count,
    distribution,
    cpuFrameP50Ms: percentile(frameMs, 0.5),
    cpuFrameP95Ms: percentile(frameMs, 0.95),
    cpuFrameP99Ms: percentile(frameMs, 0.99),
    updateP50Ms: percentile(updateMs, 0.5),
    updateP95Ms: percentile(updateMs, 0.95),
    renderSubmitP50Ms: percentile(renderMs, 0.5),
    renderSubmitP95Ms: percentile(renderMs, 0.95),
    gpuP50Ms: gpuMs.length ? percentile(gpuMs, 0.5) : null,
    gpuP95Ms: gpuMs.length ? percentile(gpuMs, 0.95) : null,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    activeMixers: animationTelemetry.liveMixers,
    skinnedMeshes,
    shadowCasters,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    heapDeltaMb: heapStart === null || browserHeap() === null ? null : (browserHeap()! - heapStart) / 1048576,
    farInstances: farRenderer?.activeCount ?? 0,
    aggregateInstances: aggregate?.instanceCount ?? 0,
    stateGrowth: 0,
  };
  for (const item of controllers) {
    item.controller.dispose();
    disposeOwnedMaterials(item.controller.model.root);
  }
  farRenderer?.reset();
  aggregate?.reset();
  scene.traverse((object) => {
    const light = object as THREE.DirectionalLight;
    if (light.isDirectionalLight) light.shadow.map?.dispose();
    const drawable = object as THREE.Mesh | THREE.Points;
    const material = drawable.material;
    if (material) {
      for (const item of Array.isArray(material) ? material : [material]) item.dispose();
    }
    if (object.userData.capacityOwnedGeometry === true) {
      (drawable.geometry as THREE.BufferGeometry | undefined)?.dispose();
    }
  });
  renderer.renderLists.dispose();
  renderer.render(new THREE.Scene(), camera);
  return { ...result, postCleanupTextures: renderer.info.memory.textures };
}

function makeScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x53636b);
  scene.fog = new THREE.Fog(0x53636b, 115, 190);
  scene.add(new THREE.HemisphereLight(0xfff5e8, 0x87918d, 1.45));
  const sun = new THREE.DirectionalLight(0xffddad, 1.35);
  sun.position.set(26, 34, 12);
  sun.castShadow = true;
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ color: 0x53615a, roughness: 0.95 }));
  ground.userData.capacityOwnedGeometry = true;
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  return scene;
}

function distributionFor(spec: ScenarioSpec): { near: number; mid: number; far: number; aggregate: number } {
  if (spec.name === 'fullNear') return { near: spec.count, mid: 0, far: 0, aggregate: 0 };
  if (spec.name === 'reducedMid') return { near: 0, mid: spec.count, far: 0, aggregate: 0 };
  if (spec.name === 'animatedFar') return { near: 0, mid: 0, far: spec.count, aggregate: 0 };
  if (spec.name === 'aggregateFar') return { near: 0, mid: 0, far: 0, aggregate: spec.count };
  const near = Math.min(40, spec.count);
  const mid = Math.min(120, spec.count - near);
  return { near, mid, far: spec.count - near - mid, aggregate: 0 };
}

function addControllers(
  scene: THREE.Scene,
  resolution: ReturnType<typeof resolveEnemyPresentation>,
  count: number,
  tier: 'near' | 'mid',
  out: Array<{ controller: EnemyAnimationController; tier: 'near' | 'mid' }>,
  offset: number,
  shadows = false,
): void {
  if (!resolution.animationProfile) return;
  for (let i = 0; i < count; i++) {
    const instance = assets.createModelInstance(resolution.profile.nearModelAssetId, { cloneMaterials: true });
    prepareMonsterMaterials(instance.root);
    const point = layoutPoint(offset + i, Math.max(1, offset + count));
    instance.root.position.set(point.x, 0, point.z);
    instance.root.rotation.y = point.yaw;
    instance.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = shadows;
    });
    scene.add(instance.root);
    const controller = EnemyAnimationController.create(resolution.animationProfile, instance, (offset + i + 1) / (offset + count + 1));
    out.push({ controller, tier });
  }
}

function layoutPoint(index: number, total: number): { x: number; z: number; yaw: number } {
  const columns = Math.max(10, Math.ceil(Math.sqrt(total * 1.7)));
  const x = (index % columns - columns / 2) * 2.35;
  const z = (Math.floor(index / columns) - Math.ceil(total / columns) / 2) * 2.35;
  return { x, z, yaw: Math.atan2(-x, -z) };
}

function enemy(id: number, index: number, total: number): EnemyState {
  const point = layoutPoint(index, total);
  return {
    id, type: 'scrapBug', x: point.x, y: 0, z: point.z, yaw: point.yaw,
    hp: 4, maxHp: 4, state: 'hunt', stateT: 0, aimYaw: point.yaw, speed: 3,
    alive: true, telegraph: 0, flash: 0, spawnT: 0, hitCd: 0,
  };
}

function addPressurePoints(scene: THREE.Scene, count: number, color: number, size: number): void {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const point = layoutPoint(i * 7, count * 7);
    positions[i * 3] = point.x;
    positions[i * 3 + 1] = 0.8 + (i % 5) * 0.08;
    positions[i * 3 + 2] = point.z;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size }));
  points.userData.capacityOwnedGeometry = true;
  scene.add(points);
}

function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(3));
}

function browserHeap(): number | null {
  const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
  return memory.memory?.usedJSHeapSize ?? null;
}

function collectGpuQueries(
  context: WebGL2RenderingContext,
  extension: { GPU_DISJOINT_EXT: number } | null,
  pending: WebGLQuery[],
  values: number[],
): void {
  if (!extension) return;
  while (pending.length > 0) {
    const query = pending[0];
    if (!context.getQueryParameter(query, context.QUERY_RESULT_AVAILABLE)) break;
    const disjoint = context.getParameter(extension.GPU_DISJOINT_EXT);
    if (!disjoint) values.push(context.getQueryParameter(query, context.QUERY_RESULT) / 1e6);
    context.deleteQuery(query);
    pending.shift();
  }
}
