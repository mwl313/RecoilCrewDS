import type { MapLabRenderContext } from '../layerTypes';
import { MapLabLayerBase } from '../baseLayer';
import { sphereMarker } from '../markers';

export class FeatureLayer extends MapLabLayerBase {
  constructor() {
    super('features', 'Macro Features', true);
  }
  protected build(ctx: MapLabRenderContext): void {
    const hf = ctx.arena.heightfield;
    for (const f of ctx.arena.macroFeatures) {
      this.group.add(sphereMarker(this.wx(ctx, f.x), hf.heightAt(f.x, f.z) + 0.4, this.wz(ctx, f.z), f.radius, 0xffd94d, 0.35));
    }
  }
}
