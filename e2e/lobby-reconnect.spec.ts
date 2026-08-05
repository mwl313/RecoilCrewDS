import { expect, test } from '@playwright/test';

async function boot(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/?test=1');
  await page.click('#screen-boot');
  await expect(page.locator('#screen-main')).toBeVisible();
}

test('disconnect cancels countdown; reconnect restores nickname and seat but not Ready', async ({ browser }) => {
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  await boot(a);
  await boot(b);
  await a.evaluate(() => {
    (window as unknown as { __recoil: { settings: { save: (n: string) => unknown } } }).__recoil.settings.save('TurboToad07');
  });
  await b.evaluate(() => {
    (window as unknown as { __recoil: { settings: { save: (n: string) => unknown } } }).__recoil.settings.save('ScrapFox42');
  });
  await a.click('#screen-main [data-act="create"]');
  await a.waitForFunction(() => {
    const w = window as unknown as { __recoil: { code(): string; lobby: { state(): unknown } } };
    return w.__recoil.code().length === 6 && w.__recoil.lobby.state() !== null;
  });
  const code = await a.evaluate(() => (window as unknown as { __recoil: { code(): string } }).__recoil.code());
  const sessionId = await b.evaluate(() => {
    return '';
  });
  await b.click('#screen-main [data-act="join"]');
  await b.fill('#join-code', code);
  await b.click('#join-go');
  await b.waitForFunction(() => {
    const w = window as unknown as { __recoil: { lobby: { state(): unknown } } };
    return w.__recoil.lobby.state() !== null;
  });
  const bSession = await b.evaluate(() => (window as unknown as { __recoil: { sessionId(): string } }).__recoil.sessionId());
  void sessionId;

  // Both ready → countdown.
  await a.click('#lobby-ready');
  await b.click('#lobby-ready');
  await expect(a.locator('#screen-countdown')).toBeVisible();

  // B disconnects (closing the page); A sees reconnecting and countdown cancels.
  await b.close();
  await a.waitForFunction(() => {
    const w = window as unknown as { __recoil: { lobby: { state(): { phase: string; players: Array<{ reconnecting: boolean }> } } } };
    const s = w.__recoil.lobby.state();
    return s.phase === 'lobby' && s.players.some((p) => p.reconnecting);
  });

  // B reconnects: nickname + seat restored, Ready false.
  const b2 = await ctx.newPage();
  await boot(b2);
  const state = await b2.evaluate(
    async ({ code, sessionId }) => {
      const w = window as unknown as {
        __recoil: { rejoin(c: string, s: string): void; lobby: { state(): unknown; chat(): unknown[] } };
      };
      w.__recoil.rejoin(code, sessionId);
      await new Promise((r) => setTimeout(r, 500));
      return w.__recoil.lobby.state();
    },
    { code, sessionId: bSession },
  );
  const players = (state as { players: Array<{ displayName: string; seat: string | null; ready: boolean }> }).players;
  const me = players.find((p) => p.displayName === 'ScrapFox42')!;
  expect(me.seat).toBe('gunner');
  expect(me.ready).toBe(false);
  await ctx.close();
});
