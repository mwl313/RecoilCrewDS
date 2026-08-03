import type { MapLabLayerManager } from './layerManager';
import { HeightHeatmapLayer, SlopeHeatmapLayer } from './layers/heightLayer';
import { FeatureLayer } from './layers/featureLayer';
import { RouteCorridorsLayer, RouteEdgesLayer, RouteNodesLayer } from './layers/routeLayer';
import { ZoneLayer } from './layers/zoneLayer';
import { GatesLayer, RecoveryLayer, SpawnsLayer } from './layers/spawnLayer';
import { FlightCorridorsLayer, LandingsLayer, RampsLayer } from './layers/rampLayer';
import { CollidersLayer, DecorationsLayer, FurnitureLayer, TerrainLayer } from './layers/furnitureLayer';
import { BarrelChainsLayer } from './layers/barrelLayer';
import { ValidationErrorsLayer, ValidationWarningsLayer } from './layers/validationLayer';

/** Register the standard layer set used by the game F3 overlay and Map Lab. */
export function registerDefaultLayers(manager: MapLabLayerManager): void {
  manager.register(new TerrainLayer());
  manager.register(new HeightHeatmapLayer());
  manager.register(new SlopeHeatmapLayer());
  manager.register(new FeatureLayer());
  manager.register(new RouteNodesLayer());
  manager.register(new RouteEdgesLayer());
  manager.register(new RouteCorridorsLayer());
  manager.register(new ZoneLayer());
  manager.register(new SpawnsLayer());
  manager.register(new GatesLayer());
  manager.register(new RecoveryLayer());
  manager.register(new RampsLayer());
  manager.register(new FlightCorridorsLayer());
  manager.register(new LandingsLayer());
  manager.register(new FurnitureLayer());
  manager.register(new CollidersLayer());
  manager.register(new DecorationsLayer());
  manager.register(new BarrelChainsLayer());
  manager.register(new ValidationErrorsLayer());
  manager.register(new ValidationWarningsLayer());
}

export { MapLabLayerManager } from './layerManager';
export type { MapLabLayerRenderer, MapLabRenderContext } from './layerTypes';
