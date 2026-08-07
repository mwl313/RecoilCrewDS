import { expect, test, type Page } from '@playwright/test';

async function createCrew(pageA: Page, pageB: Page): Promise<string> {
  await pageA.goto('/?test=1');
  await pageA.click('#screen-boot');
  await pageA.click('#screen-main [data-act="multiplayer"]');
  await pageA.click('#screen-main [data-act="create"]');
  await pageA.waitForFunction(() => (window as unknown as { __recoil: { code(): string } }).__recoil.code().length === 6);
  const code = await pageA.evaluate(() => (window as unknown as { __recoil: { code(): string } }).__recoil.code());
  await pageB.goto('/?test=1');
  await pageB.click('#screen-boot');
  await pageB.click('#screen-main [data-act="multiplayer"]');
  await pageB.click('#screen-main [data-act="join"]');
  await pageB.fill('#join-code', code);
  await pageB.click('#join-go');
  await pageA.click('#lobby-ready');
  await pageB.click('#lobby-ready');
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

test('real Space press jumps exactly once online and requires a release to jump again', async ({ browser }) => {
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
  await a.evaluate(() => (window as unknown as { __recoil: { setAutoInput(v: boolean): void } }).__recoil.setAutoInput(true));
  await a.waitForTimeout(500);

  // One press: the authoritative tank must leave the ground.
  await a.keyboard.press('Space');
  await a.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { tank: { vy: number; grounded: boolean } } | null } }).__recoil.state();
    return s ? (!s.tank.grounded || s.tank.vy > 1) : false;
  }, undefined, { timeout: 10000 });

  // Hold for the full airtime plus landing: count apexes above jumpHeight/2.
  const apexes = await a.evaluate(async () => {
    const w = window as unknown as { __recoil: { state(): { tank: { y: number } } | null } };
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let count = 0;
    let rising = false;
    for (let i = 0; i < 90; i++) {
      const s = w.__recoil.state();
      if (s) {
        const y = s.tank.y;
        if (y > 1.1 && !rising) rising = true;
        if (rising && y < 0.2) {
          count++;
          rising = false;
        }
      }
      await delay(30);
    }
    return count;
  });
  await a.keyboard.up('Space');
  expect(apexes).toBeLessThanOrEqual(1);

  // Release + repress produces a second jump.
  await a.keyboard.press('Space');
  await a.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { tank: { vy: number } } | null } }).__recoil.state();
    return s ? s.tank.vy > 1 : false;
  }, undefined, { timeout: 10000 });
  await a.keyboard.up('Space');

  const critical = errors.filter((e) => !e.includes('WebGL') && !e.includes('GPU'));
  expect(critical).toEqual([]);
  await ctxA.close();
  await ctxB.close();
});

test('real Shift press dashes once online, never repeatedly while held', async ({ browser }) => {
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
  await a.evaluate(() => (window as unknown as { __recoil: { setAutoInput(v: boolean): void } }).__recoil.setAutoInput(true));
  await a.waitForTimeout(500);

  await a.keyboard.down('Shift');
  await a.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { tank: { dashCooldown: number } } | null } }).__recoil.state();
    return s ? s.tank.dashCooldown > 0 : false;
  }, undefined, { timeout: 10000 });

  // Count authoritative replicated state entries, not speed deltas. The
  // stateful dash intentionally has an acceleration curve, so one valid
  // burst can contain more than one large positive speed delta.
  const bursts = await a.evaluate(async () => {
    const w = window as unknown as {
      __recoil: { state(): { tank: { dashState?: 'inactive' | 'burst' | 'recovery' } } | null };
    };
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let previous: 'inactive' | 'burst' | 'recovery' = 'inactive';
    let bursts = 0;
    for (let i = 0; i < 70; i++) {
      const s = w.__recoil.state();
      if (s) {
        const current = s.tank.dashState ?? 'inactive';
        if (current === 'burst' && previous !== 'burst') bursts++;
        previous = current;
      }
      await delay(30);
    }
    return bursts;
  });
  await a.keyboard.up('Shift');
  expect(bursts).toBe(1);

  const critical = errors.filter((e) => !e.includes('WebGL') && !e.includes('GPU'));
  expect(critical).toEqual([]);
  await ctxA.close();
  await ctxB.close();
});

test('HUD and How To Play use JUMP/DASH labels with no active brace/boost text', async ({ browser }) => {
  const menu = await browser.newPage();
  await menu.goto('/?test=1');
  await menu.click('#screen-boot');
  await menu.click('#screen-main [data-act="howto"]');
  const howto = await menu.textContent('#screen-howto');
  expect(howto).toMatch(/SHIFT\s+DASH/i);
  expect(howto).toMatch(/SPACE\s+JUMP/i);
  expect(howto).not.toMatch(/brace/i);
  expect(howto).not.toMatch(/boost/i);
  await menu.close();

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await createCrew(a, b);

  // The HUD dash indicator exists and no BRACE/BOOST labels are live.
  await a.waitForFunction(() => (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state()?.phase === 'running');
  const hudText = await a.textContent('#hud');
  expect(hudText).toContain('DASH');
  expect(hudText).not.toMatch(/BRACE/);
  expect(hudText).not.toMatch(/BOOST/);

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
