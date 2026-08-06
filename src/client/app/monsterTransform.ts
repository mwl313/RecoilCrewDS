import * as THREE from 'three';
import type { EnemyPresentationProfileDefinition } from '../../shared/animation/animationProfileTypes';
import type { ResolvedMonsterDimensions } from '../../shared/monsters/monsterNormalization';

/**
 * Production monster grounding and transform composition (second-pass).
 *
 * One documented convention:
 *
 *   sourceGroundOffset = max(0, -sourceMinY)
 *   scaledGroundOffset = sourceGroundOffset x finalScale
 *   visualRootY        = terrainY + authoredScaledY + scaledGroundOffset
 *
 * `finalScale` always composes normalization scale x tier scale x optional
 * variant scale. This helper also composes the full authored profile pose:
 * vector scale, rotation, and position. Because an authored rotation changes
 * the model's vertical extent, the ground offset is measured from the model's
 * own final local bounds after rotation/scale, so the lowest visible point
 * lands exactly on the terrain plane (the canonical unrotated case reduces
 * to `scaledGroundOffset = sourceGroundOffset x finalScale`).
 *
 * Parent transforms are intentionally ignored while measuring: the entity
 * group carries the terrain/airborne Y each frame, so the model's local foot
 * plane is always 0.
 */

const _m1 = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _box = new THREE.Box3();
const _box2 = new THREE.Box3();

/**
 * Apply the authoritative monster pose to a loaded model:
 *   - normalization scale x tier scale x variant scale
 *   - full authored profile scale (vector, never collapsed to X)
 *   - authored rotation
 *   - authored position (scaled)
 *   - ground correction measured from the model's final local bounds
 */
export function applyMonsterScaleAndOffset(
  model: THREE.Object3D,
  transform: EnemyPresentationProfileDefinition['transform'] | undefined,
  dims: ResolvedMonsterDimensions,
): void {
  model.rotation.set(0, 0, 0);
  model.scale.set(1, 1, 1);
  model.position.set(0, 0, 0);

  const rotation = transform?.rotation;
  if (rotation) model.rotation.set(rotation[0], rotation[1], rotation[2]);

  const profileScale = transform?.scale;
  const sx = typeof profileScale === 'number' ? profileScale : (profileScale?.[0] ?? 1);
  const sy = typeof profileScale === 'number' ? profileScale : (profileScale?.[1] ?? 1);
  const sz = typeof profileScale === 'number' ? profileScale : (profileScale?.[2] ?? 1);
  const k = dims.finalScale;
  model.scale.set(sx * k, sy * k, sz * k);

  // Measure with position (0,0,0): the foot offset is the distance from the
  // root to the lowest bound after rotation + full vector scale.
  const footOffset = localFootOffset(model);

  const position = transform?.position;
  model.position.set(
    (position?.[0] ?? 0) * k,
    (position?.[1] ?? 0) * k + footOffset,
    (position?.[2] ?? 0) * k,
  );
}

/**
 * Distance (>= 0 when feet are below the root) from an object's local root
 * to its lowest local-space bound. Rotation, scale, and nested child
 * transforms are included; parent transforms are ignored.
 */
export function localFootOffset(object: THREE.Object3D): number {
  _box.makeEmpty();
  expandLocalBounds(object, _box, _m1.identity());
  return -_box.min.y;
}

function expandLocalBounds(
  object: THREE.Object3D,
  out: THREE.Box3,
  parentMatrix: THREE.Matrix4,
): void {
  object.updateMatrix();
  const world = _m2.multiplyMatrices(parentMatrix, object.matrix).clone();
  const geometry = (object as THREE.Mesh).geometry;
  if (geometry) {
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const gb = geometry.boundingBox!;
    _box2.copy(gb).applyMatrix4(world);
    out.union(_box2);
  }
  for (const child of object.children) {
    expandLocalBounds(child, out, world);
  }
}
