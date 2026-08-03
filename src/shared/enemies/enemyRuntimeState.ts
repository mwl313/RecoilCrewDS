/** Per-enemy scratch state shared by composed behaviors within a frame. */
export class EnemyRuntimeState {
  /** Normalized movement direction produced by seek/circle/separation. */
  dirX = 0;
  dirZ = 0;
  /** Distance to the tank captured by movement.seekTank (pre-move snapshot). */
  distToTank = 0;
  /** Current frame movement speed (seek + wobble). */
  speed = 0;
}
