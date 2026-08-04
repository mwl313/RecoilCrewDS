import type { LevelCurveDefinition } from '../content/schemas/progression';
import type { MatchState } from '../types';
import { applyXp } from './levelCurve';
import type { ProgressionTelemetry } from './progressionTelemetry';

/**
 * Authoritative team experience. XP is team-shared; each crossed threshold
 * increments the pending level-up queue.
 */
export class TeamExperienceSystem {
  constructor(
    private readonly state: MatchState,
    private readonly curve: LevelCurveDefinition,
    private readonly xpMultiplier: () => number,
    private readonly telemetry: ProgressionTelemetry,
  ) {}

  addXp(rawAmount: number): { gained: number; levelUps: number } {
    if (this.state.phase !== 'running') return { gained: 0, levelUps: 0 };
    const prog = this.state.teamProgression;
    if (prog.level >= (this.curve.maximumLevel ?? Infinity)) return { gained: 0, levelUps: 0 };
    const gained = Math.max(0, Math.round(rawAmount * this.xpMultiplier()));
    if (gained <= 0) return { gained: 0, levelUps: 0 };
    const before = prog.level;
    const result = applyXp(this.curve, prog.level, prog.currentXp, gained);
    prog.level = result.level;
    prog.currentXp = result.currentXp;
    prog.xpForNextLevel = result.xpForNextLevel;
    prog.pendingLevelUps += result.pendingLevelUps;
    prog.totalXpCollected += gained;
    this.telemetry.xpCollectedPerMinute += gained;
    if (result.level > before) this.telemetry.levelUpTimes.push(this.state.time);
    return { gained, levelUps: result.pendingLevelUps };
  }

  consumeLevelUp(): boolean {
    if (this.state.teamProgression.pendingLevelUps <= 0) return false;
    this.state.teamProgression.pendingLevelUps--;
    return true;
  }
}
