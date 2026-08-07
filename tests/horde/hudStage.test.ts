import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HUD_BINDING_PATHS } from '../../src/shared/presentation/schemas';
import { emptyHudViewModel, HudProjector } from '../../src/client/presentation/hudViewModel';
import type { MatchState } from '../../src/shared/types';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function state(overrides: Partial<MatchState> = {}): MatchState {
  return {
    matchId: 'hud-test',
    time: 10,
    duration: 180,
    phase: 'running',
    tank: {
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, yawVel: 0, pitch: 0, roll: 0,
      integrity: 100, dashCooldown: 0, dashPresentationT: 0, dashDamageT: 0,
      shieldedT: 0, deadT: 0, grounded: true, drift: false, landingGripT: 0,
    },
    turret: {
      yaw: 0, pitch: 0, cannonHeld: false, cannonHoldT: 0, cannonChargeRatio: 0,
      cannonChargeFull: false, cannonCooldown: 0, cannonFlash: 0, mgCooldown: 0, mgFiring: false,
    },
    combo: { multiplier: 1, points: 0, lastDriverT: -99, lastGunnerT: -99, lastAnyT: -99, best: 1 },
    build: { capabilities: [] },
    matchFlow: 'playing',
    teamProgression: {
      level: 1, currentXp: 0, xpForNextLevel: 20, totalXpCollected: 0, pendingLevelUps: 0,
      levelUpOffersCompleted: 0, levelUpgradeSummary: [], treasureChestsOpened: 0, relicAcquisitionSequence: 0, relicStacks: {},
      activeSelection: null, lastRelicResult: null, pendingRelicResults: [],
    },
    chests: [],
    xpShards: [],
    stats: {
      score: 0, chargedCannonShots: 0, fullChargeShots: 0, kills: 0, scrapCollected: 0,
      links: 0, dashKills: 0, dodgeCount: 0, wipeouts: 0, bestCombo: 1, anyContribution: false,
    },
    enemies: [],
    pickups: [],
    shells: [],
    barrels: [],
    truck: { active: false, x: 0, y: 0, z: 0, yaw: 0, hp: 1, waypoint: 0, escaped: false, sirenT: 0 },
    respawnT: 0,
    countdown: 0,
    modifier: 'none',
    nextEnemyId: 1,
    nextPickupId: 1,
    nextShellId: 1,
    nextXpShardId: 1,
    nextChestId: 1,
    ...overrides,
  };
}

function monsterStage(
  overrides: Partial<{
    phase: 'FARMING' | 'BOSS_INTRO' | 'BOSS_ACTIVE' | 'RESULTS';
    level: number;
    encounters: Array<{
      slotId: string;
      enemyId: string;
      label: string;
      hp: number;
      maxHp: number;
      alive: boolean;
      kind: 'elite' | 'boss';
    }>;
  }> = {},
) {
  return {
    phase: overrides.phase ?? 'FARMING',
    level: overrides.level ?? 5,
    encounters: overrides.encounters ?? [],
  };
}

describe('stage HUD projection (M11)', () => {
  it('projects farming countdown and wave/leader state from context', () => {
    const projector = new HudProjector();
    const vm = projector.project(state(), {
      role: 'driver',
      peerConnected: false,
      ping: 0,
      fps: 60,
      pointerLocked: true,
      session: { kind: 'singlePlayer', showRoleIdentity: false, showPeerStatus: false },
      objective: null,
      stage: { phase: 'wave1', farmingTimeRemaining: 120, waveId: 1, leaderHp: 40, leaderMaxHp: 100 },
    });
    expect(vm.stage.phase).toBe('wave1');
    expect(vm.stage.waveLabel).toBe('WAVE 1');
    expect(vm.stage.waveActive).toBe(true);
    expect(vm.stage.leaderHpRatio).toBeCloseTo(0.4, 5);
    expect(vm.stage.stageClear).toBe(false);
  });

  it('formats the farming label as MM:SS while no wave is active', () => {
    const projector = new HudProjector();
    const vm = projector.project(state(), {
      role: 'driver',
      peerConnected: false,
      ping: 0,
      fps: 60,
      pointerLocked: true,
      session: { kind: 'singlePlayer', showRoleIdentity: false, showPeerStatus: false },
      objective: null,
      stage: { phase: 'farming2', farmingTimeRemaining: 80, waveId: null, leaderHp: 0, leaderMaxHp: 0 },
    });
    expect(vm.stage.farmingLabel).toBe('01:20');
    expect(vm.stage.waveActive).toBe(false);
    expect(vm.stage.waveLabel).toBe('');
  });

  it('maps clear and boss phases to labels', () => {
    const projector = new HudProjector();
    const base = {
      role: 'driver' as const,
      peerConnected: false,
      ping: 0,
      fps: 60,
      pointerLocked: true,
      session: { kind: 'singlePlayer' as const, showRoleIdentity: false, showPeerStatus: false },
      objective: null,
    };
    expect(projector.project(state(), { ...base, stage: { phase: 'bossWave', farmingTimeRemaining: 0, waveId: 3, leaderHp: 100, leaderMaxHp: 100 } }).stage.waveLabel).toBe('BOSS WAVE');
    expect(projector.project(state(), { ...base, stage: { phase: 'clear', farmingTimeRemaining: 0, waveId: null, leaderHp: 0, leaderMaxHp: 0 } }).stage.stageClear).toBe(true);
    expect(projector.project(state(), { ...base, stage: { phase: 'gameOver', farmingTimeRemaining: 0, waveId: null, leaderHp: 0, leaderMaxHp: 0 } }).stage.gameOver).toBe(true);
  });

  it('defaults to an inactive stage when no context is provided', () => {
    const vm = emptyHudViewModel();
    expect(vm.stage.waveActive).toBe(false);
    expect(vm.stage.leaderHpRatio).toBe(0);
    const projector = new HudProjector();
    const projected = projector.project(state(), {
      role: 'driver',
      peerConnected: false,
      ping: 0,
      fps: 60,
      pointerLocked: true,
      session: { kind: 'singlePlayer', showRoleIdentity: false, showPeerStatus: false },
      objective: null,
    });
    expect(projected.stage.farmingLabel).toBe('');
    expect(projected.stage.waveActive).toBe(false);
  });

  it('content and binding schema expose the stage block', () => {
    for (const p of [
      'stage.phase',
      'stage.farmingLabel',
      'stage.waveLabel',
      'stage.waveActive',
      'stage.leaderHpRatio',
      'stage.leaderHpMax',
      'stage.stageClear',
      'stage.gameOver',
      'stage.monster.level',
      'stage.monster.waveTimerLabel',
      'stage.monster.waveCountdownText',
      'stage.monster.waveWarning',
      'stage.monster.elite1.visible',
      'stage.monster.elite1.label',
      'stage.monster.elite1.hpText',
      'stage.monster.elite1.ratio',
      'stage.monster.elite2.visible',
      'stage.monster.elite2.label',
      'stage.monster.elite2.hpText',
      'stage.monster.elite2.ratio',
      'stage.monster.boss.visible',
      'stage.monster.boss.label',
      'stage.monster.boss.hpText',
      'stage.monster.boss.ratio',
    ]) {
      expect(HUD_BINDING_PATHS).toContain(p);
    }
    const hud = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/hud/gameplay.json'), 'utf8'));
    expect(JSON.stringify(hud)).toContain('hud-stage');
    expect(JSON.stringify(hud)).toContain('stage.waveLabel');
    expect(JSON.stringify(hud)).toContain('stage.leaderHpRatio');
  });

  it('shows TIME UNTIL NEW WAVE with a sim-time countdown to the next wave', () => {
    const projector = new HudProjector();
    const base = {
      role: 'driver' as const,
      peerConnected: false,
      ping: 0,
      fps: 60,
      pointerLocked: true,
      session: { kind: 'singlePlayer' as const, showRoleIdentity: false, showPeerStatus: false },
      objective: null,
    };
    const vm = projector.project(state({ time: 30 }), {
      ...base,
      stage: {
        phase: 'farming1',
        farmingTimeRemaining: 150,
        waveId: null,
        leaderHp: 0,
        leaderMaxHp: 0,
        monster: monsterStage({ phase: 'FARMING', level: 2 }),
      },
    });
    expect(vm.stage.monster.waveTimerLabel).toBe('TIME UNTIL NEW WAVE');
    expect(vm.stage.monster.waveCountdownText).toBe('00:30');
    expect(vm.stage.monster.level).toBe(2);
  });

  it('counts down to wave 2 and wave 3 thresholds at 60/120 seconds', () => {
    const projector = new HudProjector();
    const base = {
      role: 'driver' as const,
      peerConnected: false,
      ping: 0,
      fps: 60,
      pointerLocked: true,
      session: { kind: 'singlePlayer' as const, showRoleIdentity: false, showPeerStatus: false },
      objective: null,
      stage: {
        phase: 'farming2' as const,
        farmingTimeRemaining: 80,
        waveId: null,
        leaderHp: 0,
        leaderMaxHp: 0,
        monster: monsterStage({ phase: 'FARMING' }),
      },
    };
    expect(projector.project(state({ time: 100 }), base).stage.monster.waveCountdownText).toBe('00:20');
    expect(
      projector.project(state({ time: 130 }), {
        ...base,
        stage: { ...base.stage, phase: 'farming3', farmingTimeRemaining: 50 },
      }).stage.monster.waveCountdownText,
    ).toBe('00:50');
  });

  it('shows BOSS INCOMING during the intro and hides the timer during boss combat', () => {
    const projector = new HudProjector();
    const base = {
      role: 'driver' as const,
      peerConnected: false,
      ping: 0,
      fps: 60,
      pointerLocked: true,
      session: { kind: 'singlePlayer' as const, showRoleIdentity: false, showPeerStatus: false },
      objective: null,
    };
    const intro = projector.project(state({ time: 181 }), {
      ...base,
      stage: {
        phase: 'bossWave',
        farmingTimeRemaining: 0,
        waveId: 3,
        leaderHp: 100,
        leaderMaxHp: 100,
        monster: monsterStage({ phase: 'BOSS_INTRO', level: 13 }),
      },
    });
    expect(intro.stage.monster.waveTimerLabel).toBe('BOSS INCOMING');
    expect(intro.stage.monster.waveCountdownText).toBe('');
    const active = projector.project(state({ time: 200 }), {
      ...base,
      stage: {
        phase: 'bossWave',
        farmingTimeRemaining: 0,
        waveId: 3,
        leaderHp: 100,
        leaderMaxHp: 100,
        monster: monsterStage({ phase: 'BOSS_ACTIVE', level: 13 }),
      },
    });
    expect(active.stage.monster.waveTimerLabel).toBe('');
  });

  it('projects one elite bar, two stacked elite bars, and the boss bar from encounters', () => {
    const projector = new HudProjector();
    const base = {
      role: 'driver' as const,
      peerConnected: false,
      ping: 0,
      fps: 60,
      pointerLocked: true,
      session: { kind: 'singlePlayer' as const, showRoleIdentity: false, showPeerStatus: false },
      objective: null,
    };
    const single = projector.project(state({ time: 70 }), {
      ...base,
      stage: {
        phase: 'wave1',
        farmingTimeRemaining: 110,
        waveId: 1,
        leaderHp: 500,
        leaderMaxHp: 1000,
        monster: monsterStage({
          phase: 'FARMING',
          encounters: [
            { slotId: 'selected.wave1.elite0', enemyId: 'enemy.eliteA', label: 'Elite A', hp: 250, maxHp: 1000, alive: true, kind: 'elite' },
            { slotId: 'selected.boss', enemyId: 'enemy.bossB', label: 'Boss B', hp: 8000, maxHp: 10000, alive: true, kind: 'boss' },
          ],
        }),
      },
    });
    expect(single.stage.monster.elite1.visible).toBe(true);
    expect(single.stage.monster.elite1.label).toBe('Elite A');
    expect(single.stage.monster.elite1.ratio).toBeCloseTo(0.25, 5);
    expect(single.stage.monster.elite2.visible).toBe(false);
    expect(single.stage.monster.boss.visible).toBe(true);
    expect(single.stage.monster.boss.label).toBe('Boss B');
    expect(single.stage.monster.boss.hpText).toBe('80,000 / 100,000');

    const two = projector.project(state({ time: 130 }), {
      ...base,
      stage: {
        phase: 'wave2',
        farmingTimeRemaining: 50,
        waveId: 2,
        leaderHp: 100,
        leaderMaxHp: 500,
        monster: monsterStage({
          encounters: [
            { slotId: 'selected.wave2.elite0', enemyId: 'enemy.eliteC', label: 'Elite C', hp: 100, maxHp: 500, alive: true, kind: 'elite' },
            { slotId: 'selected.wave2.elite1', enemyId: 'enemy.eliteD', label: 'Elite D', hp: 300, maxHp: 400, alive: true, kind: 'elite' },
            { slotId: 'selected.boss', enemyId: 'enemy.bossE', label: 'Boss E', hp: 0, maxHp: 10000, alive: false, kind: 'boss' },
          ],
        }),
      },
    });
    expect(two.stage.monster.elite1.label).toBe('Elite C');
    expect(two.stage.monster.elite2.visible).toBe(true);
    expect(two.stage.monster.elite2.label).toBe('Elite D');
    expect(two.stage.monster.boss.visible).toBe(false);
  });

  it('emits a wave warning in the last five seconds before the threshold', () => {
    const projector = new HudProjector();
    const base = {
      role: 'driver' as const,
      peerConnected: false,
      ping: 0,
      fps: 60,
      pointerLocked: true,
      session: { kind: 'singlePlayer' as const, showRoleIdentity: false, showPeerStatus: false },
      objective: null,
      stage: {
        phase: 'farming1' as const,
        farmingTimeRemaining: 125,
        waveId: null,
        leaderHp: 0,
        leaderMaxHp: 0,
        monster: monsterStage({ phase: 'FARMING' }),
      },
    };
    const warned = projector.project(state({ time: 57 }), base);
    expect(warned.stage.monster.waveWarning).toBe('WAVE 1 INCOMING');
    expect(warned.stage.monster.waveWarningVisible).toBe(true);
    const quiet = projector.project(state({ time: 40 }), { ...base, stage: { ...base.stage, farmingTimeRemaining: 126 } });
    expect(quiet.stage.monster.waveWarning).toBe('');
  });

  it('promotes the single active elite to the primary bar after an earlier encounter dies', () => {
    const projector = new HudProjector();
    const vm = projector.project(state({ time: 130 }), {
      role: 'driver',
      peerConnected: false,
      ping: 0,
      fps: 60,
      pointerLocked: true,
      session: { kind: 'singlePlayer', showRoleIdentity: false, showPeerStatus: false },
      objective: null,
      stage: {
        phase: 'wave2',
        farmingTimeRemaining: 50,
        waveId: 2,
        leaderHp: 500,
        leaderMaxHp: 500,
        monster: monsterStage({
          encounters: [
            { slotId: 'selected.wave1.elite0', enemyId: 'enemy.eliteA', label: 'Dead Elite', hp: 0, maxHp: 1000, alive: false, kind: 'elite' },
            { slotId: 'selected.wave2.elite0', enemyId: 'enemy.eliteB', label: 'Wave 2 Elite', hp: 250, maxHp: 500, alive: true, kind: 'elite' },
            { slotId: 'selected.boss', enemyId: 'enemy.boss', label: 'Boss', hp: 0, maxHp: 1, alive: false, kind: 'boss' },
          ],
        }),
      },
    });
    expect(vm.stage.monster.elite1.visible).toBe(true);
    expect(vm.stage.monster.elite1.label).toBe('Wave 2 Elite');
    expect(vm.stage.monster.elite2.visible).toBe(false);
  });
});
