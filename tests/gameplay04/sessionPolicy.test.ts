import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { modeSchema, modeSessionPolicySchema } from '../../src/shared/content/schemas/mode';
import { loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';
import { MatchRules } from '../../src/shared/rules/matchRules';
import {
  isPlayerFacingModeId,
  PLAYER_FACING_MODE_IDS,
  resolveSinglePlayerModeId,
} from '../../src/shared/session/gameSessionKind';

const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../content');

const MULTIPLAYER = {
  kind: 'multiplayer',
  networkRequired: true,
  controlScheme: 'assignedRole',
  showRoleIdentity: true,
  showPeerStatus: true,
  allowRoleSwap: false,
  resultsFlow: 'crewRematchVote',
};

const SINGLE = {
  kind: 'singlePlayer',
  networkRequired: false,
  controlScheme: 'combinedDriverAndGunner',
  showRoleIdentity: false,
  showPeerStatus: false,
  allowRoleSwap: false,
  resultsFlow: 'localRestart',
};

describe('mode session policy schema', () => {
  it('accepts valid multiplayer and single player policies', () => {
    expect(modeSessionPolicySchema.safeParse(MULTIPLAYER).success).toBe(true);
    expect(modeSessionPolicySchema.safeParse(SINGLE).success).toBe(true);
  });

  it('rejects contradictory combinations', () => {
    const bad = [
      { ...SINGLE, controlScheme: 'assignedRole' },
      { ...SINGLE, networkRequired: true },
      { ...SINGLE, allowRoleSwap: true },
      { ...SINGLE, resultsFlow: 'crewRematchVote' },
      { ...MULTIPLAYER, controlScheme: 'combinedDriverAndGunner' },
      { ...MULTIPLAYER, resultsFlow: 'localRestart' },
    ];
    for (const policy of bad) {
      expect(modeSessionPolicySchema.safeParse(policy).success, JSON.stringify(policy)).toBe(false);
    }
  });

  it('mode schema accepts the shipped modes with explicit policies', () => {
    const pack = loadContentPackFromFilesystem(CONTENT_ROOT);
    const multiplayer = pack.getMode('mode.demoScoreAttack');
    const single = pack.getMode('mode.singlePlayerScoreAttack');
    expect(modeSchema.safeParse(multiplayer).success).toBe(true);
    expect(modeSchema.safeParse(single).success).toBe(true);
    expect(multiplayer.session).toEqual(MULTIPLAYER);
    expect(single.session).toEqual(SINGLE);
  });
});

describe('resolved MatchRules session policy', () => {
  it('exposes distinct policies for multiplayer and single player modes', () => {
    const pack = loadContentPackFromFilesystem(CONTENT_ROOT);
    const mp = MatchRules.fromContentPack(pack, 'none', 'mode.demoScoreAttack');
    const sp = MatchRules.fromContentPack(pack, 'none', 'mode.singlePlayerScoreAttack');
    expect(mp.sessionPolicy).toEqual(MULTIPLAYER);
    expect(sp.sessionPolicy).toEqual(SINGLE);
    expect(mp.modeId).not.toBe(sp.modeId);
  });

  it('legacy client-safe rules default to multiplayer policy', () => {
    expect(MatchRules.fromLegacyConfig('none').sessionPolicy).toEqual(MULTIPLAYER);
  });
});

describe('player-facing mode exposure', () => {
  it('publishes only production Main Stage modes', () => {
    expect(PLAYER_FACING_MODE_IDS).toEqual(['mode.mainStage', 'mode.singlePlayerMainStage']);
    expect(isPlayerFacingModeId('mode.mainStage')).toBe(true);
    expect(isPlayerFacingModeId('mode.singlePlayerMainStage')).toBe(true);
    expect(isPlayerFacingModeId('mode.demoScoreAttack')).toBe(false);
    expect(isPlayerFacingModeId('mode.singlePlayerScoreAttack')).toBe(false);
    expect(isPlayerFacingModeId('mode.truckHunter')).toBe(false);
  });

  it('allows the legacy demo override only under explicit test mode', () => {
    expect(resolveSinglePlayerModeId('demo', false)).toBe('mode.singlePlayerMainStage');
    expect(resolveSinglePlayerModeId('truckHunter', false)).toBe('mode.singlePlayerMainStage');
    expect(resolveSinglePlayerModeId('demo', true)).toBe('mode.singlePlayerScoreAttack');
    expect(resolveSinglePlayerModeId('truckHunter', true)).toBe('mode.singlePlayerMainStage');
  });
});
