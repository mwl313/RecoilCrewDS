import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildModelInstance, createModelInstanceRoot } from '../../src/client/animation/animatedModelInstanceFactory';
import { buildProceduralRigidAsset, buildProceduralSkinnedAsset } from './proceduralRig';

describe('safe skeleton cloning (animation07 M2)', () => {
  it('two skinned clones have independent bone transforms', () => {
    const source = buildProceduralSkinnedAsset();
    const a = buildModelInstance(source);
    const b = buildModelInstance(source);
    expect(a.skinned).toBe(true);
    expect(b.skinned).toBe(true);
    expect(a.root).not.toBe(b.root);
    expect(a.root.getObjectByName('mid')).not.toBe(b.root.getObjectByName('mid'));

    const boneA = a.root.getObjectByName('mid') as THREE.Bone;
    boneA.position.y = 9;
    const boneB = b.root.getObjectByName('mid') as THREE.Bone;
    expect(boneB.position.y).toBeCloseTo(1);
  });

  it('clip data is shared between clones (immutable source clips)', () => {
    const source = buildProceduralSkinnedAsset();
    const a = buildModelInstance(source);
    const b = buildModelInstance(source);
    expect(a.source.animations).toBe(b.source.animations);
    const walk = source.animations.find((c) => c.name === 'Walk')!;
    expect(a.source.animations).toContain(walk);
    expect(b.source.animations).toContain(walk);
  });

  it('animating one clone does not pose another', () => {
    const source = buildProceduralSkinnedAsset();
    const a = buildModelInstance(source);
    const b = buildModelInstance(source);
    const mixerA = new THREE.AnimationMixer(a.root);
    const actionA = mixerA.clipAction(source.animations.find((c) => c.name === 'Walk')!);
    actionA.play();
    mixerA.update(0.25);
    const boneB = b.root.getObjectByName('mid') as THREE.Bone;
    expect(boneB.position.y).toBeCloseTo(1);
    mixerA.stopAllAction();
    mixerA.uncacheRoot(a.root);
  });

  it('rigid models use the plain clone path (no bones, no mixer needed)', () => {
    const source = buildProceduralRigidAsset();
    const instance = buildModelInstance(source);
    expect(instance.skinned).toBe(false);
    expect(instance.root).not.toBe(source.scene);
    expect(instance.root.getObjectByName('mid')).toBeUndefined();
    const root = createModelInstanceRoot(source);
    expect(root).toBeInstanceOf(THREE.Group);
  });

  it('cloned materials are per-instance when requested', () => {
    const source = buildProceduralRigidAsset();
    const shared = buildModelInstance(source).root;
    const owned = buildModelInstance(source, { cloneMaterials: true }).root;
    const sourceMat = (source.scene.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const sharedMat = (shared.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const ownedMat = (owned.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(sharedMat).toBe(sourceMat);
    expect(ownedMat).not.toBe(sourceMat);
    ownedMat.color.setHex(0xff0000);
    expect(sourceMat.color.getHex()).not.toBe(0xff0000);
  });
});
