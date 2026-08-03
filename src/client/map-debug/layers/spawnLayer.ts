import type { MapLabRenderContext } from '../layerTypes';
import { MapLabLayerBase } from '../baseLayer';
import { ringMarker, sphereMarker } from '../markers';

export class SpawnsLayer extends MapLabLayerBase {
  constructor() {
    super('spawns', 'Player Spawns', true);
  }
  protected build(ctx: MapLabRenderContext): void {
    const hf = ctx.arena.heightfield;
    for (const s of ctx.arena.layout!.spawns) {
      this.group.add(sphereMarker(this.wx(ctx, s.x), hf.heightAt(s.x, s.z) + 0.6, this.wz(ctx, s.z), 1.2, 0x5eeaff, 0.9));
    }
  }
}

export class GatesLayer extends MapLabLayerBase {
  constructor() {
    super('gates', 'Enemy Gates', true);
  }
  protected build(ctx: MapLabRenderContext): void {
    const hf = ctx.arena.heightfield;
    for (const g of ctx.arena.layout!.gates) {
      this.group.add(sphereMarker(this.wx(ctx, g.x), hf.heightAt(g.x, g.z) + 0.6, this.wz(ctx, g.z), 1.6, 0xff5a4a, 0.9));
    }
  }
}

export class RecoveryLayer extends MapLabLayerBase {
  constructor() {
    super('recovery', 'Recovery Zones', true);
  }
  protected build(ctx: MapLabRenderContext): void {
    const hf = ctx.arena.heightfield;
    for (const r of ctx.arena.layout!.recovery) {
      this.group.add(ringMarker(this.wx(ctx, r.x), hf.heightAt(r.x, r.z) + 0.1, this.wz(ctx, r.z), r.radius, 0x4ddb6e));
    }
  }
}
