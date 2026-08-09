import { describe, expect, it } from 'vitest';
import { loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';
import { Match } from '../../src/shared/sim/match';
import { createStaticArenaWorld } from '../../src/shared/sim/arenaWorld';
import { resolveMonsterDimensionsForDefId } from '../../src/shared/monsters/monsterNormalization';
import {
  reservationTarget,
  resolveMonsterEngagementGeometry,
} from '../../src/shared/monsters/engagementGeometry';
import {
  DEFAULT_MELEE_ENGAGEMENT_PROFILE,
  MeleeReservationManager,
} from '../../src/shared/monsters/meleeReservations';
import { EnemyRuntimeState } from '../../src/shared/enemies/enemyRuntimeState';

const pack = loadContentPackFromFilesystem('content');
const DT = 1 / 30;
const TANK_RADIUS = 1.35;

function makeMatch(): Match {
  return new Match('engage-sim', 'none', pack, createStaticArenaWorld(), 'mode.mainStage');
}

function step(m: Match, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    m.step(DT);
    if (m.state.phase === 'running') {
      m.state.tank.integrity = m.runtime.cfg.tank.maxIntegrity;
      m.state.tank.deadT = 0;
    }
  }
}

describe('resolved engagement geometry (second-pass)', () => {
  it('effective melee distance = enemy radius + tank radius + authored reach', () => {
    const g = resolveMonsterEngagementGeometry({
      enemyRadius: 2.1,
      tankRadius: TANK_RADIUS,
      authoredAttackReach: 2.5,
    });
    expect(g.effectiveAttackDistance).toBeCloseTo(2.1 + 1.35 + 2.5, 6);
    expect(g.reservationRadius).toBe(g.effectiveAttackDistance);
    expect(g.releaseRadius).toBeCloseTo(
      g.effectiveAttackDistance * DEFAULT_MELEE_ENGAGEMENT_PROFILE.releaseDistanceMultiplier,
      6,
    );
    expect(g.stopRadius).toBeLessThan(g.effectiveAttackDistance);
    expect(g.stagingInnerRadius).toBeLessThan(g.stagingOuterRadius);
  });

  it('reservation angles map to distinct physical target points', () => {
    const manager = new MeleeReservationManager(DEFAULT_MELEE_ENGAGEMENT_PROFILE);
    const radius = 3.6;
    const candidates = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      x: Math.sin((i / 6) * Math.PI * 2) * radius,
      z: Math.cos((i / 6) * Math.PI * 2) * radius,
      collisionDiameter: 0.4,
      threat: 1,
      alive: true,
      attackRange: radius,
      distanceToTank: radius,
      angleToTank: (i / 6) * Math.PI * 2,
      lastDamageAt: 0,
    }));
    manager.update(0, 0, candidates, 1);
    expect(manager.size).toBeGreaterThanOrEqual(5);
    const targets = candidates
      .map((c) => manager.reservation(c.id))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => reservationTarget(r.angle, 0, 0, radius));
    const positions = new Set(targets.map((t) => `${t.x.toFixed(4)},${t.z.toFixed(4)}`));
    expect(positions.size).toBe(targets.length);
    for (const t of targets) {
      expect(Math.hypot(t.x, t.z)).toBeCloseTo(radius, 4);
    }
  });

  it('mixed Elite attack hold keeps the body outside invalid collider overlap', () => {
    const m = makeMatch();
    step(m, 4);
    const defId = 'enemy.quaternius.ninja-high-detail';
    const def = pack.getEnemy(defId);
    if (def.type !== 'monster' || def.attack.type !== 'mixed') throw new Error('expected mixed monster');
    const melee = def.attack.patterns.find((pattern) => pattern.type === 'melee');
    if (!melee) throw new Error('expected melee pattern');
    const dims = resolveMonsterDimensionsForDefId(defId);
    const effective =
      dims.collisionRadius + TANK_RADIUS + melee.range;
    const e = m.runtime.systems.enemies.spawnEnemyDef(
      def,
      m.state.tank.x + Math.sin(0.3) * (effective * 1.6),
      m.state.tank.z + Math.cos(0.3) * (effective * 1.6),
    )!;
    let attacked = false;
    let minGap = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 360 && !attacked; i++) {
      m.step(DT);
      if (m.state.phase === 'running') {
        m.state.tank.integrity = m.runtime.cfg.tank.maxIntegrity;
        m.state.tank.deadT = 0;
      }
      const foe = m.state.enemies.find((x) => x.id === e.id);
      if (!foe) break;
      const d = Math.hypot(foe.x - m.state.tank.x, foe.z - m.state.tank.z);
      minGap = Math.min(minGap, d);
      if (m.runtime.systems.enemies.semanticFor(e.id).action === 'Attack') attacked = true;
    }
    expect(attacked).toBe(true);
    // At the attack hold the colliders never overlap: center distance stays
    // above enemyRadius + tankRadius.
    expect(minGap).toBeGreaterThan(dims.collisionRadius + TANK_RADIUS - 0.01);
  });

  it('density steering remains active during chase', () => {
    const m = makeMatch();
    step(m, 4);
    const def = pack.getEnemy('enemy.quaternius.ninja');
    const e = m.runtime.systems.enemies.spawnEnemyDef(
      def,
      m.state.tank.x,
      m.state.tank.z + 28,
    )!;
    step(m, 0.5);
    const ctx = m.runtime.systems;
    const behavior = ctx.enemies.behaviors.require('movement.meleeEngagement');
    const foe = m.state.enemies.find((x) => x.id === e.id)!;
    const runtime = new EnemyRuntimeState();
    const distToTank = Math.hypot(foe.x - m.state.tank.x, foe.z - m.state.tank.z);
    expect(distToTank).toBeGreaterThan(12); // CHASE band
    runtime.distToTank = distToTank;
    runtime.meleeReserved = false;
    runtime.speed = 4;
    // Pure pursuit direction without separation.
    const dx = m.state.tank.x - foe.x;
    const dz = m.state.tank.z - foe.z;
    const d = Math.hypot(dx, dz) || 1;
    const pureX = dx / d;
    const pureZ = dz / d;
    // A strong separation push on the perpendicular axis.
    runtime.densityX = -pureZ * 2;
    runtime.densityZ = pureX * 2;
    behavior.update(ctx, foe, runtime, DT);
    const dirLen = Math.hypot(runtime.dirX, runtime.dirZ);
    expect(dirLen).toBeGreaterThan(0.9);
    expect(runtime.dirX).not.toBeCloseTo(pureX, 2);
    expect(runtime.dirZ).not.toBeCloseTo(pureZ, 2);
  });
});
