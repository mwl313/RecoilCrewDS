import './styles.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AssetService } from '@app/client/assets';
import { EnemyAnimationController } from '@app/client/animation/enemyAnimationController';
import { animationTelemetry, resetAnimationTelemetry } from '@app/client/animation/animationTelemetry';
import { disposeOwnedMaterials } from '@app/client/animation/animationCleanup';
import { resolveEnemyPresentation } from '@app/client/animation/enemyPresentationResolver';
import { ENEMY_ANIMATION_CONTENT } from '@app/generated/enemyAnimationContent.generated';
import { ENEMY_ANIMATION_ROLES, type EnemyAnimationRole } from '@app/shared/animation/animationRoles';
import type { EnemyPresentationProfileDefinition } from '@app/shared/animation/animationProfileTypes';
import { InstancedEnemyRenderer } from '@app/client/enemies/instancedEnemyRenderer';
import { createAssetInstancedHost } from '@app/client/enemies/assetInstancedHost';
import { AggregateSectorRenderer, type AggregateSectorRecord } from '@app/client/enemies/aggregateSectorRenderer';
import { CLIENT_CONTENT_PACK } from '@app/generated/contentPack.generated';
import type { EnemyState } from '@app/shared/types';

/**
 * Monster Pack 10 integration gallery.
 *
 * Production loaders only: AssetService, EnemyAnimationController,
 * createAssetInstancedHost, AggregateSectorRenderer. Loads models on demand;
 * never preloads all 45 heroes. `?bench=1` runs scripted scenarios and
 * reports a JSON summary through window.__monsterBench.
 */
export async function startMonsterGallery(container: HTMLElement): Promise<void> {
  const bench = new URLSearchParams(window.location.search).has('bench');
  const viewport = document.getElementById('viewport') as HTMLElement;
  const controlsPanel = document.getElementById('controls') as HTMLElement;
  const info = document.getElementById('info') as HTMLElement;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x24303a);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
  camera.position.set(8, 6, 10);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  viewport.appendChild(renderer.domElement);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 1.5, 0);

  scene.add(new THREE.HemisphereLight(0xffe9c8, 0x3b3f45, 0.8));
  const sun = new THREE.DirectionalLight(0xffd9a0, 1.6);
  sun.position.set(10, 14, 6);
  sun.castShadow = true;
  scene.add(sun);
  const ground = new THREE.GridHelper(40, 20, 0x4d6a78, 0x334a56);
  ground.position.y = 0.01;
  scene.add(ground);

  const profiles = Object.values(ENEMY_ANIMATION_CONTENT.presentationProfiles);
  const heroProfiles = profiles.filter((p) => p.id.startsWith('enemyPresentation.quaternius.') && p.id.endsWith('.hero'));
  const commonProfiles = profiles.filter((p) => p.id.startsWith('enemyPresentation.quaternius.') && p.id.endsWith('.common'));
  const slugOf = (p: EnemyPresentationProfileDefinition): string =>
    p.id.replace(/^enemyPresentation\.quaternius\./, '').replace(/\.(hero|common)$/, '');
  const roster = CLIENT_CONTENT_PACK.getEnemyArtRoster('enemyArtRoster.quaternius.integrationPreview');

  const state = {
    slug: slugOf(heroProfiles[0]),
    filter: 'all' as 'all' | 'common' | 'heroOnly',
    variant: 'hero' as 'hero' | 'commonNear' | 'commonFar' | 'aggregate',
    role: 'idle' as EnemyAnimationRole,
    playing: true,
    moveSpeed: 0,
    hitFlash: false,
    attackCue: false,
    death: false,
    shadows: true,
    spawnCount: 1,
    farCount: 100,
    aggregateStress: false,
    forceFar: false,
  };
  const progress = (msg: string): void => {
    (window as unknown as Record<string, string>).__monsterProgress = msg;
  };

  let assets: AssetService | null = null;
  let hero: EnemyAnimationController | null = null;
  let heroModel: THREE.Object3D | null = null;
  let copies: EnemyAnimationController[] = [];
  let copyModels: THREE.Object3D[] = [];
  let farRenderer: InstancedEnemyRenderer | null = null;
  let farEnemies: EnemyState[] = [];
  let aggregateRenderer: AggregateSectorRenderer | null = null;
  let frameMs: number[] = [];
  let lastFrameAt = performance.now();
  const clock = new THREE.Clock();

  function currentHeroProfile(): EnemyPresentationProfileDefinition | null {
    return heroProfiles.find((p) => slugOf(p) === state.slug) ?? null;
  }

  function currentCommonProfile(): EnemyPresentationProfileDefinition | null {
    return commonProfiles.find((p) => slugOf(p) === state.slug) ?? null;
  }

  function assetIdForVariant(profile: EnemyPresentationProfileDefinition): string {
    switch (state.variant) {
      case 'commonNear':
        return profile.nearModelAssetId;
      case 'commonFar':
        return profile.farModelAssetId ?? profile.nearModelAssetId;
      case 'aggregate':
        return profile.aggregateModelAssetId ?? profile.farModelAssetId ?? profile.nearModelAssetId;
      default:
        return profile.nearModelAssetId;
    }
  }

  function clearScene(): void {
    if (hero) {
      hero.dispose();
      hero = null;
    }
    if (heroModel) {
      disposeOwnedMaterials(heroModel);
      scene.remove(heroModel);
      heroModel = null;
    }
    for (const c of copies) c.dispose();
    copies = [];
    for (const m of copyModels) {
      disposeOwnedMaterials(m);
      scene.remove(m);
    }
    copyModels = [];
    farRenderer?.reset();
    farRenderer = null;
    farEnemies = [];
    aggregateRenderer?.reset();
    aggregateRenderer = null;
    resetAnimationTelemetry();
  }

  async function rebuild(): Promise<void> {
    progress(`rebuild:${state.slug}:${state.variant}`);
    clearScene();
    const profile = state.variant === 'commonNear' || state.variant === 'commonFar' || state.variant === 'aggregate'
      ? currentCommonProfile()
      : currentHeroProfile();
    if (!profile) return;
    const assetId = assetIdForVariant(profile);
    progress(`preload:${assetId}`);
    await assets!.preloadModels([assetId, ...(profile.animationProfileId ? [profile.nearModelAssetId] : [])]);
    progress(`preloaded:${assetId}`);
    const resolution = resolveEnemyPresentation({ presentationProfileId: profile.id, type: '' });
    const instance = assets!.createModelInstance(assetId, { cloneMaterials: true });
    heroModel = instance.root;
    scene.add(heroModel);
    const animated = state.variant !== 'commonFar' && state.variant !== 'aggregate';
    if (animated && resolution.animationProfile && (instance.skinned || instance.source.animations.length > 0)) {
      hero = EnemyAnimationController.create(resolution.animationProfile, instance, 0.123);
      hero.previewRole(state.role);
    }
    applyShadows(heroModel);
    if (animated && state.spawnCount > 1) {
      for (let i = 1; i < state.spawnCount; i++) {
        const copy = assets!.createModelInstance(assetId, { cloneMaterials: true });
        const angle = ((i - 1) / Math.max(1, state.spawnCount - 1)) * Math.PI * 2;
        copy.root.position.set(Math.cos(angle) * 3.5, 0, Math.sin(angle) * 3.5);
        copy.root.rotation.y = -angle;
        scene.add(copy.root);
        copyModels.push(copy.root);
        if (resolution.animationProfile && (copy.skinned || copy.source.animations.length > 0)) {
          const controller = EnemyAnimationController.create(resolution.animationProfile, copy, i / (state.spawnCount + 1));
          controller.previewRole(state.role);
          copies.push(controller);
        }
      }
    }

    if (state.variant === 'commonFar') {
      const host = createAssetInstancedHost(scene, assets!, assetId, state.farCount, { castShadow: false, receiveShadow: true });
      farRenderer = new InstancedEnemyRenderer(host, state.farCount);
      for (let i = 0; i < state.farCount; i++) {
        const angle = (i / Math.max(1, state.farCount)) * Math.PI * 2;
        const radius = 6 + (i % 8);
        const e = {
          id: i + 1,
          type: 'scrapBug',
          x: Math.cos(angle) * radius,
          y: 0,
          z: Math.sin(angle) * radius,
          yaw: -angle,
          flash: 0,
          alive: true,
          speed: state.moveSpeed || 3,
          state: 'hunt',
          stateT: 0,
          telegraph: 0,
        } as EnemyState;
        farEnemies.push(e);
        farRenderer.upsert(e, 0);
      }
    }
    if (state.aggregateStress && profile.aggregateModelAssetId) {
      aggregateRenderer = new AggregateSectorRenderer(scene, assets!, () => profile);
      const sectors: AggregateSectorRecord[] = [];
      for (let i = 0; i < 24; i++) {
        const angle = (i / 24) * Math.PI * 2;
        sectors.push({
          sectorId: i + 1,
          x: Math.cos(angle) * 18,
          z: Math.sin(angle) * 18,
          count: 8 + (i % 12),
          presentationSeed: i * 7,
        });
      }
      aggregateRenderer.update(sectors, 0, 0);
    }
  }

  function applyShadows(model: THREE.Object3D): void {
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = state.shadows;
      mesh.receiveShadow = state.shadows;
    });
    renderer.shadowMap.enabled = state.shadows;
    sun.castShadow = state.shadows;
  }

  function updateAnimations(dt: number): void {
    const attacking = state.attackCue;
    if (hero) hero.update(
      {
        alive: !state.death,
        state: attacking ? 'telegraph' : state.moveSpeed > 0.1 ? 'hunt' : 'idle',
        stateT: 0,
        speed: state.moveSpeed,
        telegraph: attacking ? 0.5 : 0,
        flash: state.hitFlash ? 0.1 : 0,
        airborne: false,
        cue: attacking
          ? { sequence: 1, actionId: 'enemy.attack.primary', startedAtTick: 0, durationTicks: 30 }
          : null,
        currentTick: Math.round(clock.elapsedTime * 30),
      },
      dt,
    );
    if (farRenderer) {
      for (const enemy of farEnemies) {
        enemy.speed = state.moveSpeed || 3;
        enemy.telegraph = attacking ? 0.5 : 0;
        enemy.state = attacking ? 'telegraph' : 'hunt';
        enemy.alive = !state.death;
        farRenderer.upsert(enemy, dt);
      }
    }
  }

  function renderDiagnostics(): void {
    const lines: string[] = [];
    const profile = state.variant === 'commonNear' || state.variant === 'commonFar' || state.variant === 'aggregate'
      ? currentCommonProfile()
      : currentHeroProfile();
    lines.push(`monster: ${state.slug} variant: ${state.variant} filter: ${state.filter}`);
    lines.push(`profile: ${profile?.id ?? 'none'}`);
    lines.push(`near: ${profile?.nearModelAssetId ?? '-'}${profile?.farModelAssetId ? `\nfar: ${profile.farModelAssetId}` : ''}${profile?.aggregateModelAssetId ? `\naggregate: ${profile.aggregateModelAssetId}` : ''}`);
    if (hero) {
      lines.push('clips:');
      for (const [role, clip] of Object.entries(hero.profile.clips)) lines.push(`  ${role} -> ${clip}`);
    }
    const t = assets?.telemetry;
    if (t) {
      lines.push(`asset telemetry: registered=${t.registeredModelCount} requested=${t.requestedPreloadCount} loaded=${t.loadedModelCount} bytes=${t.loadedGlbBytes} ms=${t.loadDurationMs.toFixed(1)} cacheHits=${t.cacheHits}`);
    }
    lines.push(`mixers: ${animationTelemetry.liveMixers} skeletons=${animationTelemetry.liveSkinnedRoots}`);
    lines.push(`far instances: ${farRenderer?.activeCount ?? 0}/${farRenderer?.capacity ?? 0} aggregate groups: ${aggregateRenderer?.groupCount ?? 0} aggregate instances: ${aggregateRenderer?.instanceCount ?? 0}`);
    lines.push(`draw calls: ${renderer.info.render.calls} triangles: ${renderer.info.render.triangles}`);
    const p = percentile(frameMs, 0.5);
    lines.push(`frame p50: ${p.toFixed(2)} ms (last ${frameMs.length} samples)`);
    lines.push(`roster preload ids: ${roster.preloadAssetIds.length}`);
    info.innerHTML = lines.join('\n');
  }

  function percentile(values: number[], q: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
    return sorted[index];
  }

  function loop(): void {
    requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastFrameAt) / 1000);
    lastFrameAt = now;
    if (frameMs.length > 240) frameMs.shift();
    frameMs.push(now - (now - dt * 1000));
    updateAnimations(state.playing ? dt : 0);
    orbit.update();
    renderer.render(scene, camera);
    renderDiagnostics();
  }

  function buildControls(): void {
    controlsPanel.textContent = '';
    const label = (text: string): HTMLElement => {
      const el = document.createElement('label');
      el.textContent = text;
      controlsPanel.appendChild(el);
      return el;
    };
    const select = (text: string, values: string[], get: () => string, set: (v: string) => void, onChange?: () => void): void => {
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
        void rebuild();
        onChange?.();
      });
      label(text).appendChild(sel);
    };
    const toggle = (text: string, get: () => boolean, set: (v: boolean) => void, rebuildOn = false): void => {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = get();
      box.addEventListener('change', () => {
        set(box.checked);
        if (rebuildOn) void rebuild();
      });
      const el = label(text);
      el.prepend(box);
    };
    const number = (text: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void, rebuildOn = false): void => {
      const input = document.createElement('input');
      input.type = 'number';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(get());
      input.addEventListener('change', () => {
        set(Number(input.value));
        if (rebuildOn) void rebuild();
      });
      label(text).appendChild(input);
    };

    const slugOptions = heroProfiles.map((p) => slugOf(p));
    const visibleSlugs = (): string[] =>
      state.filter === 'common'
        ? slugOptions.filter((s) => commonProfiles.some((p) => slugOf(p) === s))
        : state.filter === 'heroOnly'
          ? slugOptions.filter((s) => !commonProfiles.some((p) => slugOf(p) === s))
          : slugOptions;
    select('Monster', visibleSlugs(), () => state.slug, (v) => (state.slug = v));
    select('Filter', ['all', 'common', 'heroOnly'], () => state.filter, (v) => (state.filter = v as never), () => {
      const slugs = visibleSlugs();
      if (!slugs.includes(state.slug)) state.slug = slugs[0];
    });
    select('Variant', ['hero', 'commonNear', 'commonFar', 'aggregate'], () => state.variant, (v) => (state.variant = v as never));
    select('Semantic role', ENEMY_ANIMATION_ROLES as unknown as string[], () => state.role, (v) => {
      state.role = v as EnemyAnimationRole;
      hero?.previewRole(state.role);
    });
    toggle('Play', () => state.playing, (v) => (state.playing = v));
    toggle('Hit flash', () => state.hitFlash, (v) => (state.hitFlash = v));
    toggle('Attack cue', () => state.attackCue, (v) => (state.attackCue = v));
    toggle('Death', () => state.death, (v) => (state.death = v));
    toggle('Shadows', () => state.shadows, (v) => {
      state.shadows = v;
      if (heroModel) applyShadows(heroModel);
    });
    toggle('Aggregate stress', () => state.aggregateStress, (v) => (state.aggregateStress = v), true);
    number('Movement speed', 0, 12, 0.5, () => state.moveSpeed, (v) => (state.moveSpeed = v));
    number('Near copies', 1, 50, 1, () => state.spawnCount, (v) => (state.spawnCount = v), true);
    number('Far instances', 10, 500, 10, () => state.farCount, (v) => (state.farCount = v), true);
  }

  buildControls();
  assets = await AssetService.load();
  try {
    await rebuild();
  } catch (err) {
    (window as unknown as Record<string, unknown>).__monsterBenchError = (err as Error).message;
    info.innerHTML = 'gallery failed: ' + (err as Error).message;
    return;
  }
  const resize = (): void => {
    renderer.setSize(viewport.clientWidth || window.innerWidth, viewport.clientHeight || window.innerHeight);
    camera.aspect = (viewport.clientWidth || window.innerWidth) / (viewport.clientHeight || window.innerHeight);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  if (bench) {
    await runBenchmark();
  } else {
    loop();
  }

  async function runBenchmark(): Promise<void> {
    try {
      progress('benchmark:start');
      const results: Record<string, unknown> = {};
      const scenarios = [
        { name: 'heroBoss', slug: 'dragon-evolved', variant: 'hero' as const },
        { name: 'heroElite', slug: 'blue-demon', variant: 'hero' as const },
        { name: 'commonNear25', slug: 'mushnub', variant: 'commonNear' as const },
        { name: 'commonFar100', slug: 'mushnub', variant: 'commonFar' as const },
        { name: 'commonFar300', slug: 'mushnub', variant: 'commonFar' as const },
        { name: 'commonFar500', slug: 'mushnub', variant: 'commonFar' as const },
        { name: 'aggregateStress', slug: 'mushnub', variant: 'commonNear' as const },
      ];
      for (const scenario of scenarios) {
        progress(`benchmark:scenario:${scenario.name}`);
        state.slug = scenario.slug;
        state.variant = scenario.variant;
        state.spawnCount = scenario.variant === 'commonNear' ? 25 : 1;
        state.farCount = scenario.variant === 'commonFar'
          ? scenario.name === 'commonFar100' ? 100 : scenario.name === 'commonFar300' ? 300 : 500
          : 0;
        state.aggregateStress = scenario.name === 'aggregateStress';
        await rebuild();
        progress(`benchmark:render:${scenario.name}`);
        frameMs = [];
        const samples = 120;
        for (let i = 0; i < samples; i++) {
          await new Promise((r) => requestAnimationFrame(r));
          const t0 = performance.now();
          renderer.render(scene, camera);
          frameMs.push(performance.now() - t0);
        }
        const sorted = [...frameMs].sort((a, b) => a - b);
        const p = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
        results[scenario.name] = {
          frameP50Ms: p(0.5),
          frameP95Ms: p(0.95),
          frameP99Ms: p(0.99),
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          mixers: animationTelemetry.liveMixers,
          farInstances: farRenderer?.activeCount ?? 0,
          aggregateGroups: aggregateRenderer?.groupCount ?? 0,
          aggregateInstances: aggregateRenderer?.instanceCount ?? 0,
          loadedModels: assets?.telemetry.loadedModelCount ?? 0,
          loadedBytes: assets?.telemetry.loadedGlbBytes ?? 0,
        };
      }
      (window as unknown as Record<string, unknown>).__monsterBench = results;
      info.innerHTML = 'benchmark complete: ' + JSON.stringify(results, null, 2);
    } catch (err) {
      (window as unknown as Record<string, unknown>).__monsterBenchError = (err as Error).message;
      info.innerHTML = 'benchmark failed: ' + (err as Error).message;
    }
  }
}
