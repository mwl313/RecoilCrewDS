/** Per-enemy scratch state shared by composed behaviors within a frame. */
export class EnemyRuntimeState {
  /** Normalized movement direction produced by seek/circle/separation. */
  dirX = 0;
  dirZ = 0;
  /** Distance to the tank captured by movement.seekTank (pre-move snapshot). */
  distToTank = 0;
  /** Current frame movement speed (seek + wobble). */
  speed = 0;
  /** Core Loop 06 M7: stuck detection (accumulated time + progress gate). */
  stuckT = 0;
  lastProgress = 0;
  recovered = false;
  /** Core Loop 06 M8: simulation LOD tier (0 combat .. 3 aggregate). */
  tier: 0 | 1 | 2 | 3 = 0;
  nextUpdateAt = 0;
  lastUpdateT = 0;
  phaseOffset = 0;
}
