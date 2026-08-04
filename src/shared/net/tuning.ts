/**
 * Shared netcode tuning. Single source of truth for rates, delays, and
 * queue bounds; no scattered magic numbers in server/client code.
 */
export const NET_TUNING = {
  /** Authoritative simulation frequency. */
  simHz: 30,
  /** Snapshot broadcast frequency to clients. */
  snapshotHz: 20,
  /** Driver sequenced input send frequency. */
  driverInputHz: 20,
  /** Gunner aim frame send frequency (periodic; actions are immediate). */
  gunnerAimHz: 20,
  /** Held-state refresh frequency (recovery after missed edges). */
  heldRefreshHz: 4,
  /** Remote entity interpolation delay (seconds of render-time lag). */
  remoteInterpolationDelay: 0.1,
  /** Bounded queue sizes. */
  queues: {
    maxPendingDriverInputs: 16,
    maxPendingGunnerAimFrames: 16,
    maxPendingImpulses: 16,
    maxPendingActions: 16,
    maxReplayDriverInputs: 8,
    maxReplayImpulses: 8,
    serverOpLog: 32,
  },
} as const;

export const SIM_DT = 1 / NET_TUNING.simHz;
export const SNAPSHOT_INTERVAL = 1 / NET_TUNING.snapshotHz;
export const DRIVER_INPUT_INTERVAL = 1 / NET_TUNING.driverInputHz;
export const GUNNER_AIM_INTERVAL = 1 / NET_TUNING.gunnerAimHz;
export const HELD_REFRESH_INTERVAL = 1 / NET_TUNING.heldRefreshHz;

/** Seconds of wall-clock per frame for a target FPS (render budget). */
export function frameBudgetMs(fps: number): number {
  return 1000 / fps;
}
