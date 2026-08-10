export const SUPPORTED_LOCALES = ['en', 'ko'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type InterpolationParams = Readonly<Record<string, string | number>>;
export type LocalizationCatalog = Readonly<Record<string, string>>;
export type LocalizationListener = () => void;

export interface LocalizationService {
  locale(): Locale;
  setLocale(locale: Locale): void;
  t(key: string, params?: InterpolationParams, authoredFallback?: string): string;
  subscribe(listener: LocalizationListener): () => void;
}
