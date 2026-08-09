import { expect, test, type Page } from '@playwright/test';

const SCREENSHOT_DIR = 'docs/parallel-enemy-pressure/workstream-04-reward-world-feedback/screenshots';

test('captures authoritative XP, integrity, and tank-damage world feedback', async ({ page }) => {
  await launchGame(page);
  await page.evaluate(() => (window as unknown as RecoilHooks).__recoil.progression.xp(2));
  await page.waitForFunction(() => (window as unknown as RecoilHooks).__recoil.rewardWorldFeedback().popups.some((entry) => entry.kind === 'xpGain'));
  await page.screenshot({ path: `${SCREENSHOT_DIR}/xp-gain-world-number.png` });

  await page.evaluate(() => (window as unknown as RecoilHooks).__recoil.tankFeedback.damage(20));
  await expect(page.locator('.tank-damage-feedback--active')).toBeAttached();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/tank-damage-heavy-feedback.png` });

  await page.waitForTimeout(320);
  const actual = await page.evaluate(() => (window as unknown as RecoilHooks).__recoil.tankFeedback.repair(12).actual);
  expect(actual).toBe(12);
  await page.waitForFunction(() => (window as unknown as RecoilHooks).__recoil.rewardWorldFeedback().popups.some((entry) => entry.kind === 'integrityGain'));
  await page.screenshot({ path: `${SCREENSHOT_DIR}/integrity-gain-world-number.png` });
});

async function launchGame(page: Page): Promise<void> {
  await page.goto('http://localhost:8099/?test=1&nodebug=1');
  await page.click('#screen-boot');
  await expect(page.locator('#screen-main')).toBeVisible();
  await page.click('#screen-main [data-act="single"]');
  await page.waitForFunction(() =>
    (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state()?.phase === 'running',
  );
}

interface RecoilHooks extends Window {
  __recoil: {
    progression: { xp(value: number): void };
    rewardWorldFeedback(): { popups: Array<{ kind: string; amount: number }> };
    tankFeedback: { damage(value: number): number; repair(value: number): { actual: number } };
  };
}
