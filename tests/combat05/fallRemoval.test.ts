import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Match } from '../../src/shared/sim/match';
import { stepTankKinematics } from '../../src/shared/sim/tankKinematics';
import { BASE_CONFIG, buildMatchConfig } from '../../src/shared/config';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DT = 1 / 30;

describe('fall damage removal (Combat 05 M2)', () => {
  it('a tank falling from an extreme height takes zero fall damage', () => {
    const m = new Match('tank-fall');
    m.state.tank.y = 60;
    m.state.tank.grounded = false;
    m.state.tank.vy = 0;
    m.state.tank.shieldedT = 0;
    // Remove starter enemies: only fall physics may act on the tank.
    m.state.enemies.length = 0;
    const hp0 = m.state.tank.integrity;
    let guard = 0;
    while (!m.state.tank.grounded && guard++ < 600) {
      m.step(DT);
      m.takeEvents();
    }
    expect(m.state.tank.grounded).toBe(true);
    expect(m.state.tank.integrity).toBe(hp0);
    expect(m.state.tank.landingGripT ?? 0).toBeGreaterThan(0);
  });

  it('an enemy falling from an extreme height lands with full HP', () => {
    const m = new Match('enemy-fall');
    const bug = m.spawnEnemy('scrapBug', 0, 0)!;
    bug.y = 60;
    bug.impulseVy = 0;
    bug.impulseGrounded = false;
    const hp0 = bug.hp;
    let guard = 0;
    while (bug.impulseGrounded !== true && guard++ < 600) {
      m.runtime.systems.enemyImpulses.update(bug, m.runtime.systems.enemies.defFor(bug), DT);
    }
    expect(bug.impulseGrounded).toBe(true);
    expect(bug.hp).toBe(hp0);
  });

  it('landing grip still works after a hard landing', () => {
    const t = {
      x: 0, y: 30, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, yawVel: 0,
      pitch: 0, roll: 0, grounded: false, dashCooldown: 0, dashPresentationT: 0,
      dashDamageT: 0, drift: false, landingGripT: 0,
    };
    const mcfg = buildMatchConfig('none');
    let guard = 0;
    while (!t.grounded && guard++ < 600) {
      stepTankKinematics(t, { throttle: 0, steer: 0, dashPressed: false, jumpPressed: false }, BASE_CONFIG, mcfg, DT, undefined);
    }
    expect(t.grounded).toBe(true);
    expect(t.landingGripT).toBeGreaterThan(0);
  });
});

describe('fall damage configuration is deleted', () => {
  const read = (rel: string): string => readFileSync(path.join(ROOT, rel), 'utf8');

  it('no fall damage source remains in DamageSource', () => {
    expect(read('src/shared/damage/damageTypes.ts')).not.toMatch(/['"]fall['"]/);
  });

  it('no fall damage stats remain in tank/enemy schemas, content, config, stats, or legacy', () => {
    for (const rel of [
      'src/shared/content/schemas/tank.ts',
      'src/shared/content/schemas/enemy.ts',
      'src/shared/config.ts',
      'src/shared/stats/statIds.ts',
      'src/shared/rules/legacyDemoRules.ts',
      'src/shared/rules/contentConfig.ts',
      'content/tanks/default.json',
      'content/enemies/scrapBug.json',
      'content/enemies/rammer.json',
      'content/enemies/gunTower.json',
      'content/enemies/lootTruck.json',
    ]) {
      expect(read(rel), rel).not.toMatch(/fallDamage/);
    }
  });

  it('onHardFall no longer exists in shared kinematics', () => {
    expect(read('src/shared/sim/tankKinematics.ts')).not.toMatch(/onHardFall/);
    expect(read('src/shared/sim/matchRuntime.ts')).not.toMatch(/onHardFall/);
  });

  it('generated content pack has no fall damage fields', () => {
    expect(read('src/generated/contentPack.generated.ts')).not.toMatch(/fallDamage/);
    expect(existsSync(path.join(ROOT, 'src/generated/contentPack.generated.ts'))).toBe(true);
  });
});
