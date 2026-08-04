import { expect, test, type Page } from '@playwright/test';

async function enter(page: Page) {
  await page.goto('/?test=1');
  await page.click('#screen-boot');
}

async function createCrew(a: Page, b: Page): Promise<void> {
  await enter(a);
  await a.click('#screen-main [data-act="create"]');
  await a.waitForFunction(() => (window as unknown as { __recoil: { code(): string } }).__recoil.code().length === 6);
  const code = await a.evaluate(() => (window as unknown as { __recoil: { code(): string } }).__recoil.code());
  await enter(b);
  await b.click('#screen-main [data-act="join"]');
  await b.fill('#join-code', code);
  await b.click('#join-go');
  await a.click('#create-ready');
  await b.click('#ready-go');
  const runningFn = () => (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state()?.phase === 'running';
  for (let attempt = 0; attempt < 6; attempt++) {
    const okA = await a.waitForFunction(runningFn, undefined, { timeout: 8000 }).then(() => true).catch(() => false);
    const okB = await b.waitForFunction(runningFn, undefined, { timeout: 8000 }).then(() => true).catch(() => false);
    if (okA && okB) return;
    if (await a.locator('#create-ready').isVisible().catch(() => false)) await a.click('#create-ready');
    if (await b.locator('#ready-go').isVisible().catch(() => false)) await b.click('#ready-go');
  }
  throw new Error('match did not start');
}

test('ordinary gameplay performs exactly one world render per frame and no PIP exists', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await createCrew(a, b);
  const count = (p: Page) =>
    p.evaluate(() => (window as unknown as { __rc: number[] }).__rc);
  await a.evaluate(() => {
    const w = window as unknown as { __rc: number[] };
    w.__rc = [];
    const rec = (): void => {
      const game = (window as unknown as { __recoil: { renderCount?(): number } }).__recoil;
      if (typeof game.renderCount === 'function') w.__rc.push(game.renderCount());
      if (w.__rc.length < 40) requestAnimationFrame(rec);
    };
    requestAnimationFrame(rec);
  });
  await a.waitForTimeout(1200);
  const samples = await count(a);
  expect(samples.length).toBeGreaterThan(20);
  for (let i = 1; i < samples.length; i++) {
    expect(samples[i] - samples[i - 1]).toBe(1); // exactly one world render per frame
  }
  // No PIP HUD node or partner feed text remains.
  expect(await a.locator('#pip').count()).toBe(0);
  const hudText = await a.textContent('#hud');
  expect(hudText).not.toMatch(/FEED/);
  await ctxA.close();
  await ctxB.close();
});
