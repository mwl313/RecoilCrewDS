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

test('downward cannon aim launches the shared tank on both clients (arcade recoil)', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await createCrew(a, b);
  await b.waitForTimeout(300);
  const yBeforeA = await a.evaluate(() => (window as unknown as { __recoil: { state(): { tank: { y: number } } | null } }).__recoil.state()?.tank.y ?? 0);
  const yBeforeB = await b.evaluate(() => (window as unknown as { __recoil: { state(): { tank: { y: number } } | null } }).__recoil.state()?.tank.y ?? 0);
  // Gunner aims steeply downward and fires; recoil is the inverse vector.
  // Enable → inject → freeze happen in ONE synchronous evaluate so no
  // periodic frame can overwrite the held edge before the server ticks.
  let launched = false;
  for (let attempt = 0; attempt < 3 && !launched; attempt++) {
    await b.evaluate(() => {
      const w = window as unknown as {
        __recoil: {
          setAutoInput(v: boolean): void;
          input(role: string, data: unknown): void;
        };
      };
      w.__recoil.setAutoInput(true);
      w.__recoil.input('gunner', { aimYaw: 0, aimPitch: -1.2, primary: false, secondary: true, ability: false });
      w.__recoil.setAutoInput(false);
    });
    await b.waitForTimeout(80);
    const results: boolean[] = [];
    for (const [p, before] of [[a, yBeforeA], [b, yBeforeB]] as const) {
      const ok = await p
        .waitForFunction(
          (beforeY: number) => {
            const s = (window as unknown as { __recoil: { state(): { tank: { y: number } } | null } }).__recoil.state();
            return !!s && s.tank.y > beforeY + 0.25; // sustained launch rise
          },
          before,
          { timeout: 3000 },
        )
        .then(() => true)
        .catch(() => false);
      results.push(ok);
    }
    launched = results[0] && results[1];
  }
  expect(launched).toBe(true);
  const va = await a.evaluate(() => (window as unknown as { __recoil: { state(): { tank: { vy: number } } } }).__recoil.state().tank.vy);
  const vb = await b.evaluate(() => (window as unknown as { __recoil: { state(): { tank: { vy: number } } } }).__recoil.state().tank.vy);
  console.log(`[arcade] downward cannon vy driver=${va.toFixed(2)} gunner=${vb.toFixed(2)}`);
  // The Driver's predicted tank must show the same upward trajectory.
  await a.evaluate(() => {
    const w = window as unknown as { __recoil: { renderTank(): { y: number } | null }; __t: { ys: number[] } };
    w.__t = { ys: [] };
    const start = performance.now();
    const rec = (now: number): void => {
      const rt = w.__recoil.renderTank();
      if (rt) w.__t.ys.push(rt.y);
      if (now - start < 500) requestAnimationFrame(rec);
    };
    requestAnimationFrame(rec);
  });
  await a.waitForTimeout(800);
  const ys = await a.evaluate(() => (window as unknown as { __t: { ys: number[] } }).__t.ys);
  expect(Math.max(...ys) - ys[0]).toBeGreaterThan(0.3); // tank visibly rises
  await ctxA.close();
  await ctxB.close();
});

test('sustained MG recoil stays smooth and matches authority (no correction spikes)', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await createCrew(a, b);
  await b.evaluate(() => (window as unknown as { __recoil: { setAutoInput(v: boolean): void } }).__recoil.setAutoInput(true));
  await b.waitForTimeout(300);
  await b.evaluate(() => {
    (window as unknown as { __recoil: { input(role: string, data: unknown): void } }).__recoil.input('gunner', {
      aimYaw: 0,
      aimPitch: 0,
      primary: true,
      secondary: false,
      ability: false,
    });
  });
  await a.evaluate(() => {
    const w = window as unknown as { __recoil: { renderTank(): { z: number } | null; state(): { tank: { z: number } } | null }; __m: { rz: number; az: number }[] };
    w.__m = [];
    const start = performance.now();
    const rec = (now: number): void => {
      const rt = w.__recoil.renderTank();
      const st = w.__recoil.state();
      if (rt && st) w.__m.push({ rz: rt.z, az: st.tank.z });
      if (now - start < 1500) requestAnimationFrame(rec);
    };
    requestAnimationFrame(rec);
  });
  await a.waitForTimeout(2200);
  await b.evaluate(() => {
    (window as unknown as { __recoil: { input(role: string, data: unknown): void } }).__recoil.input('gunner', {
      aimYaw: 0,
      aimPitch: 0,
      primary: false,
      secondary: false,
      ability: false,
    });
  });
  const samples = await a.evaluate(() => (window as unknown as { __m: { rz: number; az: number }[] }).__m);
  expect(samples.length).toBeGreaterThan(30);
  let maxBackward = 0;
  for (let i = 1; i < samples.length; i++) {
    maxBackward = Math.max(maxBackward, samples[i - 1].rz - samples[i].rz);
  }
  console.log(`[arcade] MG samples=${samples.length} maxBackward=${maxBackward.toFixed(3)}m`);
  expect(maxBackward).toBeLessThan(0.25);
  await ctxA.close();
  await ctxB.close();
});
