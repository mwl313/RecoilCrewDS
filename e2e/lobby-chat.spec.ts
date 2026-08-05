import { expect, test } from '@playwright/test';

async function boot(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/?test=1');
  await page.click('#screen-boot');
  await expect(page.locator('#screen-main')).toBeVisible();
}

test('lobby chat exchanges messages, renders as text, rate-limits, and survives reconnect', async ({ browser }) => {
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  await boot(a);
  await boot(b);
  await a.click('#screen-main [data-act="create"]');
  await a.waitForFunction(() => {
    const w = window as unknown as { __recoil: { code(): string; lobby: { state(): unknown } } };
    return w.__recoil.code().length === 6 && w.__recoil.lobby.state() !== null;
  });
  const code = await a.evaluate(() => (window as unknown as { __recoil: { code(): string } }).__recoil.code());
  await b.click('#screen-main [data-act="join"]');
  await b.fill('#join-code', code);
  await b.click('#join-go');
  await b.waitForFunction(() => {
    const w = window as unknown as { __recoil: { lobby: { state(): unknown } } };
    return w.__recoil.lobby.state() !== null;
  });

  await a.fill('#lobby-chat-input', '<img src=x onerror=alert(1)>');
  await a.click('#lobby-chat-send');
  await b.fill('#lobby-chat-input', 'hello crew');
  await b.click('#lobby-chat-send');
  await expect(a.locator('#lobby-chat-messages')).toContainText('<img src=x onerror=alert(1)>');
  await expect(b.locator('#lobby-chat-messages')).toContainText('hello crew');
  expect(await a.locator('#lobby-chat-messages img').count()).toBe(0);

  // Rate limit: burst of 4, fifth rejected.
  for (let i = 0; i < 4; i++) {
    await a.fill('#lobby-chat-input', `burst${i}`);
    await a.click('#lobby-chat-send');
  }
  await a.waitForTimeout(300);
  const chat = await a.evaluate(() => {
    const w = window as unknown as { __recoil: { lobby: { chat(): unknown[] } } };
    return w.__recoil.lobby.chat();
  });
  expect(chat.length).toBe(6); // 2 earlier + 4 burst

  // Reconnect restores bounded history.
  const aSession = await a.evaluate(() => (window as unknown as { __recoil: { sessionId(): string } }).__recoil.sessionId());
  await a.reload();
  await a.click('#screen-boot');
  await a.evaluate(
    ({ code, sessionId }) => {
      (window as unknown as { __recoil: { rejoin(c: string, s: string): void } }).__recoil.rejoin(code, sessionId);
    },
    { code, sessionId: aSession },
  );
  await a.waitForFunction(() => {
    const w = window as unknown as { __recoil: { lobby: { chat(): unknown[] } } };
    return w.__recoil.lobby.chat().length >= 6;
  });
  await expect(a.locator('#lobby-chat-messages')).toContainText('hello crew');
  await ctx.close();
});
