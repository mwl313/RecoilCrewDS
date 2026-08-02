import type { MatchResults, MatchState } from '../types';

export function computeResults(state: MatchState): MatchResults {
  const s = state.stats;
  let grade = 'D';
  if (s.score >= 1500 && s.kills >= 5) grade = 'C';
  if (s.score >= 4000 && s.jackpotFired >= 1) grade = 'B';
  if (s.score >= 8000 && state.combo.best >= 4 && s.links >= 2) grade = 'A';
  if (s.score >= 12000 && s.jackpotFired >= 2) grade = 'S';

  let title = 'Scrap Goblins';
  if (s.wipeouts >= 3) title = 'Airborne Division';
  else if (s.jackpotFired === 0) title = 'Recoil Accountants';
  else if (s.links === 0) title = 'Friendly Fire Department';
  else if (s.ramKills >= 3) title = 'The Brakes Were Optional';
  else if (grade === 'S' || s.score >= 12000) title = 'One Brain, Two Browsers';
  else if (grade === 'A') title = 'Perfectly Coordinated Accident';
  else if (grade === 'B') title = 'Unlicensed Ballistics';
  else if (grade === 'D') title = 'The Brakes Were Optional';

  return {
    score: Math.floor(s.score),
    bestCombo: state.combo.best,
    jackpotFired: s.jackpotFired,
    kills: s.kills,
    scrapCollected: s.scrapCollected,
    links: s.links,
    wipeouts: s.wipeouts,
    grade,
    title,
    modifier: state.modifier,
  };
}
