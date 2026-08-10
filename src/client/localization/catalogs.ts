import enUi from '../../../content/locales/en/ui.json';
import enHud from '../../../content/locales/en/hud.json';
import enRelics from '../../../content/locales/en/relics.json';
import enUpgrades from '../../../content/locales/en/upgrades.json';
import enEnemies from '../../../content/locales/en/enemies.json';
import enErrors from '../../../content/locales/en/errors.json';
import enPhase from '../../../content/locales/en/phase.json';
import koUi from '../../../content/locales/ko/ui.json';
import koHud from '../../../content/locales/ko/hud.json';
import koRelics from '../../../content/locales/ko/relics.json';
import koUpgrades from '../../../content/locales/ko/upgrades.json';
import koEnemies from '../../../content/locales/ko/enemies.json';
import koErrors from '../../../content/locales/ko/errors.json';
import koPhase from '../../../content/locales/ko/phase.json';
import type { Locale, LocalizationCatalog } from './localizationTypes';

export const EN_CATALOG = {
  ...enUi,
  ...enHud,
  ...enRelics,
  ...enUpgrades,
  ...enEnemies,
  ...enErrors,
  ...enPhase,
} as const;

export const KO_CATALOG = {
  ...koUi,
  ...koHud,
  ...koRelics,
  ...koUpgrades,
  ...koEnemies,
  ...koErrors,
  ...koPhase,
} as const;

export type LocalizationKey = keyof typeof EN_CATALOG;

export const LOCALIZATION_CATALOGS: Readonly<Record<Locale, LocalizationCatalog>> = {
  en: EN_CATALOG,
  ko: KO_CATALOG,
};
