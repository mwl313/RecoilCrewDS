import { describe, expect, it } from 'vitest';
import { makeMatch, spawnEnemy, killEnemy } from './helpers';

describe('relic trigger effects (progression08)', () => {
  it('HEAT SINK buffs MG damage after cannon fire', () => {
    const m = makeMatch();
    m.state.teamProgression.relicStacks['relic.heat_sink'] = 1;
    m.systems.progression.projectionRefresh();
    m.systems.progression.notifyCannonFired();
    expect(m.rules.resolver.resolve('weapon.mgDamage')).toBeCloseTo(2 * 1.2);
  });

  it('VAMPIRE ROUNDS heals on cannon kills', () => {
    const m = makeMatch();
    m.state.teamProgression.relicStacks['relic.vampire_rounds'] = 2;
    m.state.tank.integrity = 80;
    const e = spawnEnemy(m);
    killEnemy(m, e.id, 'cannon');
    expect(m.state.tank.integrity).toBe(90);
  });

  it('GROUND POUND damages nearby enemies on landing', () => {
    const m = makeMatch();
    m.state.teamProgression.relicStacks['relic.ground_pound'] = 1;
    const e = spawnEnemy(m, 'enemy.scrapBug', m.state.tank.x + 1.2, m.state.tank.z);
    m.systems.enemySpatial.rebuild(m.state.enemies);
    const hp = e.hp;
    m.systems.progression.notifyLanded();
    expect(e.hp).toBeLessThan(hp);
  });

  it('RAPID RELOAD reduces cannon cooldown on cannon hit', () => {
    const m = makeMatch();
    m.state.teamProgression.relicStacks['relic.rapid_reload'] = 1;
    m.state.turret.cannonCooldown = 1.6;
    const e = spawnEnemy(m);
    m.systems.damage.applyEnemy(e, 1, 'cannon');
    m.eventBus.drain();
    m.takeEvents();
    expect(m.state.turret.cannonCooldown).toBeCloseTo(1.28);
  });

  it('DASH REFUND reduces dash cooldown on dash hit', () => {
    const m = makeMatch();
    m.state.teamProgression.relicStacks['relic.dash_refund'] = 1;
    m.state.tank.dashCooldown = 1;
    m.systems.progression.notifyDashHit(1);
    expect(m.state.tank.dashCooldown).toBeCloseTo(0.7);
  });

  it('SAFE HAVEN heals on wave clear', () => {
    const m = makeMatch();
    m.state.teamProgression.relicStacks['relic.safe_haven'] = 2;
    m.state.tank.integrity = 70;
    m.systems.progression.notifyWaveCleared(1);
    expect(m.state.tank.integrity).toBe(100);
  });

  it('PHOENIX CORE revives once on wipeout', () => {
    const m = makeMatch();
    m.state.teamProgression.relicStacks['relic.phoenix_core'] = 1;
    m.state.tank.integrity = 0;
    m.state.tank.deadT = 3;
    m.systems.progression.notifyWipeout();
    expect(m.state.tank.deadT).toBe(0);
    expect(m.state.tank.integrity).toBe(50);
  });

  it('ARMOR SHRED vulnerability increases subsequent damage', () => {
    const m = makeMatch();
    m.state.teamProgression.relicStacks['relic.armor_shred'] = 1;
    const e = spawnEnemy(m, 'enemy.rammer', 10, 10);
    m.systems.damage.applyEnemy(e, 1, 'mg');
    m.eventBus.drain();
    m.takeEvents();
    const before = e.hp;
    m.systems.damage.applyEnemy(e, 10, 'cannon');
    m.takeEvents();
    expect(before - e.hp).toBeCloseTo(11);
  });

  it('DEATH MARK explodes cannon-killed enemies', () => {
    const m = makeMatch();
    m.state.teamProgression.relicStacks['relic.death_mark'] = 1;
    const victim = spawnEnemy(m, 'enemy.scrapBug', 10, 10);
    const bystander = spawnEnemy(m, 'enemy.scrapBug', 10.5, 10);
    m.systems.enemySpatial.rebuild(m.state.enemies);
    const bystanderHp = bystander.hp;
    killEnemy(m, victim.id, 'cannon');
    expect(bystander.hp).toBeLessThan(bystanderHp);
  });
});
