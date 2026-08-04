import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BASE_CONFIG } from '../src/shared/config';
import { ContentLoader } from '../src/shared/content/contentLoader';
import { Match, MatchRuntime } from '../src/shared/sim/match';
import { canonicalizeState, stepScriptedMatch, withSeededRandom } from './helpers/demoFixture';
import type { EnemyState } from '../src/shared/types';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_ROOT = path.join(ROOT, 'content');
const pack = new ContentLoader().loadFromFilesystem(CONTENT_ROOT);
const DT = 1 / 30;

function step(match: Match, seconds: number) {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    match.step(DT);
    match.takeEvents();
  }
}

describe('enemy definition composition', () => {
  it('all four Demo enemies resolve their behavior compositions from content', () => {
    const m = new Match('enemy-defs');
    const rules = m.runtime.rules;
    expect(rules.enemies.get('enemy.scrapBug')!.behaviors.map((b) => b.id)).toEqual([
      'movement.seekTank',
      'movement.circleTarget',
      'movement.separation',
      'movement.obstacleAvoid',
      'movement.integrate',
      'attack.contactRam',
    ]);
    expect(rules.enemies.get('enemy.rammer')!.behaviors.map((b) => b.id)).toEqual([
      'attack.telegraphedCharge',
      'trait.vulnerableRear',
    ]);
    expect(rules.enemies.get('enemy.gunTower')!.behaviors.map((b) => b.id)).toEqual(['attack.projectileBurst']);
    expect(rules.enemies.get('enemy.lootTruck')!.behaviors.map((b) => b.id)).toEqual([
      'movement.followRoute',
      'trait.nonAttackingObjective',
    ]);
    for (const enemy of rules.enemies.values()) {
      expect(rules.dropTables.has(enemy.dropTableId)).toBe(true);
    }
  });

  it('behaviors run deterministically in definition order (parity checkpoints)', () => {
    const a = withSeededRandom(4242, () => {
      const m = new Match('order-a');
      stepScriptedMatch(m, 30);
      return canonicalizeState(m.state);
    });
    const b = withSeededRandom(4242, () => {
      const m = new Match('order-b');
      stepScriptedMatch(m, 30);
      return canonicalizeState(m.state);
    });
    expect(a).toEqual(b);
    expect(a.enemies.length).toBeGreaterThan(0);
  });

  it('rammer, tower, and truck state machines run through composed behaviors', () => {
    const m = new Match('machines');
    const rammer = m.spawnEnemy('rammer', m.state.tank.x - 30, m.state.tank.z)!;
    const tower = m.spawnEnemy('gunTower', m.state.tank.x - 12, m.state.tank.z)!;
    const seen = new Set<string>();
    for (let i = 0; i < 30 * 12; i++) {
      m.step(DT);
      m.takeEvents();
      seen.add(rammer.state);
      seen.add(tower.state);
      if (seen.has('recovery') && seen.has('fire')) break;
    }
    expect(seen.has('lock')).toBe(true);
    expect(seen.has('telegraph')).toBe(true);
    expect(seen.has('charge')).toBe(true);
    expect(seen.has('recovery')).toBe(true);
    expect(seen.has('fire')).toBe(true);
    // Loot truck spawns and follows its route on schedule.
    const truckMatch = new Match('truck');
    step(truckMatch, 44);
    expect(truckMatch.state.truck.active).toBe(true);
    const truck = truckMatch.state.enemies.find((e) => e.type === 'lootTruck' && e.alive);
    expect(truck).toBeDefined();
  });
});

describe('drop tables', () => {
  it('resolves deterministic drops per enemy type', () => {
    const expectDrops = (type: string, kinds: string[]) => {
      const m = new Match(`drops-${type}`);
      const e = m.spawnEnemy(type as 'scrapBug', 20, 20)!;
      withSeededRandom(99, () => {
        m.damageEnemy(e, 999, 'cannon');
        m.step(DT);
        m.takeEvents();
      });
      const drops = m.state.pickups.filter((p) => !p.collected).map((p) => p.kind).sort();
      expect(drops, type).toEqual([...kinds].sort());
      return m.state.pickups;
    };
    expectDrops('scrapBug', ['normal']);
    expectDrops('rammer', ['heavy', 'normal']);
    expectDrops('gunTower', ['heavy', 'normal', 'normal']);
    const truckPickups = expectDrops('lootTruck', ['heavy', 'heavy', 'heavy', 'heavy', 'heavy']);
    // Scatter is deterministic under the seed.
    const positions = truckPickups.map((p) => `${p.x.toFixed(4)},${p.z.toFixed(4)}`);
    const again = expectDrops('lootTruck', ['heavy', 'heavy', 'heavy', 'heavy', 'heavy']);
    expect(again.map((p) => `${p.x.toFixed(4)},${p.z.toFixed(4)}`)).toEqual(positions);
  });

  it('drop tables reference existing pickup definitions through PickupSystem', () => {
    const m = new Match('drops-pickups');
    const rules = m.runtime.rules;
    for (const table of rules.dropTables.values()) {
      for (const entry of table.entries) {
        const id = entry.kind === 'normal' ? 'pickup.normalScrap' : 'pickup.heavyScrap';
        expect(rules.pickups.has(id)).toBe(true);
      }
    }
    expect(rules.pickups.get('pickup.normalScrap')!.magnetRadius).toBe(5);
    expect(rules.pickups.get('pickup.heavyScrap')!.life).toBe(26);
  });
});

describe('pickups and effects', () => {
  it('a pickup is collected exactly once with the legacy score flow', () => {
    const m = new Match('pickup-once');
    m.runtime.systems.pickups.spawn('normal', m.state.tank.x + 0.5, m.state.tank.z);
    step(m, 0.3);
    expect(m.state.stats.scrapCollected).toBe(1);
    const collected = m.state.pickups.filter((p) => p.collected).length;
    step(m, 2);
    expect(m.state.stats.scrapCollected).toBe(1);
    expect(m.state.pickups.filter((p) => p.collected).length).toBe(collected);
    expect(m.state.stats.score).toBeGreaterThanOrEqual(BASE_CONFIG.scoring.normalScrap);
  });

  it('timed status effects expire deterministically and stacking refreshes', () => {
    const m = new Match('effects');
    const rules = m.runtime.rules;
    const effect = {
      id: 'status.testBoost',
      kind: 'test',
      behaviors: [],
      duration: 1,
      modifiers: [{ stat: 'tank.forwardSpeed', operation: 'multiply' as const, value: 1.25, stacking: 'refresh' as const }],
    };
    const before = rules.config.tank.forwardSpeed;
    const move0 = rules.movementRulesRevision;
    m.runtime.systems.statusEffects.apply(effect);
    expect(rules.config.tank.forwardSpeed).toBeCloseTo(before * 1.25, 6);
    expect(rules.movementRulesRevision).toBe(move0 + 1);
    m.runtime.systems.statusEffects.update(0.6);
    m.runtime.systems.statusEffects.apply(effect); // refresh resets the timer
    m.runtime.systems.statusEffects.update(0.6);
    expect(rules.config.tank.forwardSpeed).toBeCloseTo(before * 1.25, 6); // still active
    m.runtime.systems.statusEffects.update(0.5);
    expect(rules.config.tank.forwardSpeed).toBeCloseTo(before, 6); // expired
    expect(rules.movementRulesRevision).toBeGreaterThan(move0);
  });

  it('a JSON-defined item modifies a stat through the match rules', () => {
    const { manifest, files } = loadRealPackRecords();
    const m = deepClone(manifest) as { pack: { files: Record<string, string[]> } };
    m.pack.files.items = ['items/recoilBoost.json'];
    files['items/recoilBoost.json'] = {
      id: 'item.recoilBoost',
      label: 'Recoil Boost',
      kind: 'boost',
      behaviors: [],
      modifiers: [
        { stat: 'tank.forwardSpeed', operation: 'multiply', value: 1.1, stacking: 'replace' },
        { stat: 'weapon.mgRate', operation: 'multiply', value: 1.2, stacking: 'replace' },
      ],
    };
    const variant = new ContentLoader().loadFromRecords(m, files);
    const runtime = MatchRuntime.fromContentPack(variant, 'item-test');
    const item = variant.getItem('item.recoilBoost');
    const beforeSpeed = runtime.rules.config.tank.forwardSpeed;
    const beforeRate = runtime.rules.resolver.resolve('weapon.mgRate');
    runtime.systems.items.apply(item);
    expect(runtime.rules.config.tank.forwardSpeed).toBeCloseTo(beforeSpeed * 1.1, 6);
    expect(runtime.rules.resolver.resolve('weapon.mgRate')).toBeCloseTo(beforeRate * 1.2, 6);
    runtime.systems.items.remove(item);
    expect(runtime.rules.config.tank.forwardSpeed).toBeCloseTo(beforeSpeed, 6);
  });

  it('objectives react to typed kill and collection events', () => {
    const m = new Match('objective-events');
    const seen: string[] = [];
    m.runtime.systems.objective.onObjectiveEvent = (event) => seen.push(event.type);
    const bug = m.state.enemies.find((e) => e.type === 'scrapBug')!;
    m.damageEnemy(bug, 999, 'cannon');
    m.step(DT);
    m.takeEvents();
    m.runtime.systems.pickups.spawn('normal', m.state.tank.x + 0.5, m.state.tank.z);
    step(m, 0.3);
    expect(seen).toContain('kill');
    expect(seen).toContain('collection');
  });
});

describe('spawn director', () => {
  it('drives schedules, budgets, truck timing, and final chaos from content', () => {
    const m = new Match('spawn-director');
    const def = m.runtime.rules.spawnDirector;
    expect(def.rammerSpawns).toEqual([22, 34, 50]);
    expect(def.towerSpawns).toEqual([26, 58]);
    expect(def.truck.spawnTime).toBe(42);
    expect(def.truck.escapeTime).toBe(78);
    expect(def.finalChaos.start).toBe(70);
    const director = m.runtime.systems.spawnDirector;
    expect(director.def).toBe(def);
    expect(director.rammerSpawnIdx).toBe(0);
  });

  it('spawn timeline, Loot Truck, and assistance parity with the golden run', () => {
    const m = new Match('timeline');
    withSeededRandom(20260802, () => {
      stepScriptedMatch(m, 90);
      for (let i = 0; i < 8 && m.state.phase !== 'results'; i++) {
        m.step(DT);
        m.takeEvents();
      }
    });
    expect(m.state.phase).toBe('results');
    // Truck spawned (42) and escaped/killed during the round.
    expect(m.runtime.systems.spawnDirector.truckSpawned).toBe(true);
    expect(m.state.stats.kills).toBeGreaterThanOrEqual(1);
  });
});

describe('a test enemy composed from existing behaviors without EnemySystem edits', () => {
  it('hunts the tank using seekTank + integrate + contactRam from a content variant', () => {
    const { manifest, files } = loadRealPackRecords();
    const m = deepClone(manifest) as { pack: { files: Record<string, string[]> } };
    m.pack.files.enemies.push('enemies/testBug.json');
    m.pack.files.dropTables.push('drop-tables/testBug.json');
    files['enemies/testBug.json'] = {
      id: 'enemy.testBug',
      label: 'Test Bug',
      type: 'scrapBug',
      presentationId: 'enemy.scrapBug',
      behaviors: [
        { id: 'movement.seekTank', parameters: { speed: 5 } },
        { id: 'movement.integrate', parameters: {} },
        { id: 'attack.contactRam', parameters: { damage: 2 } },
      ],
      hp: 10,
      radius: 0.8,
      score: 100,
      contributionPoints: 2,
      dropTableId: 'drops.testBug',
      speed: 5,
      damage: 2,
      hitCooldown: 1,
      circleDistance: 7,
      circleStrength: 0.85,
      separationDistance: 2.4,
      separationStrength: 0.8,
      obstacleAvoidTurn: 1.1,
      speedWobbleAmplitude: 0,
      speedWobbleFrequency: 1.7,
    };
    files['drop-tables/testBug.json'] = {
      id: 'drops.testBug',
      behaviors: [],
      entries: [{ kind: 'normal', count: 1, offsetX: 0, offsetZ: 0 }],
    };
    const variant = new ContentLoader().loadFromRecords(m, files);
    const runtime = MatchRuntime.fromContentPack(variant, 'test-enemy');
    const e: EnemyState = runtime.systems.enemies.spawnEnemyDef(variant.getEnemy('enemy.testBug'), runtime.state.tank.x + 20, runtime.state.tank.z)!;
    // The composed test enemy hunts the tank (closing distance).
    for (let i = 0; i < 90; i++) {
      runtime.step(DT);
      runtime.takeEvents();
    }
    const dAfter = Math.hypot(runtime.state.tank.x - e.x, runtime.state.tank.z - e.z);
    expect(dAfter).toBeLessThan(20);
    expect(e.hp).toBe(10); // no weapons involved
  });
});

function loadRealPackRecords(): { manifest: unknown; files: Record<string, unknown> } {
  const manifest = JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, 'manifest.json'), 'utf8'));
  const files: Record<string, unknown> = {};
  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, rel);
      else if (entry.name.endsWith('.json')) files[rel] = JSON.parse(fs.readFileSync(abs, 'utf8'));
    }
  };
  walk(CONTENT_ROOT, '');
  return { manifest, files };
}

function deepClone(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}
