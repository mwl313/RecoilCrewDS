import type { MatchRules } from '../../rules/matchRules';
import type { MatchState, SimEvent } from '../../types';
import { RoundSystem } from './roundSystem';
import { ObjectiveSystem } from './objectiveSystem';
import { ScoreSystem } from './scoreSystem';
import { ComboSystem } from './comboSystem';
import { JackpotSystem } from './jackpotSystem';
import { ResultSystem } from './resultSystem';

/**
 * Match-scoped context shared by the extracted systems. Systems mutate
 * `state` directly (authoritative simulation) and push typed events in the
 * exact order the legacy Match did.
 */
export interface SystemContext {
  state: MatchState;
  rules: MatchRules;
  events: SimEvent[];
  round: RoundSystem;
  objective: ObjectiveSystem;
  score: ScoreSystem;
  combo: ComboSystem;
  jackpot: JackpotSystem;
  results: ResultSystem;
}

export function pushEvent(
  ctx: SystemContext,
  type: SimEvent['type'],
  x?: number,
  y?: number,
  z?: number,
  extra?: Partial<SimEvent>,
): void {
  ctx.events.push({ type, t: ctx.state.time, x, y, z, ...extra });
}

export function createSystemContext(state: MatchState, rules: MatchRules, events: SimEvent[]): SystemContext {
  const ctx = {} as SystemContext;
  ctx.state = state;
  ctx.rules = rules;
  ctx.events = events;
  ctx.round = new RoundSystem(ctx);
  ctx.objective = new ObjectiveSystem(ctx);
  ctx.score = new ScoreSystem(ctx);
  ctx.combo = new ComboSystem(ctx);
  ctx.jackpot = new JackpotSystem(ctx);
  ctx.results = new ResultSystem(ctx);
  return ctx;
}
