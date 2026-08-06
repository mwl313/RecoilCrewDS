import { describe, expect, it } from 'vitest';
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';
import { selectMonsterRun } from '../src/shared/monsters/monsterRunSelection';
import {
  advanceMonsterStage,
  createMonsterRunState,
  endMonsterStage,
  resolveSelectedSlots,
  resolvePackSlotIds,
  bindPhaseSlots,
  DEFAULT_MONSTER_STAGE_CONFIG,
  type MonsterStageEvent,
} from '../src/shared/monsters/monsterStage';
import { monsterLevelAtTime } from '../src/shared/monsters/monsterDifficulty';
import { MatchRuntime } from '../src/shared/sim/matchRuntime';

const pack = loadContentPackFromFilesystem('content');
const roster = pack.getEnemyGameplayRoster('enemyGameplayRoster.quaternius.mainStage');
const run = selectMonsterRun(roster, 42);
const curve = {
  levelIntervalSeconds: 15,
  minimumLevel: 1,
  maximumLevel: 13,
  healthMultiplierPerLevel: 1.2,
  damageMultiplierPerLevel: 1.18,
  bossPhaseLevel: 13,
};
const levelAt = (t: number) => monsterLevelAtTime(t, curve);

describe('monster stage timeline', () => {
  it('starts in FARMING phase 0 with the first wave at 60', () => {
    const state = createMonsterRunState(roster, run, 0);
    expect(state.phase).toBe('FARMING');
    expect(state.farmingPhaseIndex).toBe(0);
    expect(state.nextWaveAt).toBe(60);
  });

  it('fires waves at 60 and 120 and never ends at 180', () => {
    const state = createMonsterRunState(roster, run, 0);
    const events: MonsterStageEvent[] = [];
    advanceMonsterStage(state, 59.999, levelAt, DEFAULT_MONSTER_STAGE_CONFIG, events);
    expect(state.phase).toBe('FARMING');
    expect(events).toHaveLength(0);
    advanceMonsterStage(state, 60, levelAt, DEFAULT_MONSTER_STAGE_CONFIG, events);
    expect(events.some((e) => e.type === 'wave' && e.waveIndex === 1)).toBe(true);
    expect(state.phase).toBe('FARMING');
    advanceMonsterStage(state, 120, levelAt, DEFAULT_MONSTER_STAGE_CONFIG, events);
    expect(events.some((e) => e.type === 'wave' && e.waveIndex === 2)).toBe(true);
    expect(state.phase).toBe('FARMING');
    advanceMonsterStage(state, 180, levelAt, DEFAULT_MONSTER_STAGE_CONFIG, events);
    expect(state.phase).toBe('BOSS_INTRO');
    expect(events.some((e) => e.type === 'bossIntro')).toBe(true);
  });

  it('enters boss active after the intro and only ends via explicit result', () => {
    const state = createMonsterRunState(roster, run, 0);
    const events: MonsterStageEvent[] = [];
    advanceMonsterStage(state, 184, levelAt, DEFAULT_MONSTER_STAGE_CONFIG, events);
    expect(state.phase).toBe('BOSS_ACTIVE');
    expect(events.some((e) => e.type === 'bossActive')).toBe(true);
    endMonsterStage(state, 220, 'bossDefeated', events);
    expect(state.phase).toBe('RESULTS');
    expect(state.resultReason).toBe('bossDefeated');
    const defeat = createMonsterRunState(roster, run, 0);
    endMonsterStage(defeat, 45, 'tankDestroyed');
    expect(defeat.phase).toBe('RESULTS');
    expect(defeat.resultReason).toBe('tankDestroyed');
  });

  it('resolves symbolic slots for all phases, elites, and the boss', () => {
    const slots = resolveSelectedSlots(roster, run);
    expect(slots['selected.phase1.closeFodder']).toBe(run.phases[0].closeFodderEnemyId);
    expect(slots['selected.phase3.specialist']).toBe(run.phases[2].specialistEnemyId);
    expect(slots['selected.boss']).toBe(run.boss.enemyId);
    expect(slots['selected.wave1.elite0']).toBe(run.eliteWaves[0][0].enemyId);
    expect(slots['selected.wave2.elite0']).toBe(run.eliteWaves[1][0].enemyId);
    for (const id of Object.values(slots)) expect(pack.has('enemies', id)).toBe(true);
  });

  it('production horde references the gameplay roster', () => {
    const director = pack.getHordeDirector('horde.mainStage.production');
    expect(director.enforceStage).toBe(true);
    expect(director.gameplayRosterId).toBe('enemyGameplayRoster.quaternius.mainStage');
    expect(director.stageSequenceId).toBe('horde.stageSequence.production');
    expect(director.waveIds).toEqual(['wave.production.wave1', 'wave.production.wave2']);
    expect(director.bossWaveId).toBe('horde.bossWave.production');
  });

  it('production packs, waves, and boss wave resolve through selected slots', () => {
    const slots = resolveSelectedSlots(roster, run);
    const sequence = pack.getStageSequence('horde.stageSequence.production');
    expect(sequence.pauseCountdownDuringWave).toBe(false);
    for (const packId of pack.getHordeDirector('horde.mainStage.production').packIds) {
      const def = pack.getSpawnPack(packId);
      const resolved = resolvePackSlotIds(def.entries, slots);
      expect(resolved.length).toBe(def.entries.length);
      for (const id of resolved) expect(pack.has('enemies', id)).toBe(true);
    }
    const wave1 = pack.getWave('wave.production.wave1');
    expect(slots[wave1.leaderSlotId!]).toBe(run.eliteWaves[0][0].enemyId);
    const wave2 = pack.getWave('wave.production.wave2');
    expect(slots[wave2.leaderSlotId!]).toBe(run.eliteWaves[1][0].enemyId);
    const bossWave = pack.getBossWave('horde.bossWave.production');
    expect(slots[bossWave.bossSlotId!]).toBe(run.boss.enemyId);
  });

  it('production matches populate deterministic monster slots; demo stays null', () => {
    const prod = MatchRuntime.fromContentPack(pack, 'prod-match', 'none', 'mode.mainStage');
    expect(prod.systems.monsterSlots).not.toBeNull();
    const boss = prod.systems.monsterSlots!['selected.boss'];
    expect(pack.has('enemies', boss)).toBe(true);
    const again = MatchRuntime.fromContentPack(pack, 'prod-match', 'none', 'mode.mainStage');
    expect(again.systems.monsterSlots).toEqual(prod.systems.monsterSlots);
    const demo = MatchRuntime.fromContentPack(pack, 'demo-match');
    expect(demo.systems.monsterSlots).toBeNull();
  });

  it('bindPhaseSlots rebinds the generic current-phase roster', () => {
    const slots = resolveSelectedSlots(roster, run);
    bindPhaseSlots(slots, run, 2);
    expect(slots['selected.phase.closeFodder']).toBe(run.phases[2].closeFodderEnemyId);
    expect(slots['selected.phase.rangedFodder']).toBe(run.phases[2].rangedFodderEnemyId);
    expect(slots['selected.phase.specialist']).toBe(run.phases[2].specialistEnemyId);
  });

  it('production boss death is victory; tank destruction is defeat without respawn', () => {
    const prod = MatchRuntime.fromContentPack(pack, 'prod-boss', 'none', 'mode.mainStage');
    const bossId = prod.systems.monsterSlots!['selected.boss'];
    const def = pack.getEnemy(bossId);
    const boss = prod.systems.enemies.spawnEnemyDef(def, 5, 5);
    if (!boss) throw new Error('boss spawn failed');
    prod.systems.damage.applyEnemy(boss, 99999, 'test');
    expect(prod.state.phase).toBe('results');
    expect(prod.state.matchFlow).toBe('clear');

    const defeat = MatchRuntime.fromContentPack(pack, 'prod-defeat', 'none', 'mode.mainStage');
    defeat.state.tank.integrity = 0;
    defeat.state.tank.deadT = 0.001;
    defeat.step(1 / 60);
    if (defeat.state.phase === 'countdown') defeat.step(1 / 60);
    expect(defeat.state.phase).toBe('results');
    expect(defeat.state.matchFlow).toBe('gameOver');
    expect(defeat.state.tank.deadT).toBeLessThanOrEqual(0);
  });

  it('demo tank destruction still respawns', () => {
    const demo = MatchRuntime.fromContentPack(pack, 'demo-respawn');
    demo.state.tank.integrity = 0;
    demo.state.tank.deadT = 0.001;
    demo.step(1 / 60);
    if (demo.state.phase === 'countdown') demo.step(1 / 60);
    expect(demo.state.tank.deadT).toBe(0);
    expect(demo.state.tank.integrity).toBeGreaterThan(0);
  });

  it('melee reservations are match-scoped, deterministic, and feed runtime ownership', () => {
    const prod = MatchRuntime.fromContentPack(pack, 'prod-melee', 'none', 'mode.mainStage');
    const def = pack.getEnemy('enemy.quaternius.ninja');
    const tx = prod.state.tank.x;
    const tz = prod.state.tank.z;
    const spawned: number[] = [];
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const enemy = prod.systems.enemies.spawnEnemyDef(def, tx + Math.cos(angle) * 1.5, tz + Math.sin(angle) * 1.5);
      if (enemy) spawned.push(enemy.id);
    }
    for (let i = 0; i < 240 && prod.state.phase === 'countdown'; i++) prod.step(1 / 60);
    prod.step(1 / 60);
    const manager = prod.systems.enemies.meleeReservations;
    expect(manager.size).toBeGreaterThanOrEqual(1);
    expect(manager.size).toBeLessThanOrEqual(6);
    const owners = spawned.filter((id) => prod.systems.enemies.meleeReservedFor(id));
    expect(owners.length).toBe(manager.size);
    for (const id of spawned) {
      expect(prod.systems.enemies.meleeReservedFor(id)).toBe(manager.hasReservation(id));
    }
    const again = MatchRuntime.fromContentPack(pack, 'prod-melee', 'none', 'mode.mainStage');
    const againDef = pack.getEnemy('enemy.quaternius.ninja');
    const atx = again.state.tank.x;
    const atz = again.state.tank.z;
    const againIds: number[] = [];
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const enemy = again.systems.enemies.spawnEnemyDef(againDef, atx + Math.cos(angle) * 1.5, atz + Math.sin(angle) * 1.5);
      if (enemy) againIds.push(enemy.id);
    }
    for (let i = 0; i < 240 && again.state.phase === 'countdown'; i++) again.step(1 / 60);
    again.step(1 / 60);
    const againOwners = againIds.filter((id) => again.systems.enemies.meleeReservedFor(id)).sort();
    expect(owners.sort()).toEqual(againOwners);
  });

  it('monster kills award spawn-locked XP once via deterministic value-preserving bundles', () => {
    const prod = MatchRuntime.fromContentPack(pack, 'prod-xp', 'none', 'mode.mainStage');
    const ambient = pack.getEnemy('enemy.quaternius.ninja');
    const foe = prod.systems.enemies.spawnEnemyDef(ambient, 5, 5);
    if (!foe) throw new Error('spawn failed');
    const expected = foe.monster!.resolvedRewardXp;
    prod.systems.damage.applyEnemy(foe, 99999, 'test');
    expect(foe.monster!.xpAwarded).toBe(true);
    const shards = prod.state.xpShards;
    expect(shards).toHaveLength(1);
    expect(shards.reduce((sum, sh) => sum + sh.value, 0)).toBe(expected);

    const elite = pack.getEnemy('enemy.quaternius.alien-high-detail');
    const leader = prod.systems.enemies.spawnEnemyDef(elite, 8, 8);
    if (!leader) throw new Error('elite spawn failed');
    const eliteXp = leader.monster!.resolvedRewardXp;
    const before = prod.state.xpShards.length;
    prod.systems.damage.applyEnemy(leader, 99999, 'test');
    const newShards = prod.state.xpShards.slice(before);
    expect(newShards.length).toBeGreaterThanOrEqual(3);
    expect(newShards.length).toBeLessThanOrEqual(5);
    expect(newShards.reduce((sum, sh) => sum + sh.value, 0)).toBe(eliteXp);
  });

  it('ranged monsters telegraph before firing exactly one enemy-aligned projectile', () => {
    const prod = MatchRuntime.fromContentPack(pack, 'prod-ranged', 'none', 'mode.mainStage');
    const def = pack.getEnemy('enemy.quaternius.wizard');
    const foe = prod.systems.enemies.spawnEnemyDef(def, prod.state.tank.x + 10, prod.state.tank.z);
    if (!foe) throw new Error('wizard spawn failed');
    let telegraphSeen = false;
    for (let i = 0; i < 150; i++) {
      prod.step(1 / 60);
      if (foe.telegraph > 0) {
        telegraphSeen = true;
        break;
      }
    }
    expect(telegraphSeen).toBe(true);
    expect(prod.state.shells.filter((sh) => sh.kind === 'enemy')).toHaveLength(0);
    for (let i = 0; i < 120; i++) prod.step(1 / 60);
    const enemyShells = prod.state.shells.filter((sh) => sh.kind === 'enemy');
    expect(enemyShells.length).toBeGreaterThanOrEqual(1);
    expect(enemyShells[0].team).toBe('enemy');
    expect(enemyShells[0].ownerEnemyId).toBe(foe.id);
    expect(foe.telegraph).toBe(0);
  });

  it('death cancels a pending ranged shot and player shells default to team player', () => {
    const prod = MatchRuntime.fromContentPack(pack, 'prod-cancel', 'none', 'mode.mainStage');
    const def = pack.getEnemy('enemy.quaternius.wizard');
    const foe = prod.systems.enemies.spawnEnemyDef(def, prod.state.tank.x + 10, prod.state.tank.z);
    if (!foe) throw new Error('wizard spawn failed');
    for (let i = 0; i < 150 && foe.telegraph === 0; i++) prod.step(1 / 60);
    expect(foe.telegraph).toBeGreaterThan(0);
    prod.systems.damage.applyEnemy(foe, 99999, 'test');
    for (let i = 0; i < 180; i++) prod.step(1 / 60);
    expect(prod.state.shells.filter((sh) => sh.kind === 'enemy')).toHaveLength(0);
    const playerShell = prod.systems.projectiles.spawn(0, 1, 0, 1, 0, 0, 10, 'cannon', 5);
    expect(playerShell.team).toBe('player');
  });
});
