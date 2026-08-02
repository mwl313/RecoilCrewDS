import { expect, test, type Page } from '@playwright/test';

async function createCrew(pageA: Page, pageB: Page): Promise<string> {
  await pageA.goto('/?test=1');
  await pageA.click('#screen-boot');
  await pageA.click('#screen-main [data-act="create"]');
  await pageA.waitForFunction(() => (window as unknown as { __recoil: { code(): string } }).__recoil.code().length === 6);
  const code = await pageA.evaluate(() => (window as unknown as { __recoil: { code(): string } }).__recoil.code());
  await pageB.goto('/?test=1');
  await pageB.click('#screen-boot');
  await pageB.click('#screen-main [data-act="join"]');
  await pageB.fill('#join-code', code);
  await pageB.click('#join-go');
  await pageA.click('#create-ready');
  await pageB.click('#ready-go');
  for (const p of [pageA, pageB]) {
    await p.waitForFunction(
      () => (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state()?.phase === 'running',
      undefined,
      { timeout: 20000 },
    );
  }
  return code;
}

test('real Driver keyboard input moves the shared tank online', async ({ browser }) => {
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
  await a.waitForTimeout(800);

  // Re-enable the real input path (test mode normally suppresses auto-send).
  await a.evaluate(() => (window as unknown as { __recoil: { setAutoInput(v: boolean): void } }).__recoil.setAutoInput(true));
  const z0 = await a.evaluate(() => (window as unknown as { __recoil: { state(): { tank: { z: number } } } }).__recoil.state().tank.z);

  // Hold W with the real keyboard: the game must forward it to the server.
  await a.keyboard.down('w');
  await a.waitForFunction(
    (z0) => {
      const s = (window as unknown as { __recoil: { state(): { tank: { z: number } } | null } }).__recoil.state();
      return s ? Math.abs(s.tank.z - z0) > 2 : false;
    },
    z0,
    { timeout: 20000 },
  );
  await a.keyboard.up('w');

  // The Gunner's view of the shared tank must agree (server-authoritative).
  const zA = await a.evaluate(() => (window as unknown as { __recoil: { state(): { tank: { z: number } } } }).__recoil.state().tank.z);
  const zB = await b.evaluate(() => (window as unknown as { __recoil: { state(): { tank: { z: number } } } }).__recoil.state().tank.z);
  expect(Math.abs(zA - z0)).toBeGreaterThan(2);
  expect(Math.abs(zB - z0)).toBeGreaterThan(2);

  const critical = errors.filter((e) => !e.includes('WebGL') && !e.includes('GPU'));
  expect(critical).toEqual([]);

  await ctxA.close();
  await ctxB.close();
});

test('real Gunner mouse fires the machine gun and aims the turret online', async ({ browser }) => {
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
  await b.evaluate(() => (window as unknown as { __recoil: { setAutoInput(v: boolean): void } }).__recoil.setAutoInput(true));
  await b.waitForTimeout(800);

  // Acquire pointer lock through a real canvas click (user-gesture path).
  const locked = await b.evaluate(() => document.pointerLockElement !== null);
  if (!locked) {
    await b.mouse.click(640, 360);
    await b.waitForFunction(() => document.pointerLockElement !== null, undefined, { timeout: 5000 });
  }

  // Real left mouse button must reach the server and start the machine gun.
  await b.mouse.move(640, 360);
  await b.mouse.down();
  await b.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { turret: { mgCooldown: number } } | null } }).__recoil.state();
    return s ? s.turret.mgCooldown > 0 : false;
  }, undefined, { timeout: 10000 });
  await b.mouse.up();

  // Mouse look must rotate the turret on the authoritative server state.
  const yaw0 = await b.evaluate(() => (window as unknown as { __recoil: { state(): { turret: { yaw: number } } } }).__recoil.state().turret.yaw);
  await b.evaluate(() => {
    const canvas = document.querySelector('canvas#game-canvas');
    for (let i = 0; i < 8; i++) {
      canvas?.dispatchEvent(new MouseEvent('mousemove', { movementX: 90, movementY: 0 }));
    }
  });
  await b.waitForFunction(
    (yaw0) => {
      const s = (window as unknown as { __recoil: { state(): { turret: { yaw: number } } | null } }).__recoil.state();
      if (!s) return false;
      const d = s.turret.yaw - yaw0;
      return Math.abs(d) > 0.08;
    },
    yaw0,
    { timeout: 10000 },
  );

  const critical = errors.filter((e) => !e.includes('WebGL') && !e.includes('GPU'));
  expect(critical).toEqual([]);

  await ctxA.close();
  await ctxB.close();
});
