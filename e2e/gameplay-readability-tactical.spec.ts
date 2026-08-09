import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
  { width: 800, height: 720 },
  { width: 560, height: 720 },
] as const;

test('tactical drawer preserves gameplay and presents real arena intelligence responsively', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?test=1&nodebug=1&map=urban400');
  await page.click('#screen-boot');
  await page.click('#screen-main [data-act="single"]');
  await page.waitForFunction(() =>
    (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state()?.phase === 'running',
  );
  await page.click('#game-canvas');
  await page.waitForFunction(() =>
    (window as unknown as { __recoil: { inputState(): { locked: boolean } } }).__recoil.inputState().locked,
  );

  // A damaged enemy paints both its exact hit value and its partial HP bar
  // into the one pooled world-UI canvas.
  await page.evaluate(() => {
    const hooks = (window as unknown as {
      __recoil: {
        state(): { tank: { x: number; z: number } };
        monsterSpawn(defId: string, x: number, z: number): number;
        monster: { damage(id: number, amount: number): number };
      };
    }).__recoil;
    const tank = hooks.state().tank;
    const id = hooks.monsterSpawn('enemy.testHound', tank.x, tank.z + 7);
    hooks.monster.damage(id, 2);
  });
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#enemy-world-ui');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return false;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) return true;
    return false;
  });

  const closedAssembly = await page.locator('#tactical-drawer').evaluate((root) => {
    const panel = root.querySelector<HTMLElement>('.tactical-drawer__panel')!;
    const nub = root.querySelector<HTMLElement>('.tactical-drawer__nub')!;
    const panelRect = panel.getBoundingClientRect();
    const nubRect = nub.getBoundingClientRect();
    return {
      opacity: getComputedStyle(root).opacity,
      panelRight: panelRect.right,
      nubLeft: nubRect.left,
      nubRight: nubRect.right,
      nubPointerEvents: getComputedStyle(nub).pointerEvents,
      nubAriaHidden: nub.getAttribute('aria-hidden'),
    };
  });
  expect(Number(closedAssembly.opacity)).toBe(1);
  expect(closedAssembly.panelRight).toBeLessThanOrEqual(1);
  expect(closedAssembly.nubLeft).toBeCloseTo(0, 0);
  expect(closedAssembly.nubRight).toBeGreaterThan(30);
  expect(closedAssembly.nubPointerEvents).toBe('none');
  expect(closedAssembly.nubAriaHidden).toBe('true');

  const before = await page.evaluate(() =>
    (window as unknown as { __recoil: { state(): { time: number } } }).__recoil.state().time,
  );
  await page.keyboard.press('Tab');
  await expect(page.locator('#tactical-drawer')).toHaveClass(/is-open/);
  await expect(page.locator('#enemy-world-ui')).toHaveCount(1);
  await expect(page.locator('#tactical-minimap')).toHaveCount(1);
  await page.waitForTimeout(450);
  const openAssembly = await page.locator('#tactical-drawer').evaluate((root) => {
    const panelRect = root.querySelector<HTMLElement>('.tactical-drawer__panel')!.getBoundingClientRect();
    const nubRect = root.querySelector<HTMLElement>('.tactical-drawer__nub')!.getBoundingClientRect();
    return { panelRight: panelRect.right, nubLeft: nubRect.left };
  });
  expect(openAssembly.nubLeft).toBeCloseTo(openAssembly.panelRight, 0);
  const openState = await page.evaluate(() => {
    const hooks = (window as unknown as {
      __recoil: {
        state(): { time: number };
        inputState(): { locked: boolean; context: string };
        tactical(): { open: boolean; chassisYaw: number };
        quality(): { skySource: string; apron: { enabled: boolean; instances: number; castsShadows: boolean } };
      };
    }).__recoil;
    return { state: hooks.state(), input: hooks.inputState(), tactical: hooks.tactical(), quality: hooks.quality() };
  });
  expect(openState.state.time).toBeGreaterThan(before + .2);
  expect(openState.input).toMatchObject({ locked: true, context: 'gameplay' });
  expect(openState.tactical.open).toBe(true);
  expect(Number.isFinite(openState.tactical.chassisYaw)).toBe(true);
  expect(openState.quality.apron).toMatchObject({ enabled: true, castsShadows: false });
  expect(openState.quality.apron.instances).toBeGreaterThan(0);
  expect(['procedural', 'authored']).toContain(openState.quality.skySource);

  const apronTiming = await page.evaluate(async () => {
    const hooks = (window as unknown as {
      __recoil: {
        setApronEnabled(enabled: boolean): void;
        quality(): Record<string, unknown>;
      };
    }).__recoil;
    const sample = async (enabled: boolean) => {
      hooks.setApronEnabled(enabled);
      for (let i = 0; i < 12; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const values: number[] = [];
      let previous = performance.now();
      for (let i = 0; i < 48; i++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const now = performance.now();
        values.push(now - previous);
        previous = now;
      }
      values.sort((a, b) => a - b);
      return { rafP50: values[Math.floor(values.length / 2)], diagnostics: hooks.quality() };
    };
    const off = await sample(false);
    const on = await sample(true);
    return { off, on, costRatio: (on.rafP50 - off.rafP50) / Math.max(.001, off.rafP50) };
  });
  expect(apronTiming.costRatio).toBeLessThanOrEqual(.2);
  console.info(`[apron-diagnostics] ${JSON.stringify(apronTiming)}`);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    const bounds = await page.locator('#tactical-drawer').evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, scrollWidth: document.documentElement.scrollWidth };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(viewport.width);
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.bottom).toBeLessThanOrEqual(viewport.height);
    expect(bounds.scrollWidth).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: testInfo.outputPath(`tactical-${viewport.width}x${viewport.height}.png`) });
  }

  // Progression owns the screen and closes the drawer; the selected effect
  // then appears in the authoritative level-up-only summary on reopen.
  await page.evaluate(() =>
    (window as unknown as { __recoil: { progression: { xp(value: number): void } } }).__recoil.progression.xp(20),
  );
  await page.waitForFunction(() =>
    (window as unknown as { __recoil: { state(): { matchFlow: string } } }).__recoil.state().matchFlow === 'upgradeSelection',
  );
  await expect(page.locator('#tactical-drawer')).not.toHaveClass(/is-open/);
  await page.keyboard.press('Digit1');
  await page.waitForFunction(() =>
    (window as unknown as { __recoil: { state(): { matchFlow: string } } }).__recoil.state().matchFlow === 'playing',
  );
  await page.waitForFunction(() =>
    (window as unknown as { __recoil: { inputState(): { context: string } } }).__recoil.inputState().context === 'gameplay',
  );
  await page.keyboard.press('Tab');
  await expect(page.locator('#tactical-drawer')).toHaveClass(/is-open/);
  expect(await page.locator('.tactical-stat-row').count()).toBeGreaterThan(0);
  await expect(page.locator('.tactical-stat-row__label')).not.toContainText('.');

  expect(errors).toEqual([]);
});
