// @vitest-environment happy-dom
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { EN_CATALOG, KO_CATALOG } from '../../src/client/localization/catalogs';
import { interpolationTokens } from '../../src/client/localization/interpolate';
import { RuntimeLocalizationService } from '../../src/client/localization/localizationService';
import { SceneActionRegistry } from '../../src/client/presentation/actionRegistry';
import { UiComponentRegistry } from '../../src/client/presentation/componentRegistry';
import { SceneRuntime } from '../../src/client/presentation/sceneRuntime';
import { registerDefaultUiComponents } from '../../src/client/presentation/uiComponents';
import { enemyKey, relicKey, statKey, upgradeKey } from '../../src/client/localization/contentKeys';
import { formatUpgradeEffect } from '../../src/shared/presentation/statPresentation';

const repo = process.cwd();
const enCatalog: Readonly<Record<string, string>> = EN_CATALOG;
const koCatalog: Readonly<Record<string, string>> = KO_CATALOG;
const jsonFiles = (directory: string): Array<Record<string, unknown>> =>
  readdirSync(join(repo, directory))
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(repo, directory, name), 'utf8')) as Record<string, unknown>);

describe('localization catalogs', () => {
  it('keeps English and Korean catalogs complete with interpolation parity', () => {
    expect(Object.keys(KO_CATALOG).sort()).toEqual(Object.keys(EN_CATALOG).sort());
    for (const key of Object.keys(EN_CATALOG)) {
      expect(interpolationTokens(koCatalog[key]!)).toEqual(interpolationTokens(enCatalog[key]!));
    }
  });

  it('covers every relic, upgrade, and enemy presentation identity', () => {
    for (const relic of jsonFiles('content/relics')) {
      expect(enCatalog[relicKey(String(relic.id), 'name')]).toBeTruthy();
      expect(enCatalog[relicKey(String(relic.id), 'description')]).toBeTruthy();
    }
    for (const upgrade of jsonFiles('content/upgrade-categories')) {
      expect(enCatalog[upgradeKey(String(upgrade.id))]).toBeTruthy();
      expect(koCatalog[upgradeKey(String(upgrade.id))]).toBeTruthy();
      for (const effect of upgrade.effects as Array<{ statId: string }>) {
        expect(enCatalog[statKey(effect.statId)]).toBeTruthy();
        expect(koCatalog[statKey(effect.statId)]).toBeTruthy();
      }
    }
    for (const enemy of jsonFiles('content/enemies')) {
      expect(enCatalog[enemyKey(String(enemy.id))]).toBeTruthy();
    }
  });

  it('formats machine-gun fire-rate effects in Korean', () => {
    const service = new RuntimeLocalizationService('ko', { en: EN_CATALOG, ko: KO_CATALOG }, null);
    const translate = (key: string, params?: Record<string, string | number>, fallback?: string) =>
      service.t(key, params, fallback);
    expect(formatUpgradeEffect(
      { statId: 'weapon.mgRate', operation: 'multiply', value: 1.3 },
      translate,
    )).toBe('기관총 연사력\n+30%');
  });

  it('uses 크루 consistently for Korean crew-facing text', () => {
    expect(Object.values(koCatalog).join('\n')).not.toContain('승무원');
    expect(koCatalog['ui.results.rematch']).toBe('다시하기');
    expect(koCatalog['ui.results.leave']).toBe('크루 떠나기');
  });

  it('falls back requested locale to English, then authored copy, and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = new RuntimeLocalizationService('ko', {
      en: { greeting: 'Hello {name}' },
      ko: {},
    }, null);
    expect(service.t('greeting', { name: 'Crew' })).toBe('Hello Crew');
    expect(service.t('authored', {}, 'Authored fallback')).toBe('Authored fallback');
    expect(service.t('missing')).toBe('');
    expect(service.t('missing')).toBe('');
    expect(warn.mock.calls.filter(([message]) => String(message).includes('missing'))).toHaveLength(1);
    warn.mockRestore();
  });

  it('refreshes cached scene literals and formatted bindings without reloading', async () => {
    const root = document.createElement('div');
    const html = { lang: '' };
    const service = new RuntimeLocalizationService('en', {
      en: { title: 'SETTINGS', value: '{0}% BGM' },
      ko: { title: '설정', value: '배경 음악 {0}%' },
    }, html as HTMLElement);
    const registry = new UiComponentRegistry();
    registerDefaultUiComponents(registry);
    const runtime = new SceneRuntime({ actions: new SceneActionRegistry(), registry, localization: service }, root);
    await runtime.load({
      id: 'scene.localized', label: 'Localized', type: 'ui', root: {
        id: 'localized-root', type: 'container', children: [
          { id: 'localized-title', type: 'text', text: 'SETTINGS', textKey: 'title' },
          { id: 'localized-volume', type: 'text', bindings: [{ target: 'text', source: 'volume', format: '{0}% BGM', formatKey: 'value' }] },
        ],
      },
    }, { volume: 72 });
    expect(root.textContent).toContain('SETTINGS');
    expect(root.textContent).toContain('72% BGM');
    service.setLocale('ko');
    expect(html.lang).toBe('ko');
    expect(root.textContent).toContain('설정');
    expect(root.textContent).toContain('배경 음악 72%');
    runtime.dispose();
  });

  it('contains bilingual single-player and multiplayer paths plus Korean responsive rules', () => {
    const required = [
      'ui.main.singlePlayer', 'ui.main.multiplayer', 'ui.lobby.systemReady', 'ui.lobby.readyForWave',
      'ui.results.playAgain', 'ui.results.rematch', 'hud.role.driver', 'hud.role.gunner',
    ];
    for (const key of required) {
      expect(enCatalog[key]).toBeTruthy();
      expect(koCatalog[key]).toBeTruthy();
      expect(koCatalog[key]).not.toBe(enCatalog[key]);
    }
    const foundations = readFileSync(join(repo, 'src/client/ui/foundations.css'), 'utf8');
    const components = readFileSync(join(repo, 'src/client/ui/components.css'), 'utf8');
    expect(foundations).toMatch(/html\[lang=['"]ko['"]\]/);
    expect(foundations).toContain('word-break: keep-all');
    expect(components).toMatch(/@media\s*\(max-width:\s*560px\)/);
  });
});
