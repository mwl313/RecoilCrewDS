import * as THREE from 'three';
import type { MapLabRenderContext } from '../layerTypes';
import { MapLabLayerBase } from '../baseLayer';

function heatmapCloud(
  ctx: MapLabRenderContext,
  valueAt: (xi: number, zi: number) => number,
  lo: number,
  hi: number,
  yOffset: number,
): THREE.Points {
  const hf = ctx.arena.heightfield;
  const points: THREE.Vector3[] = [];
  const colors: number[] = [];
  const range = Math.max(0.01, hi - lo);
  for (let zi = 0; zi < hf.samplesZ; zi += 4) {
    for (let xi = 0; xi < hf.samplesX; xi += 4) {
      const v = valueAt(xi, zi);
      points.push(new THREE.Vector3(ctx.toWorldX(xi * hf.cellSize), hf.getSample(xi, zi) + yOffset, ctx.toWorldZ(zi * hf.cellSize)));
      const t = (v - lo) / range;
      colors.push(0.2 + t * 0.8, 0.5 - t * 0.3, 0.8 - t * 0.6);
    }
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({ size: 2.2, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false }),
  );
}

export class HeightHeatmapLayer extends MapLabLayerBase {
  constructor() {
    super('heightHeatmap', 'Height Heatmap', false);
  }
  protected build(ctx: MapLabRenderContext): void {
    const hf = ctx.arena.heightfield;
    this.group.add(heatmapCloud(ctx, (xi, zi) => hf.getSample(xi, zi), hf.minHeight(), hf.maxHeight(), 0.15));
  }
}

export class SlopeHeatmapLayer extends MapLabLayerBase {
  constructor() {
    super('slopeHeatmap', 'Slope Heatmap', false);
  }
  protected build(ctx: MapLabRenderContext): void {
    const hf = ctx.arena.heightfield;
    const slopes = hf.slopeGrid();
    this.group.add(heatmapCloud(ctx, (xi, zi) => slopes[zi * hf.samplesX + xi], 0, hf.maxSlope(), 0.2));
  }
}
