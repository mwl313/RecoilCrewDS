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
  private readonly themeRoot: HTMLElement;

  constructor(container: HTMLElement, registry: UiComponentRegistry, themeRoot: HTMLElement) {
    this.themeRoot = themeRoot;
    this.actions.register('app.resume', () => this.onResume?.());
    this.runtime = new SceneRuntime(
      {
        actions: this.actions,
        registry,
        addPopup: (text, kind) => this.runtime.dispatch({ type: 'floatText', label: text, kind }),
      },
      container,
    );
    const hud = PRESENTATION_HUDS['hud.gameplay'];
    void this.runtime.load({ id: hud.id, label: hud.label, type: 'gameplayOverlay', root: hud.root });
  }

  setResumeHandler(fn: () => void): void {
    this.onResume = fn;
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

  setTheme(role: 'driver' | 'gunner'): void {
    this.themeRoot.dataset.theme = role;
    const theme = PRESENTATION_THEMES[role === 'driver' ? 'theme.driver' : 'theme.gunner'];
    for (const [key, value] of Object.entries(theme.cssVariables ?? {})) {
      this.themeRoot.style.setProperty(key, value);
    }
  }

  setVisible(visible: boolean): void {
    this.runtime.element?.classList.toggle('hidden', !visible);
  }

  dispose(): void {
    this.runtime.dispose();
  }
}
