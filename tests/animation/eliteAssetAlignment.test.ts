import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HERO_POSE_ASSETS = [
  'alien-high-detail',
  'cactoro-high-detail',
  'fish-high-detail',
  'ninja-high-detail',
  'demon-high-detail',
  'yeti-high-detail',
  'orc',
  'mushroom-king',
] as const;

async function loadElite(slug: string) {
  const file = path.join(
    ROOT,
    'public',
    'assets',
    'models',
    'enemies',
    'quaternius',
    'hero',
    `${slug}.hero.glb`,
  );
  const bytes = readFileSync(file);
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new GLTFLoader().parseAsync(data, pathToFileURL(path.dirname(file) + path.sep).href);
}

describe('runtime hero asset alignment regressions', () => {
  for (const slug of HERO_POSE_ASSETS) {
    it(`${slug} keeps its idle body grounded and centered on the gameplay root`, async () => {
      const gltf = await loadElite(slug);
      const root = cloneSkeleton(gltf.scene);
      const idle = gltf.animations.find((clip) => clip.name.endsWith('|Idle'));
      expect(idle).toBeDefined();
      const mixer = new THREE.AnimationMixer(root);
      const action = mixer.clipAction(idle!);
      action.play();
      mixer.setTime(Math.max(0, idle!.duration - 0.001));
      root.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(root, true);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const anchor = root.getObjectByName('socketshadow') ?? root.getObjectByName('socket.shadow');
      expect(anchor).toBeDefined();
      const ground = new THREE.Vector3();
      anchor!.getWorldPosition(ground);

      expect(ground.y - box.min.y).toBeLessThanOrEqual(Math.max(0.08, size.y * 0.15));
      expect(Math.hypot(center.x - ground.x, center.z - ground.z)).toBeLessThanOrEqual(
        Math.max(0.25, Math.max(size.x, size.z) * 0.35),
      );
    });
  }
});
