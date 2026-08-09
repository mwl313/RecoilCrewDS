import { describe, expect, it } from 'vitest';
import { loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';
import { MatchRuntime } from '../../src/shared/sim/matchRuntime';

const pack = loadContentPackFromFilesystem('content');

describe('production procedural audio simulation events', () => {
  it('emits semantic ranged telegraph/fire with compact metadata', () => {
    const runtime = MatchRuntime.fromContentPack(pack, 'audio-ranged', 'none', 'mode.mainStage');
    const def = pack.getEnemy('enemy.quaternius.wizard');
    if (def.type !== 'monster') throw new Error('expected monster');
    const enemy = runtime.systems.enemies.spawnEnemyDef(def, runtime.state.tank.x + 10, runtime.state.tank.z)!;
    const events = [];
    for (let i = 0; i < 360; i++) {
      runtime.step(1 / 60);
      events.push(...runtime.takeEvents());
      if (events.some((event) => event.type === 'enemyFire' && event.id === enemy.id)) break;
    }
    const telegraph = events.find((event) => event.type === 'enemyTelegraph' && event.id === enemy.id);
    const fire = events.find((event) => event.type === 'enemyFire' && event.id === enemy.id);
    expect(telegraph).toMatchObject({
      tier: def.tier,
      sizeClass: def.sizeClass,
      presentationProfileId: def.presentationProfileId,
      attackSemantic: 'rangedTelegraph',
    });
    expect(fire).toMatchObject({
      tier: def.tier,
      sizeClass: def.sizeClass,
      attackSemantic: 'rangedFire',
    });
    expect(events.some((event) => event.id === enemy.id && event.type === 'towerFire')).toBe(false);
    const shell = runtime.state.shells.find((candidate) => candidate.ownerEnemyId === enemy.id);
    expect(shell).toMatchObject({
      sourceTier: def.tier,
      sourceSizeClass: def.sizeClass,
      sourcePresentationProfileId: def.presentationProfileId,
    });
  });

  it('emits dedicated tank-impact and cannon-impact events', () => {
    const runtime = MatchRuntime.fromContentPack(pack, 'audio-impacts', 'none', 'mode.mainStage');
    const tank = runtime.state.tank;
    tank.shieldedT = 0;
    runtime.systems.projectiles.spawn(tank.x, tank.y + 0.2, tank.z, 0, 0, 0, 0, 'enemy', 1, undefined, {
      damage: 12,
      splashRadius: 1,
      team: 'enemy',
      ownerEnemyId: 99,
      sourceTier: 'elite',
      sourceSizeClass: 'large',
      sourcePresentationProfileId: 'enemyPresentation.test',
      sourceAttackSequence: 7,
    });
    const integrityBefore = tank.integrity;
    runtime.step(1 / 60);
    const impactEvents = runtime.takeEvents();
    expect(impactEvents.find((event) => event.type === 'tankDamageTaken')).toMatchObject({
      value: integrityBefore - tank.integrity,
      source: 'enemy',
      impactKind: 'projectile',
      tier: 'elite',
      maxIntegrity: runtime.rules.resolver.resolve('tank.maxIntegrity'),
    });
    expect(impactEvents.filter((event) => event.type === 'tankDamageTaken')).toHaveLength(1);

    runtime.systems.projectiles.spawn(tank.x + 5, 0.01, tank.z, 0, 0, 0, 0, 'cannon', 1, undefined, {
      damage: 20,
      splashRadius: 5,
      chargeRatio: 0.75,
      team: 'player',
    });
    runtime.step(1 / 60);
    expect(runtime.takeEvents().find((event) => event.type === 'playerCannonImpact')).toMatchObject({
      kind: 'cannon',
      value: 5,
      chargeRatio: 0.75,
    });
  });

  it('emits tier-aware death metadata and presentation-only landing severity', () => {
    const runtime = MatchRuntime.fromContentPack(pack, 'audio-death-landing', 'none', 'mode.mainStage');
    const def = pack.getEnemy('enemy.quaternius.alien-high-detail');
    if (def.type !== 'monster') throw new Error('expected monster');
    const enemy = runtime.systems.enemies.spawnEnemyDef(def, runtime.state.tank.x + 6, runtime.state.tank.z)!;
    runtime.systems.damage.applyEnemy(enemy, 999_999, 'test');
    expect(runtime.takeEvents().find((event) => event.type === 'kill')).toMatchObject({
      id: enemy.id,
      tier: def.tier,
      sizeClass: def.sizeClass,
      presentationProfileId: def.presentationProfileId,
    });

    const tank = runtime.state.tank;
    const integrity = tank.integrity;
    const ground = runtime.world.groundHeightAt(tank.x, tank.z);
    tank.grounded = false;
    tank.y = ground + 2;
    tank.vy = -10;
    runtime.step(1 / 60);
    runtime.takeEvents();
    tank.grounded = false;
    tank.y = ground + 0.01;
    tank.vy = -10;
    runtime.step(1 / 60);
    const landing = runtime.takeEvents().find((event) => event.type === 'tankLanding');
    expect(landing).toMatchObject({ kind: 'heavy' });
    expect(landing?.value).toBeGreaterThanOrEqual(10);
    expect(tank.integrity).toBe(integrity);
  });
});
