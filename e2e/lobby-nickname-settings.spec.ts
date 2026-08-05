import { expect, test } from '@playwright/test';

async function boot(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/?test=1');
  await page.click('#screen-boot');
  await expect(page.locator('#screen-main')).toBeVisible();
}

test('nickname settings: randomize/cancel/save and persistence', async ({ page }) => {
  await boot(page);
  const initial = (await page.locator('#main-playing-as').textContent())!.replace('PLAYING AS: ', '');
  expect(initial).toMatch(/^[A-Za-z]+[0-9]{2}$/);

  await page.click('#main-settings');
  await expect(page.locator('#screen-settings')).toBeVisible();
  const draftBefore = await page.locator('#nickname-input').inputValue();
  expect(draftBefore).toBe(initial);

  await page.click('#settings-randomize');
  const randomized = await page.locator('#nickname-input').inputValue();
  expect(randomized).not.toBe(initial);
  await page.click('#settings-cancel');
  await expect(page.locator('#screen-main')).toBeVisible();
  expect((await page.locator('#main-playing-as').textContent())!.replace('PLAYING AS: ', '')).toBe(initial);

  await page.click('#main-settings');
  await page.fill('#nickname-input', '  Custom  Name  ');
  await page.click('#settings-save');
  await expect(page.locator('#screen-main')).toBeVisible();
  expect(await page.locator('#main-playing-as').textContent()).toBe('PLAYING AS: Custom Name');

  // Reload: the saved nickname persists.
  await page.reload();
  await page.click('#screen-boot');
  await expect(page.locator('#screen-main')).toBeVisible();
  expect(await page.locator('#main-playing-as').textContent()).toBe('PLAYING AS: Custom Name');
});

test('invalid nickname shows an error and does not save', async ({ page }) => {
  await boot(page);
  await page.click('#main-settings');
  await page.fill('#nickname-input', '   ');
  await page.click('#settings-save');
  await expect(page.locator('#screen-settings')).toBeVisible();
  await expect(page.locator('#settings-error')).toContainText('Choose a nickname');
});
