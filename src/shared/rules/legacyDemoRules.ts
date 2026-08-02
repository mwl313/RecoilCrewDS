import { BASE_CONFIG, GAME } from '../config';
import { DEMO_GRADE_RULES, DEMO_TITLE_RULES } from '../sim/results';
import type { ObjectiveDefinition } from '../content/schemas/objective';
import type { ResultsDefinition } from '../content/schemas/results';
import type { ModeDefinition } from '../content/schemas/mode';
import type { ScoringDefinition } from '../content/schemas/scoring';
import type { SpawnDirectorDefinition } from '../content/schemas/spawnDirector';

/**
 * Client-safe Demo rules bundle synthesized from the legacy constants.
 * Values mirror content/demoScoreAttack.* exactly (parity is tested); this
 * keeps the browser Practice path free of fs/zod while using the same rule
 * shapes as the authoritative content path.
 */
export interface DemoRulesBundle {
  objective: ObjectiveDefinition;
  scoring: ScoringDefinition;
  results: ResultsDefinition;
  spawnDirector: SpawnDirectorDefinition;
}

export const LEGACY_DEMO_CONSTANTS = {
  atSpeedThreshold: 12,
  atSpeedBonus: 25,
  scrapLoopWindow: 3,
  ramScore: 20,
  jackpotBraceBonus: 150,
} as const;

export function createLegacyDemoRulesBundle(): DemoRulesBundle {
  const j = BASE_CONFIG.jackpot;
  const sc = BASE_CONFIG.scoring;
  const scoring: ScoringDefinition = {
    id: 'scoring.demoScoreAttack',
    behaviors: ['behavior.scoring.demo'],
    enemyScores: {
      'enemy.scrapBug': sc.bugScore,
      'enemy.rammer': sc.rammerScore,
      'enemy.gunTower': sc.towerScore,
      'enemy.lootTruck': sc.truckScore,
    },
    scrapScores: { normal: sc.normalScrap, heavy: sc.heavyScrap, jackpot: sc.jackpotScrap },
    jackpotGains: {
      'enemy.scrapBug': j.bugGain,
      'enemy.rammer': j.rammerGain,
      'enemy.gunTower': j.towerGain,
      'enemy.lootTruck': j.truckGain,
      normalScrap: j.normalScrapGain,
      heavyScrap: j.heavyScrapGain,
      jackpotScrap: j.jackpotScrapGain,
      speedCollect: j.speedCollectGain,
      ram: j.ramGain,
      dodge: j.dodgeGain,
      braceShot: j.braceShotGain,
    },
    combo: {
      pointsPerLevel: sc.comboPointsPerLevel,
      max: sc.comboMax,
      decayTime: sc.comboDecayTime,
      bothWindow: sc.comboBothWindow,
    },
    links: {
      braceShot: sc.linkBraceShot,
      scrapLoop: sc.linkScrapLoop,
      ramFinish: sc.linkRamFinish,
    },
    atSpeed: { threshold: LEGACY_DEMO_CONSTANTS.atSpeedThreshold, bonus: LEGACY_DEMO_CONSTANTS.atSpeedBonus },
    scrapLoopWindow: LEGACY_DEMO_CONSTANTS.scrapLoopWindow,
    ramScore: LEGACY_DEMO_CONSTANTS.ramScore,
    jackpotBraceBonus: LEGACY_DEMO_CONSTANTS.jackpotBraceBonus,
    wipeoutPenalty: sc.wipeoutPenalty,
    jackpotCooldown: j.jackpotCooldown,
    assist: {
      floor55: j.assistFloor55,
      floor66: j.assistFloor66,
      floor70: j.assistFloor70,
      requireContributions: j.assistRequireContributions,
    },
    finalChaos: { mult: j.finalChaosMult, start: j.finalChaosStart },
  };

  const objective: ObjectiveDefinition = {
    id: 'objective.highScore',
    label: 'High Score',
    kind: 'scoreAttack',
    durationSeconds: GAME.roundDuration,
    behaviors: ['behavior.objective.scoreAttack'],
  };

  const results: ResultsDefinition = {
    id: 'results.demoScoreAttack',
    behaviors: ['behavior.results.demo'],
    grades: DEMO_GRADE_RULES.map((r) => ({
      grade: r.grade,
      minScore: r.minScore,
      ...(r.require ? { require: r.require } : {}),
    })),
    titles: DEMO_TITLE_RULES.map((t) => ({
      id: t.id,
      text: t.text,
      ...(t.require ? { require: t.require } : {}),
    })),
  };

  const spawnDirector: SpawnDirectorDefinition = {
    id: 'spawn.director.demoScoreAttack',
    behaviors: ['behavior.spawnDirector.demo'],
    initialSpawns: [
      { type: 'enemy.scrapBug', x: -7, z: 6 },
      { type: 'enemy.scrapBug', x: 8, z: -4 },
    ],
    bugPacing: {
      minActive: BASE_CONFIG.arena.minActiveBugs,
      maxActive: BASE_CONFIG.arena.maxActiveBugs,
      rampPerSecond: 0.22,
      cap: 22,
    },
    rammerSpawns: [22, 34, 50],
    towerSpawns: [26, 58],
    maxRammers: BASE_CONFIG.arena.maxRammers,
    maxTowers: BASE_CONFIG.arena.maxTowers,
    finalChaos: { start: 70, rammerProbability: 0.12, rammerMax: 3, towerProbability: 0.08 },
    arena: { half: BASE_CONFIG.arena.half, maxPickups: BASE_CONFIG.arena.maxPickups },
    props: {
      barrelHp: BASE_CONFIG.weapons.barrelHp,
      barrelRadius: BASE_CONFIG.weapons.barrelRadius,
      barrelChainRadius: BASE_CONFIG.weapons.barrelChainRadius,
    },
  };

  return { objective, scoring, results, spawnDirector };
}

/** Mode definition for the client-safe path (mirrors content/modes). */
export function createLegacyDemoModeDefinition(): ModeDefinition {
  return {
    id: 'mode.demoScoreAttack',
    label: 'Demo Score Attack',
    difficulty: 'difficulty.standard',
    tank: 'tank.default',
    loadout: 'loadout.default',
    objectives: ['objective.highScore'],
    spawnDirector: 'spawn.director.demoScoreAttack',
    scoring: 'scoring.demoScoreAttack',
    results: 'results.demoScoreAttack',
    presentation: 'presentation.demoScoreAttack',
    rematch: {
      modifiers: [
        'difficulty.doubleBarrel',
        'difficulty.soapTracks',
        'difficulty.moonYard',
        'difficulty.volatileInventory',
        'difficulty.scrapMagnet',
        'difficulty.overclocked',
      ],
    },
    behaviors: ['behavior.mode.demoScoreAttack'],
  };
}
