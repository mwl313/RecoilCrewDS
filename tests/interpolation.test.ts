import { describe, expect, it } from 'vitest';
import { SnapshotBuffer, interpolateMatchState, type SnapshotEnvelope } from '../src/shared/net/interpolation';
import type { MatchState } from '../src/shared/types';

function state(time: number, z: number, yaw = 0): MatchState {
  return {
    matchId: 'm',
    time,
    duration: 90,
    phase: 'running',
    tank: {
      x: 0, y: 0, z, vx: 0, vy: 0, vz: 0, yaw, yawVel: 0, pitch: 0, roll: 0,
      integrity: 100, dashCooldown: 0, dashPresentationT: 0, dashDamageT: 0, shieldedT: 0, deadT: 0, grounded: true, drift: false,
    },
    turret: { yaw: 0, pitch: 0, cannonHeld: false, cannonHoldT: 0, cannonChargeRatio: 0, cannonChargeFull: false, cannonCooldown: 0, cannonFlash: 0, mgCooldown: 0, mgFiring: false },
    combo: { multiplier: 1, points: 0, lastDriverT: -99, lastGunnerT: -99, lastAnyT: -99, best: 1 },
    build: { capabilities: [] },
    matchFlow: 'playing',
    teamProgression: {
      level: 1, currentXp: 0, xpForNextLevel: 20, totalXpCollected: 0, pendingLevelUps: 0,
      levelUpOffersCompleted: 0, levelUpgradeSummary: [], treasureChestsOpened: 0, relicAcquisitionSequence: 0, relicStacks: {},
      activeSelection: null, lastRelicResult: null, pendingRelicResults: [],
    },
    chests: [],
    xpShards: [],
    stats: { score: 0, chargedCannonShots: 0, fullChargeShots: 0, kills: 0, scrapCollected: 0, links: 0, dashKills: 0, dodgeCount: 0, wipeouts: 0, bestCombo: 1, anyContribution: false },
    enemies: [],
    pickups: [],
    shells: [],
    barrels: [],
    truck: { active: false, x: 0, y: 0, z: 0, yaw: 0, hp: 26, waypoint: 0, escaped: false, sirenT: 0 },
    respawnT: 0,
    countdown: 0,
    modifier: 'none',
    nextEnemyId: 1,
    nextPickupId: 1,
    nextShellId: 1,
    nextXpShardId: 1,
    nextChestId: 1,
  };
}

function env(seq: number, serverTime: number, s: MatchState): SnapshotEnvelope<MatchState> {
  return { seq, serverTime, state: s, lastProcessedDriverInputSeq: 0, lastProcessedGunnerInputSeq: 0 };
}

describe('snapshot buffer bracketing', () => {
  it('picks the pair surrounding render time with the correct alpha', () => {
    const buf = new SnapshotBuffer<MatchState>();
    buf.push(env(1, 1.0, state(1.0, 10)));
    buf.push(env(2, 1.2, state(1.2, 12)));
    const pair = buf.pick(1.1)!;
    expect(pair.a.state.time).toBe(1.0);
    expect(pair.b.state.time).toBe(1.2);
    expect(pair.alpha).toBeCloseTo(0.5);
  });

  it('rejects out-of-order and repeated snapshots', () => {
    const buf = new SnapshotBuffer<MatchState>();
    buf.push(env(2, 1.0, state(1.0, 10)));
    buf.push(env(1, 0.8, state(0.8, 8)));
    buf.push(env(2, 1.1, state(1.1, 11)));
    expect(buf.latestSeq).toBe(2);
    expect(buf.latest()?.state.time).toBe(1.0);
  });

  it('uses a bounded fallback when no B exists yet', () => {
    const buf = new SnapshotBuffer<MatchState>();
    buf.push(env(1, 1.0, state(1.0, 10)));
    const pair = buf.pick(1.3)!;
    expect(pair.b).toBe(pair.a);
    expect(pair.alpha).toBe(1);
  });
});

describe('state interpolation', () => {
  it('alpha changes the rendered tank position', () => {
    const a = state(1.0, 10);
    const b = state(1.2, 12);
    const mid = interpolateMatchState(a, b, 0.5);
    expect(mid.tank.z).toBeCloseTo(11);
    expect(interpolateMatchState(a, b, 0).tank.z).toBeCloseTo(10);
    expect(interpolateMatchState(a, b, 1).tank.z).toBeCloseTo(12);
  });

  it('interpolates yaw along the shortest angle', () => {
    const a = state(0, 0, (179 * Math.PI) / 180);
    const b = state(1, 0, (-179 * Math.PI) / 180);
    const mid = interpolateMatchState(a, b, 0.5);
    expect(mid.tank.yaw).toBeCloseTo(Math.PI, 6);
  });

  it('does not produce NaN with repeated identical snapshots', () => {
    const a = state(1.0, 10);
    const b = state(1.2, 12);
    for (let i = 0; i < 100; i++) {
      const m = interpolateMatchState(a, b, i / 99);
      expect(Number.isFinite(m.tank.z)).toBe(true);
      expect(Number.isFinite(m.tank.yaw)).toBe(true);
    }
  });

  it('does not interpolate discrete score state', () => {
    const a = state(1.0, 10);
    a.stats.score = 100;
    const b = state(1.2, 12);
    b.stats.score = 400;
    const mid = interpolateMatchState(a, b, 0.5);
    expect(mid.stats.score).toBe(400);
  });
});
