import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const EVIDENCE_DIR = 'docs/parallel-enemy-pressure/workstream-03-tactical-threat-map/screenshots';

async function startSinglePlayer(page: Page): Promise<void> {
  await page.goto('/?test=1&nodebug=1&map=urban400');
  await page.click('#screen-boot');
  await page.click('#screen-main [data-act="single"]');
  await page.waitForFunction(() =>
    (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state()?.phase === 'running',
  );
}

test('captures the complete Single Player threat hierarchy, aggregate sector, and attached drawer nub', async ({ page }) => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  await startSinglePlayer(page);
  await page.evaluate(() => {
    const hooks = (window as unknown as {
      __recoil: {
        state(): { tank: { x: number; z: number } };
        monsterSpawn(defId: string, x: number, z: number): number;
        progression: { chest(x: number, z: number): number };
      };
    }).__recoil;
    const tank = hooks.state().tank;
    hooks.monsterSpawn('enemy.quaternius.alien', tank.x - 28, tank.z - 12);
    hooks.monsterSpawn('enemy.quaternius.alien-high-detail', tank.x + 30, tank.z - 18);
    hooks.monsterSpawn('enemy.quaternius.alien-high-detail.boss', tank.x + 10, tank.z + 34);
    hooks.progression.chest(tank.x - 24, tank.z + 30);

    const sectorX = tank.x >= 0 ? -125 : 125;
    const sectorZ = tank.z >= 0 ? -125 : 125;
    for (let i = 0; i < 14; i++) {
      hooks.monsterSpawn('enemy.quaternius.alien', sectorX + (i % 3), sectorZ + (i % 2));
    }
  });
  await page.waitForFunction(() => {
    const hooks = (window as unknown as {
      __recoil: { tactical(): { renderedSectors: number } | null };
    }).__recoil;
    return document.querySelector('#tactical-drawer') !== null && hooks.tactical() !== null;
  });

  await page.screenshot({ path: `${EVIDENCE_DIR}/single-player-drawer-closed.png` });
  await page.keyboard.press('Tab');
  await expect(page.locator('#tactical-drawer')).toHaveClass(/is-open/);
  await page.waitForFunction(() =>
    ((window as unknown as { __recoil: { tactical(): { renderedSectors: number } } }).__recoil.tactical()?.renderedSectors ?? 0) > 0,
    undefined,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(150);

  await page.screenshot({ path: `${EVIDENCE_DIR}/single-player-threat-map-open.png` });
  await page.locator('#tactical-minimap').screenshot({ path: `${EVIDENCE_DIR}/ordinary-elite-boss-chest-and-sector.png` });
  const diagnostics = await page.evaluate(() =>
    (window as unknown as { __recoil: { tactical(): { open: boolean; renderedSectors: number } } }).__recoil.tactical(),
  );
  expect(diagnostics).toMatchObject({ open: true });
  expect(diagnostics.renderedSectors).toBeGreaterThan(0);
});

test('renders the same tactical drawer contract for both Multiplayer roles', async ({ browser }) => {
  test.setTimeout(120_000);
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const context = await browser.newContext();
  const driver = await context.newPage();
  const gunner = await context.newPage();

  await driver.goto('/?test=1&nodebug=1&map=urban400');
  await driver.click('#screen-boot');
  await driver.click('#screen-main [data-act="multiplayer"]');
  await driver.click('#screen-main [data-act="create"]');
  await driver.waitForFunction(() =>
    (window as unknown as { __recoil: { code(): string } }).__recoil.code().length === 6,
  );
  const code = await driver.evaluate(() =>
    (window as unknown as { __recoil: { code(): string } }).__recoil.code(),
  );

  await gunner.goto('/?test=1&nodebug=1&map=urban400');
  await gunner.click('#screen-boot');
  await gunner.click('#screen-main [data-act="multiplayer"]');
  await gunner.click('#screen-main [data-act="join"]');
  await gunner.fill('#join-code', code);
  await gunner.click('#join-go');
  await expect(gunner.locator('#screen-ready')).toBeVisible();
  await driver.click('#lobby-ready');
  await gunner.click('#lobby-ready');

  for (const page of [driver, gunner]) {
    await page.waitForFunction(() =>
      (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state()?.phase === 'running',
      undefined,
      { timeout: 60_000 },
    );
    await page.bringToFront();
    await page.click('#game-canvas');
    await page.waitForFunction(() =>
      (window as unknown as { __recoil: { inputState(): { locked: boolean } } }).__recoil.inputState().locked,
    );
    await page.keyboard.press('Tab');
    await expect(page.locator('#tactical-drawer')).toHaveClass(/is-open/);
  }

  const roles = await Promise.all([driver, gunner].map((page) =>
    page.locator('#tactical-drawer').getAttribute('data-role'),
  ));
  expect(new Set(roles)).toEqual(new Set(['driver', 'gunner']));
  await driver.screenshot({ path: `${EVIDENCE_DIR}/multiplayer-driver-threat-map-open.png` });
  await gunner.screenshot({ path: `${EVIDENCE_DIR}/multiplayer-gunner-threat-map-open.png` });
  await context.close();
});
