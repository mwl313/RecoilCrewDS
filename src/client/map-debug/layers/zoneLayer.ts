import type { MapLabRenderContext } from '../layerTypes';
import { MapLabLayerBase } from '../baseLayer';
import { ringMarker } from '../markers';

const ZONE_COLORS: Record<string, number> = {
  basin: 0x4aa3ff,
  highland: 0xd8b06a,
  valley: 0x6fd89a,
  transit: 0x9ff3ff,
  openCombat: 0xc9a86a,
  rampPark: 0xffb347,
  resource: 0xffd94d,
  spawnSafe: 0x5eeaff,
  enemyGate: 0xff5a4a,
  recovery: 0x4ddb6e,
};

export class ZoneLayer extends MapLabLayerBase {
  constructor() {
    super('zones', 'Semantic Zones', false);
  }
  protected build(ctx: MapLabRenderContext): void {
    const hf = ctx.arena.heightfield;
    for (const z of ctx.arena.layout!.zones.regions) {
      this.group.add(ringMarker(this.wx(ctx, z.x), hf.heightAt(z.x, z.z) + 0.1, this.wz(ctx, z.z), z.radius, ZONE_COLORS[z.tag] ?? 0xaaaaaa));
    }
  }
}
