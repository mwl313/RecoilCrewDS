import { PRESENTATION_HUDS, PRESENTATION_THEMES } from '../../generated/presentationContent.generated';
import { SceneActionRegistry } from './actionRegistry';
import { UiComponentRegistry } from './componentRegistry';
import type { UiComponentInstance } from './componentRegistry';
import { SceneRuntime } from './sceneRuntime';
import type { HudViewModel } from './hudViewModel';

/**
 * HudRuntime renders the content-driven gameplay HUD document and applies
 * the projected HudViewModel through cached binding handles. The DOM is
 * built once; updates only mutate changed values.
 */
export class HudRuntime {
  private readonly runtime: SceneRuntime;
  private readonly actions = new SceneActionRegistry();
  private onResume: (() => void) | null = null;
  private onPause: (() => void) | null = null;
  private assetUrlResolver: ((id: string) => string | null) | null = null;
  private readonly themeRoot: HTMLElement;

  constructor(container: HTMLElement, registry: UiComponentRegistry, themeRoot: HTMLElement) {
    this.themeRoot = themeRoot;
    this.actions.register('app.resume', () => this.onResume?.());
    this.actions.register('app.pause', () => this.onPause?.());
    this.runtime = new SceneRuntime(
      {
        actions: this.actions,
        registry,
        addPopup: (text, kind) => this.runtime.dispatch({ type: 'floatText', label: text, kind }),
        resolveAssetUrl: (id) => this.assetUrlResolver?.(id) ?? null,
      },
      container,
    );
    const hud = PRESENTATION_HUDS['hud.gameplay'];
    void this.runtime.load({ id: hud.id, label: hud.label, type: 'gameplayOverlay', root: hud.root });
  }

  setResumeHandler(fn: () => void): void {
    this.onResume = fn;
  }

  setPauseHandler(fn: () => void): void {
    this.onPause = fn;
  }

  setAssetUrlResolver(fn: ((id: string) => string | null) | null): void {
    this.assetUrlResolver = fn;
  }

  get element(): HTMLElement | null {
    return this.runtime.element;
  }

  getNode(id: string): UiComponentInstance | undefined {
    return this.runtime.getNode(id);
  }

  apply(vm: HudViewModel): void {
    this.runtime.setContext(vm as unknown as Record<string, unknown>);
  }

  dispatch(event: { type: string; label?: string; value?: number; kind?: string }): void {
    this.runtime.dispatch(event);
  }

  addPopup(text: string, kind = 'score'): void {
    this.runtime.dispatch({ type: 'floatText', label: text, kind });
  }

  setTheme(themeId: 'driver' | 'gunner' | 'singlePlayer'): void {
    this.themeRoot.dataset.theme = themeId;
    const theme = PRESENTATION_THEMES[themeId === 'driver' ? 'theme.driver' : themeId === 'gunner' ? 'theme.gunner' : 'theme.singlePlayer'];
    for (const [key, value] of Object.entries(theme.cssVariables ?? {})) {
      this.themeRoot.style.setProperty(key, value);
    }
  }

  setVisible(visible: boolean): void {
    this.runtime.element?.classList.toggle('hidden', !visible);
  }

  /**
   * Move the gameplay crosshair to the projected trajectory point (no DOM
   * rebuild). The reticle host (.hud-center) carries a CSS transform, so it
   * is the containing block for a fixed-position child; left/top pixels are
   * therefore NOT viewport-relative. Instead we keep the CSS anchor
   * (50% / 50% of that host, i.e. viewport center / 42% height) and apply a
   * transform offset in viewport pixels. Visibility uses style.visibility so
   * it never fights the HUD projection's `hidden` class.
   */
  setTrajectoryReticle(x: number, y: number, visible: boolean, blocked: boolean): void {
    const crosshair = this.runtime.getNode('crosshair')?.element;
    if (!crosshair) return;
    crosshair.classList.add('reticle');
    crosshair.classList.toggle('blocked', blocked);
    if (!visible || !Number.isFinite(x) || !Number.isFinite(y)) {
      crosshair.style.visibility = 'hidden';
      return;
    }
    const vw = window.innerWidth || 1;
    const vh = window.innerHeight || 1;
    // Edge clamp policy: keep the reticle on-screen when the shot line is
    // slightly outside; fully off-screen results stay hidden above.
    const cx = Math.max(8, Math.min(vw - 8, x));
    const cy = Math.max(8, Math.min(vh - 8, y));
    const dx = cx - vw / 2;
    const dy = cy - vh * 0.42;
    crosshair.style.visibility = 'visible';
    crosshair.style.transform = `translate(-50%, -50%) translate(${Math.round(dx)}px, ${Math.round(dy)}px)`;
  }

  dispose(): void {
    this.runtime.dispose();
  }
}
