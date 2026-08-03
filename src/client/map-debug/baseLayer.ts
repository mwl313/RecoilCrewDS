import * as THREE from 'three';
import type { MapLabLayerRenderer, MapLabRenderContext } from './layerTypes';
import { clearGroup } from './markers';

/** Base class: context, rebuild, visibility, disposal. */
export abstract class MapLabLayerBase implements MapLabLayerRenderer {
  readonly group = new THREE.Group();
  protected ctx: MapLabRenderContext | null = null;

  constructor(
    readonly id: string,
    readonly label: string,
    readonly defaultVisible: boolean,
  ) {}

  setContext(ctx: MapLabRenderContext | null): void {
    this.ctx = ctx;
    clearGroup(this.group);
    if (ctx) this.build(ctx);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  dispose(): void {
    clearGroup(this.group);
  }

  protected abstract build(ctx: MapLabRenderContext): void;

  protected wx(ctx: MapLabRenderContext, x: number): number {
    return ctx.toWorldX(x);
  }

  protected wz(ctx: MapLabRenderContext, z: number): number {
    return ctx.toWorldZ(z);
  }
}
