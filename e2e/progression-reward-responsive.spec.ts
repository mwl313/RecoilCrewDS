import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
  { width: 800, height: 720 },
  { width: 560, height: 720 },
  { width: 390, height: 844 },
] as const;

test('upgrade and relic reward plates fit every qualification viewport', async ({ page }, testInfo) => {
  await page.goto('/?test=1');
  await page.click('#screen-boot');
  await expect(page.locator('#screen-main')).toBeVisible();
  await page.click('#screen-main [data-act="single"]');
  await page.waitForFunction(() =>
    (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state()?.phase === 'running',
  );

  await page.evaluate(() =>
    (window as unknown as { __recoil: { progression: { xp(value: number): void } } }).__recoil.progression.xp(20),
  );
  await page.waitForFunction(() =>
    (window as unknown as { __recoil: { state(): { matchFlow: string } | null } }).__recoil.state()?.matchFlow === 'upgradeSelection',
  );
  const upgradeReels = await page.locator('.reward-card__reel-window').evaluateAll((windows) => windows.map((window) => ({
    overflow: getComputedStyle(window).overflow,
    cells: window.querySelectorAll('.reward-card__symbol').length,
  })));
  expect(upgradeReels).toHaveLength(3);
  expect(upgradeReels.every((reel) => reel.overflow === 'hidden' && reel.cells >= 8)).toBe(true);
  await page.waitForTimeout(1_150);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await assertRewardFits(page, '.reward-stage--upgrade', '.reward-card', 3);
    await page.screenshot({ path: testInfo.outputPath(`upgrade-${viewport.width}x${viewport.height}.png`) });
  }

  await page.keyboard.press('Digit1');
  await page.waitForFunction(() =>
    (window as unknown as { __recoil: { state(): { matchFlow: string } | null } }).__recoil.state()?.matchFlow === 'playing',
  );
  await page.evaluate(() => {
    const hooks = (window as unknown as {
      __recoil: {
        state(): { tank: { x: number; z: number } };
        progression: { chest(x: number, z: number): number; openChest(id: number): unknown };
      };
    }).__recoil;
    const state = hooks.state();
    hooks.progression.openChest(hooks.progression.chest(state.tank.x, state.tank.z));
  });
  await page.waitForFunction(() =>
    (window as unknown as { __recoil: { state(): { matchFlow: string } | null } }).__recoil.state()?.matchFlow === 'relicSelection',
  );
  await expect(page.locator('.reward-relic__symbol')).toHaveCount(10);
  await expect(page.locator('.reward-relic__reel-window')).toHaveCSS('overflow', 'hidden');
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await assertRewardFits(page, '.reward-stage--relic', '.reward-relic', 1);
    await page.screenshot({ path: testInfo.outputPath(`relic-${viewport.width}x${viewport.height}.png`) });
  }
  await page.keyboard.press('Space');
  await page.waitForFunction(() =>
    (window as unknown as { __recoil: { state(): { matchFlow: string } | null } }).__recoil.state()?.matchFlow === 'playing',
  );
});

async function assertRewardFits(
  page: import('@playwright/test').Page,
  stageSelector: string,
  itemSelector: string,
  expectedItems: number,
): Promise<void> {
  const layout = await page.evaluate(({ stageSelector, itemSelector }) => {
    const stage = document.querySelector<HTMLElement>(stageSelector)!;
    const stageRect = stage.getBoundingClientRect();
    const items = [...document.querySelectorAll<HTMLElement>(itemSelector)].map((item) => {
      const rect = item.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    });
    return {
      viewport: { width: innerWidth, height: innerHeight },
      scroll: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      stage: { left: stageRect.left, right: stageRect.right, top: stageRect.top, bottom: stageRect.bottom },
      items,
    };
  }, { stageSelector, itemSelector });
  expect(layout.items).toHaveLength(expectedItems);
  expect(layout.scroll.width).toBeLessThanOrEqual(layout.viewport.width);
  expect(layout.stage.left).toBeGreaterThanOrEqual(0);
  expect(layout.stage.right).toBeLessThanOrEqual(layout.viewport.width);
  expect(layout.stage.top).toBeGreaterThanOrEqual(0);
  expect(layout.stage.bottom).toBeLessThanOrEqual(layout.viewport.height);
  for (const item of layout.items) {
    expect(item.right - item.left).toBeGreaterThan(20);
    expect(item.bottom - item.top).toBeGreaterThan(20);
    expect(item.left).toBeGreaterThanOrEqual(0);
    expect(item.right).toBeLessThanOrEqual(layout.viewport.width);
    expect(item.top).toBeGreaterThanOrEqual(0);
    expect(item.bottom).toBeLessThanOrEqual(layout.viewport.height);
  }
}
