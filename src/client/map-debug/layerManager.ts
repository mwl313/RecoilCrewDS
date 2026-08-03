import * as THREE from 'three';
import type { MapLabLayerRenderer, MapLabRenderContext } from './layerTypes';

/**
 * Shared layer manager: register renderers, rebuild from a context, toggle
 * visibility (never regenerates the map), focus issues, and dispose without
 * leaks. Used by the game F3 overlay and Map Lab.
 */
export class MapLabLayerManager {
  private readonly layers = new Map<string, MapLabLayerRenderer>();

  constructor(private readonly container: THREE.Group) {}

  register(renderer: MapLabLayerRenderer): void {
    if (this.layers.has(renderer.id)) throw new Error(`layer already registered: ${renderer.id}`);
    this.layers.set(renderer.id, renderer);
    renderer.setVisible(renderer.defaultVisible);
    this.container.add(renderer.group);
  }

  ids(): string[] {
    return [...this.layers.keys()];
  }

  get(id: string): MapLabLayerRenderer | undefined {
    return this.layers.get(id);
  }

  setContext(ctx: MapLabRenderContext | null): void {
    for (const layer of this.layers.values()) layer.setContext(ctx);
  }

  setVisible(id: string, visible: boolean): void {
    this.layers.get(id)?.setVisible(visible);
  }

  toggle(id: string): boolean {
    const layer = this.layers.get(id);
    if (!layer) return false;
    const next = !layer.group.visible;
    layer.setVisible(next);
    return next;
  }

  /** Focus an entity/issue: enable its layer and return whether handled. */
  focus(targetId: string, layerHint?: string): boolean {
    if (layerHint) {
      const hinted = this.layers.get(layerHint);
      if (hinted) {
        hinted.setVisible(true);
        if (hinted.focus?.(targetId)) return true;
      }
    }
    for (const layer of this.layers.values()) {
      if (layer.focus?.(targetId)) {
        layer.setVisible(true);
        return true;
      }
    }
    return false;
  }

  dispose(): void {
    for (const layer of this.layers.values()) {
      layer.dispose();
      this.container.remove(layer.group);
    }
    this.layers.clear();
  }
}
