import * as THREE from 'three';
import { ENEMY_DEFINITION_SIZE_TIER } from '../../generated/monsterDimensions.generated';
import { normalizedEnemyClass } from '../../shared/enemies/enemyClassification';
import { resolveMonsterDimensionsForDefId } from '../../shared/monsters/monsterNormalization';
import type { EnemyState } from '../../shared/types';

export type EnemyPresenceClass = 'ordinary' | 'elite' | 'boss';
export type EnemyPresenceLayer = EnemyPresenceClass | 'bossOuter';

export const ENEMY_GROUND_PRESENCE_STYLES: Readonly<Record<EnemyPresenceLayer, {
  color: number;
  opacity: number;
  radiusMultiplier: number;
  segmented: boolean;
}>> = {
  ordinary: { color: 0x9e332c, opacity: 0.18, radiusMultiplier: 1, segmented: false },
  elite: { color: 0xb56cff, opacity: 0.32, radiusMultiplier: 1.08, segmented: true },
  boss: { color: 0xff304d, opacity: 0.34, radiusMultiplier: 1.12, segmented: false },
  bossOuter: { color: 0xf3dfcf, opacity: 0.19, radiusMultiplier: 1.34, segmented: true },
};

export function presenceClassForEnemy(enemy: EnemyState): EnemyPresenceClass {
  const tier = enemy.defId ? ENEMY_DEFINITION_SIZE_TIER[enemy.defId]?.tier : undefined;
  if (tier === 'boss') return 'boss';
  if (tier === 'elite') return 'elite';
  if (tier === 'fodder' || tier === 'specialist') return 'ordinary';
  const semanticClass = normalizedEnemyClass(enemy);
  return semanticClass === 'boss' ? 'boss' : semanticClass === 'elite' ? 'elite' : 'ordinary';
}

export function presenceDistanceFade(style: EnemyPresenceClass, distance: number): number {
  if (distance <= 45) return 1;
  if (style === 'ordinary') return THREE.MathUtils.clamp(1 - (distance - 45) / 45, 0, 1);
  if (distance <= 90) return THREE.MathUtils.lerp(1, 0.35, (distance - 45) / 45);
  return THREE.MathUtils.clamp(0.35 * (1 - (distance - 90) / 30), 0, 0.35);
}

interface PresenceBatch {
  mesh: THREE.InstancedMesh<THREE.CircleGeometry, THREE.ShaderMaterial>;
  alphas: THREE.InstancedBufferAttribute;
}

export interface EnemyGroundPresenceDiagnostics {
  capacity: number;
  activeEnemies: number;
  counts: Record<EnemyPresenceLayer, number>;
  disposed: boolean;
}

/**
 * Four fixed instanced layers (ordinary, elite, boss inner/outer) cover the
 * complete enemy population. Geometry is terrain-aligned and depth-tested;
 * per-instance alpha supplies distance fading without sprites or DOM nodes.
 */
export class EnemyGroundPresenceRenderer {
  private readonly batches: Record<EnemyPresenceLayer, PresenceBatch>;
  private readonly dummy = new THREE.Object3D();
  private activeEnemies = 0;
  private disposed = false;
  private readonly reducedMotion: boolean;

  constructor(
    private readonly scene: THREE.Scene,
    readonly capacity: number,
    private readonly groundHeightAt: (x: number, z: number) => number = () => 0,
    reducedMotion = typeof globalThis.matchMedia === 'function'
      && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches,
  ) {
    this.reducedMotion = reducedMotion;
    this.batches = {
      ordinary: this.createBatch('ordinary'),
      elite: this.createBatch('elite'),
      boss: this.createBatch('boss'),
      bossOuter: this.createBatch('bossOuter'),
    };
  }

  sync(
    enemies: readonly EnemyState[],
    focusX: number,
    focusZ: number,
    elapsedSeconds: number,
  ): void {
    if (this.disposed) return;
    const counts: Record<EnemyPresenceLayer, number> = {
      ordinary: 0,
      elite: 0,
      boss: 0,
      bossOuter: 0,
    };
    this.activeEnemies = 0;
    for (const enemy of enemies) {
      if (!enemy.alive || this.activeEnemies >= this.capacity) continue;
      const style = presenceClassForEnemy(enemy);
      const distance = Math.hypot(enemy.x - focusX, enemy.z - focusZ);
      const fade = presenceDistanceFade(style, distance);
      if (fade <= 0) continue;
      const radius = this.radiusFor(enemy);
      const pulse = style === 'boss' && !this.reducedMotion
        ? 1 + Math.sin(elapsedSeconds * 0.75) * 0.03
        : 1;
      this.writeInstance(style, counts[style]++, enemy, radius * pulse, fade);
      if (style === 'boss') {
        this.writeInstance('bossOuter', counts.bossOuter++, enemy, radius * pulse, fade);
      }
      this.activeEnemies++;
    }
    for (const layer of Object.keys(this.batches) as EnemyPresenceLayer[]) {
      const batch = this.batches[layer];
      batch.mesh.count = counts[layer];
      batch.mesh.instanceMatrix.needsUpdate = true;
      batch.alphas.needsUpdate = true;
    }
  }

  reset(): void {
    this.activeEnemies = 0;
    for (const batch of Object.values(this.batches)) {
      batch.mesh.count = 0;
      batch.mesh.instanceMatrix.needsUpdate = true;
      batch.alphas.needsUpdate = true;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.reset();
    for (const batch of Object.values(this.batches)) {
      this.scene.remove(batch.mesh);
      batch.mesh.geometry.dispose();
      batch.mesh.material.dispose();
    }
    this.disposed = true;
  }

  diagnostics(): EnemyGroundPresenceDiagnostics {
    return {
      capacity: this.capacity,
      activeEnemies: this.activeEnemies,
      counts: {
        ordinary: this.batches.ordinary.mesh.count,
        elite: this.batches.elite.mesh.count,
        boss: this.batches.boss.mesh.count,
        bossOuter: this.batches.bossOuter.mesh.count,
      },
      disposed: this.disposed,
    };
  }

  private radiusFor(enemy: EnemyState): number {
    if (enemy.defId && ENEMY_DEFINITION_SIZE_TIER[enemy.defId]) {
      return resolveMonsterDimensionsForDefId(enemy.defId).shadowRadius;
    }
    return enemy.type === 'gunTower' ? 2.2 : enemy.type === 'rammer' ? 1.65 : 1.25;
  }

  private writeInstance(
    layer: EnemyPresenceLayer,
    slot: number,
    enemy: EnemyState,
    radius: number,
    fade: number,
  ): void {
    const style = ENEMY_GROUND_PRESENCE_STYLES[layer];
    this.dummy.position.set(enemy.x, this.groundHeightAt(enemy.x, enemy.z) + 0.035, enemy.z);
    this.dummy.rotation.set(-Math.PI / 2, 0, 0);
    this.dummy.scale.setScalar(radius * style.radiusMultiplier);
    this.dummy.updateMatrix();
    const batch = this.batches[layer];
    batch.mesh.setMatrixAt(slot, this.dummy.matrix);
    batch.alphas.setX(slot, style.opacity * fade);
  }

  private createBatch(layer: EnemyPresenceLayer): PresenceBatch {
    const geometry = new THREE.CircleGeometry(1, 40);
    const alphas = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity), 1);
    alphas.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('instanceAlpha', alphas);
    const style = ENEMY_GROUND_PRESENCE_STYLES[layer];
    const material = new THREE.ShaderMaterial({
      uniforms: {
        markerColor: { value: new THREE.Color(style.color) },
        markerMode: { value: layer === 'ordinary' ? 0 : layer === 'elite' ? 1 : layer === 'boss' ? 2 : 3 },
      },
      vertexShader: `
        attribute float instanceAlpha;
        varying vec2 vMarkerUv;
        varying float vInstanceAlpha;
        void main() {
          vMarkerUv = uv;
          vInstanceAlpha = instanceAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 markerColor;
        uniform float markerMode;
        varying vec2 vMarkerUv;
        varying float vInstanceAlpha;
        void main() {
          vec2 p = (vMarkerUv - 0.5) * 2.0;
          float radius = length(p);
          float outer = 1.0 - smoothstep(0.90, 1.0, radius);
          float ring = smoothstep(0.56, 0.68, radius) * outer;
          float disc = (1.0 - smoothstep(0.20, 0.92, radius)) * 0.24;
          float shape = max(ring, markerMode < 0.5 ? disc : 0.0);
          if (markerMode > 0.5 && (markerMode < 1.5 || markerMode > 2.5)) {
            float angle = atan(p.y, p.x) / 6.2831853 + 0.5;
            float segment = step(0.20, fract(angle * (markerMode > 2.5 ? 16.0 : 12.0)));
            shape *= segment;
          }
          float alpha = shape * vInstanceAlpha;
          if (alpha < 0.003) discard;
          gl_FragColor = vec4(markerColor, alpha);
        }
      `,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    material.userData.enemyPresenceLayer = layer;
    const mesh = new THREE.InstancedMesh(geometry, material, this.capacity);
    mesh.name = `enemy-ground-presence.${layer}`;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    this.scene.add(mesh);
    return { mesh, alphas };
  }
}
