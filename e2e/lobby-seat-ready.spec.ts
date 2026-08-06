import { expect, test } from '@playwright/test';

async function boot(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/?test=1');
  await page.click('#screen-boot');
  await expect(page.locator('#screen-main')).toBeVisible();
}

async function createAndJoin(driver: import('@playwright/test').Page, gunner: import('@playwright/test').Page) {
  await driver.evaluate(() => {
    const w = window as unknown as { __recoil: { joinWithName: (c: string, n: string) => void; settings: { nickname: () => string } } };
    return w.__recoil.settings.nickname();
  });
  await driver.click('#screen-main [data-act="multiplayer"]');
  await driver.click('#screen-main [data-act="create"]');
  await driver.waitForFunction(() => {
    const w = window as unknown as { __recoil: { code(): string; lobby: { state(): unknown } } };
    return w.__recoil.code().length === 6 && w.__recoil.lobby.state() !== null;
  });
  const code = await driver.evaluate(() => (window as unknown as { __recoil: { code(): string } }).__recoil.code());
  await gunner.click('#screen-main [data-act="multiplayer"]');
  await gunner.click('#screen-main [data-act="join"]');
  await gunner.fill('#join-code', code);
  await gunner.click('#join-go');
  await gunner.waitForFunction(() => {
    const w = window as unknown as { __recoil: { lobby: { state(): unknown } } };
    return w.__recoil.lobby.state() !== null;
  });
  await driver.waitForFunction(() => {
    const w = window as unknown as { __recoil: { lobby: { state(): { players: unknown[] } } } };
    return w.__recoil.lobby.state()?.players.length === 2;
  });
  return code;
}

test('both players see names, YOU only on their own card, and seats/ready start the match', async ({ browser }) => {
  const ctx = await browser.newContext();
  const driver = await ctx.newPage();
  const gunner = await ctx.newPage();
  await boot(driver);
  await boot(gunner);
  await driver.evaluate(() => {
    const w = window as unknown as { __recoil: { settings: { save: (n: string) => unknown } } };
    w.__recoil.settings.save('TurboToad07');
  });
  await gunner.evaluate(() => {
    const w = window as unknown as { __recoil: { settings: { save: (n: string) => unknown } } };
    w.__recoil.settings.save('ScrapFox42');
  });
  await createAndJoin(driver, gunner);

  await expect(driver.locator('#screen-ready')).toBeVisible();
  await expect(gunner.locator('#screen-ready')).toBeVisible();
  await expect(driver.locator('#lobby-players')).toContainText('TurboToad07');
  await expect(driver.locator('#lobby-players')).toContainText('ScrapFox42');
  await expect(gunner.locator('#lobby-players')).toContainText('TurboToad07');
  await expect(gunner.locator('#lobby-players')).toContainText('ScrapFox42');
  // YOU is per-playerId.
  await expect(driver.locator('[data-you="true"]')).toHaveCount(1);
  await expect(gunner.locator('[data-you="true"]')).toHaveCount(1);

  // The Gunner requests the occupied Driver role and the Driver explicitly accepts.
  await gunner.click('#request-role-swap');
  await expect(driver.locator('#accept-role-swap')).toBeVisible();
  await driver.click('#accept-role-swap');
  await gunner.waitForTimeout(200);
  const swapped = await gunner.evaluate(() => {
    const w = window as unknown as {
      __recoil: {
        lobby: {
          state(): { players: Array<{ playerId: string; seat: string }> };
          playerId(): string;
        };
      };
    };
    const s = w.__recoil.lobby.state();
    return s.players.find((p) => p.playerId === w.__recoil.lobby.playerId())?.seat;
  });
  expect(swapped).toBe('driver');
  expect(await gunner.evaluate(() => (window as unknown as { __recoil: { role(): string } }).__recoil.role())).toBe('driver');
  expect(await driver.evaluate(() => (window as unknown as { __recoil: { role(): string } }).__recoil.role())).toBe('gunner');

  await driver.click('#lobby-ready');
  await gunner.click('#lobby-ready');
  await expect(driver.locator('#screen-countdown')).toBeVisible();
  await driver.waitForFunction(() => {
    const w = window as unknown as { __recoil: { flow(): string } };
    return w.__recoil.flow() === 'game';
  }, undefined, { timeout: 15_000 });
  await ctx.close();
});

test('duplicate nicknames still identify YOU by playerId', async ({ browser }) => {
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  await boot(a);
  await boot(b);
  await a.evaluate(() => {
    (window as unknown as { __recoil: { settings: { save: (n: string) => unknown } } }).__recoil.settings.save('TurboToad07');
  });
  await b.evaluate(() => {
    (window as unknown as { __recoil: { settings: { save: (n: string) => unknown } } }).__recoil.settings.save('TurboToad07');
  });
  await createAndJoin(a, b);
  await expect(a.locator('[data-you="true"]')).toHaveCount(1);
  await expect(b.locator('[data-you="true"]')).toHaveCount(1);
  const aYou = await a.evaluate(() => {
    const w = window as unknown as { __recoil: { lobby: { playerId(): string } } };
    return w.__recoil.lobby.playerId();
  });
  const bYou = await b.evaluate(() => {
    const w = window as unknown as { __recoil: { lobby: { playerId(): string } } };
    return w.__recoil.lobby.playerId();
  });
  expect(aYou).not.toBe(bYou);
  await ctx.close();
});
