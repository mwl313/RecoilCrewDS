import { expect, test } from '@playwright/test';

test('progression-disabled Demo multiplayer stays inert', async ({ browser }) => {
  const ctx = await browser.newContext();
  const driver = await ctx.newPage();
  const gunner = await ctx.newPage();

  await driver.goto('/?test=1');
  await driver.click('#screen-boot');
  await expect(driver.locator('#screen-main')).toBeVisible();
  await driver.click('#screen-main [data-act="create"]');
  await driver.waitForFunction(() => {
    const w = window as unknown as { __recoil: { code(): string } };
    return w.__recoil.code().length === 6;
  });
  const code = await driver.evaluate(() => (window as unknown as { __recoil: { code(): string } }).__recoil.code());

  await gunner.goto('/?test=1');
  await gunner.click('#screen-boot');
  await expect(gunner.locator('#screen-main')).toBeVisible();
  await gunner.click('#screen-main [data-act="join"]');
  await gunner.fill('#join-code', code);
  await gunner.click('#join-go');
  await expect(gunner.locator('#screen-ready')).toBeVisible();
  await driver.click('#lobby-ready');
  await gunner.click('#lobby-ready');
  for (const page of [driver, gunner]) {
    await page.waitForFunction(() => {
      const s = (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state();
      return s?.phase === 'running';
    });
  }

  // XP/chest injection through the client hooks is a no-op in Demo mode.
  await driver.evaluate(() => {
    const w = window as unknown as {
      __recoil: {
        progression: {
          xp(value: number): void;
          chest(x: number, z: number): number;
          openChest(id: number): unknown;
        };
      };
    };
    w.__recoil.progression.xp(50);
    const s = (window as unknown as { __recoil: { state(): { tank: { x: number; z: number } } } }).__recoil.state();
    const id = w.__recoil.progression.chest(s.tank.x, s.tank.z);
    w.__recoil.progression.openChest(id);
  });
  await driver.waitForTimeout(800);

  const state = await driver.evaluate(() => {
    const s = (window as unknown as {
      __recoil: {
        state(): {
          matchFlow: string;
          xpShards: unknown[];
          chests: unknown[];
          teamProgression: { totalXpCollected: number; treasureChestsOpened: number; activeSelection: unknown };
        };
      };
    }).__recoil.state();
    return {
      matchFlow: s.matchFlow,
      xpShards: s.xpShards.length,
      chests: s.chests.length,
      totalXpCollected: s.teamProgression.totalXpCollected,
      treasureChestsOpened: s.teamProgression.treasureChestsOpened,
      activeSelection: s.teamProgression.activeSelection,
    };
  });
  expect(state.matchFlow).toBe('playing');
  expect(state.xpShards).toBe(0);
  expect(state.chests).toBe(0);
  expect(state.totalXpCollected).toBe(0);
  expect(state.treasureChestsOpened).toBe(0);
  expect(state.activeSelection).toBeNull();
  await expect(driver.locator('#progression-overlay')).toBeHidden();
  await ctx.close();
});
