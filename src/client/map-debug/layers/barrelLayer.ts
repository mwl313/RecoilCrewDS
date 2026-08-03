import { barrelComponents } from '../../../shared/mapgen/barrels';
import type { MapLabRenderContext } from '../layerTypes';
import { MapLabLayerBase } from '../baseLayer';
import { lineBetween } from '../markers';

export class BarrelChainsLayer extends MapLabLayerBase {
  constructor() {
    super('barrelChains', 'Barrel Chains', false);
  }
  protected build(ctx: MapLabRenderContext): void {
    const barrels = ctx.arena.layout!.objects
      .filter((o) => o.kind === 'barrel')
      .map((o) => ({ id: o.id, x: o.x, z: o.z }));
    const radius = ctx.arena.layout!.furnitureSet.barrel.chainRadius;
    const { components } = barrelComponents(barrels, radius);
    for (const c of components) {
      if (c.members.length < 2) continue;
      for (let i = 0; i < c.members.length; i++) {
        const a = barrels.find((b) => b.id === c.members[i])!;
        const b = barrels.find((x) => x.id === c.members[(i + 1) % c.members.length])!;
        this.group.add(
          lineBetween(this.wx(ctx, a.x), 0.6, this.wz(ctx, a.z), this.wx(ctx, b.x), 0.6, this.wz(ctx, b.z), 0xff9d45),
        );
      }
    }
  }
}
