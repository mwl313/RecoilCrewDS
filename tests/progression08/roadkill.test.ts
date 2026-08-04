import { describe, expect, it } from 'vitest';
import { makeMatch, spawnEnemy } from './helpers';

function contactMatch(): { m: ReturnType<typeof makeMatch>; e: ReturnType<typeof spawnEnemy> } {
  const m = makeMatch();
  const e = spawnEnemy(m, 'enemy.scrapBug', m.state.tank.x + 1.2, m.state.tank.z);
  m.systems.enemySpatial.rebuild(m.state.enemies);
  m.state.tank.vx = 18;
  m.state.tank.grounded = true;
  return { m, e };
}

describe('ROADKILL contact rule (progression08)', () => {
  it('no relic + high speed = zero damage', () => {
    const { m, e } = contactMatch();
    const hp = e.hp;
    m.systems.contact.update();
    expect(e.hp).toBe(hp);
  });

  it('relic + low speed = zero damage', () => {
    const { m, e } = contactMatch();
    m.state.tank.vx = 1;
    m.state.teamProgression.relicStacks['relic.roadkill'] = 1;
    m.systems.capabilities.grant('tank.roadkillContact', 'relic:relic.roadkill');
    m.systems.progression.projectionRefresh();
    const hp = e.hp;
    m.systems.contact.update();
    expect(e.hp).toBe(hp);
  });

  it('relic + high speed = damage with distinct attribution', () => {
    const { m, e } = contactMatch();
    m.state.teamProgression.relicStacks['relic.roadkill'] = 1;
    m.systems.capabilities.grant('tank.roadkillContact', 'relic:relic.roadkill');
    m.systems.progression.projectionRefresh();
    const hp = e.hp;
    m.systems.contact.update();
    expect(e.hp).toBeLessThan(hp);
    expect(m.systems.progression.telemetry.roadkillHits).toBe(1);
  });

  it('Dash active = Dash rule only (no double hit, no roadkill count)', () => {
    const { m, e } = contactMatch();
    m.state.teamProgression.relicStacks['relic.roadkill'] = 1;
    m.systems.capabilities.grant('tank.roadkillContact', 'relic:relic.roadkill');
    m.state.tank.dashDamageT = 0.2;
    const hp = e.hp;
    m.systems.contact.update();
    expect(e.hp).toBeLessThan(hp);
    expect(m.systems.progression.telemetry.roadkillHits).toBe(0);
  });

  it('additional stacks add +25% coefficient per stack', () => {
    const { m, e } = contactMatch();
    m.state.teamProgression.relicStacks['relic.roadkill'] = 3;
    m.systems.capabilities.grant('tank.roadkillContact', 'relic:relic.roadkill');
    m.systems.progression.projectionRefresh();
    const params = m.systems.progression.roadkillParams()!;
    expect(params.coefficientPerAdditionalStack).toBe(0.25);
    const hp = e.hp;
    m.systems.contact.update();
    const damage = hp - e.hp;
    expect(damage).toBeGreaterThan(12 * 0.8); // base × 1.0 ratio × 1.0
  });

  it('roadkill kills do not increment dashKills', () => {
    const { m, e } = contactMatch();
    m.state.teamProgression.relicStacks['relic.roadkill'] = 1;
    m.systems.capabilities.grant('tank.roadkillContact', 'relic:relic.roadkill');
    m.systems.progression.projectionRefresh();
    e.hp = 1;
    m.systems.contact.update();
    expect(e.alive).toBe(false);
    expect(m.state.stats.dashKills).toBe(0);
    expect(m.systems.progression.telemetry.roadkillKills).toBe(1);
  });
});
