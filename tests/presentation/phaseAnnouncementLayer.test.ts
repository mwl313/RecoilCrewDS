// @vitest-environment happy-dom
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PHASE_ANNOUNCEMENT_DURATION_MS,
  PhaseAnnouncementLayer,
  phaseAnnouncementForPhase,
  phaseAnnouncementText,
  type PhaseAnnouncementImpact,
  type PhaseAnnouncementLocale,
} from '../../src/client/presentation/phaseAnnouncementLayer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

class FakeScheduler {
  private next = 1;
  readonly timers = new Map<number, { callback: () => void; durationMs: number }>();

  setTimeout(callback: () => void, durationMs: number): number {
    const handle = this.next++;
    this.timers.set(handle, { callback, durationMs });
    return handle;
  }

  clearTimeout(handle: number): void {
    this.timers.delete(handle);
  }

  runOnly(): void {
    expect(this.timers.size).toBe(1);
    const [handle, timer] = [...this.timers][0];
    this.timers.delete(handle);
    timer.callback();
  }
}

function localization(initial: PhaseAnnouncementLocale = 'en') {
  let locale = initial;
  return {
    locale: () => locale,
    t: (key: string) => phaseAnnouncementText(locale, key.replace('phase.', '') as 'farming' | 'elite' | 'eliteDefeated' | 'final'),
    setLocale: (next: PhaseAnnouncementLocale) => { locale = next; },
  };
}

describe('phase announcement semantic presentation', () => {
  it('maps all six gameplay phases and excludes terminal phases', () => {
    expect([
      'farming1', 'wave1', 'farming2', 'wave2', 'farming3', 'bossWave', 'clear', 'gameOver',
    ].map(phaseAnnouncementForPhase)).toEqual([
      'farming', 'elite', 'eliteDefeated', 'elite', 'eliteDefeated', 'final', null, null,
    ]);
  });

  it('announces every authoritative sequence transition exactly once', () => {
    const impacts: PhaseAnnouncementImpact[] = [];
    const layer = new PhaseAnnouncementLayer(document.createElement('main'), {
      localization: localization(),
      scheduler: new FakeScheduler(),
      onPresent: (impact) => impacts.push(impact),
    });
    layer.beginMatch('match-a', true);

    for (const [phaseSequence, phase] of [
      [0, 'farming1'], [0, 'farming1'], [1, 'wave1'], [1, 'wave1'],
      [2, 'farming2'], [3, 'wave2'], [4, 'farming3'], [5, 'bossWave'],
    ] as const) {
      layer.observe('match-a', { phase, phaseSequence });
    }

    expect(impacts.map((impact) => impact.kind)).toEqual([
      'farming', 'elite', 'eliteDefeated', 'elite', 'eliteDefeated', 'final',
    ]);
    expect(impacts.map((impact) => impact.intensity)).toEqual([0.75, 1, 1, 1, 1, 1.25]);
    expect(layer.diagnostics.sequence).toBe(5);
  });

  it('baselines a reconnect silently, then presents the next genuine transition', () => {
    const impacts: PhaseAnnouncementImpact[] = [];
    const layer = new PhaseAnnouncementLayer(document.createElement('main'), {
      localization: localization(),
      scheduler: new FakeScheduler(),
      onPresent: (impact) => impacts.push(impact),
    });
    layer.beginMatch('match-live', false);
    layer.observe('match-live', { phase: 'wave2', phaseSequence: 3 });
    layer.observe('match-live', { phase: 'wave2', phaseSequence: 3 });
    expect(impacts).toEqual([]);

    layer.observe('match-live', { phase: 'farming3', phaseSequence: 4 });
    expect(impacts.map((impact) => impact.kind)).toEqual(['eliteDefeated']);
  });

  it('resets for a rematch and announces its initial farming phase', () => {
    const impacts: PhaseAnnouncementImpact[] = [];
    const layer = new PhaseAnnouncementLayer(document.createElement('main'), {
      localization: localization(),
      scheduler: new FakeScheduler(),
      onPresent: (impact) => impacts.push(impact),
    });
    layer.beginMatch('match-one', true);
    layer.observe('match-one', { phase: 'farming1', phaseSequence: 0 });
    layer.beginMatch('match-two', true);
    layer.observe('match-two', { phase: 'farming1', phaseSequence: 0 });
    expect(impacts.map((impact) => impact.kind)).toEqual(['farming', 'farming']);
  });

  it('uses localized catalogs and refreshes an active banner without replaying impact', () => {
    const service = localization('en');
    const impacts: PhaseAnnouncementImpact[] = [];
    const host = document.createElement('main');
    const layer = new PhaseAnnouncementLayer(host, {
      localization: service,
      scheduler: new FakeScheduler(),
      onPresent: (impact) => impacts.push(impact),
    });
    layer.beginMatch('locale-match', true);
    layer.observe('locale-match', { phase: 'bossWave', phaseSequence: 0 });
    expect(host.querySelector('.phase-announcement-heading')?.textContent)
      .toBe('THE FINAL WAVE IS INCOMING');

    service.setLocale('ko');
    layer.observe('locale-match', { phase: 'bossWave', phaseSequence: 0 });
    expect(host.querySelector('.phase-announcement-heading')?.textContent)
      .toBe('최종 웨이브 접근 중!');
    expect(layer.element.lang).toBe('ko');
    expect(impacts).toHaveLength(1);
  });

  it('announces the second and third farming phases as elite victories', () => {
    expect(phaseAnnouncementText('en', phaseAnnouncementForPhase('farming2')!))
      .toBe('ELITE MONSTER DEFEATED');
    expect(phaseAnnouncementText('en', phaseAnnouncementForPhase('farming3')!))
      .toBe('ELITE MONSTER DEFEATED');
    expect(phaseAnnouncementText('ko', phaseAnnouncementForPhase('farming2')!))
      .toBe('엘리트 몬스터 처치!');
  });

  it('uses the concise survive-the-hoard opening copy in both locales', () => {
    expect(phaseAnnouncementText('en', 'farming')).toBe('SURVIVE THE HOARD');
    expect(phaseAnnouncementText('ko', 'farming')).toBe('몬스터를 제압하라!');
  });

  it('never intercepts input, attenuates camera intent for reduced motion, and restores HUD state', () => {
    const scheduler = new FakeScheduler();
    const active: boolean[] = [];
    const impacts: PhaseAnnouncementImpact[] = [];
    const layer = new PhaseAnnouncementLayer(document.createElement('main'), {
      localization: localization(),
      scheduler,
      reducedMotion: () => true,
      onPresent: (impact) => impacts.push(impact),
      onActiveChange: (value) => active.push(value),
    });
    layer.preview('elite');

    expect(layer.element.style.pointerEvents).toBe('none');
    expect(layer.element.dataset.reducedMotion).toBe('true');
    expect(layer.element.getAttribute('aria-hidden')).toBe('false');
    expect(impacts[0]).toMatchObject({ kind: 'elite', cameraImpulse: 0.34, reducedMotion: true });
    expect([...scheduler.timers.values()][0].durationMs).toBe(PHASE_ANNOUNCEMENT_DURATION_MS);
    scheduler.runOnly();
    expect(layer.element.getAttribute('aria-hidden')).toBe('true');
    expect(active).toEqual([true, false]);
  });

  it('coordinates duplicate HUD warnings and contains responsive/reduced-motion rules', () => {
    const css = fs.readFileSync(path.join(ROOT, 'src/client/ui/phase-announcement.css'), 'utf8');
    expect(css).toContain('.phase-announcement-presenting .hud-wave-warning');
    expect(css).toContain('.phase-announcement-presenting .hud-phase-label');
    expect(css).toMatch(/font:[^;]*clamp\(29\.4px, 5\.04vw, 75\.6px\)/);
    expect(css).toContain('font-size: clamp(26.6px, 8.4vw, 40.6px)');
    expect(css).toContain('font-size: clamp(23.8px, 7.35vw, 36.4px)');
    expect(css).toContain('@media (max-width: 560px)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('pointer-events: none');
    expect(PHASE_ANNOUNCEMENT_DURATION_MS).toBe(3_700);
    expect(css).toContain('--phase-announcement-duration: 3700ms');
    expect(css).toContain('13.622%, 73.081% { opacity: 1; }');
    expect(css).toContain('animation: phase-announcement-zoom-impact var(--phase-announcement-duration) linear both');
    expect(css).toContain('scale(.12)');
    expect(css).toContain('translate3d(-8px, 2px, 0)');
  });
});
