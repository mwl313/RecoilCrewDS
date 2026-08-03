import { expect, test, type Page } from '@playwright/test';

const URL = 'http://localhost:8098';

async function open(page: Page) {
  await page.goto(URL);
  await page.waitForSelector('canvas#maplab-canvas', { timeout: 30000 });
}

async function waitForStatus(page: Page) {
  await expect(page.locator('.maplab-status-pass, .maplab-status-fail').first()).toBeVisible({ timeout: 30000 });
  return (await page.textContent('.maplab-status-pass, .maplab-status-fail'))?.trim();
}

async function setObjectsEnabled(page: Page, enabled: boolean): Promise<void> {
  await page.evaluate((value) => {
    window.__maplab?.setObjectsEnabled(value);
  }, enabled);
}

async function arenaChecksum(page: Page): Promise<number | null> {
  return page.evaluate(() => window.__maplab?.arenaChecksum() ?? null);
}

test('Map Lab full flow: generate, edit, toggle, focus, export, draft restore', async ({ browser }) => {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await open(page);

  // 1-3. Primary profile loads and a production map is generated with PASS.
  await expect(page.locator('.maplab-toolbar')).toBeVisible();
  expect(await waitForStatus(page)).toBe('PASS');

  // 4-5. Edit (objects off) -> regenerate shows the change in metrics.
  const checksumBefore = await arenaChecksum(page);
  await setObjectsEnabled(page, false);
  await page.waitForTimeout(1200);
  let body = await page.textContent('body');
  expect(body).toContain('objects: 0');
  expect(body).toContain('gates:');

  // 6. Camera mode switch (3D / Top Down).
  await page.getByRole('button', { name: 'Top Down' }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: '3D' }).click();
  await page.waitForTimeout(200);

  // 7. Route layer toggle must NOT regenerate (checksum unchanged).
  const routeBox = page.locator('.maplab-layer-row', { hasText: 'routeEdges' }).locator('input[type="checkbox"]');
  await routeBox.uncheck();
  await routeBox.check();
  await page.waitForTimeout(400);
  const checksumAfter = await arenaChecksum(page);
  expect(checksumAfter).toBe(checksumBefore);

  // 8-9. Objects back on -> objects appear again; routes persist.
  await setObjectsEnabled(page, true);
  await page.waitForTimeout(1200);
  body = await page.textContent('body');
  expect(body).toMatch(/objects: [1-9]/);
  expect(body).toContain('gates:');

  // 10. Issue selection (only when issues exist).
  const issueRows = page.locator('.maplab-issue');
  if ((await issueRows.count()) > 0) {
    await issueRows.first().click();
    await page.waitForTimeout(300);
  }

  // 11. Profile export download.
  const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
  await page.getByRole('button', { name: 'Export Profile' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('maplab-profile');

  // 12. Draft restore after reload (objects off persists).
  await setObjectsEnabled(page, false);
  await page.waitForTimeout(1400); // draft auto-save debounce
  await page.reload();
  await page.waitForSelector('canvas#maplab-canvas', { timeout: 30000 });
  expect(await waitForStatus(page)).toBe('PASS');
  body = await page.textContent('body');
  expect(body).toContain('objects: 0');

  const critical = errors.filter((e) => !e.includes('WebGL') && !e.includes('GPU'));
  expect(critical).toEqual([]);
  await page.close();
});

test('Map Lab: 20 regenerations keep the scene stable', async ({ browser }) => {
  const page = await browser.newPage();
  await open(page);
  await waitForStatus(page);
  const layerRowsBefore = await page.locator('.maplab-layer-row').count();
  const regen = page.getByRole('button', { name: 'Regenerate' });
  for (let i = 0; i < 20; i++) {
    await regen.click();
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(1200);
  await expect(page.locator('canvas#maplab-canvas')).toHaveCount(1);
  const layerRowsAfter = await page.locator('.maplab-layer-row').count();
  expect(layerRowsAfter).toBe(layerRowsBefore); // no leaked layers
  expect(await waitForStatus(page)).toBe('PASS');
  await page.close();
});
