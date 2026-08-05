import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ContentLoader } from '../src/shared/content/contentLoader';
import { Match, MatchRuntime } from '../src/shared/sim/match';
import { statModifier } from '../src/shared/stats/statModifier';

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

describe('alternate mode (Truck Hunter)', () => {
  it('selects the mode through the pack with no modeId branch in MatchRuntime', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/shared/sim/matchRuntime.ts'), 'utf8');
    expect(src).not.toContain('modeId ===');
    expect(src).not.toContain('truckHunter');
    const runtime = MatchRuntime.fromContentPack(pack, 'truck-hunter', 'none', 'mode.truckHunter');
    expect(runtime.rules.modeId).toBe('mode.truckHunter');
    expect(runtime.rules.objective.id).toBe('objective.truckEscort');
    expect(runtime.rules.objective.completionOnTruckEscape).toBe(true);
    expect(runtime.rules.loadout.id).toBe('loadout.truckHunter');
  });

  it('completes on truck escape (different completion rule) before the timer', () => {
    const runtime = MatchRuntime.fromContentPack(pack, 'truck-hunter', 'none', 'mode.truckHunter');
    // Two test hounds spawn from the director's initial spawns.
    expect(runtime.state.enemies.filter((e) => e.type === 'scrapBug').length).toBe(2);
    for (let i = 0; i < 30 * 60 && runtime.state.phase !== 'results'; i++) {
      runtime.step(DT);
      runtime.takeEvents();
    }
    expect(runtime.state.phase).toBe('results');
    expect(runtime.state.time).toBeLessThan(90);
    expect(runtime.state.truck.escaped).toBe(true);
  });
});

describe('proof weapon (Rapid Cannon)', () => {
  it('fires through the existing projectile behavior with its own cooldown', () => {
    const runtime = MatchRuntime.fromContentPack(pack, 'truck-hunter', 'none', 'mode.truckHunter');
    runtime.systems.capabilities.revoke('cannon.charge');
    const cannon = runtime.rules.weapons.get('weapon.rapidCannon')!;
    expect(cannon.behaviorId).toBe('weapon.projectile');
    expect(cannon.cooldownSeconds).toBe(0.5);
    expect(cannon.presentation?.muzzleVfxId).toBe('vfx.cannonMuzzle');
    runtime.state.tank.x = 0;
    runtime.state.tank.z = 0;
    runtime.state.tank.yaw = Math.PI / 2;
    runtime.state.turret.yaw = 0;
    runtime.setGunnerInput({ aimYaw: 0, aimPitch: 0, primary: false, secondary: true, ability: false });
    runtime.step(DT);
    runtime.takeEvents();
    expect(runtime.state.shells.length).toBe(1);
    expect(runtime.state.turret.cannonCooldown).toBeCloseTo(0.5, 3);
    // No MatchRuntime edit needed: the loadout references the new weapon id.
    expect(runtime.loadout.secondary.id).toBe('weapon.rapidCannon');
  });
});

describe('proof enemy (Test Hound)', () => {
  it('is composed from existing behaviors and hunts the tank', () => {
    const runtime = MatchRuntime.fromContentPack(pack, 'truck-hunter', 'none', 'mode.truckHunter');
    const hound = runtime.state.enemies.find((e) => e.id === 1)!;
    const def = runtime.rules.enemies.get('enemy.testHound')!;
    expect(def.behaviors.map((b) => b.id)).toEqual([
      'movement.seekTank',
      'movement.circleTarget',
      'movement.integrate',
      'attack.contactRam',
    ]);
    if (def.dropTableId) expect(runtime.rules.dropTables.has(def.dropTableId)).toBe(true);
    const d0 = Math.hypot(hound.x - runtime.state.tank.x, hound.z - runtime.state.tank.z);
    for (let i = 0; i < 60; i++) {
      runtime.step(DT);
      runtime.takeEvents();
    }
    const d1 = Math.hypot(hound.x - runtime.state.tank.x, hound.z - runtime.state.tank.z);
    expect(d1).toBeLessThan(d0);
  });
});

describe('proof item (Overdrive Cannon)', () => {
  it('applies a non-movement stat modifier from JSON', () => {
    const runtime = MatchRuntime.fromContentPack(pack, 'truck-hunter', 'none', 'mode.truckHunter');
    const item = pack.getItem('item.overdriveCannon');
    const before = runtime.rules.resolver.resolve('weapon.cannonDamage');
    const rulesRev = runtime.rules.rulesRevision;
    const moveRev = runtime.rules.movementRulesRevision;
    runtime.systems.items.apply(item);
    expect(runtime.rules.resolver.resolve('weapon.cannonDamage')).toBeCloseTo(before * 1.5, 6);
    expect(runtime.rules.rulesRevision).toBe(rulesRev + 1);
    expect(runtime.rules.movementRulesRevision).toBe(moveRev); // non-movement
  });

  it('retains movement-stat synchronization coverage (movement item bumps the revision)', () => {
    const m = new Match('movement-item');
    const rules = m.runtime.rules;
    const move0 = rules.movementRulesRevision;
    rules.addModifier(statModifier('test.speed', 'tank.forwardSpeed', 'multiply', 1.1, { source: 'test' }));
    expect(rules.movementRulesRevision).toBe(move0 + 1);
    expect(rules.config.tank.forwardSpeed).toBeCloseTo(18 * 1.1, 6);
  });
});

describe('final acceptance validations', () => {
  it('invalid content fails loudly (unknown enemy behavior)', () => {
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
    const hound = files['enemies/testHound.json'] as { behaviors: Array<{ id: string }> };
    hound.behaviors[0].id = 'movement.bogus';
    try {
      new ContentLoader().loadFromRecords(manifest, files);
      throw new Error('expected load to fail');
    } catch (err) {
      expect((err as { issues?: string[] }).issues?.join('\n')).toContain("unknown enemy behavior 'movement.bogus'");
    }
  });

  it('two rooms still resolve different rules without contamination', () => {
    const a = MatchRuntime.fromContentPack(pack, 'room-a', 'none', 'mode.truckHunter');
    const b = MatchRuntime.fromContentPack(pack, 'room-b');
    expect(a.rules.objective.id).toBe('objective.truckEscort');
    expect(b.rules.objective.id).toBe('objective.highScore');
    expect(a.rules).not.toBe(b.rules);
    a.rules.addModifier(statModifier('x', 'weapon.cannonDamage', 'multiply', 2, { source: 'test' }));
    expect(b.rules.resolver.resolve('weapon.cannonDamage')).toBe(12);
  });

  it('demo pack parity survives the proof-content additions', () => {
    const demo = MatchRuntime.fromContentPack(pack, 'demoScoreAttack');
    expect(demo.rules.objective.id).toBe('objective.highScore');
    expect(demo.rules.objective.completionOnTruckEscape).toBeUndefined();
    expect(demo.rules.duration).toBe(90);
    expect(demo.rules.loadout.id).toBe('loadout.default');
  });
});
