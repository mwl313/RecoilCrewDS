import type { LevelUpgradeStatSummary } from '../../shared/progression/progressionTypes';
import {
  formatStatAdditive,
  formatStatMultiplier,
  statPresentationMetadata,
  type StatPresentationGroup,
} from '../../shared/presentation/statPresentation';
import type { LocalizationService } from '../localization/localizationTypes';

export type TacticalStatGroup = StatPresentationGroup;

export interface TacticalStatRow {
  statId: string;
  group: TacticalStatGroup;
  label: string;
  primary: string;
  secondary: string;
  effectCount: number;
}

export function statGroup(statId: string): TacticalStatGroup {
  return statPresentationMetadata(statId).group;
}

export function presentLevelUpgradeSummary(
  summary: readonly LevelUpgradeStatSummary[],
  i18n?: Pick<LocalizationService, 't'>,
): TacticalStatRow[] {
  const translate = i18n
    ? (key: string, params?: Record<string, string | number>, fallback?: string) => i18n.t(key, params, fallback)
    : undefined;
  return summary
    .filter((entry) => entry.effectCount > 0)
    .map((entry) => {
      const metadata = statPresentationMetadata(entry.statId, translate);
      const parts: string[] = [];
      if (Math.abs(entry.additiveTotal) > 0.0001) parts.push(formatStatAdditive(entry.statId, entry.additiveTotal));
      if (Math.abs(entry.multiplierProduct - 1) > 0.0001) parts.push(formatStatMultiplier(entry.multiplierProduct));
      const percentage = Math.round(Math.abs(entry.multiplierProduct - 1) * 100);
      const direction = entry.multiplierProduct < 1 && metadata.lowerIsBetterLabel
        ? `${percentage}% ${i18n?.t(`upgrade.${metadata.lowerIsBetterLabel.toLowerCase()}`, {}, metadata.lowerIsBetterLabel) ?? metadata.lowerIsBetterLabel}`
        : entry.multiplierProduct !== 1
          ? `${entry.multiplierProduct >= 1 ? '+' : '−'}${percentage}%`
          : i18n?.t(
              entry.effectCount === 1 ? 'upgrade.count.one' : 'upgrade.count.many',
              { count: entry.effectCount },
              `${entry.effectCount} ${entry.effectCount === 1 ? 'UPGRADE' : 'UPGRADES'}`,
            ) ?? `${entry.effectCount} ${entry.effectCount === 1 ? 'UPGRADE' : 'UPGRADES'}`;
      return {
        statId: entry.statId,
        group: metadata.group,
        label: metadata.label,
        primary: parts.join(' · ') || '—',
        secondary: direction,
        effectCount: entry.effectCount,
      };
    })
    .sort((a, b) => groupOrder(a.group) - groupOrder(b.group) || a.label.localeCompare(b.label));
}

function groupOrder(group: TacticalStatGroup): number {
  return group === 'CREW' ? 0 : group === 'DRIVER' ? 1 : 2;
}
