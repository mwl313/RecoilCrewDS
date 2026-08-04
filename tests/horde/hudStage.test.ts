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
      levelUpOffersCompleted: 0, treasureChestsOpened: 0, relicStacks: {},
      activeSelection: null, lastRelicResult: null,
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
    ]) {
      expect(HUD_BINDING_PATHS).toContain(p);
    }
    const hud = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/hud/gameplay.json'), 'utf8'));
    expect(JSON.stringify(hud)).toContain('hud-stage');
    expect(JSON.stringify(hud)).toContain('stage.waveLabel');
    expect(JSON.stringify(hud)).toContain('stage.leaderHpRatio');
  });
});
