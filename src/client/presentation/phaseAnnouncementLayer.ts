import type { StagePhase } from '../../shared/stage/stageTypes';
import { LOCALIZATION_CATALOGS } from '../localization/catalogs';
import { localization as defaultLocalization } from '../localization/localizationService';
import type { Locale, LocalizationService } from '../localization/localizationTypes';

export type PhaseAnnouncementKind = 'farming' | 'elite' | 'eliteDefeated' | 'final';
export type PhaseAnnouncementKey = `phase.${PhaseAnnouncementKind}`;
export type PhaseAnnouncementLocale = Locale;

export interface PhaseAnnouncementStageView {
  phase: string;
  phaseSequence?: number;
}

export interface PhaseAnnouncementImpact {
  kind: PhaseAnnouncementKind;
  intensity: number;
  cameraImpulse: number;
  reducedMotion: boolean;
}

interface PhaseAnnouncementScheduler {
  setTimeout(callback: () => void, durationMs: number): number;
  clearTimeout(handle: number): void;
}

export interface PhaseAnnouncementLayerOptions {
  localization?: Pick<LocalizationService, 'locale' | 't'>;
  reducedMotion?: () => boolean;
  onPresent?: (impact: PhaseAnnouncementImpact) => void;
  onActiveChange?: (active: boolean) => void;
  scheduler?: PhaseAnnouncementScheduler;
}

export const PHASE_ANNOUNCEMENT_DURATION_MS = 2_700;

const IMPACTS: Record<PhaseAnnouncementKind, Omit<PhaseAnnouncementImpact, 'kind' | 'reducedMotion'>> = {
  farming: { intensity: 0.75, cameraImpulse: 0.16 },
  elite: { intensity: 1, cameraImpulse: 0.34 },
  eliteDefeated: { intensity: 1, cameraImpulse: 0.34 },
  final: { intensity: 1.25, cameraImpulse: 0.58 },
};

export function phaseAnnouncementForPhase(phase: StagePhase | string): PhaseAnnouncementKind | null {
  if (phase === 'farming1') return 'farming';
  if (phase === 'farming2' || phase === 'farming3') return 'eliteDefeated';
  if (phase === 'wave1' || phase === 'wave2') return 'elite';
  if (phase === 'bossWave') return 'final';
  return null;
}

export function phaseAnnouncementText(
  locale: PhaseAnnouncementLocale,
  kind: PhaseAnnouncementKind,
): string {
  const key: PhaseAnnouncementKey = `phase.${kind}`;
  return LOCALIZATION_CATALOGS[locale]?.[key] ?? LOCALIZATION_CATALOGS.en[key] ?? '';
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function createScheduler(): PhaseAnnouncementScheduler {
  return {
    setTimeout: (callback, durationMs) => window.setTimeout(callback, durationMs),
    clearTimeout: (handle) => window.clearTimeout(handle),
  };
}

/**
 * View-only phase punctuation. It observes the replicated monotonic sequence;
 * stage progression remains exclusively owned by StageDirector.
 */
export class PhaseAnnouncementLayer {
  readonly element: HTMLElement;
  private readonly heading: HTMLElement;
  private readonly localization: Pick<LocalizationService, 'locale' | 't'>;
  private readonly reducedMotion: () => boolean;
  private readonly scheduler: PhaseAnnouncementScheduler;
  private matchId: string | null = null;
  private lastSequence: number | null = null;
  private hideTimer: number | null = null;
  private activeKind: PhaseAnnouncementKind | null = null;
  private activeLocaleOverride: PhaseAnnouncementLocale | null = null;

  constructor(host: HTMLElement, private readonly options: PhaseAnnouncementLayerOptions = {}) {
    this.localization = options.localization ?? defaultLocalization;
    this.reducedMotion = options.reducedMotion ?? prefersReducedMotion;
    this.scheduler = options.scheduler ?? createScheduler();

    this.element = document.createElement('section');
    this.element.className = 'phase-announcement-layer';
    this.element.dataset.active = 'false';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.setAttribute('aria-live', 'assertive');
    this.element.setAttribute('aria-atomic', 'true');
    this.element.style.pointerEvents = 'none';

    const impact = document.createElement('div');
    impact.className = 'phase-announcement-impact';
    impact.setAttribute('aria-hidden', 'true');

    const frame = document.createElement('div');
    frame.className = 'phase-announcement-frame';
    const slashStart = document.createElement('span');
    slashStart.className = 'phase-announcement-slash phase-announcement-slash--start';
    slashStart.setAttribute('aria-hidden', 'true');
    const slashEnd = document.createElement('span');
    slashEnd.className = 'phase-announcement-slash phase-announcement-slash--end';
    slashEnd.setAttribute('aria-hidden', 'true');
    this.heading = document.createElement('h2');
    this.heading.className = 'phase-announcement-heading';

    frame.append(slashStart, this.heading, slashEnd);
    this.element.append(impact, frame);
    host.appendChild(this.element);
  }

  /** A fresh match may announce sequence 0; reconnects baseline silently. */
  beginMatch(matchId: string, announceInitial: boolean): void {
    this.hide();
    this.matchId = matchId;
    this.lastSequence = announceInitial ? -1 : null;
  }

  observe(matchId: string, stage: PhaseAnnouncementStageView | undefined): void {
    if (!stage || !Number.isInteger(stage.phaseSequence)) return;
    if (this.matchId !== matchId) this.beginMatch(matchId, false);

    const sequence = stage.phaseSequence!;
    if (this.lastSequence === null || sequence < this.lastSequence) {
      this.lastSequence = sequence;
      return;
    }
    if (sequence === this.lastSequence) {
      this.refreshLocale();
      return;
    }

    this.lastSequence = sequence;
    const kind = phaseAnnouncementForPhase(stage.phase);
    if (kind) this.present(kind);
  }

  /** Deterministic browser/design qualification entrypoint. */
  preview(kind: PhaseAnnouncementKind, locale?: PhaseAnnouncementLocale): void {
    this.present(kind, locale);
  }

  get diagnostics(): { active: boolean; kind: PhaseAnnouncementKind | null; sequence: number | null } {
    return {
      active: this.element.dataset.active === 'true',
      kind: this.activeKind,
      sequence: this.lastSequence,
    };
  }

  private present(kind: PhaseAnnouncementKind, localeOverride?: PhaseAnnouncementLocale): void {
    if (this.hideTimer !== null) this.scheduler.clearTimeout(this.hideTimer);
    const locale = localeOverride ?? this.localization.locale();
    const reducedMotion = this.reducedMotion();
    this.activeKind = kind;
    this.activeLocaleOverride = localeOverride ?? null;
    this.heading.textContent = localeOverride
      ? phaseAnnouncementText(localeOverride, kind)
      : this.localization.t(`phase.${kind}`);
    this.element.lang = locale;
    this.element.dataset.locale = locale;
    this.element.dataset.kind = kind;
    this.element.dataset.reducedMotion = String(reducedMotion);
    this.element.dataset.active = 'false';
    this.element.classList.remove('is-active');
    // Restart the authored slam even if a rapid test/rematch replaces a banner.
    void this.element.offsetWidth;
    this.element.dataset.active = 'true';
    this.element.classList.add('is-active');
    this.element.setAttribute('aria-hidden', 'false');
    this.options.onActiveChange?.(true);
    const impact = { kind, reducedMotion, ...IMPACTS[kind] };
    this.options.onPresent?.(impact);
    this.hideTimer = this.scheduler.setTimeout(() => this.hide(), PHASE_ANNOUNCEMENT_DURATION_MS);
  }

  private refreshLocale(): void {
    if (!this.activeKind) return;
    const locale = this.activeLocaleOverride ?? this.localization.locale();
    if (this.element.dataset.locale === locale) return;
    this.element.lang = locale;
    this.element.dataset.locale = locale;
    this.heading.textContent = this.activeLocaleOverride
      ? phaseAnnouncementText(this.activeLocaleOverride, this.activeKind)
      : this.localization.t(`phase.${this.activeKind}`);
  }

  hide(): void {
    if (this.hideTimer !== null) {
      this.scheduler.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    const wasActive = this.element.dataset.active === 'true';
    this.element.dataset.active = 'false';
    this.element.classList.remove('is-active');
    this.element.setAttribute('aria-hidden', 'true');
    this.activeKind = null;
    this.activeLocaleOverride = null;
    if (wasActive) this.options.onActiveChange?.(false);
  }

  dispose(): void {
    this.hide();
    this.element.remove();
  }
}
