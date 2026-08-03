import * as THREE from 'three';
import type { GeneratedArena } from '../../shared/mapgen/generator';
import type { ArenaWorld } from '../../shared/sim/arenaWorld';

/** Context shared by every debug layer (game F3 overlay and Map Lab). */
export interface MapLabRenderContext {
  arena: GeneratedArena;
  world: ArenaWorld;
  /** Map-local coordinate -> world coordinate (centered). */
  toWorldX(localX: number): number;
  toWorldZ(localZ: number): number;
}

/**
 * A named visualization layer. Layers own a THREE.Group; setContext() (re)
 * builds markers, setVisible() toggles, focus() optionally targets an id,
 * and dispose() releases resources. Layers never mutate authoritative data.
 */
export interface MapLabLayerRenderer {
  readonly id: string;
  readonly label: string;
  readonly defaultVisible: boolean;
  readonly group: THREE.Group;
  setContext(ctx: MapLabRenderContext | null): void;
  setVisible(visible: boolean): void;
  focus?(targetId: string): boolean;
  dispose(): void;
}
