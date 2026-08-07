import { describe, expect, it } from 'vitest';
import { NetworkStatePresenter, presentationDelayMs } from '../../src/client/app/networkStatePresenter';
import {
  PLAYER_CANNON_MAX_EXTRAPOLATION_SECONDS,
  PlayerCannonProjectilePresenter,
} from '../../src/client/prediction/projectilePresenter';
import { RemoteEntityInterpolator, type RemoteFrame } from '../../src/client/prediction/remoteInterpolator';
import type { SnapshotEnvelope } from '../../src/shared/net/interpolation';
import type { EnemyState, MatchState, ShellState } from '../../src/shared/types';

const GRAVITY = 5;

function shell(id: number, overrides: Partial<ShellState> = {}): ShellState {
  return {
    id,
    kind: 'cannon',
    team: 'player',
    x: 0,
    y: 2,
    z: 0,
    vx: 50,
    vy: 10,
    vz: 0,
    life: 2,
    ...overrides,
  };
}

function state(shells: ShellState[], enemies: EnemyState[] = []): MatchState {
  return {
    shells,
    enemies,
    pickups: [],
    xpShards: [],
    truck: { active: false, x: 0, y: 0, z: 0, yaw: 0, hp: 0, waypoint: 0, escaped: false, sirenT: 0 },
    turret: { yaw: 0, pitch: 0 },
    tank: { x: 0, y: 0, z: 0 },
  } as unknown as MatchState;
}

function envelope(seq: number, serverTime: number, match: MatchState): SnapshotEnvelope<MatchState> {
  return {
    seq,
    serverTime,
    state: match,
    lastProcessedDriverInputSeq: 0,
    lastProcessedGunnerInputSeq: 0,
  };
}

function frame(match: MatchState): RemoteFrame {
  return {
    enemies: [],
    pickups: [],
    xpShards: [],
    shells: [],
    truck: { active: false, x: 0, y: 0, z: 0, yaw: 0, hp: 0, waypoint: 0, escaped: false, sirenT: 0 },
    turret: { yaw: 0, pitch: 0 },
    tank: match.tank,
    discrete: match,
    interpolated: false,
  };
}

describe('multiplayer player cannon projectile presentation', () => {
  it('uses the newest authoritative shell instead of the delayed interpolation pose', () => {
    const a = state([shell(42, { x: 0 })]);
    const b = state([shell(42, { x: 10 })]);
    const remote = new RemoteEntityInterpolator();
    const remoteFrame = frame(b);
    remote.setEndpoints(envelope(1, 1, a), envelope(2, 1.1, b), 0.5);
    remote.fill(remoteFrame);
    expect(remoteFrame.shells[0].x).toBeCloseTo(5);

    const projectiles = new PlayerCannonProjectilePresenter();
    projectiles.updateSnapshot(b.shells, 1.1, 1.1, GRAVITY);
    expect(projectiles.sample(1.1, GRAVITY)[0].x).toBeCloseTo(10);
  });

  it('forward-extrapolates from actual authoritative velocity', () => {
    const projectiles = new PlayerCannonProjectilePresenter();
    projectiles.updateSnapshot([shell(42, { x: 0, vx: 50 })], 1, 1, GRAVITY);
    expect(projectiles.sample(1.1, GRAVITY)[0].x).toBeCloseTo(5);
  });

  it('applies cannon gravity to ballistic height and vertical velocity', () => {
    const projectiles = new PlayerCannonProjectilePresenter();
    projectiles.updateSnapshot([shell(42, { y: 2, vy: 10 })], 1, 1, GRAVITY);
    const visual = projectiles.sample(1.1, GRAVITY)[0];
    expect(visual.y).toBeCloseTo(2 + 10 * 0.1 - 0.5 * GRAVITY * 0.1 ** 2);
    expect(visual.vy).toBeCloseTo(10 - GRAVITY * 0.1);
  });

  it('caps extrapolation during a packet stall', () => {
    const projectiles = new PlayerCannonProjectilePresenter();
    projectiles.updateSnapshot([shell(42, { x: 0, vx: 50 })], 1, 1, GRAVITY);
    const visual = projectiles.sample(1.5, GRAVITY)[0];
    expect(visual.x).toBeCloseTo(50 * PLAYER_CANNON_MAX_EXTRAPOLATION_SECONDS);
    expect(projectiles.extrapolationSeconds).toBe(PLAYER_CANNON_MAX_EXTRAPOLATION_SECONDS);
  });

  it('removes an impacted shell immediately and blocks stale resurrection', () => {
    const projectiles = new PlayerCannonProjectilePresenter();
    projectiles.updateSnapshot([shell(42)], 1, 1, GRAVITY);
    expect(projectiles.sample(1, GRAVITY).map((entry) => entry.id)).toEqual([42]);

    projectiles.markImpacted(42, 1.05);
    expect(projectiles.sample(1.05, GRAVITY)).toHaveLength(0);
    projectiles.updateSnapshot([shell(42, { x: 3 })], 1.1, 1.1, GRAVITY);
    expect(projectiles.sample(1.1, GRAVITY)).toHaveLength(0);
  });

  it('routes an authoritative cannon impact to immediate shell-view removal', () => {
    const visible = new Set([42, 43]);
    const presenter = new NetworkStatePresenter({
      assets: {},
      tankRig: {},
      registry: { removeShell: (id: number) => visible.delete(id) },
      session: () => ({ kind: 'multiplayer', networked: true }),
    } as never);
    const impact = { type: 'enemyExplosion', t: 1, id: 42, kind: 'cannon', x: 5, y: 1, z: 2 } as const;
    presenter.handleEvent(impact);
    presenter.handleEvent(impact);
    expect([...visible]).toEqual([43]);
  });

  it('keys Twin Shell presentation and impact removal independently', () => {
    const projectiles = new PlayerCannonProjectilePresenter();
    projectiles.updateSnapshot([shell(42), shell(43, { z: 2 })], 1, 1, GRAVITY);
    projectiles.markImpacted(42, 1.05);
    expect(projectiles.sample(1.05, GRAVITY).map((entry) => entry.id)).toEqual([43]);
  });

  it('uses a charged shell actual velocity and preserves its visual fields', () => {
    const projectiles = new PlayerCannonProjectilePresenter();
    projectiles.updateSnapshot([
      shell(42, { vx: 80, chargeRatio: 0.75, visualScale: 1.8 }),
    ], 1, 1, GRAVITY);
    const visual = projectiles.sample(1.1, GRAVITY)[0];
    expect(visual.x).toBeCloseTo(8);
    expect(visual.chargeRatio).toBe(0.75);
    expect(visual.visualScale).toBe(1.8);
  });

  it('clears projectile records and tombstones on reset', () => {
    const projectiles = new PlayerCannonProjectilePresenter();
    projectiles.updateSnapshot([shell(42)], 1, 1, GRAVITY);
    projectiles.markImpacted(42, 1.05);
    projectiles.reset();
    projectiles.updateSnapshot([shell(42)], 0, 0, GRAVITY);
    expect(projectiles.sample(0, GRAVITY).map((entry) => entry.id)).toEqual([42]);
  });

  it('leaves enemy interpolation and non-player shell timing unchanged', () => {
    const enemyA = { id: 7, alive: true, x: 0, y: 0, z: 0, yaw: 0, aimYaw: 0 } as EnemyState;
    const enemyB = { ...enemyA, x: 10 };
    const towerA = shell(9, { kind: 'tower', team: 'enemy', x: 0 });
    const towerB = shell(9, { kind: 'tower', team: 'enemy', x: 10 });
    const a = state([towerA], [enemyA]);
    const b = state([towerB], [enemyB]);
    const remote = new RemoteEntityInterpolator();
    const remoteFrame = frame(b);
    remote.setEndpoints(envelope(1, 1, a), envelope(2, 1.1, b), 0.5);
    remote.fill(remoteFrame);
    expect(remoteFrame.enemies[0].x).toBeCloseTo(5);
    expect(remoteFrame.shells[0].x).toBeCloseTo(5);
  });

  it('reports a positive delay when the remote render clock is behind authority', () => {
    expect(presentationDelayMs(10, 9.9)).toBeCloseTo(100);
    expect(presentationDelayMs(9.9, 10)).toBe(0);
  });
});
