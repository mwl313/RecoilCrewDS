/** Asset loading telemetry for stage-selective preload diagnostics. */
export interface AssetTelemetry {
  registeredModelCount: number;
  requestedPreloadCount: number;
  loadedModelCount: number;
  loadedGlbBytes: number;
  loadDurationMs: number;
  cacheHits: number;
}

export function createAssetTelemetry(): AssetTelemetry {
  return {
    registeredModelCount: 0,
    requestedPreloadCount: 0,
    loadedModelCount: 0,
    loadedGlbBytes: 0,
    loadDurationMs: 0,
    cacheHits: 0,
  };
}

export function resetAssetTelemetry(): AssetTelemetry {
  return createAssetTelemetry();
}
