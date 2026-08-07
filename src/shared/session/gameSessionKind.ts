/** Runtime session kinds (gameplay04). */
export type GameSessionKind = 'multiplayer' | 'singlePlayer';

export type LocalControlScheme = 'assignedRole' | 'combined';

/**
 * Client session context: which session kind is active, whether gameplay is
 * networked, who controls input, and the resolved rules mode id.
 */
export interface GameSessionContext {
  kind: GameSessionKind;
  networked: boolean;
  localControl: LocalControlScheme;
  rulesModeId: string;
}

export const MULTIPLAYER_SESSION: GameSessionContext = {
  kind: 'multiplayer',
  networked: true,
  localControl: 'assignedRole',
  rulesModeId: 'mode.mainStage',
};

export const SINGLE_PLAYER_SESSION: GameSessionContext = {
  kind: 'singlePlayer',
  networked: false,
  localControl: 'combined',
  rulesModeId: 'mode.singlePlayerMainStage',
};

/** Modes that may be presented or selected by the shipping player UI. */
export const PLAYER_FACING_MODE_IDS = [
  MULTIPLAYER_SESSION.rulesModeId,
  SINGLE_PLAYER_SESSION.rulesModeId,
] as const;

export type PlayerFacingModeId = (typeof PLAYER_FACING_MODE_IDS)[number];

export function isPlayerFacingModeId(modeId: string): modeId is PlayerFacingModeId {
  return (PLAYER_FACING_MODE_IDS as readonly string[]).includes(modeId);
}

/** Legacy score attack remains reachable only by explicit test automation. */
export function resolveSinglePlayerModeId(requestedMode: string | null, testMode: boolean): string {
  return testMode && requestedMode === 'demo'
    ? 'mode.singlePlayerScoreAttack'
    : SINGLE_PLAYER_SESSION.rulesModeId;
}
