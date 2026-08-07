import type { ShellState } from '../../shared/types';

export const PLAYER_CANNON_MAX_EXTRAPOLATION_SECONDS = 0.12;
export const PLAYER_CANNON_IMPACT_TOMBSTONE_SECONDS = 1;

const CORRECTION_MIN_METERS = 0.5;
const CORRECTION_SNAP_METERS = 2;
const CORRECTION_SECONDS = 0.04;

interface ProjectilePresentationRecord {
  authoritative: ShellState;
  visual: ShellState;
  snapshotServerTime: number;
  generation: number;
  correctionX: number;
  correctionY: number;
  correctionZ: number;
  correctionStartedAt: number;
}

interface Pose {
  x: number;
  y: number;
  z: number;
  vy: number;
  age: number;
}

/**
 * Low-latency, presentation-only path for multiplayer player cannon shells.
 * Gameplay collision and impact authority remain entirely on the server.
 */
export class PlayerCannonProjectilePresenter {
  private readonly records = new Map<number, ProjectilePresentationRecord>();
  private readonly impactedUntil = new Map<number, number>();
  private readonly output: ShellState[] = [];
  private generation = 0;
  private latestSnapshotServerTime = Number.NEGATIVE_INFINITY;

  extrapolationSeconds = 0;
  visualErrorMeters = 0;

  updateSnapshot(
    shells: readonly ShellState[],
    serverTime: number,
    estimatedServerNow: number,
    gravity: number,
  ): void {
    if (serverTime < this.latestSnapshotServerTime) return;
    this.latestSnapshotServerTime = serverTime;
    this.pruneTombstones(estimatedServerNow);
    const generation = ++this.generation;

    for (const shell of shells) {
      if (!isPlayerCannonShell(shell)) continue;
      if ((this.impactedUntil.get(shell.id) ?? Number.NEGATIVE_INFINITY) > estimatedServerNow) continue;

      let record = this.records.get(shell.id);
      if (!record) {
        record = {
          authoritative: { ...shell },
          visual: { ...shell },
          snapshotServerTime: serverTime,
          generation,
          correctionX: 0,
          correctionY: 0,
          correctionZ: 0,
          correctionStartedAt: estimatedServerNow,
        };
        this.records.set(shell.id, record);
        continue;
      }

      const previous = samplePose(record.authoritative, record.snapshotServerTime, estimatedServerNow, gravity);
      Object.assign(record.authoritative, shell);
      record.snapshotServerTime = serverTime;
      record.generation = generation;
      const next = samplePose(record.authoritative, serverTime, estimatedServerNow, gravity);
      const dx = previous.x - next.x;
      const dy = previous.y - next.y;
      const dz = previous.z - next.z;
      const error = Math.hypot(dx, dy, dz);

      if (error >= CORRECTION_MIN_METERS && error <= CORRECTION_SNAP_METERS) {
        record.correctionX = dx;
        record.correctionY = dy;
        record.correctionZ = dz;
        record.correctionStartedAt = estimatedServerNow;
      } else {
        record.correctionX = 0;
        record.correctionY = 0;
        record.correctionZ = 0;
        record.correctionStartedAt = estimatedServerNow;
      }
    }

    for (const [id, record] of this.records) {
      if (record.generation !== generation) this.records.delete(id);
    }
  }

  /** Returns a stable, reused array of pooled visual shell records. */
  sample(estimatedServerNow: number, gravity: number): readonly ShellState[] {
    this.output.length = 0;
    this.extrapolationSeconds = 0;
    this.visualErrorMeters = 0;
    this.pruneTombstones(estimatedServerNow);

    for (const [id, record] of this.records) {
      if ((this.impactedUntil.get(id) ?? Number.NEGATIVE_INFINITY) > estimatedServerNow) continue;
      const pose = samplePose(record.authoritative, record.snapshotServerTime, estimatedServerNow, gravity);
      const correctionAge = Math.max(0, estimatedServerNow - record.correctionStartedAt);
      const correctionWeight = Math.max(0, 1 - correctionAge / CORRECTION_SECONDS);
      const correctionX = record.correctionX * correctionWeight;
      const correctionY = record.correctionY * correctionWeight;
      const correctionZ = record.correctionZ * correctionWeight;
      const out = record.visual;
      Object.assign(out, record.authoritative);
      out.x = pose.x + correctionX;
      out.y = pose.y + correctionY;
      out.z = pose.z + correctionZ;
      out.vy = pose.vy;
      this.output.push(out);
      this.extrapolationSeconds = Math.max(this.extrapolationSeconds, pose.age);
      this.visualErrorMeters = Math.max(
        this.visualErrorMeters,
        Math.hypot(correctionX, correctionY, correctionZ),
      );
    }

    return this.output;
  }

  markImpacted(shellId: number, serverNow: number): void {
    this.records.delete(shellId);
    this.impactedUntil.set(shellId, serverNow + PLAYER_CANNON_IMPACT_TOMBSTONE_SECONDS);
    const outputIndex = this.output.findIndex((shell) => shell.id === shellId);
    if (outputIndex >= 0) this.output.splice(outputIndex, 1);
  }

  reset(): void {
    this.records.clear();
    this.impactedUntil.clear();
    this.output.length = 0;
    this.generation = 0;
    this.latestSnapshotServerTime = Number.NEGATIVE_INFINITY;
    this.extrapolationSeconds = 0;
    this.visualErrorMeters = 0;
  }

  private pruneTombstones(serverNow: number): void {
    for (const [id, expiresAt] of this.impactedUntil) {
      if (expiresAt <= serverNow) this.impactedUntil.delete(id);
    }
  }
}

export function isPlayerCannonShell(shell: ShellState): boolean {
  return shell.kind === 'cannon' && shell.team === 'player';
}

function samplePose(
  shell: ShellState,
  snapshotServerTime: number,
  estimatedServerNow: number,
  gravity: number,
): Pose {
  const age = Math.min(
    PLAYER_CANNON_MAX_EXTRAPOLATION_SECONDS,
    Math.max(0, estimatedServerNow - snapshotServerTime),
  );
  return {
    x: shell.x + shell.vx * age,
    y: shell.y + shell.vy * age - 0.5 * gravity * age * age,
    z: shell.z + shell.vz * age,
    vy: shell.vy - gravity * age,
    age,
  };
}
