import { expect, test } from '@playwright/test';

/**
 * Multiplayer progression selection plumbing: both clients speak protocol v6
 * and a selectUpgrade request with no active offer is a safe no-op. Full
 * role-separated selection E2E requires serving a progression-enabled
 * multiplayer mode (truckHunter) from the room; the shared selection
 * controller is covered by unit tests.
 */
test('multiplayer clients accept selectUpgrade protocol safely', async ({ browser }) => {
  const ctx = await browser.newContext();
  const driver = await ctx.newPage();
  const gunner = await ctx.newPage();
  const errors: string[] = [];
  for (const page of [driver, gunner]) {
    page.on('pageerror', (e) => errors.push(e.message));
  }

  await driver.goto('/?test=1');
  await driver.click('#screen-boot');
  await expect(driver.locator('#screen-main')).toBeVisible();
  await driver.click('#screen-main [data-act="multiplayer"]');
  await driver.click('#screen-main [data-act="create"]');
  await driver.waitForFunction(() => {
    const w = window as unknown as { __recoil: { code(): string } };
    return w.__recoil.code().length === 6;
  });
  const code = await driver.evaluate(() => (window as unknown as { __recoil: { code(): string } }).__recoil.code());

  await gunner.goto('/?test=1');
  await gunner.click('#screen-boot');
  await expect(gunner.locator('#screen-main')).toBeVisible();
  await gunner.click('#screen-main [data-act="multiplayer"]');
  await gunner.click('#screen-main [data-act="join"]');
  await gunner.fill('#join-code', code);
  await gunner.click('#join-go');
  await expect(gunner.locator('#screen-ready')).toBeVisible();
  await driver.click('#lobby-ready');
  await gunner.click('#lobby-ready');
  await driver.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state();
    return s?.phase === 'running';
  });
  await gunner.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state();
    return s?.phase === 'running';
  });

  // No active offer: sending selectUpgrade must not crash either client.
  await gunner.evaluate(() => {
    (window as unknown as { __recoil: { progression: { submitUpgrade(i: number): void } } }).__recoil.progression.submitUpgrade(1);
  });
  await gunner.waitForTimeout(300);
  expect(errors).toEqual([]);
  await ctx.close();
});
