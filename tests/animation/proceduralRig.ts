import * as THREE from 'three';
import { buildLoadedModelAsset, type LoadedModelAsset } from '../../src/client/assets/loadedModelAsset';

/**
 * Procedural skinned test fixture (tests only — no binary GLB committed).
 *
 * Three bones (root/mid/tip), one SkinnedMesh with skinIndex/skinWeight,
 * one looping locomotion clip ("Walk"), one one-shot clip ("Attack"), and
 * one death clip ("Death").
 */
export function buildProceduralSkinnedAsset(id = 'test.proceduralSkinned'): LoadedModelAsset {
  const root = new THREE.Group();
  const bone0 = new THREE.Bone();
  bone0.name = 'root';
  const bone1 = new THREE.Bone();
  bone1.name = 'mid';
  bone1.position.set(0, 1, 0);
  const bone2 = new THREE.Bone();
  bone2.name = 'tip';
  bone2.position.set(0, 1, 0);
  bone0.add(bone1);
  bone1.add(bone2);

  const geo = new THREE.BoxGeometry(0.5, 2.2, 0.5);
  const pos = geo.attributes.position;
  const skinIndex = new Float32Array(pos.count * 4);
  const skinWeight = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const primary = y < -0.6 ? 0 : y < 0.6 ? 1 : 2;
    skinIndex[i * 4] = primary;
    skinWeight[i * 4] = 1;
    if (primary !== 0) {
      skinIndex[i * 4 + 1] = 0;
      skinWeight[i * 4 + 1] = 0.2;
      skinWeight[i * 4] = 0.8;
    }
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));

  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x8a4b2f }));
  mesh.add(bone0);
  mesh.bind(new THREE.Skeleton([bone0, bone1, bone2]));
  root.add(mesh);

  const walkTimes = [0, 0.5, 1];
  const midBob: number[] = [];
  const tipBob: number[] = [];
  for (const t of walkTimes) {
    const bob = Math.sin(t * Math.PI * 2) * 0.15;
    midBob.push(0, bob, 0);
    tipBob.push(0, -bob, 0);
  }
  const walk = new THREE.AnimationClip('Walk', 1, [
    new THREE.VectorKeyframeTrack('mid.position', walkTimes, midBob),
    new THREE.VectorKeyframeTrack('tip.position', walkTimes, tipBob),
  ]);

  const q0 = new THREE.Quaternion();
  const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 1.1);
  const attack = new THREE.AnimationClip('Attack', 0.5, [
    new THREE.QuaternionKeyframeTrack('mid.quaternion', [0, 0.25, 0.5], [
      q0.x, q0.y, q0.z, q0.w,
      q1.x, q1.y, q1.z, q1.w,
      q0.x, q0.y, q0.z, q0.w,
    ]),
  ]);

  const staggerQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.6);
  const stagger = new THREE.AnimationClip('Stagger', 0.35, [
    new THREE.QuaternionKeyframeTrack('mid.quaternion', [0, 0.35], [
      q0.x, q0.y, q0.z, q0.w,
      staggerQ.x, staggerQ.y, staggerQ.z, staggerQ.w,
    ]),
  ]);

  const deathQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 1.5);
  const death = new THREE.AnimationClip('Death', 0.8, [
    new THREE.QuaternionKeyframeTrack('root.quaternion', [0, 0.8], [
      q0.x, q0.y, q0.z, q0.w,
      deathQ.x, deathQ.y, deathQ.z, deathQ.w,
    ]),
  ]);

  return buildLoadedModelAsset(id, root, [walk, attack, stagger, death]);
}

/** Procedural rigid fixture with no clips (mirrors legacy built-ins). */
export function buildProceduralRigidAsset(id = 'test.proceduralRigid'): LoadedModelAsset {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x9aa3ad })));
  return buildLoadedModelAsset(id, root);
}

/** Fake GLTF loader factory for asset tests. */
export function fakeGltfLoaderFactory(
  _onLoad?: (gltf: { scene: THREE.Object3D; animations?: THREE.AnimationClip[] }) => void,
  onError?: (err: unknown) => void,
): () => Promise<{
  load(
    url: string,
    load: (gltf: { scene: THREE.Object3D; animations?: THREE.AnimationClip[] }) => void,
    progress?: unknown,
    error?: (err: unknown) => void,
  ): void;
}> {
  return async () => ({
    load(_url, load, _progress, error) {
      if (onError) error?.(new Error('boom'));
      else load({ scene: buildScene(), animations: [makeClip()] });
    },
  });
}

function buildScene(): THREE.Object3D {
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
  return scene;
}

function makeClip(): THREE.AnimationClip {
  return new THREE.AnimationClip('Idle', 1, []);
}
