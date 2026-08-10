import { LOCALIZATION_CATALOGS } from './catalogs';
import { interpolate } from './interpolate';
import type {
  InterpolationParams,
  Locale,
  LocalizationCatalog,
  LocalizationListener,
  LocalizationService,
} from './localizationTypes';

export function normalizeLocale(value: unknown, fallback: Locale = 'en'): Locale {
  return value === 'ko' || value === 'en' ? value : fallback;
}

export function localeFromNavigator(language = typeof navigator === 'undefined' ? '' : navigator.language): Locale {
  return language.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

export class RuntimeLocalizationService implements LocalizationService {
  private current: Locale;
  private readonly listeners = new Set<LocalizationListener>();
  private readonly warned = new Set<string>();

  constructor(
    locale: Locale,
    private readonly catalogs: Readonly<Record<Locale, LocalizationCatalog>> = LOCALIZATION_CATALOGS,
    private readonly root: Pick<HTMLElement, 'lang'> | null = typeof document === 'undefined' ? null : document.documentElement,
  ) {
    this.current = locale;
    this.applyDocumentLanguage();
  }

  locale(): Locale {
    return this.current;
  }

  setLocale(locale: Locale): void {
    if (locale === this.current) return;
    this.current = locale;
    this.applyDocumentLanguage();
    for (const listener of [...this.listeners]) listener();
  }

  t(key: string, params: InterpolationParams = {}, authoredFallback = ''): string {
    const requested = this.catalogs[this.current]?.[key];
    const english = this.catalogs.en[key];
    const value = requested ?? english ?? authoredFallback;
    if (!value) {
      if (!this.warned.has(key) && typeof console !== 'undefined') {
        this.warned.add(key);
        console.warn(`[localization] Missing translation and authored fallback for ${key}`);
      }
      return '';
    }
    if (requested === undefined && this.current !== 'en' && !this.warned.has(`${this.current}:${key}`)) {
      this.warned.add(`${this.current}:${key}`);
      if (typeof console !== 'undefined') console.warn(`[localization] Missing ${this.current} translation for ${key}; using English fallback`);
    }
    return interpolate(value, params);
  }

  subscribe(listener: LocalizationListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private applyDocumentLanguage(): void {
    if (this.root) this.root.lang = this.current;
  }
}

export function createLocalizationService(
  locale: Locale = localeFromNavigator(),
  catalogs: Readonly<Record<Locale, LocalizationCatalog>> = LOCALIZATION_CATALOGS,
  root?: Pick<HTMLElement, 'lang'> | null,
): RuntimeLocalizationService {
  return new RuntimeLocalizationService(locale, catalogs, root === undefined ? (typeof document === 'undefined' ? null : document.documentElement) : root);
}

// Keep module-level consumers deterministic; the app applies the persisted or
// navigator-derived setting during bootstrap before the first interactive UI.
export const localization = createLocalizationService('en');
