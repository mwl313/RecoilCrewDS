import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  ENEMY_GROUND_PRESENCE_STYLES,
  EnemyGroundPresenceRenderer,
  presenceClassForEnemy,
  presenceDistanceFade,
} from '../../src/client/enemies/enemyGroundPresenceRenderer';
import type { EnemyState } from '../../src/shared/types';

function enemy(id: number, defId: string, rewardClass: 'ambient' | 'wave' | 'elite' | 'boss'): EnemyState {
  return {
    id, type: 'monster', defId, x: id, y: 40, z: 0, yaw: 0,
    hp: 10, maxHp: 10, state: 'hunt', stateT: 0, aimYaw: 0, speed: 0,
    alive: true, telegraph: 0, flash: 0, spawnT: 0,
    monster: {
      spawnLevel: 1, healthMultiplierAtSpawn: 1, damageMultiplierAtSpawn: 1,
      maxHpAtSpawn: 10, resolvedRewardXp: 1, rewardClass,
    },
  };
}

describe('EnemyGroundPresenceRenderer', () => {
  it('uses semantic tier styles and binding colors', () => {
    expect(presenceClassForEnemy(enemy(1, 'enemy.quaternius.ninja', 'wave'))).toBe('ordinary');
    expect(presenceClassForEnemy(enemy(2, 'enemy.quaternius.alien-high-detail', 'ambient'))).toBe('elite');
    expect(presenceClassForEnemy(enemy(3, 'enemy.quaternius.demon-high-detail', 'ambient'))).toBe('boss');
    expect(ENEMY_GROUND_PRESENCE_STYLES.ordinary.color).toBe(0x9e332c);
    expect(ENEMY_GROUND_PRESENCE_STYLES.elite.color).toBe(0xb56cff);
    expect(ENEMY_GROUND_PRESENCE_STYLES.boss.color).toBe(0xff304d);
    expect(ENEMY_GROUND_PRESENCE_STYLES.bossOuter.color).toBe(0xf3dfcf);
  });

  it('fades ordinary at 45–90 m and retains specials beyond 90 m', () => {
    expect(presenceDistanceFade('ordinary', 45)).toBe(1);
    expect(presenceDistanceFade('ordinary', 67.5)).toBeCloseTo(0.5);
    expect(presenceDistanceFade('ordinary', 90)).toBe(0);
    expect(presenceDistanceFade('elite', 90)).toBeCloseTo(0.35);
    expect(presenceDistanceFade('boss', 120)).toBe(0);
  });

  it('bounds instances, terrain-aligns them, and uses occluded materials', () => {
    const scene = new THREE.Scene();
    const renderer = new EnemyGroundPresenceRenderer(scene, 3, (x) => x * 0.5, true);
    const enemies = [
      enemy(1, 'enemy.quaternius.ninja', 'wave'),
      enemy(2, 'enemy.quaternius.alien-high-detail', 'elite'),
      enemy(3, 'enemy.quaternius.demon-high-detail', 'boss'),
      enemy(4, 'enemy.quaternius.tribal', 'wave'),
    ];
    renderer.sync(enemies, 0, 0, 2);
    expect(renderer.diagnostics()).toMatchObject({
      capacity: 3,
      activeEnemies: 3,
      counts: { ordinary: 1, elite: 1, boss: 1, bossOuter: 1 },
    });
    const meshes = scene.children.filter((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh);
    expect(meshes).toHaveLength(4);
    for (const mesh of meshes) {
      const material = mesh.material as THREE.ShaderMaterial;
      expect(material.depthTest).toBe(true);
      expect(material.depthWrite).toBe(false);
      expect(material.polygonOffset).toBe(true);
    }
    const ordinary = scene.getObjectByName('enemy-ground-presence.ordinary') as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    ordinary.getMatrixAt(0, matrix);
    position.setFromMatrixPosition(matrix);
    expect(position.y).toBeCloseTo(0.5 + 0.035, 6);
    renderer.sync(enemies, 0, 0, 3);
    expect(scene.children.filter((child) => child instanceof THREE.InstancedMesh)).toHaveLength(4);
  });

  it('disables boss pulse for reduced motion and resets/disposes cleanly', () => {
    const scene = new THREE.Scene();
    const renderer = new EnemyGroundPresenceRenderer(scene, 8, () => 0, true);
    const boss = [enemy(1, 'enemy.quaternius.demon-high-detail', 'boss')];
    const mesh = scene.getObjectByName('enemy-ground-presence.boss') as THREE.InstancedMesh;
    const first = new THREE.Matrix4();
    const second = new THREE.Matrix4();
    renderer.sync(boss, 0, 0, 1);
    mesh.getMatrixAt(0, first);
    renderer.sync(boss, 0, 0, 5);
    mesh.getMatrixAt(0, second);
    expect(first.elements).toEqual(second.elements);
    renderer.reset();
    expect(renderer.diagnostics().activeEnemies).toBe(0);
    expect(Object.values(renderer.diagnostics().counts).every((count) => count === 0)).toBe(true);
    renderer.dispose();
    expect(renderer.diagnostics().disposed).toBe(true);
    expect(scene.children.filter((child) => child instanceof THREE.InstancedMesh)).toHaveLength(0);
  });

  it('keeps 200 ordinary enemies inside one bounded style batch', () => {
    const scene = new THREE.Scene();
    const renderer = new EnemyGroundPresenceRenderer(scene, 512, () => 0, true);
    const enemies = Array.from({ length: 200 }, (_, index) => ({
      ...enemy(index + 1, 'enemy.quaternius.ninja', 'wave'),
      x: (index % 20) - 10,
      z: Math.floor(index / 20) - 5,
    }));
    renderer.sync(enemies, 0, 0, 1);
    expect(renderer.diagnostics()).toMatchObject({
      capacity: 512,
      activeEnemies: 200,
      counts: { ordinary: 200, elite: 0, boss: 0, bossOuter: 0 },
    });
    expect(scene.children.filter((child) => child instanceof THREE.InstancedMesh)).toHaveLength(4);
    renderer.dispose();
  });
});
