import { localization } from './localizationService';
import type { LocalizationService } from './localizationTypes';

/** Resolve semantic server error codes locally; the server message is fallback-only. */
export function localizeServerError(
  code: unknown,
  authoredFallback: unknown,
  i18n: Pick<LocalizationService, 't'> = localization,
): string {
  const normalized = typeof code === 'string' ? code.replace(/[^a-z0-9_]/gi, '') : '';
  const fallback = typeof authoredFallback === 'string' ? authoredFallback : i18n.t('error.unknown');
  return normalized ? i18n.t(`error.server.${normalized}`, {}, fallback) : fallback;
}
