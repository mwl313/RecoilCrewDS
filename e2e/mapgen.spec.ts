import { expect, test, type Page } from '@playwright/test';

type Recoil = {
  arena(): { mapProfileId: string; arenaBaseSeed: number; arenaChecksum: number; arenaFallbackUsed: boolean } | null;
  state(): { phase: string; tank: { x: number; z: number; yaw: number; y: number } } | null;
  code(): string;
  sessionId(): string;
  flow(): string;
  sceneStats(): { children: number } | null;
  groundHeightAt(x: number, z: number): number;
  corruptArenaChecksum(v: number): void;
};

async function enter(page: Page) {
  await page.goto('/?test=1');
  await page.click('#screen-boot');
}

async function createCrew(a: Page, b: Page): Promise<string> {
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
  for (const p of [a, b]) {
    await p.waitForFunction(
      () => (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state()?.phase === 'running',
      undefined,
      { timeout: 20000 },
    );
  }
  return code;
}

test('online matches run on the generated arena with checksum-gated metadata', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const errors: string[] = [];
  for (const p of [a, b]) {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
  }
  await createCrew(a, b);

  const meta = await a.evaluate(() => (window as unknown as { __recoil: Recoil }).__recoil.arena());
  expect(meta?.mapProfileId).toBe('map.arena400Primary');
  expect(meta?.arenaFallbackUsed).toBe(false);
  expect(meta && meta.arenaChecksum > 0).toBe(true);

  // Terrain chunks + props exist in the scene (generated map rendered).
  const stats = await a.evaluate(() => (window as unknown as { __recoil: Recoil }).__recoil.sceneStats());
  expect(stats && stats.children).toBeGreaterThan(10);

  // Tank ground agrees with the client-side authoritative ground query.
  const ground = await a.evaluate(() => {
    const w = window as unknown as { __recoil: Recoil };
    const s = w.__recoil.state();
    return s ? { y: s.tank.y, ground: w.__recoil.groundHeightAt(s.tank.x, s.tank.z) } : null;
  });
  expect(ground && Math.abs(ground.y - ground.ground)).toBeLessThan(0.4);

  const critical = errors.filter((e) => !e.includes('WebGL') && !e.includes('GPU'));
  expect(critical).toEqual([]);
  await ctxA.close();
  await ctxB.close();
});

test('checksum mismatch blocks gameplay with an error screen', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await enter(a);
  await a.click('#screen-main [data-act="create"]');
  await a.waitForFunction(() => (window as unknown as { __recoil: { code(): string } }).__recoil.code().length === 6);
  const code = await a.evaluate(() => (window as unknown as { __recoil: { code(): string } }).__recoil.code());
  await enter(b);
  await b.click('#screen-main [data-act="join"]');
  await b.fill('#join-code', code);
  await b.click('#join-go');
  // Corrupt the driver's reconstruction before the match starts.
  await a.evaluate(() => (window as unknown as { __recoil: Recoil }).__recoil.corruptArenaChecksum(12345));
  await a.click('#create-ready');
  await b.click('#ready-go');

  await a.waitForFunction(
    () => (window as unknown as { __recoil: Recoil }).__recoil.flow() === 'error',
    undefined,
    { timeout: 20000 },
  );
  await expect(a.locator('#screen-error:not(.hidden)')).toBeVisible();
  const message = await a.textContent('#error-msg');
  expect(message).toContain('checksum');
  // The Gunner still plays normally (server unaffected).
  await b.waitForFunction(
    () => (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state()?.phase === 'running',
    undefined,
    { timeout: 20000 },
  );
  await ctxA.close();
  await ctxB.close();
});

test('reconnect during an active round rebuilds the same checksummed arena', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const code = await createCrew(a, b);
  const sessionId = await a.evaluate(() => (window as unknown as { __recoil: Recoil }).__recoil.sessionId());
  const meta = await a.evaluate(() => (window as unknown as { __recoil: Recoil }).__recoil.arena());
  const z0 = await a.evaluate(() => (window as unknown as { __recoil: Recoil }).__recoil.state()?.tank.z ?? 0);

  // Disconnect the Driver, then rejoin from a fresh page with the session.
  await ctxA.close();
  const ctxC = await browser.newContext();
  const c = await ctxC.newPage();
  await enter(c);
  await c.evaluate(
    ({ code: room, sid }) => {
      (window as unknown as { __recoil: { rejoin(code: string, sid: string): void } }).__recoil.rejoin(room, sid);
    },
    { code, sid: sessionId },
  );
  await c.waitForFunction(
    () => (window as unknown as { __recoil: Recoil }).__recoil.state()?.phase === 'running',
    undefined,
    { timeout: 20000 },
  );
  const meta2 = await c.evaluate(() => (window as unknown as { __recoil: Recoil }).__recoil.arena());
  expect(meta2?.arenaChecksum).toBe(meta?.arenaChecksum);
  expect(meta2?.arenaBaseSeed).toBe(meta?.arenaBaseSeed);
  const z1 = await c.evaluate(() => (window as unknown as { __recoil: Recoil }).__recoil.state()?.tank.z ?? 0);
  expect(Math.abs(z1 - z0)).toBeLessThan(60); // same match world, tank within reach
  await ctxB.close();
  await ctxC.close();
});

test('rematch rerolls the arena seed and does not leak scene objects', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await createCrew(a, b);
  const seed0 = await a.evaluate(() => (window as unknown as { __recoil: Recoil }).__recoil.arena()?.arenaBaseSeed);
  const children0 = await a.evaluate(() => (window as unknown as { __recoil: Recoil }).__recoil.sceneStats()?.children ?? 0);

  // Fast-forward both clients through the round with scripted input.
  await a.evaluate(() => {
    const w = window as unknown as { __recoil: { input(r: string, d: unknown): void; state(): { tank: { x: number; z: number; yaw: number } } } };
    const id = setInterval(() => {
      const s = w.__recoil.state();
      if (!s) return;
      w.__recoil.input('driver', { throttle: 0.85, steer: Math.sin(Date.now() / 500) * 0.6, dashPressed: false, jumpPressed: false });
    }, 100);
    (window as unknown as Record<string, unknown>).__stop = () => clearInterval(id);
  });
  await b.evaluate(() => {
    const w = window as unknown as { __recoil: { input(r: string, d: unknown): void; state(): { turret: { cannonCooldown: number; jackpotReady: boolean } } } };
    const id = setInterval(() => {
      const s = w.__recoil.state();
      if (!s) return;
      w.__recoil.input('gunner', { aimYaw: 0, aimPitch: 0.05, primary: true, secondary: false, ability: s.turret.jackpotReady });
    }, 100);
    (window as unknown as Record<string, unknown>).__stop = () => clearInterval(id);
  });
  await a.waitForFunction(
    () => (window as unknown as { __recoil: Recoil }).__recoil.state()?.phase === 'results',
    undefined,
    { timeout: 130000 },
  );
  await a.evaluate(() => (window as unknown as { __stop?: () => void }).__stop?.());
  await b.evaluate(() => (window as unknown as { __stop?: () => void }).__stop?.());

  await a.click('.mod[data-mod="doubleBarrel"]');
  await b.click('.mod[data-mod="doubleBarrel"]');
  await a.waitForFunction(
    () => {
      const w = window as unknown as { __recoil: Recoil };
      const s = w.__recoil.state();
      return s?.phase === 'running' && w.__recoil.arena()?.arenaBaseSeed !== undefined;
    },
    undefined,
    { timeout: 30000 },
  );
  const seed1 = await a.evaluate(() => (window as unknown as { __recoil: Recoil }).__recoil.arena()?.arenaBaseSeed);
  expect(seed1).not.toBe(seed0);
  const children1 = await a.evaluate(() => (window as unknown as { __recoil: Recoil }).__recoil.sceneStats()?.children ?? 0);
  expect(children1).toBeLessThanOrEqual(children0 + 8); // no scene/listener leak across rematch
  await ctxA.close();
  await ctxB.close();
});
