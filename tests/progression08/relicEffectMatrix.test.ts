import { describe, expect, it, vi } from 'vitest';
import { BASE_CONFIG } from '../../src/shared/config';
import { makeMatch, spawnEnemy, killEnemy } from './helpers';

function own(m: ReturnType<typeof makeMatch>, relicId: string, stacks = 1): void {
  m.state.teamProgression.relicStacks[relicId] = stacks;
  m.systems.progression.projectionRefresh();
}

describe('all 28 shipped relic effects', () => {
  it('01 MAGNET CORE pulls shards inside its expanded radius', () => {
    const m = makeMatch();
    own(m, 'relic.magnet_core');
    m.systems.xpShards.spawn(1, m.state.tank.x + 6, m.state.tank.z);
    m.systems.xpShards.update(1 / 30);
    expect(m.state.xpShards[0].vx).toBeLessThan(0);
  });

  it('02 HEAT SINK applies its timed MG multiplier', () => {
    const m = makeMatch();
    own(m, 'relic.heat_sink', 2);
    m.systems.progression.notifyCannonFired();
    expect(m.rules.resolver.resolve('weapon.mgDamage')).toBeCloseTo(4.2);
  });

  it('03 COVERING FIRE slows the MG-hit target', () => {
    const m = makeMatch();
    own(m, 'relic.covering_fire', 2);
    const enemy = spawnEnemy(m);
    m.systems.damage.applyEnemy(enemy, 1, 'mg');
    m.eventBus.drain();
    expect(m.systems.progression.enemySpeedMultiplier(enemy)).toBeCloseTo(0.9);
  });

  it('04 DOUBLE JUMP projects additional authoritative jump charges', () => {
    const m = makeMatch();
    own(m, 'relic.double_jump', 2);
    expect(m.rules.resolver.resolve('tank.extraJumps')).toBe(2);
  });

  it('05 VAMPIRE ROUNDS heals only a cannon kill', () => {
    const m = makeMatch();
    own(m, 'relic.vampire_rounds');
    m.state.tank.integrity = 80;
    killEnemy(m, spawnEnemy(m).id, 'cannon');
    expect(m.state.tank.integrity).toBe(85);
  });

  it('06 FRIENDLY SHIELD reduces cannon splash without affecting enemy hits', () => {
    const m = makeMatch();
    own(m, 'relic.friendly_shield');
    expect(m.systems.progression.modifyTankDamage(10, 'splash')).toBe(5);
    expect(m.systems.progression.modifyTankDamage(10, 'enemy')).toBe(10);
  });

  it('07 HEARTY TANK adds max integrity before other layers', () => {
    const m = makeMatch();
    own(m, 'relic.hearty_tank', 2);
    expect(m.rules.resolver.resolve('tank.maxIntegrity')).toBe(140);
  });

  it('08 DASH REFUND reduces remaining cooldown on a dash hit', () => {
    const m = makeMatch();
    own(m, 'relic.dash_refund', 2);
    m.state.tank.dashCooldown = 1;
    m.systems.progression.notifyDashHit(1);
    expect(m.state.tank.dashCooldown).toBeCloseTo(0.4);
  });

  it('09 AIR MASTER stacks air control but caps reuse at one', () => {
    const m = makeMatch();
    own(m, 'relic.air_master', 2);
    expect(m.rules.resolver.resolve('tank.airControl')).toBeCloseTo(BASE_CONFIG.tank.airControl * 1.8);
    expect(m.rules.resolver.resolve('tank.airDashCharges')).toBe(1);
  });

  it('10 HE PAYLOAD expands splash and knockback stats', () => {
    const m = makeMatch();
    own(m, 'relic.he_payload', 2);
    expect(m.rules.resolver.resolve('weapon.cannonRadius')).toBeCloseTo(BASE_CONFIG.weapons.cannonRadius * 1.6);
    expect(m.rules.resolver.resolve('weapon.splashKnockbackMax')).toBeCloseTo(8 * 1.6);
  });

  it('11 ROADKILL unlocks speed contact with stack-scaled damage', () => {
    const m = makeMatch();
    own(m, 'relic.roadkill', 2);
    m.systems.capabilities.grant('tank.roadkillContact', 'relic:relic.roadkill');
    const enemy = spawnEnemy(m, 'enemy.scrapBug', m.state.tank.x + 1.2, m.state.tank.z);
    m.systems.enemySpatial.rebuild(m.state.enemies);
    m.state.tank.vx = 18;
    const hp = enemy.hp;
    m.systems.contact.update();
    expect(enemy.hp).toBeLessThan(hp);
  });

  it('12 AERIAL MASTER buffs airborne gunner damage', () => {
    const m = makeMatch();
    own(m, 'relic.aerial_master');
    m.state.tank.grounded = false;
    const enemy = spawnEnemy(m);
    expect(m.systems.progression.modifyEnemyDamage(10, 'cannon', { enemy })).toBe(13);
  });

  it('13 GROUND POUND applies its landing area damage', () => {
    const m = makeMatch();
    own(m, 'relic.ground_pound');
    const enemy = spawnEnemy(m, 'enemy.scrapBug', m.state.tank.x + 1, m.state.tank.z);
    m.systems.enemySpatial.rebuild(m.state.enemies);
    const hp = enemy.hp;
    const t = m.state.tank;
    m.systems.progression.notifyLanded({ fallDistance: 1.5, impactSpeed: 5, x: t.x, y: t.y, z: t.z });
    expect(hp - enemy.hp).toBe(10);
  });

  it('14 MOMENTUM SHIELD reduces damage at top speed', () => {
    const m = makeMatch();
    own(m, 'relic.momentum_shield');
    m.state.tank.vx = m.rules.resolver.resolve('tank.forwardSpeed');
    expect(m.systems.progression.modifyTankDamage(10, 'enemy')).toBe(8);
  });

  it('15 ARMOR SHRED increases subsequent target damage', () => {
    const m = makeMatch();
    own(m, 'relic.armor_shred');
    const enemy = spawnEnemy(m);
    m.systems.damage.applyEnemy(enemy, 1, 'mg');
    m.eventBus.drain();
    expect(m.systems.progression.modifyEnemyDamage(10, 'cannon', { enemy })).toBe(11);
  });

  it('16 BULLET TIME adds airborne dash cooldown recovery', () => {
    const m = makeMatch();
    own(m, 'relic.bullet_time');
    m.state.tank.dashCooldown = 10;
    m.systems.progression.notifyAirborneTick(1, false);
    expect(m.state.tank.dashCooldown).toBe(9);
  });

  it.each([1, 2, 3])('17 TWIN SHELL stack %i adds one shell per stack with the same charge ratio', (stacks) => {
    const m = makeMatch();
    own(m, 'relic.twin_shell', stacks);
    const spawn = vi.spyOn(m.systems.projectiles, 'spawn');
    const before = m.state.nextShellId;
    expect(m.applyGunnerAction('secondaryPressed', 1).accepted).toBe(true);
    for (let i = 0; i < 32; i++) m.step(1 / 30);
    expect(m.applyGunnerAction('secondaryReleased', 2).accepted).toBe(true);
    m.step(1 / 30);
    expect(m.state.turret.cannonCooldown).toBeGreaterThan(m.rules.matchConfig.cannonCooldown);
    for (let i = 0; i < 29; i++) m.step(1 / 30);
    expect(m.state.nextShellId - before).toBe(1 + stacks);
    expect(spawn).toHaveBeenCalledTimes(1 + stacks);
    const spawnedShells = spawn.mock.results.map((result) => result.value);
    const firstChargeRatio = spawnedShells[0]?.chargeRatio ?? -1;
    for (const shell of spawnedShells) {
      expect(shell.chargeRatio).toBeCloseTo(firstChargeRatio);
    }
  });

  it('18 DEATH MARK explodes a cannon-killed enemy', () => {
    const m = makeMatch();
    own(m, 'relic.death_mark', 2);
    const victim = spawnEnemy(m, 'enemy.scrapBug', 10, 10);
    const bystander = spawnEnemy(m, 'enemy.scrapBug', 10.5, 10);
    m.systems.enemySpatial.rebuild(m.state.enemies);
    const hp = bystander.hp;
    killEnemy(m, victim.id, 'cannon');
    expect(bystander.hp).toBeLessThan(hp);
  });

  it('19 GLASS CANNON raises outgoing and incoming damage', () => {
    const m = makeMatch();
    own(m, 'relic.glass_cannon');
    const enemy = spawnEnemy(m);
    expect(m.systems.progression.modifyEnemyDamage(10, 'mg', { enemy })).toBe(12);
    expect(m.systems.progression.modifyTankDamage(10, 'enemy')).toBeCloseTo(11.5);
  });

  it('20 SAFE HAVEN heals once per semantic wave ID', () => {
    const m = makeMatch();
    own(m, 'relic.safe_haven');
    m.state.tank.integrity = 50;
    m.systems.progression.notifyWaveCleared(1);
    m.systems.progression.notifyWaveCleared(1);
    expect(m.state.tank.integrity).toBe(65);
  });

  it('21 RAPID RELOAD reduces remaining cannon cooldown on hit', () => {
    const m = makeMatch();
    own(m, 'relic.rapid_reload');
    m.state.turret.cannonCooldown = 1;
    m.systems.progression.notifyCannonHit(1);
    expect(m.state.turret.cannonCooldown).toBe(0.8);
  });

  it('22 IRON WILL reduces incoming damage at the 50% boundary', () => {
    const m = makeMatch();
    own(m, 'relic.iron_will');
    m.state.tank.integrity = 50;
    expect(m.systems.progression.modifyTankDamage(10, 'enemy')).toBe(8);
  });

  it('23 LAST RESORT raises outgoing damage at the 30% boundary', () => {
    const m = makeMatch();
    own(m, 'relic.last_resort');
    m.state.tank.integrity = 30;
    const enemy = spawnEnemy(m);
    expect(m.systems.progression.modifyEnemyDamage(10, 'mg', { enemy })).toBe(12.5);
  });

  it('24 PHASE DASH blocks damage only in an authoritative dash state', () => {
    const m = makeMatch();
    own(m, 'relic.phase_dash');
    m.state.tank.dashState = 'burst';
    expect(m.systems.progression.modifyTankDamage(10, 'enemy')).toBe(0);
    m.state.tank.dashState = 'inactive';
    expect(m.systems.progression.modifyTankDamage(10, 'enemy')).toBe(10);
  });

  it('25 XP SURGE multiplies the authoritative XP path once', () => {
    const m = makeMatch();
    own(m, 'relic.xp_surge');
    m.systems.progression.addXp(5);
    expect(m.state.teamProgression.totalXpCollected).toBe(20);
  });

  it('26 PHOENIX CORE revives once at half integrity', () => {
    const m = makeMatch();
    own(m, 'relic.phoenix_core');
    m.state.tank.integrity = 0;
    m.state.tank.deadT = 3;
    m.systems.progression.notifyWipeout();
    expect(m.state.tank.integrity).toBe(50);
    expect(m.systems.progression.debugState().triggers.phoenixConsumed).toBe(true);
  });

  it('27 UNSTOPPABLE zeros dash cooldown and stacks dash damage', () => {
    const m = makeMatch();
    own(m, 'relic.unstoppable', 2);
    expect(m.rules.resolver.resolve('tank.dashCooldown')).toBe(0);
    expect(m.rules.resolver.resolve('tank.dashContactDamage')).toBeCloseTo(BASE_CONFIG.tank.dashContactDamage * 2);
  });

  it('28 APEX PREDATOR recognizes a modern elite reward class', () => {
    const m = makeMatch();
    own(m, 'relic.apex_predator');
    const enemy = spawnEnemy(m, 'enemy.quaternius.demon-high-detail.elite');
    expect(enemy.monster?.rewardClass).toBe('elite');
    expect(m.systems.progression.modifyEnemyDamage(10, 'mg', { enemy })).toBe(14);
  });
});
