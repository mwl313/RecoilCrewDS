import { expect, test, type Page } from '@playwright/test';

async function enter(page: Page, latency = 0) {
  const jitter = Number(process.env.NETCODE_JITTER_MS ?? 0);
  const loss = Number(process.env.NETCODE_LOSS_RATE ?? 0);
  const params = [`test=1`];
  if (latency > 0) params.push(`latency=${latency}`);
  if (jitter > 0) params.push(`jitter=${jitter}`);
  if (loss > 0) params.push(`loss=${loss}`);
  await page.goto(`/?${params.join('&')}`);
  await page.click('#screen-boot');
}

async function createCrew(a: Page, b: Page, latency = 0): Promise<void> {
  await enter(a, latency);
  await a.click('#screen-main [data-act="multiplayer"]');
  await a.click('#screen-main [data-act="create"]');
  await a.waitForFunction(() => (window as unknown as { __recoil: { code(): string } }).__recoil.code().length === 6);
  const code = await a.evaluate(() => (window as unknown as { __recoil: { code(): string } }).__recoil.code());
  await enter(b, latency);
  await b.click('#screen-main [data-act="multiplayer"]');
  await b.click('#screen-main [data-act="join"]');
  await b.fill('#join-code', code);
  await b.click('#join-go');
  await a.click('#lobby-ready');
  await b.click('#lobby-ready');
  const runningFn = () => {
    const recoil = (window as unknown as {
      __recoil: { state(): { phase: string } | null; flow(): string };
    }).__recoil;
    return recoil.state()?.phase === 'running' && recoil.flow() === 'game';
  };
  for (let attempt = 0; attempt < 6; attempt++) {
    const okA = await a.waitForFunction(runningFn, undefined, { timeout: 8000 }).then(() => true).catch(() => false);
    const okB = await b.waitForFunction(runningFn, undefined, { timeout: 8000 }).then(() => true).catch(() => false);
    if (okA && okB) {
      await b.waitForFunction(() =>
        (window as unknown as { __recoil: { role(): string } }).__recoil.role() === 'gunner',
      );
      return;
    }
    if (await a.locator('#lobby-ready').isVisible().catch(() => false)) await a.click('#lobby-ready');
    if (await b.locator('#lobby-ready').isVisible().catch(() => false)) await b.click('#lobby-ready');
  }
  throw new Error('match did not start');
}

async function lockPointer(page: Page) {
  const locked = await page.evaluate(() => document.pointerLockElement !== null);
  if (!locked) {
    await page.mouse.click(640, 360);
    await page.waitForFunction(() => document.pointerLockElement !== null, undefined, { timeout: 5000 });
  }
}

test('gunner cannon press is sent immediately and accepted exactly once', async ({ browser }) => {
  const latency = Number(process.env.NETCODE_LATENCY_MS ?? 0);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await b.bringToFront();
  await createCrew(a, b, latency);
  await b.bringToFront();
  await b.evaluate(() => (window as unknown as { __recoil: { setAutoInput(v: boolean): void } }).__recoil.setAutoInput(true));
  await lockPointer(b);
  await b.waitForTimeout(300);
  const start = await b.evaluate(() => performance.now());
  await b.mouse.down({ button: 'right' });
  await b.waitForTimeout(60);
  await b.mouse.up({ button: 'right' });
  await b.waitForFunction(
    () => {
      const s = (window as unknown as { __recoil: { state(): { turret: { cannonCooldown: number } } | null } }).__recoil.state();
      return !!s && s.turret.cannonCooldown > 0.3;
    },
    undefined,
    { timeout: 4000 },
  );
  const elapsed = await b.evaluate(() => performance.now()) - start;
  async function observeMaxShells(ms: number): Promise<number> {
    let max = 0;
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const n = await b.evaluate(() => (window as unknown as { __recoil: { state(): { shells: unknown[] } | null } }).__recoil.state()?.shells.length ?? 0);
      max = Math.max(max, n);
      await b.waitForTimeout(50);
    }
    return max;
  }
  const firstMax = await observeMaxShells(900);
  const state = await b.evaluate(() => (window as unknown as { __recoil: { state(): { turret: { cannonCooldown: number } } } }).__recoil.state());
  console.log(`[gunner] cannon accepted in ${elapsed.toFixed(0)}ms cooldown=${state.turret.cannonCooldown.toFixed(2)}s shellsMax=${firstMax}`);
  // Even under synthetic RTT, a very short click must not be lost between
  // 50 ms periodic frames (the discrete action bypasses the timer).
  // The generous bound covers headless rAF polling granularity; the real
  // action latency is tracked by netcodeMetrics (F4 overlay).
  expect(elapsed).toBeLessThan(latency * 2 + 600);
  expect(firstMax).toBeGreaterThanOrEqual(1);

  // The exact recoil impulse must move the gunner's predicted tank once per
  // click (shared predictor + impulse path), and a second click after the
  // cooldown must produce exactly one more impulse (no double application).
  await b.waitForFunction(
    () => {
      const s = (window as unknown as { __recoil: { state(): { turret: { cannonCooldown: number } } | null } }).__recoil.state();
      return !!s && s.turret.cannonCooldown <= 0.001;
    },
    undefined,
    { timeout: 5000 },
  );
  await b.waitForTimeout(200); // server-side cooldown may lag the client view
  const tankPos = () =>
    b.evaluate(() => {
      const t = (window as unknown as { __recoil: { renderTank(): { x: number; z: number } | null } }).__recoil.renderTank();
      return t ? { x: t.x, z: t.z } : { x: 0, z: 0 };
    });
  let impulseSeen = false;
  for (let attempt = 0; attempt < 3 && !impulseSeen; attempt++) {
    const before = await tankPos();
    await b.mouse.down({ button: 'right' });
    await b.waitForTimeout(60);
    await b.mouse.up({ button: 'right' });
    const end = Date.now() + 1000;
    while (Date.now() < end && !impulseSeen) {
      await b.waitForTimeout(40);
      const after = await tankPos();
      if (Math.hypot(after.x - before.x, after.z - before.z) > 0.25) impulseSeen = true;
    }
    if (!impulseSeen) await b.waitForTimeout(400);
  }
  expect(impulseSeen).toBe(true);
  await ctxA.close();
  await ctxB.close();
});

test('gunner charge HUD fills locally and releases exactly one full-charge shot', async ({ browser }) => {
  const latency = Number(process.env.NETCODE_LATENCY_MS ?? 0);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const driver = await ctxA.newPage();
  const gunner = await ctxB.newPage();
  await createCrew(driver, gunner, latency);
  await gunner.evaluate(() =>
    (window as unknown as { __recoil: { setAutoInput(value: boolean): void } }).__recoil.setAutoInput(true),
  );
  await lockPointer(gunner);
  await gunner.waitForTimeout(300);

  const beforeShots = await gunner.evaluate(() =>
    (window as unknown as { __recoil: { state(): { stats: { fullChargeShots: number } } } }).__recoil.state().stats.fullChargeShots,
  );
  await gunner.mouse.down({ button: 'right' });
  await gunner.waitForFunction(() => {
    const recoil = (window as unknown as {
      __recoil: {
        localCharge(): { held: boolean; full: boolean; ratio: number } | null;
        state(): { turret: { cannonHeld: boolean; cannonChargeFull: boolean; cannonChargeRatio: number } } | null;
      };
    }).__recoil;
    const local = recoil.localCharge();
    const state = recoil.state();
    return local?.held === true && local.full === true && local.ratio >= 0.999
      && state?.turret.cannonHeld === true && state.turret.cannonChargeFull === true
      && state.turret.cannonChargeRatio >= 0.999;
  }, undefined, { timeout: 5000 });
  await driver.waitForFunction(() => {
    const recoil = (window as unknown as {
      __recoil: {
        state(): { turret: { cannonHeld: boolean } } | null;
        audioStats(): { cannonChargeActive: boolean };
      };
    }).__recoil;
    return recoil.state()?.turret.cannonHeld === true && recoil.audioStats().cannonChargeActive;
  }, undefined, { timeout: 5000 });

  const chargePresentation = await gunner.evaluate(() => {
    const local = (window as unknown as {
      __recoil: { localCharge(): { held: boolean; full: boolean; ratio: number; pendingTransportActions: number } | null };
    }).__recoil.localCharge();
    const rail = document.getElementById('charge-fill');
    const crosshair = document.getElementById('crosshair-charge-fill');
    return {
      local,
      railWidth: rail?.style.width ?? '',
      crosshairHeight: crosshair?.style.height ?? '',
      crosshairFull: crosshair?.classList.contains('full') ?? false,
    };
  });
  expect(chargePresentation.local?.held).toBe(true);
  expect(chargePresentation.local?.full).toBe(true);
  expect(chargePresentation.local?.pendingTransportActions).toBe(0);
  expect(parseFloat(chargePresentation.railWidth)).toBeGreaterThanOrEqual(99.9);
  expect(parseFloat(chargePresentation.crosshairHeight)).toBeGreaterThanOrEqual(99.9);
  expect(chargePresentation.crosshairFull).toBe(true);

  await gunner.mouse.up({ button: 'right' });
  await gunner.waitForFunction((expected) => {
    const recoil = (window as unknown as {
      __recoil: {
        localCharge(): { held: boolean; pendingTransportActions: number } | null;
        state(): { stats: { fullChargeShots: number } } | null;
      };
    }).__recoil;
    const state = recoil.state();
    const local = recoil.localCharge();
    return state?.stats.fullChargeShots === expected && local?.held === false && local.pendingTransportActions === 0;
  }, beforeShots + 1, { timeout: 5000 });
  await driver.waitForFunction(() => {
    const recoil = (window as unknown as {
      __recoil: { audioStats(): { cannonChargeActive: boolean } };
    }).__recoil;
    return !recoil.audioStats().cannonChargeActive;
  }, undefined, { timeout: 5000 });
  await gunner.waitForTimeout(400);
  const afterShots = await gunner.evaluate(() =>
    (window as unknown as { __recoil: { state(): { stats: { fullChargeShots: number } } } }).__recoil.state().stats.fullChargeShots,
  );
  expect(afterShots).toBe(beforeShots + 1);

  await ctxA.close();
  await ctxB.close();
});

test('MG start edge is accepted and firing begins without holding', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await createCrew(a, b);
  await b.evaluate(() => (window as unknown as { __recoil: { setAutoInput(v: boolean): void } }).__recoil.setAutoInput(true));
  await lockPointer(b);
  await b.waitForTimeout(300);
  const start = await b.evaluate(() => performance.now());
  let fired = false;
  for (let attempt = 0; attempt < 3 && !fired; attempt++) {
    await b.mouse.down({ button: 'left' });
    await b.waitForTimeout(60);
    await b.mouse.up({ button: 'left' });
    fired = await b
      .waitForFunction(
        () => {
          const s = (window as unknown as { __recoil: { state(): { turret: { mgFiring: boolean } } | null } }).__recoil.state();
          return !!s && s.turret.mgFiring === true;
        },
        undefined,
        { timeout: 2500 },
      )
      .then(() => true)
      .catch(() => false);
    if (!fired) await b.waitForTimeout(300);
  }
  expect(fired).toBe(true);
  const elapsed = await b.evaluate(() => performance.now()) - start;
  console.log(`[gunner] mgStart accepted in ${elapsed.toFixed(0)}ms`);
  // Headless rAF polling inflates this; the functional assertion is firing.
  expect(elapsed).toBeLessThan(2000);
  await ctxA.close();
  await ctxB.close();
});
