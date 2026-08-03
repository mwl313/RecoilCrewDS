import * as THREE from 'three';
import type { MapLabRenderContext } from '../layerTypes';
import { MapLabLayerBase } from '../baseLayer';
import { sphereMarker, wireBoxMarker } from '../markers';

const KIND_COLORS: Record<string, number> = {
  largeObstacle: 0xffa040,
  barrel: 0xff9d45,
  crate: 0xffd94d,
  medium: 0xc9a86a,
  decoration: 0x8a7a55,
  lightPole: 0xfff0c0,
};

export class FurnitureLayer extends MapLabLayerBase {
  constructor() {
    super('furniture', 'Furniture', true);
  }
  protected build(ctx: MapLabRenderContext): void {
    for (const o of ctx.arena.layout!.objects) {
      const color = KIND_COLORS[o.kind] ?? 0xaaaaaa;
      this.group.add(sphereMarker(this.wx(ctx, o.x), (o.h ?? 1) / 2, this.wz(ctx, o.z), o.radius * 0.7, color, 0.7));
    }
  }
}

export class CollidersLayer extends MapLabLayerBase {
  constructor() {
    super('colliders', 'Authoritative Colliders', true);
  }
  protected build(ctx: MapLabRenderContext): void {
    for (const o of ctx.world.obstacles) {
      this.group.add(wireBoxMarker(o.x, o.z, o.w, o.d, o.h));
    }
    for (const b of ctx.world.barrels) {
      this.group.add(wireBoxMarker(b.x, b.z, 0.9, 0.9, 1.1));
    }
  }
}

export class DecorationsLayer extends MapLabLayerBase {
  constructor() {
    super('decorations', 'Decorations', false);
  }
  protected build(ctx: MapLabRenderContext): void {
    for (const o of ctx.arena.layout!.objects) {
      if (o.collider && o.kind !== 'lightPole') continue;
      const color = o.kind === 'lightPole' ? 0xfff0c0 : 0x9a9a8a;
      this.group.add(sphereMarker(this.wx(ctx, o.x), (o.h ?? 0.8) * 0.5, this.wz(ctx, o.z), 0.5, color, 0.6));
    }
  }
}

/** Coarse heightfield wireframe used as the Map Lab "terrain" toggle. */
export class TerrainLayer extends MapLabLayerBase {
  constructor() {
    super('terrain', 'Terrain', true);
  }
  protected build(ctx: MapLabRenderContext): void {
    const hf = ctx.arena.heightfield;
    const pts: THREE.Vector3[] = [];
    for (let zi = 0; zi < hf.samplesZ; zi += 2) {
      for (let xi = 0; xi < hf.samplesX; xi += 2) {
        const x = xi * hf.cellSize;
        const z = zi * hf.cellSize;
        if (xi + 2 < hf.samplesX) {
          pts.push(new THREE.Vector3(this.wx(ctx, x), hf.getSample(xi, zi), this.wz(ctx, z)));
          pts.push(new THREE.Vector3(this.wx(ctx, x + hf.cellSize * 2), hf.getSample(xi + 2, zi), this.wz(ctx, z)));
        }
        if (zi + 2 < hf.samplesZ) {
          pts.push(new THREE.Vector3(this.wx(ctx, x), hf.getSample(xi, zi), this.wz(ctx, z)));
          pts.push(new THREE.Vector3(this.wx(ctx, x), hf.getSample(xi, zi + 2), this.wz(ctx, z + hf.cellSize * 2)));
        }
      }
    }
    this.group.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x9fb6c4, transparent: true, opacity: 0.5 }),
      ),
    );
  }
}
