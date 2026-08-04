import type { MatchResults, MatchState } from '../types';

export interface GradeRule {
  grade: 'D' | 'C' | 'B' | 'A' | 'S';
  minScore: number;
  require?: {
    kills?: number;
    fullChargeShots?: number;
    bestCombo?: number;
    links?: number;
  };
}

export interface TitleRule {
  id: string;
  text: string;
  require?: {
    wipeouts?: number;
    chargedCannonShots?: number;
    fullChargeShots?: number;
    links?: number;
    dashKills?: number;
    minScore?: number;
    grade?: 'D' | 'C' | 'B' | 'A' | 'S';
  };
}

/**
 * Single source of truth for the Demo grade/title rules. The Phase 1 content
 * file content/results/demoScoreAttack.json mirrors these values; the
 * legacy rules bundle is synthesized from these constants so the client-safe
 * Match path and the server content path can never diverge.
 */
export const DEMO_GRADE_RULES: readonly GradeRule[] = [
  { grade: 'S', minScore: 12000, require: { fullChargeShots: 2 } },
  { grade: 'A', minScore: 8000, require: { bestCombo: 4, links: 2 } },
  { grade: 'B', minScore: 4000, require: { fullChargeShots: 1 } },
  { grade: 'C', minScore: 1500, require: { kills: 5 } },
  { grade: 'D', minScore: 0 },
];

export const DEMO_TITLE_RULES: readonly TitleRule[] = [
  { id: 'title.airborneDivision', text: 'Airborne Division', require: { wipeouts: 3 } },
  { id: 'title.recoilAccountants', text: 'Recoil Accountants', require: { fullChargeShots: 0 } },
  { id: 'title.friendlyFire', text: 'Friendly Fire Department', require: { links: 0 } },
  { id: 'title.brakesOptional', text: 'The Brakes Were Optional', require: { dashKills: 3 } },
  { id: 'title.oneBrain', text: 'One Brain, Two Browsers', require: { minScore: 12000 } },
  { id: 'title.perfectlyCoordinated', text: 'Perfectly Coordinated Accident', require: { grade: 'A' } },
  { id: 'title.unlicensed', text: 'Unlicensed Ballistics', require: { grade: 'B' } },
  { id: 'title.brakesOptionalD', text: 'The Brakes Were Optional', require: { grade: 'D' } },
  { id: 'title.scrapGoblins', text: 'Scrap Goblins', require: {} },
];

export function computeResults(state: MatchState): MatchResults {
  const s = state.stats;
  const grade = gradeFromRules(state, DEMO_GRADE_RULES);
  const title = titleFromRules(state, grade, DEMO_TITLE_RULES);

  return {
    score: Math.floor(s.score),
    bestCombo: state.combo.best,
    chargedCannonShots: s.chargedCannonShots,
    fullChargeShots: s.fullChargeShots,
    kills: s.kills,
    scrapCollected: s.scrapCollected,
    links: s.links,
    wipeouts: s.wipeouts,
    grade,
    title,
    modifier: state.modifier,
  };
}

export function gradeFromRules(state: MatchState, rules: readonly GradeRule[]): 'D' | 'C' | 'B' | 'A' | 'S' {
  for (const rule of rules) {
    if (rule.minScore > state.stats.score) continue;
    if (rule.require?.kills !== undefined && state.stats.kills < rule.require.kills) continue;
    if (rule.require?.fullChargeShots !== undefined && state.stats.fullChargeShots < rule.require.fullChargeShots) continue;
    if (rule.require?.bestCombo !== undefined && state.combo.best < rule.require.bestCombo) continue;
    if (rule.require?.links !== undefined && state.stats.links < rule.require.links) continue;
    return rule.grade;
  }
  return 'D';
}

export function titleFromRules(
  state: MatchState,
  grade: 'D' | 'C' | 'B' | 'A' | 'S',
  rules: readonly TitleRule[],
): string {
  for (const rule of rules) {
    const req = rule.require ?? {};
    if (req.wipeouts !== undefined && state.stats.wipeouts < req.wipeouts) continue;
    if (req.chargedCannonShots !== undefined && state.stats.chargedCannonShots !== req.chargedCannonShots) continue;
    if (req.fullChargeShots !== undefined && state.stats.fullChargeShots !== req.fullChargeShots) continue;
    if (req.links !== undefined && state.stats.links !== req.links) continue;
    if (req.dashKills !== undefined && state.stats.dashKills < req.dashKills) continue;
    if (req.minScore !== undefined && state.stats.score < req.minScore) continue;
    if (req.grade !== undefined && grade !== req.grade) continue;
    return rule.text;
  }
  return 'Scrap Goblins';
}
