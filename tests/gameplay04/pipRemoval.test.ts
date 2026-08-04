import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('PIP removal (gameplay04)', () => {
  it('PipRenderer and PipCamera modules no longer exist', () => {
    expect(existsSync(path.join(ROOT, 'src/client/app/pipRenderer.ts'))).toBe(false);
    expect(existsSync(path.join(ROOT, 'src/client/cameras.ts'))).toBe(false);
  });

  it('GameClient has no PIP wiring', () => {
    const gc = read('src/client/app/gameClient.ts');
    expect(gc).not.toMatch(/PipRenderer/);
    expect(gc).not.toMatch(/this\.pip/);
    expect(gc).not.toMatch(/pip\.update/);
  });

  it('RenderWorld has no PIP viewport methods and counts renders', () => {
    const rw = read('src/client/app/renderWorld.ts');
    expect(rw).not.toMatch(/renderWithCamera/);
    expect(rw).not.toMatch(/resetViewport/);
    expect(rw).toMatch(/renderCount/);
  });

  it('HUD content, bindings, view model, components, and styles have no PIP', () => {
    const hud = read('content/hud/gameplay.json');
    expect(hud).not.toMatch(/"pip"/);
    expect(hud).not.toMatch(/FEED/);
    const schemas = read('src/shared/presentation/schemas.ts');
    expect(schemas).not.toMatch(/pipFrame/);
    expect(schemas).not.toMatch(/'pip\./);
    const vm = read('src/client/presentation/hudViewModel.ts');
    expect(vm).not.toMatch(/pip:/);
    expect(vm).not.toMatch(/partnerAction/);
    const ui = read('src/client/presentation/uiComponents.ts');
    expect(ui).not.toMatch(/pipFrame/);
    const css = read('src/client/styles.css');
    expect(css).not.toMatch(/\.pip/);
  });

  it('quality/tuning/metrics have no PIP knobs', () => {
    const q = read('src/client/app/qualityManager.ts');
    expect(q).not.toMatch(/setPipRate/);
    expect(q).not.toMatch(/setPipScale/);
    const t = read('src/shared/net/tuning.ts');
    expect(t).not.toMatch(/pip:/);
    const m = read('src/client/netcode/netcodeMetrics.ts');
    expect(m).not.toMatch(/pipRenderMs/);
  });
});
