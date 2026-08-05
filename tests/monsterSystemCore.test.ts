import { describe, expect, it } from 'vitest';
import {
  monsterLevelAtTime,
  monsterHealthMultiplier,
  monsterDamageMultiplier,
  monsterXpReward,
  resolveMonsterSpawnLock,
  type MonsterLevelCurveData,
  type MonsterXpRewardsData,
} from '../src/shared/monsters/monsterDifficulty';
import {
  advanceAttackCycle,
  attackPlaybackSpeed,
  cancelAttackCycle,
  startAttackCycle,
  type EnemyAttackRuntime,
} from '../src/shared/monsters/monsterAttack';
import {
  monsterPhaseAt,
  monsterLevelForPhase,
  beginBossPhase,
  endMatch,
  type MonsterPhaseConfig,
  type MonsterPhaseState,
} from '../src/shared/monsters/monsterPhase';
import {
  MeleeReservationManager,
  type MeleeCandidate,
} from '../src/shared/monsters/meleeReservations';

const curve: MonsterLevelCurveData = {
  levelIntervalSeconds: 15,
  minimumLevel: 1,
  maximumLevel: 13,
  healthMultiplierPerLevel: 1.2,
  damageMultiplierPerLevel: 1.18,
  bossPhaseLevel: 13,
};

const rewards: MonsterXpRewardsData = {
  classes: {
    ambient: { base: 1, perLevel: 1 },
    wave: { base: 2, perLevel: 2 },
    elite: { base: 40, perLevel: 8 },
    boss: { base: 150, perLevel: 0 },
  },
};

describe('monster level boundaries', () => {
  it.each([
    [0, 1],
    [14.999, 1],
    [15, 2],
    [60, 5],
    [120, 9],
    [179.999, 12],
    [180, 13],
    [9999, 13],
  ])('%s seconds → Lv%s', (seconds, expected) => {
    expect(monsterLevelAtTime(seconds, curve)).toBe(expected);
  });
});

describe('monster difficulty formulas', () => {
  it('health is 1.20^(level-1)', () => {
    expect(monsterHealthMultiplier(1, curve)).toBeCloseTo(1, 9);
    expect(monsterHealthMultiplier(2, curve)).toBeCloseTo(1.2, 9);
    expect(monsterHealthMultiplier(13, curve)).toBeCloseTo(1.2 ** 12, 9);
  });

  it('damage is 1.18^(level-1)', () => {
    expect(monsterDamageMultiplier(1, curve)).toBeCloseTo(1, 9);
    expect(monsterDamageMultiplier(13, curve)).toBeCloseTo(1.18 ** 12, 9);
  });

  it('spawn lock never changes and boss damage is fixed', () => {
    const fodder = resolveMonsterSpawnLock({
      tier: 'fodder',
      baseHp: 4,
      baseDamage: 4,
      rewardClass: 'ambient',
      level: 5,
      curve,
      rewards,
    });
    expect(fodder.level).toBe(5);
    expect(fodder.maxHpAtSpawn).toBeCloseTo(4 * 1.2 ** 4, 9);
    expect(fodder.scaledContactDps).toBeCloseTo(4 * 1.18 ** 4, 9);
    const boss = resolveMonsterSpawnLock({
      tier: 'boss',
      baseHp: 250,
      baseDamage: undefined,
      rewardClass: 'boss',
      level: 13,
      curve,
      rewards,
    });
    expect(boss.maxHpAtSpawn).toBeCloseTo(250 * 1.2 ** 12, 9);
    expect(boss.damageMultiplierAtSpawn).toBe(1);
  });

  it('XP rewards scale with spawn level; Single Player is ×2', () => {
    expect(monsterXpReward(1, 'ambient', rewards)).toBe(2);
    expect(monsterXpReward(5, 'ambient', rewards)).toBe(6);
    expect(monsterXpReward(9, 'wave', rewards)).toBe(20);
    expect(monsterXpReward(13, 'elite', rewards)).toBe(144);
    expect(monsterXpReward(13, 'boss', rewards)).toBe(150);
    expect(monsterXpReward(5, 'ambient', rewards, 2)).toBe(12);
    expect(monsterXpReward(5, 'ambient', rewards, 1)).toBe(6);
  });
});

describe('attack cycle and cue', () => {
  it('fires the cue exactly once per cycle, even across a frame skip', () => {
    let cues = 0;
    const runtime = startAttackCycle(0, 2, undefined, 1);
    advanceAttackCycle(runtime, 0.1, () => cues++);
    advanceAttackCycle(runtime, 0.4, () => cues++); // jumps across the 0.275 s cue
    expect(cues).toBe(1);
    expect(runtime.cueFired).toBe(true);
    advanceAttackCycle(runtime, 0.6, () => cues++);
    expect(cues).toBe(1);
    expect(runtime.active).toBe(false);
  });

  it('duplicate snapshots cannot refire the cue', () => {
    const runtime = startAttackCycle(0, 1, 0.5, 2);
    const results: string[] = [];
    advanceAttackCycle(runtime, 0.5, () => results.push('cue'));
    advanceAttackCycle(runtime, 0.5, () => results.push('cue'));
    expect(results).toEqual(['cue']);
  });

  it('death cancels pending cues and blocks new attacks', () => {
    const runtime = startAttackCycle(0, 1, 0.9, 3);
    cancelAttackCycle(runtime);
    let cues = 0;
    advanceAttackCycle(runtime, 5, () => cues++);
    expect(cues).toBe(0);
    expect(runtime.active).toBe(false);
  });

  it('playback fitting clamps without changing gameplay rate', () => {
    expect(attackPlaybackSpeed(1.0, 2.0)).toBeCloseTo(2.0, 9);
    expect(attackPlaybackSpeed(3.0, 2.0)).toBeCloseTo(2.5, 9);
    expect(attackPlaybackSpeed(0.2, 2.0)).toBeCloseTo(0.6, 9);
  });
});

describe('melee engagement reservations', () => {
  const profile = {
    spacingMultiplier: 1.25,
    minimumSlots: 3,
    maximumSlots: 6,
    reservationGraceSeconds: 0.35,
    releaseDistanceMultiplier: 1.35,
  };

  function candidate(id: number, angle: number, distance: number, threat = 1, alive = true): MeleeCandidate {
    return {
      id,
      x: Math.cos(angle) * distance,
      z: Math.sin(angle) * distance,
      collisionDiameter: 1,
      threat,
      alive,
      attackRange: 2,
      distanceToTank: distance,
      angleToTank: angle,
      lastDamageAt: 0,
    };
  }

  it('grants at most maximumSlots and requires ownership to fire', () => {
    const manager = new MeleeReservationManager(profile);
    const candidates = Array.from({ length: 12 }, (_, i) =>
      candidate(i, (i / 12) * Math.PI * 2, 1.5),
    );
    manager.update(0, 0, candidates, 0);
    // 1.25 rad arcs cannot all fit around the ring; packing is deterministic.
    expect(manager.size).toBe(3);
    expect(manager.size).toBeLessThanOrEqual(6);
    const owners = candidates.filter((c) => manager.hasReservation(c.id));
    expect(owners.length).toBe(manager.size);
    for (const c of candidates) {
      expect(manager.canFireMelee(c.id, 0)).toBe(manager.hasReservation(c.id));
    }
    const quarter = new MeleeReservationManager(profile);
    quarter.update(
      0,
      0,
      [0, 1, 2, 3].map((i) => candidate(i, (i / 4) * Math.PI * 2, 1.5)),
      0,
    );
    expect(quarter.size).toBe(4);
  });

  it('releases on death, distance escape, and grace expiry', () => {
    const manager = new MeleeReservationManager(profile);
    manager.update(0, 0, [candidate(1, 0, 1.5)], 0);
    expect(manager.hasReservation(1)).toBe(true);
    // Death.
    manager.update(0, 0, [candidate(1, 0, 1.5, 1, false)], 0.1);
    expect(manager.hasReservation(1)).toBe(false);
    // Distance escape.
    manager.update(0, 0, [candidate(2, 1, 1.5)], 0.2);
    expect(manager.hasReservation(2)).toBe(true);
    manager.update(0, 0, [candidate(2, 1, 20)], 0.3);
    expect(manager.hasReservation(2)).toBe(false);
    // Grace expiry without refresh.
    manager.update(0, 0, [candidate(3, 2, 1.5)], 0.4);
    expect(manager.hasReservation(3)).toBe(true);
    manager.update(0, 0, [], 1.0);
    expect(manager.hasReservation(3)).toBe(false);
  });

  it('arbitration is deterministic: distance, ownership, threat, id', () => {
    const a = new MeleeReservationManager(profile);
    const b = new MeleeReservationManager(profile);
    const candidates = [
      candidate(5, 0.2, 3.0, 3),
      candidate(1, 1.0, 1.2, 1),
      candidate(3, 2.0, 2.0, 5),
      candidate(7, 3.0, 1.2, 1),
    ];
    a.update(0, 0, candidates, 0);
    b.update(0, 0, candidates, 0);
    const ownersA = candidates.filter((c) => a.hasReservation(c.id)).map((c) => c.id).sort();
    const ownersB = candidates.filter((c) => b.hasReservation(c.id)).map((c) => c.id).sort();
    expect(ownersA).toEqual(ownersB);
    // Closest (id 1 and 7 at 1.2) get slots before the distant id 5.
    expect(ownersA).toContain(1);
    expect(ownersA).toContain(7);
  });

  it('elites with larger diameters consume wider arcs', () => {
    const manager = new MeleeReservationManager(profile);
    const wide = { ...candidate(1, 0, 1.5), collisionDiameter: 3 };
    const narrow = { ...candidate(2, Math.PI, 1.5), collisionDiameter: 1 };
    manager.update(0, 0, [wide, narrow], 0);
    expect(manager.hasReservation(1)).toBe(true);
    expect(manager.hasReservation(2)).toBe(true);
  });
});

describe('monster phase machine', () => {
  const config: MonsterPhaseConfig = {
    farmingSeconds: 180,
    bossIntroSeconds: 4,
    bossPhaseLevel: 13,
  };
  const state: MonsterPhaseState = { phase: 'FARMING' };

  it('transitions FARMING → BOSS_INTRO → BOSS_ACTIVE and never ends at 180', () => {
    expect(monsterPhaseAt(0, config, state)).toBe('FARMING');
    expect(monsterPhaseAt(179, config, state)).toBe('FARMING');
    expect(monsterPhaseAt(180, config, state)).toBe('BOSS_INTRO');
    expect(monsterPhaseAt(183, config, state)).toBe('BOSS_INTRO');
    expect(monsterPhaseAt(184, config, state)).toBe('BOSS_ACTIVE');
    expect(monsterPhaseAt(300, config, state)).toBe('BOSS_ACTIVE');
  });

  it('boss level locks at 13 after farming and victory/defeat end the match', () => {
    expect(monsterLevelForPhase(60, config, (t) => monsterLevelAtTime(t, curve))).toBe(5);
    expect(monsterLevelForPhase(180, config, (t) => monsterLevelAtTime(t, curve))).toBe(13);
    const active = beginBossPhase(state, 184);
    expect(active.phase).toBe('BOSS_ACTIVE');
    const victory = endMatch(active, 220, true);
    expect(victory.phase).toBe('RESULTS');
    expect(victory.victory).toBe(true);
    expect(monsterPhaseAt(500, config, victory)).toBe('RESULTS');
  });
});
