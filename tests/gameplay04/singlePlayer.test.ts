// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Match } from '../../src/shared/sim/match';
import { createStaticArenaWorld } from '../../src/shared/sim/arenaWorld';
import { CLIENT_CONTENT_PACK } from '../../src/generated/contentPack.generated';
import { PRESENTATION_HUDS, PRESENTATION_SCENES } from '../../src/generated/presentationContent.generated';
import { ACTION_IDS, HUD_BINDING_PATHS, UI_COMPONENT_TYPES } from '../../src/shared/presentation/schemas';
import { SceneFlowPresenter } from '../../src/client/presentation/sceneFlowPresenter';
import { UiComponentRegistry } from '../../src/client/presentation/componentRegistry';
import { registerDefaultUiComponents } from '../../src/client/presentation/uiComponents';
import { InputManager } from '../../src/client/input';
import type { UiNodeInput } from '../../src/shared/presentation/schemas';

function walkUi(node: UiNodeInput, visit: (n: UiNodeInput) => void): void {
  visit(node);
  for (const child of node.children ?? []) walkUi(child, visit);
}

describe('Single Player content mode', () => {
  it('resolves through ContentPack -> Match with the single player mode id', () => {
    const mode = CLIENT_CONTENT_PACK.getMode('mode.singlePlayerScoreAttack');
    expect(mode.session?.kind).toBe('singlePlayer');
    expect(mode.session?.networkRequired).toBe(false);
    expect(mode.session?.controlScheme).toBe('combinedDriverAndGunner');
    expect(mode.session?.allowRoleSwap).toBe(false);
    expect(mode.session?.resultsFlow).toBe('localRestart');

    const match = new Match('single-test', 'none', CLIENT_CONTENT_PACK, createStaticArenaWorld(), 'mode.singlePlayerScoreAttack');
    expect(match.rules.modeId).toBe('mode.singlePlayerScoreAttack');
    expect(match.rules.sessionPolicy.kind).toBe('singlePlayer');
    expect(match.rules.sessionPolicy.resultsFlow).toBe('localRestart');
    expect(match.state.phase).toBe('running');
  });

  it('main menu exposes SINGLE PLAYER with the app.startSinglePlayer action', () => {
    const menu = PRESENTATION_SCENES['scene.mainMenu'];
    let button: UiNodeInput | null = null;
    walkUi(menu.root, (n) => {
      if (n.id === 'main-single') button = n;
    });
    expect(button).not.toBeNull();
    expect(button!.text).toBe('SINGLE PLAYER');
    expect(button!.actions?.[0]?.action).toBe('app.startSinglePlayer');
    expect(ACTION_IDS).toContain('app.startSinglePlayer');
    expect(ACTION_IDS).toContain('app.restartSinglePlayer');
    expect(ACTION_IDS).not.toContain('app.startPractice');
  });

  it('gameplay HUD drops the practice tag and keeps session identity paths', () => {
    const hud = PRESENTATION_HUDS['hud.gameplay'];
    let hasPracticeTag = false;
    let hasRoleChip = false;
    walkUi(hud.root, (n) => {
      if (n.id === 'practice-tag') hasPracticeTag = true;
      if (n.id === 'role-chip') hasRoleChip = true;
    });
    expect(hasPracticeTag).toBe(false);
    expect(hasRoleChip).toBe(true);
    expect(UI_COMPONENT_TYPES).not.toContain('practiceTag');
    expect(HUD_BINDING_PATHS).not.toContain('practice');
    expect(HUD_BINDING_PATHS).toContain('session.showRoleIdentity');
    expect(HUD_BINDING_PATHS).toContain('session.showPeerStatus');
  });

  it('registers start/restart single player actions (no startPractice alias)', () => {
    const container = document.createElement('div');
    const themeRoot = document.createElement('div');
    const registry = new UiComponentRegistry();
    registerDefaultUiComponents(registry);
    const flow = new SceneFlowPresenter(container, themeRoot, registry);
    const started: string[] = [];
    flow.bind({
      onStartSinglePlayer: () => started.push('start'),
      onRestartSinglePlayer: () => started.push('restart'),
    } as never);
    expect(flow.actionRegistry.has('app.startSinglePlayer')).toBe(true);
    expect(flow.actionRegistry.has('app.restartSinglePlayer')).toBe(true);
    expect(flow.actionRegistry.has('app.startPractice')).toBe(false);
    flow.actionRegistry.execute('app.startSinglePlayer');
    flow.actionRegistry.execute('app.restartSinglePlayer');
    expect(started).toEqual(['start', 'restart']);
  });
});

describe('Single Player input', () => {
  it('InputManager has no swap binding or swap state', () => {
    const input = new InputManager() as unknown as Record<string, unknown>;
    expect('consumeSwap' in input).toBe(false);
    expect('swapPressed' in input).toBe(false);
    const state = (input.debugState as () => Record<string, unknown>)() as Record<string, unknown>;
    expect('swapPressed' in state).toBe(false);
  });
});
