import { describe, expect, it } from 'vitest';
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';
import { MatchRuntime } from '../src/shared/sim/matchRuntime';
import type { EnemyDefinition } from '../src/shared/content/schemas/enemy';

const pack = loadContentPackFromFilesystem('content');
const roster = pack.getEnemyGameplayRoster('enemyGameplayRoster.quaternius.mainStage');

function monsterDef(def: EnemyDefinition) {
  if (!('tier' in def)) throw new Error(`expected a generalized monster def, got ${def.id}`);
  return def;
}

describe('monster core-loop qualification (Phase E)', () => {
  it('SP and multiplayer resolve the same selected run for the same match id', () => {
    const sp = MatchRuntime.fromContentPack(pack, 'qual-42', 'none', 'mode.singlePlayerMainStage');
    const mp = MatchRuntime.fromContentPack(pack, 'qual-42', 'none', 'mode.mainStage');
    expect(sp.systems.monsterSlots).toEqual(mp.systems.monsterSlots);
    expect(sp.systems.monsterRun).toEqual(mp.systems.monsterRun);
    const spOther = MatchRuntime.fromContentPack(pack, 'qual-43', 'none', 'mode.singlePlayerMainStage');
    expect(spOther.systems.monsterRun?.seed).not.toBe(sp.systems.monsterRun?.seed);
  });

  it('all six featured identities have valid elite and boss role definitions', () => {
    const identities = roster.featuredIdentities;
    expect(identities).toHaveLength(6);
    const eliteTiers: string[] = [];
    const bossTiers: string[] = [];
    for (const identity of identities) {
      const elite = monsterDef(pack.getEnemy(identity.eliteEnemyId));
      const boss = monsterDef(pack.getEnemy(identity.bossEnemyId));
      expect(elite.tier).toBe('elite');
      expect(elite.tierScale).toBe(3);
      expect(elite.rewardClass).toBe('elite');
      if (elite.attack.type !== 'mixed') throw new Error(`elite ${elite.id} must use mixed patterns`);
      expect(elite.attack.patterns.some((p) => p.type === 'melee')).toBe(true);
      expect(elite.attack.patterns.some((p) => p.type === 'ranged')).toBe(true);
      expect(elite.behaviors.some(({ id }) => id === 'attack.mixedCue')).toBe(true);
      expect(elite.levelScaling.damage).toBe(true);
      expect(boss.tier).toBe('boss');
      expect(boss.tierScale).toBe(5);
      expect(boss.rewardClass).toBe('boss');
      if (boss.attack.type !== 'mixed') throw new Error(`boss ${boss.id} must use mixed patterns`);
      expect(boss.attack.patterns.length).toBeGreaterThanOrEqual(2);
      expect(boss.attack.patterns.some((p) => p.type === 'melee')).toBe(true);
      expect(boss.attack.patterns.some((p) => p.type === 'ranged')).toBe(true);
      expect(boss.behaviors.some(({ id }) => id === 'attack.mixedCue')).toBe(true);
      expect(boss.levelScaling.damage).toBe(false);
      eliteTiers.push(elite.tierScale.toFixed(1));
      bossTiers.push(boss.tierScale.toFixed(1));
    }
    expect([...new Set(eliteTiers)]).toEqual(['3.0']);
    expect([...new Set(bossTiers)]).toEqual(['5.0']);
  });

  it('production packs and waves resolve only through selected slots (no hardcoded IDs)', () => {
    const run = roster; // validate roster itself
    expect(run.ordinaryCandidates.length).toBeGreaterThanOrEqual(39);
    const director = pack.getHordeDirector('horde.mainStage.production');
    expect(director.gameplayRosterId).toBe(roster.id);
    const wave1 = pack.getWave('wave.production.wave1');
    const wave2 = pack.getWave('wave.production.wave2');
    expect(wave1.leaderSlotId).toMatch(/^selected\.wave1\.elite/);
    expect(wave2.leaderSlotId).toMatch(/^selected\.wave2\.elite/);
    expect(pack.getBossWave('horde.bossWave.production').bossSlotId).toBe('selected.boss');
  });
});
