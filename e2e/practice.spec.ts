import { expect, test } from '@playwright/test';

test('practice mode runs a full local round with keyboard + mouse controls', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/?test=1');
  await page.click('#screen-boot');
  await page.click('#screen-main [data-act="practice"]');
  await page.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state();
    return s?.phase === 'running';
  });
  await expect(page.locator('canvas#game-canvas')).toHaveCount(1);
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#practice-tag')).toBeVisible();

  // Keyboard driving moves the local tank.
  const z0 = await page.evaluate(() => (window as unknown as { __recoil: { state(): { tank: { z: number } } } }).__recoil.state().tank.z);
  await page.keyboard.down('w');
  await page.waitForFunction((z0) => {
    const s = (window as unknown as { __recoil: { state(): { tank: { z: number } } | null } }).__recoil.state();
    return s ? Math.abs(s.tank.z - z0) > 2 : false;
  }, z0);
  await page.keyboard.up('w');

  // Tab swaps practice camera without breaking the loop.
  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);

  // Practice reaches results after the 90-second round.
  await page.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state();
    return s?.phase === 'results';
  }, undefined, { timeout: 110_000 });
  await expect(page.locator('#screen-results:not(.hidden)')).toBeVisible();
  const grade = await page.textContent('#results-grade');
  expect(grade?.trim() ?? '').toBeTruthy();

  const critical = errors.filter((e) => !e.includes('WebGL') && !e.includes('GPU'));
  expect(critical).toEqual([]);
});
