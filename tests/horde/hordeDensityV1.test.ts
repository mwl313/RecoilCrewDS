import { describe, expect, it } from 'vitest';
import { FODDER_CAPACITY } from '../../src/client/app/entityViewRegistry';
import { loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';
import { allocateOrdinaryMix } from '../../src/shared/horde/hordeDirector';
import { buildSpawnAnchors } from '../../src/shared/horde/spawnAnchors';
import { selectArenaSession } from '../../src/shared/mapgen/arenaSession';
import { resolveMapBundle } from '../../src/shared/mapgen/profiles';
import { Match } from '../../src/shared/sim/match';

const content = loadContentPackFromFilesystem('content');

describe('Horde Density V1 production tuning', () => {
  it('authors the required farming endpoints and interpolates their midpoints', () => {
    const match = new Match('density-content', 'none', content, undefined, 'mode.mainStage');
    const phases = match.runtime.systems.horde!.resolved.farmingPhases;
    expect(phases.map((phase) => [phase.entityTargetStart, phase.entityTargetEnd])).toEqual([
      [20, 32],
      [32, 50],
      [50, 72],
    ]);
    expect(phases.map((phase) => [phase.threatTargetStart, phase.threatTargetEnd])).toEqual([
      [25, 42],
      [42, 66],
      [66, 95],
    ]);
    expect(phases.map((phase) => [phase.spawnIncomeStart, phase.spawnIncomeEnd])).toEqual([
      [1.6, 2.4],
      [2.4, 3.2],
      [3.2, 4.4],
    ]);
    expect(phases.map((phase) => (phase.entityTargetStart + phase.entityTargetEnd) / 2)).toEqual([26, 41, 61]);
  });

  it('authors 6/7/8 production packs and the 65/25/10 mix converges', () => {
    const horde = new Match('density-packs', 'none', content, undefined, 'mode.mainStage').runtime.systems.horde!;
    expect(horde.resolved.packs.get('pack.production.farmingCluster')?.entityCost).toBe(6);
    expect(horde.resolved.packs.get('pack.production.mixedFarming')?.entityCost).toBe(7);
    expect(horde.resolved.packs.get('pack.production.waveCohort')?.entityCost).toBe(8);
    const mix = horde.resolved.gameplayRoster!.ordinaryMix;
    expect(mix).toEqual({ closeFodder: 0.65, rangedFodder: 0.25, specialist: 0.1 });
    expect(allocateOrdinaryMix(mix, { closeFodder: 0, rangedFodder: 0, specialist: 0 }, 100)).toEqual({
      closeFodder: 65,
      rangedFodder: 25,
      specialist: 10,
    });
  });

  it('keeps elite scarcity, selects 8-10 boss escorts, and preserves engineering caps', () => {
    const match = new Match('density-caps', 'none', content, undefined, 'mode.mainStage');
    const horde = match.runtime.systems.horde!;
    expect(horde.resolved.gameplayRoster!.featuredWaves.map((wave) => wave.eliteCount)).toEqual([1, 1]);
    expect(horde.resolved.gameplayRoster!.bossEscortCount).toEqual([8, 10]);
    expect(match.runtime.systems.monsterRun!.bossEscortCount).toBeGreaterThanOrEqual(8);
    expect(match.runtime.systems.monsterRun!.bossEscortCount).toBeLessThanOrEqual(10);
    expect(horde.resolved.limits.hardEntityCap).toBe(300);
    expect(FODDER_CAPACITY).toBe(512);
  });

  it('keeps multiplayer and single-player Main Stage on the same production horde', () => {
    const multiplayer = new Match('density-mp', 'none', content, undefined, 'mode.mainStage');
    const singlePlayer = new Match('density-sp', 'none', content, undefined, 'mode.singlePlayerMainStage');
    expect(multiplayer.rules.hordeDirector?.id).toBe('horde.mainStage.production');
    expect(singlePlayer.rules.hordeDirector?.id).toBe('horde.mainStage.production');
    expect(multiplayer.runtime.systems.horde!.resolved).toEqual(singlePlayer.runtime.systems.horde!.resolved);
  });

  it('reports global and nearby live density bands plus ordinary roles', () => {
    const match = new Match('density-telemetry', 'none', content, undefined, 'mode.mainStage');
    const horde = match.runtime.systems.horde!;
    const closeId = match.runtime.systems.monsterSlots!['selected.phase.closeFodder'];
    const rangedId = match.runtime.systems.monsterSlots!['selected.phase.rangedFodder'];
    const specialistId = match.runtime.systems.monsterSlots!['selected.phase.specialist'];
    const tank = match.state.tank;
    match.runtime.systems.enemies.spawnEnemyDef(match.runtime.systems.enemies.defById(closeId)!, tank.x + 30, tank.z);
    match.runtime.systems.enemies.spawnEnemyDef(match.runtime.systems.enemies.defById(rangedId)!, tank.x + 60, tank.z);
    match.runtime.systems.enemies.spawnEnemyDef(match.runtime.systems.enemies.defById(specialistId)!, tank.x + 80, tank.z);
    expect(horde.densityTelemetry()).toMatchObject({
      globalEnemyCount: 3,
      globalOrdinaryCount: 3,
      nearbyEnemyCount45: 1,
      nearbyEnemyCount70: 2,
      nearbyOrdinaryCount45: 1,
      nearbyOrdinaryCount70: 2,
      close: 1,
      ranged: 1,
      specialist: 1,
      sectorCount: 0,
      pendingSubgroups: 0,
      maintenanceSummonCount: 0,
      rewardSuppressedKills: 0,
    });
    expect(horde.densityTelemetry().angularSectorCounts).toHaveLength(8);
  });

  it('retains multiple urban400 anchors capable of an eight-entity pack', () => {
    const bundle = resolveMapBundle(content, 'map.urban400Prototype');
    const fallbackBundle = bundle.map.fallbackMapId ? resolveMapBundle(content, bundle.map.fallbackMapId) : bundle;
    const session = selectArenaSession({ roomCode: 'DENSE8', matchIndex: 0, bundle, fallbackBundle });
    const compatible = buildSpawnAnchors(session.world).anchors.filter(
      (anchor) => anchor.reachable && anchor.capacity >= 8 && !['spawnSafe', 'recovery'].includes(anchor.terrainTag),
    );
    expect(compatible.length).toBeGreaterThanOrEqual(8);
  });
});
