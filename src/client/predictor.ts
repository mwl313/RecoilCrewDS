/**
 * Backward-compatible entry point: the generalized predictor lives in
 * src/client/prediction/sharedTankPredictor.ts. Existing tests import
 * `DriverPredictor` from this module; it is the same class.
 */
export { SharedTankPredictor as DriverPredictor } from './prediction/sharedTankPredictor';
export type { QueuedDriverInput, PredictorSource } from './prediction/sharedTankPredictor';
