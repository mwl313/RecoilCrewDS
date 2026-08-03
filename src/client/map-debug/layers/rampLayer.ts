import type { MapLabRenderContext } from '../layerTypes';
import { MapLabLayerBase } from '../baseLayer';
import { lineBetween, sphereMarker } from '../markers';

export class RampsLayer extends MapLabLayerBase {
  constructor() {
    super('ramps', 'Ramps', true);
  }
  protected build(ctx: MapLabRenderContext): void {
    for (const r of ctx.arena.layout!.ramps) {
      this.group.add(sphereMarker(this.wx(ctx, r.x), r.baseY + 1, this.wz(ctx, r.z), 2, 0xffb347, 0.8));
    }
  }
}

export class LandingsLayer extends MapLabLayerBase {
  constructor() {
    super('landings', 'Landing Zones', true);
  }
  protected build(ctx: MapLabRenderContext): void {
    const hf = ctx.arena.heightfield;
    for (const r of ctx.arena.layout!.ramps) {
      this.group.add(sphereMarker(this.wx(ctx, r.landingX), hf.heightAt(r.landingX, r.landingZ) + 0.3, this.wz(ctx, r.landingZ), 2.5, 0x7de05a, 0.6));
    }
  }
}

export class FlightCorridorsLayer extends MapLabLayerBase {
  constructor() {
    super('flightCorridors', 'Flight Corridors', false);
  }
  protected build(ctx: MapLabRenderContext): void {
    const hf = ctx.arena.heightfield;
    for (const r of ctx.arena.layout!.ramps) {
      const endX = r.x + r.dirX * r.flightRange;
      const endZ = r.z + r.dirZ * r.flightRange;
      this.group.add(
        lineBetween(
          this.wx(ctx, r.x), r.baseY + r.rise, this.wz(ctx, r.z),
          this.wx(ctx, endX), hf.heightAt(endX, endZ) + 0.3, this.wz(ctx, endZ),
          0xff9d45, 0.6,
        ),
      );
    }
  }
}
