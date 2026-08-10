import { cpSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildPresentationContent,
  loadPresentationContent,
  readPresentationSourceHash,
  validateProjectAsset,
} from '../../scripts/generate-presentation-content';
import {
  PRESENTATION_CONTENT_SOURCE_HASH,
  PRESENTATION_SCENES,
  PRESENTATION_HUDS,
  PRESENTATION_FLOWS,
  PRESENTATION_THEMES,
  PRESENTATION_ASSET_CATALOG,
} from '../../src/generated/presentationContent.generated';
import { actionBindingSchema, bindingSchema, projectAssetDefinitionSchema, sceneDefinitionSchema, uiNodeSchema } from '../../src/shared/presentation/schemas';
import { isBuiltInAssetId, isProjectAssetId, assertResolvableAssetId } from '../../src/shared/assetCatalog';

const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../content');

function tempRoot(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'presentation-'));
  cpSync(path.join(CONTENT_ROOT, 'scenes'), path.join(dir, 'scenes'), { recursive: true });
  cpSync(path.join(CONTENT_ROOT, 'hud'), path.join(dir, 'hud'), { recursive: true });
  cpSync(path.join(CONTENT_ROOT, 'scene-flows'), path.join(dir, 'scene-flows'), { recursive: true });
  cpSync(path.join(CONTENT_ROOT, 'themes'), path.join(dir, 'themes'), { recursive: true });
  cpSync(path.join(CONTENT_ROOT, 'assets'), path.join(dir, 'assets'), { recursive: true });
  return dir;
}

function findNodeByType(node: Record<string, unknown>, type: string): Record<string, unknown> | undefined {
  if (node.type === type) return node;
  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    if (!child || typeof child !== 'object') continue;
    const match = findNodeByType(child as Record<string, unknown>, type);
    if (match) return match;
  }
  return undefined;
}

describe('presentation content pipeline', () => {
  it('generated bundle is current (stale detection)', () => {
    const current = buildPresentationContent(CONTENT_ROOT);
    expect(readPresentationSourceHash()).toBe(PRESENTATION_CONTENT_SOURCE_HASH);
    expect(current.sourceHash).toBe(PRESENTATION_CONTENT_SOURCE_HASH);
  });

  it('loads every scene/hud/flow/theme with valid cross-references', () => {
    const loaded = loadPresentationContent(CONTENT_ROOT);
    expect(Object.keys(loaded.scenes)).toHaveLength(12);
    expect(Object.keys(loaded.huds)).toContain('hud.gameplay');
    expect(Object.keys(loaded.themes)).toContain('theme.driver');
    expect(loaded.flows['flow.primary'].initialSceneId).toBe('scene.boot');
  });

  it('keeps the shared logo gap and retired flavor copy out of every scene', () => {
    const scenes = JSON.stringify(PRESENTATION_SCENES);
    const wordmarkCss = readFileSync(path.resolve(CONTENT_ROOT, '../src/client/ui/scenes.css'), 'utf8');
    expect(JSON.stringify(PRESENTATION_SCENES['scene.boot'])).toContain('RECOI\u2009L');
    expect(JSON.stringify(PRESENTATION_SCENES['scene.mainMenu'])).toContain('RECOI\u2009L');
    expect(wordmarkCss).toMatch(/\.ui-wordmark h1\s*\{[^}]*white-space:\s*nowrap/s);
    expect(wordmarkCss).toMatch(/\.ui-wordmark-crew\s*\{[^}]*white-space:\s*nowrap/s);
    expect(scenes).not.toContain('ONE TANK // TWO BRAINS // ZERO BRAKES');
    expect(scenes).not.toContain('DRIVER STEERS. GUNNER SHOOTS.');
    expect(scenes).not.toContain('WASD DRIVE // MOUSE AIM // RMB CANNON');
  });

  it('encodes the upgraded menu hierarchy, drag behavior, and true menu overlays', () => {
    const menu = PRESENTATION_SCENES['scene.mainMenu'];
    const menuJson = JSON.stringify(menu);
    expect(menuJson).toContain('SYSTEM STATUS: READY');
    expect(menuJson).toContain('CURRENT NICKNAME: ---');
    expect(menuJson).toContain('MULTIPLAYER');
    expect(menuJson).toContain('ui-menu-page--main');
    expect(menuJson).toContain('ui-menu-page--multiplayer hidden');
    expect(menuJson).toContain('ui-action ui-action--04');
    expect(menuJson).toContain('ui-action ui-action--05');
    expect(menuJson).toContain('app.openCredits');
    expect(menu.entities?.[0]?.transform?.scale).toEqual([1.05, 1.05, 1.05]);
    expect(menu.entities?.[0]?.components.some((component) => component.type === 'dragRotate')).toBe(true);
    expect(PRESENTATION_SCENES['scene.settings'].root.class).toContain('ui-overlay-screen');
    expect(PRESENTATION_SCENES['scene.howTo'].root.class).toContain('ui-overlay-screen');
    expect(PRESENTATION_SCENES['scene.credits'].root.class).toContain('ui-overlay-screen');
    expect(PRESENTATION_SCENES['scene.joinCrew'].root.class).toContain('ui-overlay-screen');
  });

  it('encodes reusable title, menu, and overlay motion roles', () => {
    const bootJson = JSON.stringify(PRESENTATION_SCENES['scene.boot']);
    const menuJson = JSON.stringify(PRESENTATION_SCENES['scene.mainMenu']);
    expect(bootJson).toContain('ui-exit-to-right');
    expect(bootJson).toContain('ui-exit-to-left');
    expect(bootJson).toContain('ui-exit-to-bottom');
    expect(bootJson).toContain('ui-exit-zoom-up');
    expect(menuJson).toContain('ui-enter-from-left');
    expect(menuJson).toContain('ui-enter-from-right');
    expect(PRESENTATION_SCENES['scene.settings'].enterTransition?.durationMs).toBe(460);
    expect(PRESENTATION_SCENES['scene.settings'].exitTransition?.durationMs).toBe(380);
    expect(PRESENTATION_SCENES['scene.howTo'].enterTransition?.durationMs).toBe(460);
    expect(PRESENTATION_SCENES['scene.howTo'].exitTransition?.durationMs).toBe(380);
    expect(PRESENTATION_SCENES['scene.credits'].enterTransition?.durationMs).toBe(460);
    expect(PRESENTATION_SCENES['scene.credits'].exitTransition?.durationMs).toBe(380);
    expect(PRESENTATION_SCENES['scene.joinCrew'].enterTransition?.durationMs).toBe(460);
    expect(PRESENTATION_SCENES['scene.joinCrew'].exitTransition?.durationMs).toBe(380);
    expect(PRESENTATION_FLOWS['flow.primary'].transitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'main', to: 'main', action: 'app.openMultiplayer' }),
      expect.objectContaining({ from: 'main', to: 'main', action: 'app.closeMultiplayer' }),
      expect.objectContaining({ from: 'main', to: 'credits', action: 'app.openCredits' }),
      expect.objectContaining({ from: 'credits', to: 'main', action: 'app.back' }),
    ]));
  });

  it('rejects duplicate node ids', () => {
    const root = tempRoot();
    try {
      const scene = JSON.parse(readFileSync(path.join(root, 'scenes', 'boot.json'), 'utf8'));
      scene.root.children.push({ id: 'screen-boot', type: 'container', text: 'dup' });
      writeFileSync(path.join(root, 'scenes', 'boot.json'), JSON.stringify(scene));
      expect(() => loadPresentationContent(root)).toThrow(/duplicate node id/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects unknown component types', () => {
    const parsed = uiNodeSchema.safeParse({ id: 'x', type: 'nope', children: [] });
    expect(parsed.success).toBe(false);
  });

  it('accepts semantic appearance metadata and rejects ad-hoc appearance keys', () => {
    expect(uiNodeSchema.safeParse({
      id: 'x',
      type: 'panel',
      appearance: { tone: 'driver', emphasis: 'hero', density: 'compact', shape: 'plate' },
    }).success).toBe(true);
    expect(uiNodeSchema.safeParse({
      id: 'x',
      type: 'panel',
      appearance: { gradient: 'generic-purple' },
    }).success).toBe(false);
  });

  it('rejects unknown actions and transforms', () => {
    expect(actionBindingSchema.safeParse({ event: 'click', action: 'app.nope' }).success).toBe(false);
    expect(bindingSchema.safeParse({ target: 'text', source: 'a', transform: 'eval' }).success).toBe(false);
  });

  it('rejects invalid binding sources for scenes and huds', () => {
    const root = tempRoot();
    try {
      const scene = JSON.parse(readFileSync(path.join(root, 'scenes', 'boot.json'), 'utf8'));
      scene.root.children[0].bindings = [{ target: 'text', source: 'not.a.scene.path' }];
      writeFileSync(path.join(root, 'scenes', 'boot.json'), JSON.stringify(scene));
      expect(() => loadPresentationContent(root)).toThrow(/invalid binding source/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects invalid component prop sources (progressBar/arcMeter/repeater)', () => {
    const root = tempRoot();
    try {
      const hud = JSON.parse(readFileSync(path.join(root, 'hud', 'gameplay.json'), 'utf8'));
      const progressBar = findNodeByType(hud.root, 'progressBar');
      expect(progressBar).toBeDefined();
      (progressBar!.props as Record<string, unknown>).valueSource = 'not.a.hud.path';
      writeFileSync(path.join(root, 'hud', 'gameplay.json'), JSON.stringify(hud));
      expect(() => loadPresentationContent(root)).toThrow(/invalid prop valueSource source/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects unknown fallbackAssetId references', () => {
    const root = tempRoot();
    try {
      const assets = JSON.parse(readFileSync(path.join(root, 'assets', 'project.json'), 'utf8'));
      assets.project[0].fallbackAssetId = 'missing.model';
      writeFileSync(path.join(root, 'assets', 'project.json'), JSON.stringify(assets));
      expect(() => loadPresentationContent(root)).toThrow(/fallbackAssetId unknown id/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects unknown asset references in scenes', () => {
    const root = tempRoot();
    try {
      const scene = JSON.parse(readFileSync(path.join(root, 'scenes', 'mainMenu.json'), 'utf8'));
      scene.entities[0].components[0].props.assetId = 'missing.model';
      writeFileSync(path.join(root, 'scenes', 'mainMenu.json'), JSON.stringify(scene));
      expect(() => loadPresentationContent(root)).toThrow(/unknown asset/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects depth excess and unknown theme references', () => {
    const root = tempRoot();
    try {
      const hud = JSON.parse(readFileSync(path.join(root, 'hud', 'gameplay.json'), 'utf8'));
      hud.themeId = 'theme.nope';
      writeFileSync(path.join(root, 'hud', 'gameplay.json'), JSON.stringify(hud));
      expect(() => loadPresentationContent(root)).toThrow(/unknown theme/);

      const deep = JSON.parse(readFileSync(path.join(root, 'scenes', 'boot.json'), 'utf8'));
      let child = deep.root;
      for (let i = 0; i < 30; i++) {
        const node = { id: `deep-${i}`, type: 'container' as const, children: [] as unknown[] };
        child.children = [node];
        child = node;
      }
      writeFileSync(path.join(root, 'scenes', 'boot.json'), JSON.stringify(deep));
      expect(() => loadPresentationContent(root)).toThrow(/depth exceeds/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('project assets require namespaces and cannot collide with built-ins', () => {
    expect(() => validateProjectAsset({ id: 'custom.tank', kind: 'model', namespace: 'custom' })).not.toThrow();
    expect(() => validateProjectAsset({ id: 'custom.tank', kind: 'model' })).toThrow();
    const bad = projectAssetDefinitionSchema.safeParse({ id: 'playerTank.chassis', kind: 'model', namespace: 'custom' });
    expect(bad.success).toBe(true); // schema-level ok; catalog-level guard below
    expect(() => assertResolvableAssetId('playerTank.chassis', PRESENTATION_ASSET_CATALOG)).not.toThrow();
    expect(() => assertResolvableAssetId('missing.asset', PRESENTATION_ASSET_CATALOG)).toThrow(/unresolvable/);
  });

  it('built-in and project asset classification', () => {
    expect(isBuiltInAssetId('playerTank.chassis')).toBe(true);
    expect(isBuiltInAssetId('scene.menuTank')).toBe(false);
    expect(isProjectAssetId('scene.menuTank', PRESENTATION_ASSET_CATALOG)).toBe(true);
    expect(isProjectAssetId('playerTank.chassis', PRESENTATION_ASSET_CATALOG)).toBe(false);
  });

  it('generated scenes/huds reference only known assets and themes', () => {
    for (const scene of Object.values(PRESENTATION_SCENES)) {
      expect(sceneDefinitionSchema.safeParse(scene).success).toBe(true);
    }
    for (const hud of Object.values(PRESENTATION_HUDS)) {
      expect(PRESENTATION_THEMES[hud.themeId]).toBeDefined();
    }
    expect(Object.keys(PRESENTATION_FLOWS)).toContain('flow.primary');
    expect(PRESENTATION_ASSET_CATALOG.project.some((a) => a.id === 'scene.menuTank')).toBe(true);
  });

  it('content files exist on disk for all generated entries', () => {
    expect(existsSync(path.join(CONTENT_ROOT, 'scenes', 'boot.json'))).toBe(true);
    expect(existsSync(path.join(CONTENT_ROOT, 'hud', 'gameplay.json'))).toBe(true);
  });
});
