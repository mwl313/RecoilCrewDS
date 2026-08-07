import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

const EVIDENCE_DIR = 'docs/progression08/evidence';

test('records the full 1280x720 upgrade punch, reels, locks, and selection', async ({ browser }, testInfo) => {
  const { context, page } = await launchGame(browser, testInfo);
  const video = page.video()!;
  await page.evaluate(() =>
    (window as unknown as { __recoil: { progression: { xp(value: number): void } } }).__recoil.progression.xp(20),
  );
  await page.waitForFunction(() =>
    (window as unknown as { __recoil: { state(): { matchFlow: string } | null } }).__recoil.state()?.matchFlow === 'upgradeSelection',
  );
  await expect(page.locator('.reward-stage--upgrade')).toBeVisible();
  await page.waitForTimeout(2_300);
  await page.keyboard.press('Digit2');
  await page.waitForTimeout(420);
  await context.close();
  await video.saveAs(`${EVIDENCE_DIR}/production-upgrade-1280x720.webm`);
});

test('records the natural Epic or Legendary relic punch, reel, lock, and staged payoff', async ({ browser }, testInfo) => {
  const { context, page } = await launchGame(browser, testInfo);
  const video = page.video()!;
  await openFirstChest(page);
  const rarity = await page.evaluate(() =>
    (window as unknown as { __recoil: { state(): { teamProgression: { activeSelection: { relicResult?: { rarity: string } } } } } }).__recoil.state().teamProgression.activeSelection.relicResult?.rarity,
  );
  expect(['epic', 'legendary']).toContain(rarity);
  await page.waitForTimeout(3_050);
  await page.keyboard.press('Space');
  await page.waitForTimeout(320);
  await context.close();
  await video.saveAs(`${EVIDENCE_DIR}/production-relic-${rarity}-1280x720.webm`);
});

test('records the reduced-motion entrance without microscopic scaling or flash', async ({ browser }, testInfo) => {
  const { context, page } = await launchGame(browser, testInfo, true);
  const video = page.video()!;
  await page.evaluate(() =>
    (window as unknown as { __recoil: { progression: { xp(value: number): void } } }).__recoil.progression.xp(20),
  );
  await page.waitForFunction(() =>
    (window as unknown as { __recoil: { state(): { matchFlow: string } | null } }).__recoil.state()?.matchFlow === 'upgradeSelection',
  );
  await page.waitForTimeout(520);
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(300);
  await context.close();
  await video.saveAs(`${EVIDENCE_DIR}/production-upgrade-reduced-motion-1280x720.webm`);
});

async function launchGame(browser: Browser, testInfo: TestInfo, reducedMotion = false): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
    recordVideo: { dir: testInfo.outputPath('raw-video'), size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  await page.goto('http://localhost:8099/?test=1&nodebug=1');
  await page.click('#screen-boot');
  await expect(page.locator('#screen-main')).toBeVisible();
  await page.click('#screen-main [data-act="single"]');
  await page.waitForFunction(() =>
    (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state()?.phase === 'running',
  );
  return { context, page };
}

async function openFirstChest(page: Page): Promise<void> {
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
}
