import { expect, test, type Page } from '@playwright/test';

const PRODUCTION_URL = 'http://localhost:8096/?test=1';

type ChestSnapshot = {
  id: number;
  source: string;
  x: number;
  y: number;
  z: number;
  lifecycle: string;
  claimableAtGameTime: number;
};

async function enterMenu(page: Page): Promise<void> {
  await page.goto(PRODUCTION_URL);
  await page.click('#screen-boot');
  await expect(page.locator('#screen-main')).toBeVisible();
}

async function waitForTenChests(page: Page): Promise<ChestSnapshot[]> {
  await page.waitForFunction(() => {
    const state = (window as unknown as { __recoil: { state(): { chests: ChestSnapshot[] } | null } }).__recoil.state();
    return state?.chests.filter((chest) => chest.source === 'mapStart').length === 10;
  });
  return page.evaluate(() => {
    const state = (window as unknown as { __recoil: { state(): { chests: ChestSnapshot[] } } }).__recoil.state();
    return state.chests.filter((chest) => chest.source === 'mapStart').sort((a, b) => a.id - b.id);
  });
}

test('two production clients and a reconnect share the same ten world chests', async ({ browser }) => {
  const context = await browser.newContext();
  const driver = await context.newPage();
  const gunner = await context.newPage();
  const startupErrors: string[] = [];
  for (const [role, page] of [['driver', driver], ['gunner', gunner]] as const) {
    page.on('pageerror', (error) => startupErrors.push(`${role}: ${error.message}`));
  }

  await enterMenu(driver);
  await driver.click('#screen-main [data-act="multiplayer"]');
  await driver.click('#screen-main [data-act="create"]');
  await driver.waitForFunction(() =>
    (window as unknown as { __recoil: { code(): string } }).__recoil.code().length === 6,
  );
  const code = await driver.evaluate(() =>
    (window as unknown as { __recoil: { code(): string } }).__recoil.code(),
  );

  await enterMenu(gunner);
  await gunner.click('#screen-main [data-act="multiplayer"]');
  await gunner.click('#screen-main [data-act="join"]');
  await gunner.fill('#join-code', code);
  await gunner.click('#join-go');
  await expect(gunner.locator('#screen-ready')).toBeVisible();
  const gunnerSession = await gunner.evaluate(() =>
    (window as unknown as { __recoil: { sessionId(): string } }).__recoil.sessionId(),
  );
  await driver.click('#lobby-ready');
  await gunner.click('#lobby-ready');

  for (const page of [driver, gunner]) {
    await expect(page.locator('#game-canvas')).toBeVisible({ timeout: 45_000 });
  }
  expect(startupErrors).toEqual([]);

  const driverChests = await waitForTenChests(driver);
  const gunnerChests = await waitForTenChests(gunner);
  expect(gunnerChests).toEqual(driverChests);
  await expect(driver.locator('#relic-inventory-rail')).toBeHidden();
  await expect(gunner.locator('#relic-inventory-rail')).toBeHidden();

  await gunner.close();
  const rejoined = await context.newPage();
  await rejoined.goto(PRODUCTION_URL);
  await rejoined.waitForFunction(() => Boolean((window as unknown as { __recoil?: unknown }).__recoil));
  await rejoined.evaluate(({ roomCode, sessionId }) => {
    (window as unknown as { __recoil: { rejoin(code: string, session: string): void } }).__recoil.rejoin(roomCode, sessionId);
  }, { roomCode: code, sessionId: gunnerSession });
  const reconnectChests = await waitForTenChests(rejoined);
  expect(reconnectChests).toEqual(driverChests);
  await context.close();
});
