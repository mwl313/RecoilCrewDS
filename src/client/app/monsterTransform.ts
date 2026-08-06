import * as THREE from 'three';
import type { EnemyPresentationProfileDefinition } from '../../shared/animation/animationProfileTypes';
import type { ResolvedMonsterDimensions } from '../../shared/monsters/monsterNormalization';
import { resolveGeneratedGroundOffset } from '../../shared/monsters/monsterNormalization';

/**
 * Production monster grounding and transform composition (second-pass).
 *
 * One documented convention:
 *
 *   sourceGroundOffset = max(0, -sourceMinY)
 *   scaledGroundOffset = sourceGroundOffset x finalScale
 *   visualRootY        = terrainY + authoredScaledY + groundCorrection
 *
 * `finalScale` always composes normalization scale x tier scale x optional
 * variant scale. This helper also composes the full authored profile pose:
 * vector scale, rotation, and position. Prepared animated imports ground from
 * their authored `socketshadow` marker because bind-pose/animated bounds are
 * not a stable ground reference. Markerless models use generated dimensions;
 * no render-time mesh or skinned-vertex bounds scan is performed.
 *
 * Parent transforms are intentionally ignored while measuring: the entity
 * group carries the terrain/airborne Y each frame, so the model's local foot
 * plane is always 0.
 */

const _m1 = new THREE.Matrix4();
const _vertex = new THREE.Vector3();
const MONSTER_GROUND_ANCHOR = 'socketshadow';

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
  applyMonsterPose(model, transform, dims);
  groundMonsterModel(model, transform, dims);
}

/** Compose the authored pose without reading bounds. */
function applyMonsterPose(
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

  const position = transform?.position;
  model.position.set(
    (position?.[0] ?? 0) * k,
    (position?.[1] ?? 0) * k,
    (position?.[2] ?? 0) * k,
  );
}

/** Ground an already-posed model from its current rendered bounds. */
function groundMonsterModel(
  model: THREE.Object3D,
  transform: EnemyPresentationProfileDefinition['transform'] | undefined,
  dims: ResolvedMonsterDimensions,
): void {
  // Measure after composing the complete authored pose. This is important
  // for imported profiles with a non-zero Y position: adding their authored
  // Y after grounding would turn that metadata into a visible hover.
  // Prepared imported monsters expose a stable semantic ground marker. Use
  // it instead of transient skinned bounds (which are invalid in the freshly
  // cloned bind pose and naturally move during walk/jump animation). Static
  // and markerless models use the generated neutral-pose AABB.
  const anchor = model.getObjectByName(MONSTER_GROUND_ANCHOR);
  model.position.y += anchor ? localObjectOffset(model, anchor) : resolveGeneratedGroundOffset(dims, transform);
}

function localObjectOffset(model: THREE.Object3D, object: THREE.Object3D): number {
  if (model.parent) model.parent.updateWorldMatrix(true, false);
  model.updateWorldMatrix(true, true);
  object.getWorldPosition(_vertex);
  if (model.parent) _vertex.applyMatrix4(_m1.copy(model.parent.matrixWorld).invert());
  return -_vertex.y;
}
