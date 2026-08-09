import { describe, expect, it } from 'vitest';
import { loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';
import { Match } from '../../src/shared/sim/match';
import { createStaticArenaWorld } from '../../src/shared/sim/arenaWorld';
import { resolveMonsterDimensionsForDefId } from '../../src/shared/monsters/monsterNormalization';
import { EnemyRuntimeState } from '../../src/shared/enemies/enemyRuntimeState';

const pack = loadContentPackFromFilesystem('content');
const DT = 1 / 30;

function makeMatch(): Match {
  return new Match('move-sim', 'none', pack, createStaticArenaWorld(), 'mode.mainStage');
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

function spawnAt(m: Match, defId: string, distance: number, angle = 0): number {
  const def = pack.getEnemy(defId);
  const x = m.state.tank.x + Math.sin(angle) * distance;
  const z = m.state.tank.z + Math.cos(angle) * distance;
  const e = m.runtime.systems.enemies.spawnEnemyDef(def, x, z);
  if (!e) throw new Error('spawn failed');
  return e.id;
}

function dist(m: Match, id: number): number {
  const e = m.state.enemies.find((x) => x.id === id);
  if (!e) return -1;
  return Math.hypot(e.x - m.state.tank.x, e.z - m.state.tank.z);
}

function startRunning(m: Match): void {
  step(m, 4);
}

describe('monster movement and behavior ordering (bug-fix phase 3)', () => {
  it('far unreserved melee chases the tank (distance decreases)', () => {
    const m = makeMatch();
    startRunning(m);
    const id = spawnAt(m, 'enemy.quaternius.ninja', 28);
    const before = dist(m, id);
    step(m, 3);
    const after = dist(m, id);
    expect(before).toBeGreaterThan(20);
    expect(after).toBeLessThan(before - 4);
  });

  it('near unreserved melee stages on a ring instead of crossing the tank', () => {
    const m = makeMatch();
    startRunning(m);
    const id = spawnAt(m, 'enemy.quaternius.ninja', 5);
    let minD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 150; i++) {
      m.step(DT);
      minD = Math.min(minD, dist(m, id));
    }
    expect(minD).toBeGreaterThan(1.5);
    const d = dist(m, id);
    expect(d).toBeGreaterThan(2);
    expect(d).toBeLessThan(8);
  });

  it('reserved melee reaches the attack position', () => {
    const m = makeMatch();
    startRunning(m);
    const id = spawnAt(m, 'enemy.quaternius.ninja', 8);
    const def = pack.getEnemy('enemy.quaternius.ninja');
    const attackRange = def.type === 'monster' && def.attack.type === 'melee' ? def.attack.range : 2;
    const effective =
      resolveMonsterDimensionsForDefId('enemy.quaternius.ninja').collisionRadius +
      1.35 +
      attackRange;
    let reached = false;
    for (let i = 0; i < 240 && !reached; i++) {
      m.step(DT);
      reached = m.runtime.systems.enemies.meleeReservedFor(id) && dist(m, id) <= effective * 1.05;
    }
    expect(reached).toBe(true);
  });

  it('only reservation owners enter Attack and deal melee damage', () => {
    const m = makeMatch();
    startRunning(m);
    const ids: number[] = [];
    for (let i = 0; i < 8; i++) {
      ids.push(spawnAt(m, 'enemy.quaternius.ninja', 1.6, (i / 8) * Math.PI * 2));
    }
    const manager = m.runtime.systems.enemies.meleeReservations;
    const attackers = new Set<number>();
    const nonOwners = new Set<number>();
    for (let i = 0; i < 240; i++) {
      m.step(DT);
      if (m.state.phase === 'running') {
        m.state.tank.integrity = m.runtime.cfg.tank.maxIntegrity;
        m.state.tank.deadT = 0;
      }
      for (const id of ids) {
        if (m.runtime.systems.enemies.semanticFor(id).action === 'Attack') {
          attackers.add(id);
          if (!m.runtime.systems.enemies.meleeReservedFor(id)) nonOwners.add(id);
        }
      }
    }
    expect(attackers.size).toBeGreaterThanOrEqual(1);
    expect([...nonOwners]).toEqual([]);
    expect(attackers.size).toBeLessThanOrEqual(manager.size);
  });

  it('ranged monsters hold the preferred band without oscillation', () => {
    const m = makeMatch();
    startRunning(m);
    const id = spawnAt(m, 'enemy.quaternius.wizard', 13);
    const samples: number[] = [];
    for (let i = 0; i < 150; i++) {
      m.step(DT);
      samples.push(dist(m, id));
    }
    for (const d of samples) {
      expect(d).toBeGreaterThan(10.5);
      expect(d).toBeLessThan(16.5);
    }
  });

  it('ranged monsters approach from far and retreat from inside the band', () => {
    const far = makeMatch();
    startRunning(far);
    const farId = spawnAt(far, 'enemy.quaternius.wizard', 30);
    step(far, 4);
    expect(dist(far, farId)).toBeLessThan(24);

    const close = makeMatch();
    startRunning(close);
    const closeId = spawnAt(close, 'enemy.quaternius.wizard', 7);
    step(close, 4);
    expect(dist(close, closeId)).toBeGreaterThan(10.4);
  });

  it('speed debuff changes displacement (applied before integration)', () => {
    const m = makeMatch();
    startRunning(m);
    const id = spawnAt(m, 'enemy.quaternius.ninja', 30);
    const x0 = m.state.enemies.find((e) => e.id === id)!.x;
    const z0 = m.state.enemies.find((e) => e.id === id)!.z;
    step(m, 2);
    const baseline = Math.hypot(
      m.state.enemies.find((e) => e.id === id)!.x - x0,
      m.state.enemies.find((e) => e.id === id)!.z - z0,
    );

    const debuffed = makeMatch();
    startRunning(debuffed);
    const slowId = spawnAt(debuffed, 'enemy.quaternius.ninja', 30);
    (debuffed.runtime.systems.progression as unknown as { enemySpeedMultiplier: () => number }).enemySpeedMultiplier = () => 0.5;
    const sx0 = debuffed.state.enemies.find((e) => e.id === slowId)!.x;
    const sz0 = debuffed.state.enemies.find((e) => e.id === slowId)!.z;
    step(debuffed, 2);
    const slowed = Math.hypot(
      debuffed.state.enemies.find((e) => e.id === slowId)!.x - sx0,
      debuffed.state.enemies.find((e) => e.id === slowId)!.z - sz0,
    );
    expect(baseline).toBeGreaterThan(0.5);
    expect(slowed).toBeLessThan(baseline * 0.75);
  });

  it('semantic actions reflect current-frame movement and attack (Attack cue same tick)', () => {
    const m = makeMatch();
    startRunning(m);
    const id = spawnAt(m, 'enemy.quaternius.ninja', 1.2);
    let attackCue = false;
    for (let i = 0; i < 180 && !attackCue; i++) {
      m.step(DT);
      const e = m.state.enemies.find((x) => x.id === id);
      attackCue = e?.actionCue?.actionId === 'enemy.semantic.attack';
    }
    expect(attackCue).toBe(true);
    const foe = m.state.enemies.find((x) => x.id === id)!;
    m.runtime.systems.damage.applyEnemy(foe, 999999, 'test');
    m.step(DT);
    expect(foe.actionCue?.actionId).toBe('enemy.semantic.death');
  });

  it('substeps the 14.4 m/s Ninja Boss against a thin obstacle after a large elapsed update', () => {
    const m = makeMatch();
    const def = pack.getEnemy('enemy.quaternius.ninja-high-detail.boss');
    if (def.type !== 'monster') throw new Error('expected monster');
    const foe = m.runtime.systems.enemies.spawnEnemyDef(def, -22, -10)!;
    const runtime = new EnemyRuntimeState();
    runtime.dirX = 1;
    runtime.speed = 14.4;
    m.runtime.systems.enemies.behaviors.require('movement.integrate').update(m.runtime.systems, foe, runtime, 1);
    // bowlC1 spans x=-15.5..-8.5; the boss radius is resolved before entry.
    expect(foe.x).toBeLessThan(-8.5);
    expect(foe.speed).toBeLessThanOrEqual(14.4);
  });

  it('stays stable through a corner and a narrow alley at 30 Hz', () => {
    const def = pack.getEnemy('enemy.quaternius.ninja-high-detail.boss');
    if (def.type !== 'monster') throw new Error('expected monster');
    const corner = makeMatch();
    const cornerFoe = corner.runtime.systems.enemies.spawnEnemyDef(def, -22, -20)!;
    const cornerRuntime = new EnemyRuntimeState();
    cornerRuntime.dirX = Math.SQRT1_2;
    cornerRuntime.dirZ = Math.SQRT1_2;
    cornerRuntime.speed = 14.4;
    for (let tick = 0; tick < 30; tick++) {
      corner.runtime.systems.enemies.behaviors.require('movement.integrate').update(
        corner.runtime.systems,
        cornerFoe,
        cornerRuntime,
        DT,
      );
    }
    // The body cannot tunnel through bowlC1's south-west corner.
    expect(cornerFoe.x < -8.5 || cornerFoe.z < -11.5).toBe(true);

    const alley = makeMatch();
    const alleyFoe = alley.runtime.systems.enemies.spawnEnemyDef(def, 0, -15)!;
    const alleyRuntime = new EnemyRuntimeState();
    alleyRuntime.dirZ = 1;
    alleyRuntime.speed = 14.4;
    for (let tick = 0; tick < 30; tick++) {
      alley.runtime.systems.enemies.behaviors.require('movement.integrate').update(
        alley.runtime.systems,
        alleyFoe,
        alleyRuntime,
        DT,
      );
    }
    // The boss fits through the center gap without unstable lateral ejection.
    expect(Math.abs(alleyFoe.x)).toBeLessThan(1.1);
    expect(alleyFoe.z).toBeGreaterThan(-5);
  });

  it('substeps featured movement at cliffs and prevents crossing through the tank', () => {
    const cliffWorld = createStaticArenaWorld();
    cliffWorld.queryTerrainTransition = (_fromX, _fromZ, toX) => ({
      fromHeight: 0,
      toHeight: toX >= 0 ? 4 : 0,
      delta: toX >= 0 ? 4 : 0,
      crossesCliffWall: toX >= 0,
      maxStepUp: 0.45,
    });
    const cliffMatch = new Match('elite-cliff', 'none', pack, cliffWorld, 'mode.mainStage');
    const def = pack.getEnemy('enemy.quaternius.ninja-high-detail.boss');
    if (def.type !== 'monster') throw new Error('expected monster');
    const cliffFoe = cliffMatch.runtime.systems.enemies.spawnEnemyDef(def, -8, 0)!;
    const cliffRuntime = new EnemyRuntimeState();
    cliffRuntime.dirX = 1;
    cliffRuntime.speed = 14.4;
    cliffMatch.runtime.systems.enemies.behaviors.require('movement.integrate').update(
      cliffMatch.runtime.systems,
      cliffFoe,
      cliffRuntime,
      1,
    );
    expect(cliffFoe.x).toBeLessThan(0);

    const tankMatch = makeMatch();
    const tank = tankMatch.state.tank;
    const tankFoe = tankMatch.runtime.systems.enemies.spawnEnemyDef(def, tank.x, tank.z + 20)!;
    const tankRuntime = new EnemyRuntimeState();
    tankRuntime.dirZ = -1;
    tankRuntime.speed = 14.4;
    tankMatch.runtime.systems.enemies.behaviors.require('movement.integrate').update(
      tankMatch.runtime.systems,
      tankFoe,
      tankRuntime,
      2,
    );
    const minimum = resolveMonsterDimensionsForDefId(def.id).collisionRadius + 1.35;
    expect(Math.hypot(tankFoe.x - tank.x, tankFoe.z - tank.z)).toBeGreaterThanOrEqual(minimum - 0.01);
  });
});
