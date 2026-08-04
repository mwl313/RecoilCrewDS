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
  rulesModeId: 'mode.demoScoreAttack',
};

export const SINGLE_PLAYER_SESSION: GameSessionContext = {
  kind: 'singlePlayer',
  networked: false,
  localControl: 'combined',
  rulesModeId: 'mode.singlePlayerScoreAttack',
};
