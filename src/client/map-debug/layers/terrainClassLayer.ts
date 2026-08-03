import * as THREE from 'three';
import type { MapLabRenderContext } from '../layerTypes';
import { MapLabLayerBase } from '../baseLayer';
import { TerrainFlag } from '../../../shared/mapgen/terrainFlags';

function flagPoints(
  ctx: MapLabRenderContext,
  mask: number,
  color: number,
  yOffset: number,
): THREE.Points {
  const hf = ctx.arena.heightfield;
  const flags = ctx.arena.terrainFlags;
  const points: THREE.Vector3[] = [];
  const colors: number[] = [];
  const c = new THREE.Color(color);
  for (let zi = 0; zi < hf.samplesZ; zi += 2) {
    for (let xi = 0; xi < hf.samplesX; xi += 2) {
      const idx = zi * hf.samplesX + xi;
      if ((flags[idx] & mask) === 0) continue;
      points.push(
        new THREE.Vector3(
          ctx.toWorldX(xi * hf.cellSize),
          hf.getSample(xi, zi) + yOffset,
          ctx.toWorldZ(zi * hf.cellSize),
        ),
      );
      colors.push(c.r, c.g, c.b);
    }
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({ size: 2.6, vertexColors: true, transparent: true, opacity: 0.65, depthWrite: false }),
  );
}

class FlagMaskLayer extends MapLabLayerBase {
  constructor(
    id: string,
    label: string,
    private readonly mask: number,
    private readonly color: number,
    defaultVisible = false,
  ) {
    super(id, label, defaultVisible);
  }
  protected build(ctx: MapLabRenderContext): void {
    this.group.add(flagPoints(ctx, this.mask, this.color, 0.25));
  }
}

export class DriveableMaskLayer extends FlagMaskLayer {
  constructor() {
    super('driveableMask', 'Driveable Mask', TerrainFlag.Driveable, 0x3ddb6e);
  }
}

export class RiskyMaskLayer extends FlagMaskLayer {
  constructor() {
    super('riskyMask', 'Risky Mask', TerrainFlag.Risky, 0xffc94a);
  }
}

export class BlockedMaskLayer extends FlagMaskLayer {
  constructor() {
    super('blockedMask', 'Blocked Mask', TerrainFlag.Blocked, 0xff5a4a);
  }
}

export class CliffTopLayer extends FlagMaskLayer {
  constructor() {
    super('cliffTop', 'Cliff Top', TerrainFlag.CliffTop, 0x56cdeb);
  }
}

export class CliffBottomLayer extends FlagMaskLayer {
  constructor() {
    super('cliffBottom', 'Cliff Bottom', TerrainFlag.CliffBottom, 0xb58cff);
  }
}

export class ProtectedTraversalLayer extends FlagMaskLayer {
  constructor() {
    super('protectedTraversal', 'Protected Traversal', 0xfff0c9, 0xffffff);
  }
}

export class CliffSafetyBufferLayer extends MapLabLayerBase {
  constructor() {
    super('cliffSafetyBuffer', 'Cliff Safety Buffer', false);
  }
  protected build(ctx: MapLabRenderContext): void {
    const hf = ctx.arena.heightfield;
    const flags = ctx.arena.terrainFlags;
    const wall = new Uint8Array(flags.length);
    for (let i = 0; i < flags.length; i++) {
      if (flags[i] & TerrainFlag.CliffWall) wall[i] = 1;
    }
    const points: THREE.Vector3[] = [];
    const colors: number[] = [];
    const c = new THREE.Color(0xffb84a);
    for (let zi = 0; zi < hf.samplesZ; zi++) {
      for (let xi = 0; xi < hf.samplesX; xi++) {
        const idx = zi * hf.samplesX + xi;
        if (flags[idx] & (TerrainFlag.CliffWall | TerrainFlag.CliffTop)) continue;
        let near = false;
        for (let dz = -2; dz <= 2 && !near; dz++) {
          for (let dx = -2; dx <= 2 && !near; dx++) {
            const nx = xi + dx;
            const nz = zi + dz;
            if (nx < 0 || nx >= hf.samplesX || nz < 0 || nz >= hf.samplesZ) continue;
            if (wall[nz * hf.samplesX + nx]) near = true;
          }
        }
        if (!near) continue;
        points.push(
          new THREE.Vector3(
            ctx.toWorldX(xi * hf.cellSize),
            hf.getSample(xi, zi) + 0.3,
            ctx.toWorldZ(zi * hf.cellSize),
          ),
        );
        colors.push(c.r, c.g, c.b);
      }
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.group.add(
      new THREE.Points(
        geo,
        new THREE.PointsMaterial({ size: 2.0, vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false }),
      ),
    );
  }
}

export class CliffWallsLayer extends MapLabLayerBase {
  constructor() {
    super('cliffWalls', 'Cliff Walls', true);
  }
  protected build(ctx: MapLabRenderContext): void {
    const hf = ctx.arena.heightfield;
    const positions: number[] = [];
    for (const e of ctx.arena.cliffEdges) {
      positions.push(
        ctx.toWorldX(e.ax),
        e.topY,
        ctx.toWorldZ(e.az),
        ctx.toWorldX(e.bx),
        e.topY,
        ctx.toWorldZ(e.bz),
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const line = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0x6b3f2f, linewidth: 1 }),
    );
    void hf;
    this.group.add(line);
  }
}

export class CliffAccessLayer extends MapLabLayerBase {
  constructor() {
    super('cliffAccessRoutes', 'Cliff Access Routes', false);
  }
  protected build(ctx: MapLabRenderContext): void {
    const positions: number[] = [];
    for (const a of ctx.arena.accessCorridors) {
      positions.push(
        ctx.toWorldX(a.ax),
        ctx.arena.heightfield.heightAt(a.ax, a.az) + 0.4,
        ctx.toWorldZ(a.az),
        ctx.toWorldX(a.bx),
        ctx.arena.heightfield.heightAt(a.bx, a.bz) + 0.4,
        ctx.toWorldZ(a.bz),
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.group.add(
      new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xff9f40 })),
    );
  }
}

export class TerrainCostLayer extends MapLabLayerBase {
  constructor() {
    super('terrainCost', 'Terrain Cost', false);
  }
  protected build(ctx: MapLabRenderContext): void {
    const hf = ctx.arena.heightfield;
    const flags = ctx.arena.terrainFlags;
    const points: THREE.Vector3[] = [];
    const colors: number[] = [];
    const driveable = new THREE.Color(0x2fbf5f);
    const risky = new THREE.Color(0xffc94a);
    const blocked = new THREE.Color(0xef4036);
    for (let zi = 0; zi < hf.samplesZ; zi += 2) {
      for (let xi = 0; xi < hf.samplesX; xi += 2) {
        const idx = zi * hf.samplesX + xi;
        const f = flags[idx];
        const c = f & TerrainFlag.Blocked ? blocked : f & TerrainFlag.Risky ? risky : driveable;
        points.push(
          new THREE.Vector3(
            ctx.toWorldX(xi * hf.cellSize),
            hf.getSample(xi, zi) + 0.3,
            ctx.toWorldZ(zi * hf.cellSize),
          ),
        );
        colors.push(c.r, c.g, c.b);
      }
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.group.add(
      new THREE.Points(
        geo,
        new THREE.PointsMaterial({ size: 2.0, vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false }),
      ),
    );
  }
}
