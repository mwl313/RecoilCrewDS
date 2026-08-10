import { gradeFromRules, titleRuleFromRules, type GradeRule, type TitleRule } from '../results';
import type { MatchResults } from '../../types';
import type { SystemContext } from './systemContext';

/**
 * ResultSystem selects grades/titles from the mode's results definition
 * (content on the server path, legacy constants on the client path). Both
 * are parity-tested against computeResults.
 */
export class ResultSystem {
  constructor(private readonly ctx: SystemContext) {}

  compute(): MatchResults {
    const s = this.ctx.state;
    const rules = this.ctx.rules.results;
    const grade = gradeFromRules(s, rules.grades as unknown as GradeRule[]);
    const titleRule = titleRuleFromRules(s, grade, rules.titles as unknown as TitleRule[]);
    return {
      score: Math.floor(s.stats.score),
      bestCombo: s.combo.best,
      chargedCannonShots: s.stats.chargedCannonShots,
      fullChargeShots: s.stats.fullChargeShots,
      kills: s.stats.kills,
      scrapCollected: s.stats.scrapCollected,
      links: s.stats.links,
      wipeouts: s.stats.wipeouts,
      grade,
      titleId: titleRule.id,
      title: titleRule.text,
      modifier: s.modifier,
    };
  }
}
