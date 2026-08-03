import * as THREE from 'three';
import type { MapLabRenderContext } from '../layerTypes';
import { MapLabLayerBase } from '../baseLayer';
import { lineBetween, sphereMarker } from '../markers';

export class RouteNodesLayer extends MapLabLayerBase {
  constructor() {
    super('routeNodes', 'Route Nodes', true);
  }
  protected build(ctx: MapLabRenderContext): void {
    const hf = ctx.arena.heightfield;
    for (const n of ctx.arena.layout!.graph.nodes) {
      this.group.add(sphereMarker(this.wx(ctx, n.x), hf.heightAt(n.x, n.z) + 0.4, this.wz(ctx, n.z), 1.1, 0x9ff3ff, 0.8));
    }
  }
}

export class RouteEdgesLayer extends MapLabLayerBase {
  constructor() {
    super('routeEdges', 'Route Edges', true);
  }
  protected build(ctx: MapLabRenderContext): void {
    const hf = ctx.arena.heightfield;
    for (const e of ctx.arena.layout!.graph.edges) {
      const a = ctx.arena.layout!.graph.nodes.find((n) => n.id === e.a)!;
      const b = ctx.arena.layout!.graph.nodes.find((n) => n.id === e.b)!;
      this.group.add(
        lineBetween(
          this.wx(ctx, a.x), hf.heightAt(a.x, a.z) + 0.2, this.wz(ctx, a.z),
          this.wx(ctx, b.x), hf.heightAt(b.x, b.z) + 0.2, this.wz(ctx, b.z),
          0x35d7e8, 0.8,
        ),
      );
    }
  }
}

export class RouteCorridorsLayer extends MapLabLayerBase {
  constructor() {
    super('routeCorridors', 'Route Corridors', false);
  }
  protected build(ctx: MapLabRenderContext): void {
    const hf = ctx.arena.heightfield;
    for (const c of ctx.arena.layout!.graph.corridors) {
      const len = Math.hypot(c.bx - c.ax, c.bz - c.az) || 1;
      const yaw = Math.atan2(c.bx - c.ax, c.bz - c.az);
      const mx = this.wx(ctx, (c.ax + c.bx) / 2);
      const mz = this.wz(ctx, (c.az + c.bz) / 2);
      const my = hf.heightAt((c.ax + c.bx) / 2, (c.az + c.bz) / 2) + 0.05;
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(c.halfWidth * 2, len),
        new THREE.MeshBasicMaterial({ color: 0x35d7e8, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }),
      );
      plane.rotation.x = -Math.PI / 2;
      plane.rotation.z = -yaw;
      plane.position.set(mx, my, mz);
      this.group.add(plane);
    }
  }
}
