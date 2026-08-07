import * as THREE from 'three';

export const RELIC_CHEST_ASSET_ID = 'custom.item.relicChest';
export const RELIC_CHEST_OPEN_ANGLE_DEGREES = -55.791075;
export const RELIC_CHEST_OPEN_DURATION_SECONDS = 0.65;

const GOLD = new THREE.Color(0xffdc78);
const UP = new THREE.Vector3(0, 1, 0);
const RAY_SEEDS = [
  { azimuth: 0, elevation: 24, width: 0.95, length: 1.0, opacity: 0.8, jitterX: -0.02, jitterZ: 0.01 },
  { azimuth: 40, elevation: 36, width: 0.72, length: 0.82, opacity: 0.72, jitterX: 0.01, jitterZ: -0.015 },
  { azimuth: 80, elevation: 52, width: 1.1, length: 1.08, opacity: 0.92, jitterX: 0.02, jitterZ: 0.018 },
  { azimuth: 120, elevation: 28, width: 0.82, length: 0.9, opacity: 0.78, jitterX: -0.012, jitterZ: 0.025 },
  { azimuth: 160, elevation: 44, width: 0.68, length: 1.15, opacity: 0.86, jitterX: 0.016, jitterZ: -0.022 },
  { azimuth: 200, elevation: 22, width: 1.0, length: 0.88, opacity: 0.75, jitterX: -0.025, jitterZ: -0.01 },
  { azimuth: 240, elevation: 39, width: 0.78, length: 1.05, opacity: 0.9, jitterX: 0.008, jitterZ: 0.02 },
  { azimuth: 280, elevation: 30, width: 0.88, length: 0.94, opacity: 0.78, jitterX: 0.024, jitterZ: -0.018 },
  { azimuth: 320, elevation: 48, width: 0.7, length: 1.12, opacity: 0.88, jitterX: -0.014, jitterZ: 0.012 },
  { azimuth: 20, elevation: 68, width: 0.9, length: 1.0, opacity: 1.0, jitterX: 0.018, jitterZ: -0.008 },
  { azimuth: 60, elevation: 80, width: 0.62, length: 1.2, opacity: 1.08, jitterX: -0.01, jitterZ: 0.016 },
  { azimuth: 100, elevation: 58, width: 1.06, length: 0.96, opacity: 0.94, jitterX: 0.012, jitterZ: 0.022 },
  { azimuth: 140, elevation: 74, width: 0.74, length: 1.14, opacity: 1.04, jitterX: -0.018, jitterZ: -0.014 },
  { azimuth: 180, elevation: 62, width: 0.98, length: 1.03, opacity: 0.96, jitterX: 0.022, jitterZ: 0.008 },
  { azimuth: 220, elevation: 84, width: 0.66, length: 1.22, opacity: 1.1, jitterX: -0.006, jitterZ: -0.02 },
  { azimuth: 260, elevation: 56, width: 0.84, length: 1.08, opacity: 0.92, jitterX: 0.014, jitterZ: 0.014 },
  { azimuth: 300, elevation: 72, width: 1.02, length: 0.98, opacity: 1.02, jitterX: -0.022, jitterZ: 0.004 },
  { azimuth: 340, elevation: 64, width: 0.76, length: 1.18, opacity: 1.06, jitterX: 0.006, jitterZ: -0.016 },
] as const;

export interface RelicChestDiagnostics {
  openProgress: number;
  easedLidProgress: number;
  lidRotationDegrees: number;
  finalLidAngleDegrees: number;
  rayOpacity: number;
  rayWidth: number;
  raySpread: number;
  rayLength: number;
  raysVisible: boolean;
  chestGlowOpacity: number;
  chestGlowPhase: number;
}

export interface RelicChestPresentationOptions {
  openDurationSeconds?: number;
  openAngleDegrees?: number;
}

interface RayEntry {
  group: THREE.Group;
  material: THREE.ShaderMaterial;
  seed: (typeof RAY_SEEDS)[number];
  closedDirection: THREE.Vector3;
  radialDirection: THREE.Vector3;
}

/**
 * Owns the articulated lid and local treasure-light presentation for one
 * loaded relic-chest instance. Call update(dt) from the game loop after
 * open()/close(), or use setOpenProgress() for deterministic scrubbing.
 */
export class RelicChestPresentation {
  readonly root: THREE.Object3D;
  readonly base: THREE.Object3D;
  readonly lid: THREE.Object3D;
  readonly glowOrigin: THREE.Object3D;
  readonly rewardAnchor: THREE.Object3D;

  private readonly closedLidRotationX: number;
  private readonly openAngleRadians: number;
  private readonly durationSeconds: number;
  private readonly vfxRoot = new THREE.Group();
  private readonly rayEntries: RayEntry[] = [];
  private readonly workingRayDirection = new THREE.Vector3();
  private readonly coreMaterial: THREE.ShaderMaterial;
  private readonly chestAuraMaterial: THREE.SpriteMaterial;
  private readonly chestAuraTexture: THREE.DataTexture;
  private readonly coreGlow: THREE.Mesh;
  private readonly chestAura: THREE.Sprite;
  private progress = 0;
  private targetProgress: number | null = null;
  private raysVisible = true;
  private pulseTime = 0;
  private chestGlowOpacity = 0.08;
  private chestGlowPhase = 0;
  private diagnostics: RelicChestDiagnostics;

  constructor(root: THREE.Object3D, options: RelicChestPresentationOptions = {}) {
    this.root = root.getObjectByName('RelicChest') ?? root;
    this.base = requireNode(this.root, 'Base');
    this.lid = requireNode(this.root, 'Lid');
    this.glowOrigin = requireNode(this.root, 'GlowOrigin');
    this.rewardAnchor = requireNode(this.root, 'RewardAnchor');
    this.closedLidRotationX = this.lid.rotation.x;
    this.openAngleRadians = THREE.MathUtils.degToRad(
      options.openAngleDegrees ?? RELIC_CHEST_OPEN_ANGLE_DEGREES,
    );
    this.durationSeconds = Math.max(0.001, options.openDurationSeconds ?? RELIC_CHEST_OPEN_DURATION_SECONDS);

    this.vfxRoot.name = 'RelicChestGoldVfx';
    this.vfxRoot.renderOrder = 2;
    this.glowOrigin.add(this.vfxRoot);

    this.coreMaterial = createRadialGoldMaterial('RelicChestCoreGlowMaterial');
    this.coreGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.coreMaterial);
    this.coreGlow.name = 'RelicChestCoreGlow';
    this.coreGlow.rotation.x = -Math.PI / 2;
    this.coreGlow.position.y = 0.027;
    this.coreGlow.renderOrder = 2;
    this.coreGlow.frustumCulled = false;
    this.vfxRoot.add(this.coreGlow);

    this.chestAuraTexture = createRadialGlowTexture();
    this.chestAuraMaterial = new THREE.SpriteMaterial({
      name: 'RelicChestPulsingAuraMaterial',
      map: this.chestAuraTexture,
      color: GOLD,
      transparent: true,
      opacity: this.chestGlowOpacity,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.chestAura = new THREE.Sprite(this.chestAuraMaterial);
    this.chestAura.name = 'RelicChestPulsingAura';
    this.chestAura.position.set(0, 0.42, 0.01);
    this.chestAura.scale.set(1.42, 1.08, 1);
    this.chestAura.renderOrder = 1;
    this.chestAura.frustumCulled = false;
    this.base.add(this.chestAura);

    for (let index = 0; index < RAY_SEEDS.length; index += 1) {
      const seed = RAY_SEEDS[index];
      const material = createSoftGoldMaterial(`RelicChestRayMaterial${index + 1}`);
      const group = new THREE.Group();
      group.name = `RelicChestRay${index + 1}`;
      for (let planeIndex = 0; planeIndex < 2; planeIndex += 1) {
        const ray = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
        ray.position.y = 0.5;
        ray.rotation.y = planeIndex * Math.PI * 0.5;
        ray.renderOrder = 3;
        ray.frustumCulled = false;
        group.add(ray);
      }
      this.vfxRoot.add(group);
      const azimuth = THREE.MathUtils.degToRad(seed.azimuth);
      const elevation = THREE.MathUtils.degToRad(seed.elevation);
      this.rayEntries.push({
        group,
        material,
        seed,
        closedDirection: new THREE.Vector3(seed.jitterX * 2, 1, seed.jitterZ * 2).normalize(),
        radialDirection: new THREE.Vector3(
          Math.cos(azimuth) * Math.cos(elevation),
          Math.sin(elevation),
          Math.sin(azimuth) * Math.cos(elevation),
        ),
      });
    }

    this.diagnostics = {
      openProgress: 0,
      easedLidProgress: 0,
      lidRotationDegrees: THREE.MathUtils.radToDeg(this.closedLidRotationX),
      finalLidAngleDegrees: THREE.MathUtils.radToDeg(this.closedLidRotationX + this.openAngleRadians),
      rayOpacity: 0,
      rayWidth: 0,
      raySpread: 0,
      rayLength: 0,
      raysVisible: true,
      chestGlowOpacity: this.chestGlowOpacity,
      chestGlowPhase: this.chestGlowPhase,
    };
    this.setOpenProgress(0);
  }

  setOpenProgress(value: number): void {
    const clamped = THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1);
    this.progress = clamped;
    this.targetProgress = null;
    this.applyProgress(clamped);
  }

  open(): void {
    this.targetProgress = 1;
  }

  close(): void {
    this.targetProgress = 0;
  }

  reset(): void {
    this.targetProgress = null;
    this.progress = 0;
    this.applyProgress(0);
  }

  update(deltaSeconds: number): boolean {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return false;
    this.pulseTime = (this.pulseTime + deltaSeconds) % 1.8;
    this.applyChestPulse();
    if (this.targetProgress === null) return true;
    const step = deltaSeconds / this.durationSeconds;
    if (this.targetProgress > this.progress) this.progress = Math.min(this.targetProgress, this.progress + step);
    else this.progress = Math.max(this.targetProgress, this.progress - step);
    if (Math.abs(this.progress - this.targetProgress) <= 1e-9) this.progress = this.targetProgress;
    this.applyProgress(this.progress);
    if (this.progress === this.targetProgress) this.targetProgress = null;
    return true;
  }

  setRaysVisible(visible: boolean): void {
    this.raysVisible = visible;
    for (const entry of this.rayEntries) entry.group.visible = visible;
    this.diagnostics = { ...this.diagnostics, raysVisible: visible };
  }

  getOpenProgress(): number {
    return this.progress;
  }

  getDiagnostics(): RelicChestDiagnostics {
    return {
      ...this.diagnostics,
      chestGlowOpacity: this.chestGlowOpacity,
      chestGlowPhase: this.chestGlowPhase,
    };
  }

  dispose(): void {
    this.glowOrigin.remove(this.vfxRoot);
    this.coreGlow.geometry.dispose();
    this.coreMaterial.dispose();
    this.base.remove(this.chestAura);
    this.chestAuraMaterial.dispose();
    this.chestAuraTexture.dispose();
    for (const entry of this.rayEntries) {
      for (const child of entry.group.children) {
        if (child instanceof THREE.Mesh) child.geometry.dispose();
      }
      entry.material.dispose();
    }
  }

  private applyProgress(openProgress: number): void {
    const lidProgress = smootherstep(openProgress);
    const glowProgress = 1 - Math.pow(1 - openProgress, 1.45);
    const rayOpacity = THREE.MathUtils.lerp(0.002, 0.52, glowProgress);
    const rayWidth = THREE.MathUtils.lerp(0.0015, 0.24, glowProgress);
    const raySpread = THREE.MathUtils.lerp(0.001, 0.95, glowProgress);
    const rayLength = THREE.MathUtils.lerp(0.025, 1.75, glowProgress);

    this.lid.rotation.x = this.closedLidRotationX + this.openAngleRadians * lidProgress;

    this.coreMaterial.uniforms.opacity.value = THREE.MathUtils.lerp(0.08, 0.34, glowProgress);
    const coreScale = THREE.MathUtils.lerp(0.18, 0.36, glowProgress);
    this.coreGlow.scale.set(coreScale * 1.5, coreScale, 1);

    this.rayEntries.forEach(({ group, material, seed, closedDirection, radialDirection }) => {
      const width = rayWidth * seed.width;
      const length = rayLength * seed.length;
      this.workingRayDirection.copy(closedDirection).lerp(radialDirection, glowProgress).normalize();
      group.position.set(
        seed.jitterX * raySpread * 0.25,
        0.045,
        THREE.MathUtils.lerp(0.36, seed.jitterZ * 0.4, glowProgress),
      );
      group.quaternion.setFromUnitVectors(UP, this.workingRayDirection);
      group.scale.set(width, length, 1);
      material.uniforms.opacity.value = rayOpacity * seed.opacity * 0.72;
      material.uniforms.taper.value = THREE.MathUtils.lerp(0.76, 0.5, glowProgress);
    });

    this.diagnostics = {
      openProgress,
      easedLidProgress: lidProgress,
      lidRotationDegrees: THREE.MathUtils.radToDeg(this.lid.rotation.x),
      finalLidAngleDegrees: THREE.MathUtils.radToDeg(this.closedLidRotationX + this.openAngleRadians),
      rayOpacity,
      rayWidth,
      raySpread,
      rayLength,
      raysVisible: this.raysVisible,
      chestGlowOpacity: this.chestGlowOpacity,
      chestGlowPhase: this.chestGlowPhase,
    };
  }

  private applyChestPulse(): void {
    this.chestGlowPhase = this.pulseTime / 1.8;
    const wave = 0.5 - 0.5 * Math.cos(this.chestGlowPhase * Math.PI * 2);
    const easedWave = smootherstep(wave);
    this.chestGlowOpacity = THREE.MathUtils.lerp(0.03, 0.576, easedWave);
    this.chestAuraMaterial.opacity = this.chestGlowOpacity;
    const auraScale = THREE.MathUtils.lerp(1, 1.18, easedWave);
    this.chestAura.scale.set(1.42 * auraScale, 1.08 * auraScale, 1);
  }
}

function requireNode(root: THREE.Object3D, name: string): THREE.Object3D {
  const node = root.getObjectByName(name);
  if (!node) throw new Error(`Relic chest is missing required node '${name}'`);
  return node;
}

function smootherstep(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function createSoftGoldMaterial(name: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name,
    uniforms: {
      color: { value: GOLD.clone() },
      opacity: { value: 0.1 },
      taper: { value: 0.65 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float opacity;
      uniform float taper;
      varying vec2 vUv;
      void main() {
        float horizontal = 1.0 - smoothstep(0.05, 0.5, abs(vUv.x - 0.5));
        float foot = smoothstep(0.0, 0.08, vUv.y);
        float tip = 1.0 - smoothstep(taper, 1.0, vUv.y);
        float alpha = horizontal * horizontal * foot * tip * opacity;
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function createRadialGoldMaterial(name: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name,
    uniforms: {
      color: { value: GOLD.clone() },
      opacity: { value: 0.1 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float opacity;
      varying vec2 vUv;
      void main() {
        float radius = length((vUv - 0.5) * 2.0);
        float alpha = (1.0 - smoothstep(0.08, 1.0, radius)) * opacity;
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function createRadialGlowTexture(size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = ((x + 0.5) / size) * 2 - 1;
      const ny = ((y + 0.5) / size) * 2 - 1;
      const radius = Math.sqrt(nx * nx + ny * ny);
      const fade = Math.pow(THREE.MathUtils.clamp(1 - radius, 0, 1), 1.25);
      const index = (y * size + x) * 4;
      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = Math.round(fade * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = 'RelicChestPulsingAuraTexture';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
