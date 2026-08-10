import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const screenshotDir = resolve('docs/final-patch-batch/workstream-01-localization-settings/screenshots');

async function finishAnimations(locator: import('@playwright/test').Locator): Promise<void> {
  await locator.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished));
  });
}

async function boot(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/?test=1');
  await page.click('#screen-boot');
  await expect(page.locator('#screen-main')).toBeVisible();
}

test.beforeAll(() => mkdirSync(screenshotDir, { recursive: true }));

test('runtime Korean preview, Cancel restore, and V2 persistence', async ({ page }) => {
  await boot(page);
  await page.click('#main-settings');
  await page.click('#settings-language button[data-value="ko"]');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(page.locator('#settings-title')).toHaveText('플레이어 설정');
  await expect(page.locator('#settings-sfx-label')).toHaveText('효과음');

  await page.locator('#settings-bgm-range').fill('23');
  await page.locator('#settings-sfx-range').fill('67');
  await expect(page.locator('#settings-bgm-value')).toHaveText('23%');
  await expect(page.locator('#settings-sfx-value')).toHaveText('67%');
  await finishAnimations(page.locator('#screen-settings'));
  await expect(page.locator('#settings-save')).toBeInViewport();
  await expect(page.locator('#settings-cancel')).toBeInViewport();
  await page.screenshot({ path: resolve(screenshotDir, 'settings-v2-ko-desktop.png') });

  await page.click('#settings-cancel');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.click('#main-settings');
  await expect(page.locator('#settings-bgm-range')).toHaveValue('100');
  await expect(page.locator('#settings-sfx-range')).toHaveValue('100');

  await page.click('#settings-language button[data-value="ko"]');
  await page.locator('#settings-bgm-range').fill('23');
  await page.locator('#settings-sfx-range').fill('67');
  await page.click('#settings-save');
  await expect(page.locator('#screen-main')).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('recoilCrew.playerSettings.v2') ?? '{}'));
  expect(stored).toMatchObject({ version: 2, locale: 'ko', bgmVolume: 23, sfxVolume: 67 });

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await page.click('#screen-boot');
  await expect(page.locator('#main-single')).toHaveText('싱글 플레이');
});

test('Korean Settings V2 remains usable at a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('recoilCrew.playerSettings.v2', JSON.stringify({
    version: 2,
    nickname: 'TurboToad07',
    locale: 'ko',
    bgmVolume: 72,
    sfxVolume: 84,
  })));
  await boot(page);
  await page.click('#main-settings');
  await expect(page.locator('#settings-title')).toHaveText('플레이어 설정');
  await finishAnimations(page.locator('#screen-settings'));
  await expect(page.locator('#settings-save')).toBeVisible();
  await expect(page.locator('#settings-cancel')).toBeVisible();
  const panel = page.locator('#settings-panel');
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  await panel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(page.locator('#settings-save')).toBeInViewport();
  await expect(page.locator('#settings-cancel')).toBeInViewport();
  await page.screenshot({ path: resolve(screenshotDir, 'settings-v2-ko-mobile.png') });
});
