import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyTankIntegrityGain } from '../src/shared/damage/tankIntegrityGain';
import {
  formatIntegrityGain,
  formatXpGain,
  XP_PRESENTATION_COLOR,
} from '../src/shared/presentation/combatDisplayUnits';
import {
  WorldPopupOverlayQueue,
  WorldPopupPool,
} from '../src/client/worldUi/enemyWorldUiLayer';
import {
  classifyTankDamageFeedback,
  TankDamageCoalescer,
  tankDamageScreenDirection,
} from '../src/client/presentation/tankDamageFeedback';
import { makeMatch, spawnEnemy } from './progression08/helpers';

describe('authoritative positive world feedback', () => {
  it('emits only actual clamped integrity and never emits zero or revives implicitly', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'integrity-world-event');
    m.takeEvents();
    m.state.tank.integrity = 96;
    expect(applyTankIntegrityGain(m.systems, 15, 'directRepair')).toEqual({ requested: 15, actual: 4 });
    expect(m.takeEvents()).toContainEqual(expect.objectContaining({
      type: 'tankIntegrityGain', value: 4, kind: 'directRepair',
    }));
    expect(applyTankIntegrityGain(m.systems, 5, 'directRepair').actual).toBe(0);
    expect(m.takeEvents().some((event) => event.type === 'tankIntegrityGain')).toBe(false);
    m.state.tank.integrity = 0;
    expect(applyTankIntegrityGain(m.systems, 50, 'directRepair').actual).toBe(0);
    expect(m.state.tank.integrity).toBe(0);
  });

  it('routes Vampire Rounds, Safe Haven, and revive through semantic reasons', () => {
    const vampire = makeMatch('mode.singlePlayerScoreAttack', 'vampire-repair-event');
    vampire.takeEvents();
    vampire.state.tank.integrity = 80;
    vampire.state.teamProgression.relicStacks['relic.vampire_rounds'] = 1;
    const enemy = spawnEnemy(vampire, 'enemy.scrapBug');
    vampire.systems.damage.applyEnemy(enemy, 99_999, 'cannon');
    expect(vampire.takeEvents()).toContainEqual(expect.objectContaining({
      type: 'tankIntegrityGain', value: 5, kind: 'cannonKillRepair',
    }));

    const haven = makeMatch('mode.singlePlayerScoreAttack', 'safe-haven-repair-event');
    haven.takeEvents();
    haven.state.tank.integrity = 80;
    haven.state.teamProgression.relicStacks['relic.safe_haven'] = 1;
    haven.systems.progression.notifyWaveCleared(7);
    expect(haven.takeEvents()).toContainEqual(expect.objectContaining({
      type: 'tankIntegrityGain', value: 15, kind: 'waveClearRepair',
    }));

    const phoenix = makeMatch('mode.singlePlayerScoreAttack', 'phoenix-repair-event');
    phoenix.takeEvents();
    phoenix.state.teamProgression.relicStacks['relic.phoenix_core'] = 1;
    phoenix.state.tank.integrity = 0;
    phoenix.systems.progression.notifyWipeout();
    expect(phoenix.takeEvents()).toContainEqual(expect.objectContaining({
      type: 'tankIntegrityGain', value: 50, kind: 'revive',
    }));
  });

  it('emits final effective XP without combat scaling', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'xp-world-event');
    m.takeEvents();
    m.systems.progression.addXp(5);
    expect(m.takeEvents()).toContainEqual(expect.objectContaining({
      type: 'xpGained', value: 10, kind: 'direct', deferUntilPlaying: false,
    }));
    expect(formatXpGain(10)).toBe('+10 XP');
    expect(formatIntegrityGain(6)).toBe('+60');
    expect(XP_PRESENTATION_COLOR).toBe('#8fe8ff');
  });
});

describe('world popup coalescing and overlay queue', () => {
  it('uses separate semantic lanes and merge windows', () => {
    const pool = new WorldPopupPool();
    pool.add({ kind: 'xpGain', source: 'shard', amount: 2, x: 10, y: 20 }, 0);
    pool.add({ kind: 'xpGain', source: 'boss', amount: 4, x: 12, y: 20 }, 130);
    pool.add({ kind: 'integrityGain', source: 'cannonKillRepair', amount: 2, x: 0, y: 0 }, 200);
    pool.add({ kind: 'integrityGain', source: 'waveClearRepair', amount: 3, x: 0, y: 0 }, 210);
    expect(pool.items.map((item) => [item.kind, item.amount])).toEqual([
      ['xpGain', 6], ['integrityGain', 2], ['integrityGain', 3],
    ]);
  });

  it('releases fresh overlay feedback and discards stale/terminal state cleanly', () => {
    const queue = new WorldPopupOverlayQueue();
    queue.enqueue({ type: 'xpGained', t: 0, value: 4 }, 0);
    queue.enqueue({ type: 'tankIntegrityGain', t: 0, value: 20 }, 900);
    expect(queue.takeFresh(1_350).map((event) => event.type)).toEqual(['tankIntegrityGain']);
    queue.enqueue({ type: 'xpGained', t: 0, value: 2 }, 1_400);
    queue.clear();
    expect(queue.items).toHaveLength(0);
  });
});

describe('unified tank damage feedback', () => {
  it('emits final post-modifier loss once with source metadata and none for shields', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'tank-damage-event');
    m.takeEvents();
    m.state.tank.shieldedT = 0;
    m.state.tank.integrity = 12;
    m.systems.damage.applyTank(99, 'enemy', undefined, {
      sourcePosition: { x: -5, y: 0, z: 2 }, kind: 'projectile', tier: 'elite',
    });
    const semantic = m.takeEvents().filter((event) => event.type === 'tankDamageTaken');
    expect(semantic).toEqual([expect.objectContaining({
      value: 12, source: 'enemy', tx: -5, tz: 2, impactKind: 'projectile', tier: 'elite', maxIntegrity: 100,
    })]);
    m.state.tank.shieldedT = 1;
    m.systems.damage.applyTank(5, 'enemy');
    expect(m.takeEvents().some((event) => event.type === 'tankDamageTaken')).toBe(false);
  });

  it('classifies bounded tiers, preserves burst totals, and resolves direction', () => {
    expect(classifyTankDamageFeedback(3, 100)).toBe('LIGHT');
    expect(classifyTankDamageFeedback(7, 100)).toBe('MEDIUM');
    expect(classifyTankDamageFeedback(15, 100)).toBe('HEAVY');
    expect(classifyTankDamageFeedback(1, 100, 'boss')).toBe('BOSS');
    const coalescer = new TankDamageCoalescer(80);
    const sample = {
      actualDamage: 3, maxIntegrity: 100, source: 'bug', impactKind: 'melee' as const,
      tankX: 0, tankZ: 0, sourceX: -5, sourceZ: 0,
    };
    expect(coalescer.add(sample, 0)).toBeNull();
    expect(coalescer.add({ ...sample, actualDamage: 4 }, 60)).toBeNull();
    expect(coalescer.drain(80)).toMatchObject({ actualDamage: 7, hitCount: 2 });
    const camera = new THREE.PerspectiveCamera();
    expect(tankDamageScreenDirection(sample, camera)).toBeCloseTo(-1);
    expect(tankDamageScreenDirection({ ...sample, sourceX: undefined, sourceZ: undefined }, camera)).toBe(0);
  });
});
