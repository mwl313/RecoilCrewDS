import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyMonsterScaleAndOffset,
  localFootOffset,
} from '../../src/client/app/monsterTransform';
import {
  resolvedMonsterDimensions,
  resolveMonsterDimensionsForDefId,
} from '../../src/shared/monsters/monsterNormalization';
import { AggregateSectorRenderer } from '../../src/client/enemies/aggregateSectorRenderer';

/**
 * Real-transform grounding (second-pass Phase 1).
 *
 * The production helper is applied to actual Object3D hierarchies and the
 * resulting world bounding box is measured, so a sign flip without a real
 * bounds test is impossible to ship.
 */
const FOOT_TOLERANCE = 0.05;

/** Model whose lowest visible point is `belowRoot` meters under its root. */
function makeModel(belowRoot: number, height = 1): THREE.Group {
  const model = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, height, 1));
  mesh.position.y = -(belowRoot + height / 2);
  model.add(mesh);
  return model;
}

/**
 * Skinned model whose source vertices live around Y=-60 but whose bind pose
 * renders around the root. Static geometry bounds reproduce the production
 * GLB failure; skinned vertex bounds describe what Three.js actually draws.
 */
function makeSkinnedBindOffsetModel(): THREE.Group {
  const model = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(0, -60, 0);
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  const position = geometry.getAttribute('position');
  // Stand in for a bind pose that moves distant source vertices back around
  // the visible root. Both the production helper and Three.js Box3 consume
  // getVertexPosition(), while the old broken helper consumed geometry.box.
  mesh.getVertexPosition = (index, target) => {
    target.fromBufferAttribute(position, index);
    target.y += 60;
    return target;
  };
  model.add(mesh);
  return model;
}

function dimsFor(
  enemyId: string,
  sizeClass: 'small' | 'medium' | 'large',
  tier: 'fodder' | 'specialist' | 'elite' | 'boss',
  sourceHeight = 2,
  belowRoot = 1,
) {
  return resolvedMonsterDimensions(
    enemyId,
    enemyId.replace('enemy.quaternius.', ''),
    { width: 1, height: sourceHeight, depth: 1, groundOffset: belowRoot },
    sizeClass,
    tier,
  );
}

function worldMinY(model: THREE.Object3D, terrainY: number): number {
  const group = new THREE.Group();
  group.add(model);
  group.position.y = terrainY;
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  return box.min.y;
}

describe('monster grounding production transform (second-pass)', () => {
  it('places a small ordinary model foot plane on flat terrain (y=0)', () => {
    const model = makeModel(1);
    applyMonsterScaleAndOffset(model, undefined, dimsFor('enemy.quaternius.ninja', 'small', 'fodder'));
    expect(worldMinY(model, 0)).toBeGreaterThanOrEqual(0);
    expect(worldMinY(model, 0)).toBeLessThanOrEqual(FOOT_TOLERANCE);
  });

  it('places a medium elite model foot plane on terrain', () => {
    const model = makeModel(1.2, 2.4);
    applyMonsterScaleAndOffset(model, undefined, dimsFor('enemy.quaternius.alien-high-detail', 'medium', 'elite', 2.4, 1.2));
    expect(Math.abs(worldMinY(model, 0))).toBeLessThanOrEqual(FOOT_TOLERANCE);
  });

  it('places a large boss model foot plane on terrain', () => {
    const model = makeModel(1.4, 3);
    applyMonsterScaleAndOffset(model, undefined, dimsFor('enemy.quaternius.demon-high-detail', 'large', 'boss', 3, 1.4));
    expect(Math.abs(worldMinY(model, 0))).toBeLessThanOrEqual(FOOT_TOLERANCE);
  });

  it('handles nonzero terrain height exactly', () => {
    const model = makeModel(1);
    applyMonsterScaleAndOffset(model, undefined, dimsFor('enemy.quaternius.ninja', 'small', 'fodder'));
    expect(Math.abs(worldMinY(model, 8) - 8)).toBeLessThanOrEqual(FOOT_TOLERANCE);
  });

  it('contacts sloped terrain at every sampled point', () => {
    for (const x of [0, 10, 25, 50]) {
      const terrainY = 2 + x * 0.08;
      const model = makeModel(1);
      applyMonsterScaleAndOffset(model, undefined, dimsFor('enemy.quaternius.ninja', 'small', 'fodder'));
      expect(Math.abs(worldMinY(model, terrainY) - terrainY)).toBeLessThanOrEqual(FOOT_TOLERANCE);
    }
  });

  it('composes a nonzero authored position and still grounds the final pose', () => {
    const model = makeModel(1);
    applyMonsterScaleAndOffset(model, { position: [2, 0.5, -1] }, dimsFor('enemy.quaternius.ninja', 'small', 'fodder'));
    const group = new THREE.Group();
    group.add(model);
    group.position.y = 3;
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    expect(Math.abs(box.min.y - 3)).toBeLessThanOrEqual(FOOT_TOLERANCE);
    expect(box.min.x).toBeGreaterThan(0.5);
    expect(box.max.z).toBeLessThan(-0.2);
  });

  it('uses rendered skinned bounds instead of distant bind-space geometry', () => {
    const model = makeSkinnedBindOffsetModel();
    const d = dimsFor('enemy.quaternius.ninja-high-detail', 'medium', 'elite', 1, 0.5);
    applyMonsterScaleAndOffset(model, undefined, d);

    // The old static-geometry path produced an offset around 60 * finalScale
    // and launched this model high above the terrain.
    expect(model.position.y).toBeLessThan((60 * d.finalScale) / 10);
    expect(Math.abs(worldMinY(model, 7) - 7)).toBeLessThanOrEqual(FOOT_TOLERANCE);
  });

  it('uses a prepared GLB ground marker instead of unstable bind-pose bounds', () => {
    const model = makeModel(80, 2);
    const anchor = new THREE.Object3D();
    anchor.name = 'socketshadow';
    model.add(anchor);
    applyMonsterScaleAndOffset(
      model,
      { position: [0, 0.5, 0] },
      dimsFor('enemy.quaternius.cactoro-high-detail', 'medium', 'elite', 2, 1),
    );
    const group = new THREE.Group();
    group.position.y = 6;
    group.add(model);
    group.updateMatrixWorld(true);
    const world = new THREE.Vector3();
    anchor.getWorldPosition(world);
    expect(world.y).toBeCloseTo(6, 6);
    expect(Math.abs(model.position.y)).toBeLessThan(1e-6);
  });

  it('grounds a procedural fallback even when its pivot is far from geometry', () => {
    const model = makeModel(62, 2);
    applyMonsterScaleAndOffset(
      model,
      { position: [0, 0.5, 0] },
      dimsFor('enemy.quaternius.ninja-high-detail', 'medium', 'elite', 2, 1),
    );
    expect(Math.abs(worldMinY(model, 5) - 5)).toBeLessThanOrEqual(FOOT_TOLERANCE);
  });

  it('grounds an authored-rotated model by measuring final bounds', () => {
    const model = makeModel(1);
    applyMonsterScaleAndOffset(
      model,
      { rotation: [Math.PI / 2, 0.3, 0] },
      dimsFor('enemy.quaternius.ninja', 'small', 'fodder'),
    );
    expect(Math.abs(worldMinY(model, 4)) - 4).toBeLessThanOrEqual(FOOT_TOLERANCE + 1e-9);
  });

  it('grounds a nonuniform profile-scaled model (vector scale never collapsed)', () => {
    const model = makeModel(1, 2);
    applyMonsterScaleAndOffset(
      model,
      { scale: [1.2, 0.8, 1.1] },
      dimsFor('enemy.quaternius.ninja', 'small', 'fodder', 2, 1),
    );
    expect(Math.abs(worldMinY(model, 2)) - 2).toBeLessThanOrEqual(FOOT_TOLERANCE + 1e-9);
    const group = new THREE.Group();
    group.add(model);
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    // Y scale must be 0.8 x finalScale, not the X component.
    expect(box.max.y - box.min.y).toBeCloseTo(1.02 * 0.8, 2);
    expect(box.max.x - box.min.x).toBeCloseTo(0.51 * 1.2, 2);
  });

  it('keeps near and far model variants on the same foot plane', () => {
    const d = dimsFor('enemy.quaternius.ninja', 'small', 'fodder');
    const near = makeModel(1, 2);
    const far = makeModel(0.7, 1.7);
    applyMonsterScaleAndOffset(near, undefined, d);
    applyMonsterScaleAndOffset(far, undefined, d);
    expect(Math.abs(worldMinY(near, 6) - 6)).toBeLessThanOrEqual(FOOT_TOLERANCE);
    expect(Math.abs(worldMinY(far, 6) - 6)).toBeLessThanOrEqual(FOOT_TOLERANCE);
  });

  it('preserves the same vertical envelope across near/far/aggregate variants', () => {
    const d = dimsFor('enemy.quaternius.ninja', 'small', 'fodder');
    const models = [
      makeModel(1, 2),
      makeModel(0.8, 1.8),
      makeModel(0.6, 1.6),
    ];
    const centers: number[] = [];
    for (const model of models) {
      applyMonsterScaleAndOffset(model, undefined, d);
      const group = new THREE.Group();
      group.add(model);
      group.position.y = 5;
      group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(group);
      expect(Math.abs(box.min.y - 5)).toBeLessThanOrEqual(FOOT_TOLERANCE);
      centers.push((box.min.y + box.max.y) / 2);
    }
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(0.5);
  });
});

describe('aggregate sector terrain placement (second-pass)', () => {
  function aggregatePrototype(belowRoot: number, height = 1): THREE.Group {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, height, 1));
    mesh.position.y = -(belowRoot + height / 2);
    group.add(mesh);
    return group;
  }

  it('uses the measured local foot offset at the ground height function', () => {
    const prototype = aggregatePrototype(1);
    const foot0 = localFootOffset(prototype);
    expect(foot0).toBeCloseTo(2, 4);
    const k = 2.5;
    const groundY = 7.25;
    const dummy = new THREE.Group();
    dummy.add(aggregatePrototype(1));
    dummy.rotation.y = 0.7;
    dummy.scale.setScalar(k);
    dummy.position.set(3, groundY + foot0 * k, -4);
    dummy.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(dummy);
    expect(Math.abs(box.min.y - groundY)).toBeLessThanOrEqual(FOOT_TOLERANCE);
  });

  it('places instanced aggregate sectors on raised terrain through the renderer', async () => {
    const scene = new THREE.Scene();
    const prototype = aggregatePrototype(1);
    const assets = {
      preloadModels: async () => undefined,
      model: () => prototype,
    } as never;
    const renderer = new AggregateSectorRenderer(
      scene,
      assets,
      () => ({
        id: 'enemyPresentation.quaternius.ninja.common',
        label: 'ninja',
        nearModelAssetId: 'near',
        farModelAssetId: 'far',
        aggregateModelAssetId: 'agg',
        lodPolicyId: 'animationLod.defaultHorde',
        shadowPolicyId: 'animationShadow.defaultHorde',
        transform: { scale: 1, position: [0, 0, 0] },
      }),
      32,
      () => 9.5,
    );
    renderer.update(
      [
        {
          sectorId: 1,
          x: 10,
          z: -10,
          count: 3,
          presentationProfileId: 'enemyPresentation.quaternius.ninja.common',
          enemyDefId: 'enemy.quaternius.ninja',
          presentationSeed: 7,
        },
      ],
      0,
      0,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(renderer.instanceCount).toBe(1);
    const groups = (
      renderer as unknown as {
        groups: Map<string, { instanced: THREE.InstancedMesh[] }>;
      }
    ).groups;
    const mesh = groups.get('agg')!.instanced[0];
    const dummy = new THREE.Object3D();
    mesh.getMatrixAt(0, dummy.matrix);
    const foot0 = localFootOffset(prototype);
    const dimsScale = resolveMonsterDimensionsForDefId('enemy.quaternius.ninja').finalScale;
    const crowdScale = THREE.MathUtils.clamp(0.7 + Math.sqrt(Math.min(8, 3)) * 0.25, 0.7, 1.8);
    const k = dimsScale * crowdScale;
    expect(dummy.matrix.elements[13]).toBeCloseTo(9.5 + foot0 * k, 3);
    renderer.reset();
  });
});
