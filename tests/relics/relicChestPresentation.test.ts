import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  RELIC_CHEST_OPEN_ANGLE_DEGREES,
  RelicChestPresentation,
} from '../../src/client/relics/relicChestPresentation';

describe('RelicChestPresentation', () => {
  it('clamps progress and keeps every state finite', () => {
    const { presentation } = fixture();
    presentation.setOpenProgress(-5);
    expect(presentation.getOpenProgress()).toBe(0);
    presentation.setOpenProgress(9);
    expect(presentation.getOpenProgress()).toBe(1);
    presentation.setOpenProgress(Number.NaN);
    expect(presentation.getOpenProgress()).toBe(0);
    expect(Object.values(presentation.getDiagnostics()).filter((value) => typeof value === 'number').every(Number.isFinite)).toBe(true);
    presentation.dispose();
  });

  it('rotates the lid monotonically from closed to the solved open angle', () => {
    const { presentation, lid } = fixture();
    const rotations: number[] = [];
    for (let step = 0; step <= 20; step += 1) {
      presentation.setOpenProgress(step / 20);
      rotations.push(lid.rotation.x);
    }
    expect(rotations.every((value, index) => index === 0 || value <= rotations[index - 1])).toBe(true);
    expect(THREE.MathUtils.radToDeg(rotations.at(-1)!)).toBeCloseTo(RELIC_CHEST_OPEN_ANGLE_DEGREES, 5);
    presentation.dispose();
  });

  it('opens and closes through one reversible 0.65 second runtime state', () => {
    const { presentation, lid } = fixture();
    presentation.open();
    for (let i = 0; i < 13; i += 1) presentation.update(0.05);
    expect(presentation.getOpenProgress()).toBe(1);
    const openRotation = lid.rotation.x;
    presentation.close();
    presentation.update(0.1);
    expect(presentation.getOpenProgress()).toBeLessThan(1);
    expect(lid.rotation.x).toBeGreaterThan(openRotation);
    for (let i = 0; i < 12; i += 1) presentation.update(0.05);
    expect(presentation.getOpenProgress()).toBe(0);
    expect(lid.rotation.x).toBe(0);
    presentation.dispose();
  });

  it('uses the exact same openProgress for lid and ray diagnostics without NaNs', () => {
    const { presentation, root } = fixture();
    presentation.setOpenProgress(0.5);
    const diagnostics = presentation.getDiagnostics();
    expect(diagnostics.openProgress).toBe(0.5);
    expect(diagnostics.easedLidProgress).toBe(0.5);
    expect(diagnostics.rayOpacity).toBeGreaterThan(0.075);
    expect(diagnostics.rayWidth).toBeGreaterThan(0.038);
    expect(diagnostics.rayLength).toBeGreaterThan(0.62);

    root.updateMatrixWorld(true);
    root.traverse((object) => {
      expect(object.matrix.elements.every(Number.isFinite)).toBe(true);
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        expect(Number.isFinite(material.opacity)).toBe(true);
        if (material instanceof THREE.ShaderMaterial) {
          expect(Object.values(material.uniforms).every((uniform) => {
            const value = uniform.value as unknown;
            return typeof value !== 'number' || Number.isFinite(value);
          })).toBe(true);
        }
      }
    });
    presentation.dispose();
  });

  it('fans a dense ray field through every horizontal direction at full open', () => {
    const { presentation, root } = fixture();
    presentation.setOpenProgress(1);
    const directions: THREE.Vector3[] = [];
    for (let index = 1; index <= 18; index += 1) {
      const ray = root.getObjectByName(`RelicChestRay${index}`);
      expect(ray, `RelicChestRay${index}`).toBeTruthy();
      expect(ray?.children).toHaveLength(2);
      directions.push(new THREE.Vector3(0, 1, 0).applyQuaternion(ray!.quaternion));
    }
    expect(Math.min(...directions.map((direction) => direction.x))).toBeLessThan(-0.45);
    expect(Math.max(...directions.map((direction) => direction.x))).toBeGreaterThan(0.45);
    expect(Math.min(...directions.map((direction) => direction.z))).toBeLessThan(-0.45);
    expect(Math.max(...directions.map((direction) => direction.z))).toBeGreaterThan(0.45);
    expect(directions.every((direction) => direction.y > 0)).toBe(true);
    presentation.dispose();
  });

  it('contains the interior core and pulses a separate exterior aura smoothly', () => {
    const { presentation, root, chestMaterial } = fixture();
    presentation.setOpenProgress(1);
    const core = root.getObjectByName('RelicChestCoreGlow');
    const aura = root.getObjectByName('RelicChestPulsingAura') as THREE.Sprite;
    expect(core?.scale.x).toBeLessThanOrEqual(0.54);
    expect(core?.scale.y).toBeLessThanOrEqual(0.36);
    expect(aura).toBeTruthy();
    expect(aura.material.name).toBe('RelicChestPulsingAuraMaterial');
    expect(aura.material.depthTest).toBe(true);
    expect((core as THREE.Mesh).material).toMatchObject({ depthTest: true });
    for (let index = 1; index <= 18; index += 1) {
      const ray = root.getObjectByName(`RelicChestRay${index}`) as THREE.Group;
      expect((ray.children[0] as THREE.Mesh).material).toMatchObject({ depthTest: true });
    }

    const initialOpacity = aura.material.opacity;
    presentation.update(0.45);
    const risingOpacity = aura.material.opacity;
    presentation.update(0.45);
    const peakOpacity = aura.material.opacity;
    expect(risingOpacity).toBeGreaterThan(initialOpacity);
    expect(peakOpacity).toBeGreaterThan(risingOpacity);
    expect(peakOpacity).toBeLessThanOrEqual(0.576);
    expect(chestMaterial.emissive.getHex()).toBe(0x000000);
    presentation.dispose();
  });

  it('reset returns to the exact authored closed pose and never mutates chest materials', () => {
    const { presentation, root, lid, chestMaterial } = fixture(0.123);
    const originalColor = chestMaterial.color.getHex();
    const originalEmissive = chestMaterial.emissive.getHex();
    presentation.setOpenProgress(0.8);
    presentation.reset();
    expect(lid.rotation.x).toBe(0.123);
    expect(presentation.getOpenProgress()).toBe(0);
    expect(chestMaterial.color.getHex()).toBe(originalColor);
    expect(chestMaterial.emissive.getHex()).toBe(originalEmissive);
    presentation.setRaysVisible(false);
    expect(presentation.getDiagnostics().raysVisible).toBe(false);
    expect(root.getObjectByName('RelicChestRay1')?.visible).toBe(false);
    expect(root.getObjectByName('RelicChestCoreGlow')?.visible).toBe(true);
    expect(root.getObjectByName('RelicChestPulsingAura')?.visible).toBe(true);
    presentation.dispose();
  });

  it('fades only the separate gold effect layers for world despawn', () => {
    const { presentation, root, chestMaterial } = fixture();
    presentation.setOpenProgress(1);
    presentation.setEffectOpacity(0);

    const core = root.getObjectByName('RelicChestCoreGlow') as THREE.Mesh;
    const aura = root.getObjectByName('RelicChestPulsingAura') as THREE.Sprite;
    const ray = root.getObjectByName('RelicChestRay1') as THREE.Group;
    expect((core.material as THREE.ShaderMaterial).uniforms.opacity.value).toBe(0);
    expect(aura.material.opacity).toBe(0);
    expect(((ray.children[0] as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.opacity.value).toBe(0);
    expect(chestMaterial.color.getHex()).toBe(0x5e3024);
    expect(chestMaterial.emissive.getHex()).toBe(0x000000);
    presentation.dispose();
  });
});

function fixture(closedRotation = 0): {
  root: THREE.Group;
  lid: THREE.Group;
  chestMaterial: THREE.MeshStandardMaterial;
  presentation: RelicChestPresentation;
} {
  const root = new THREE.Group();
  root.name = 'RelicChest';
  const base = new THREE.Group();
  base.name = 'Base';
  const lid = new THREE.Group();
  lid.name = 'Lid';
  lid.rotation.x = closedRotation;
  const glow = new THREE.Group();
  glow.name = 'GlowOrigin';
  const reward = new THREE.Group();
  reward.name = 'RewardAnchor';
  const chestMaterial = new THREE.MeshStandardMaterial({ color: 0x5e3024, emissive: 0x000000 });
  base.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 0.8), chestMaterial), glow, reward);
  root.add(base, lid);
  return { root, lid, chestMaterial, presentation: new RelicChestPresentation(root) };
}
