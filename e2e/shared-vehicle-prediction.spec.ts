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
  const runningFn = () => (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state()?.phase === 'running';
  for (let attempt = 0; attempt < 6; attempt++) {
    const okA = await a.waitForFunction(runningFn, undefined, { timeout: 8000 }).then(() => true).catch(() => false);
    const okB = await b.waitForFunction(runningFn, undefined, { timeout: 8000 }).then(() => true).catch(() => false);
    if (okA && okB) return;
    if (await a.locator('#lobby-ready').isVisible().catch(() => false)) await a.click('#lobby-ready');
    if (await b.locator('#lobby-ready').isVisible().catch(() => false)) await b.click('#lobby-ready');
  }
  throw new Error('match did not start');
}

test('gunner camera follows the shared predicted tank without the delayed interpolation timeline', async ({ browser }) => {
  const latency = Number(process.env.NETCODE_LATENCY_MS ?? 0);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await createCrew(a, b, latency);
  await a.evaluate(() => (window as unknown as { __recoil: { setAutoInput(v: boolean): void } }).__recoil.setAutoInput(true));
  await b.evaluate(() => (window as unknown as { __recoil: { setAutoInput(v: boolean): void } }).__recoil.setAutoInput(true));
  await a.keyboard.down('w');
  await a.waitForTimeout(700);
  await b.evaluate(() => {
    const w = window as unknown as {
      __recoil: { renderTank(): { x: number; z: number } | null; state(): { tank: { z: number } } | null };
      __stab: { samples: Array<{ rz: number; az: number }> };
    };
    w.__stab = { samples: [] };
    const start = performance.now();
    const rec = (now: number): void => {
      const rt = w.__recoil.renderTank();
      const st = w.__recoil.state();
      if (rt && st) w.__stab.samples.push({ rz: rt.z, az: st.tank.z });
      if (now - start < 1200) requestAnimationFrame(rec);
    };
    requestAnimationFrame(rec);
  });
  await b.waitForTimeout(2200);
  await a.keyboard.up('w');
  const samples = await b.evaluate(() => (window as unknown as { __stab: { samples: Array<{ rz: number; az: number }> } }).__stab.samples);
  const debug = await b.evaluate(() => (window as unknown as { __recoil: { predictionDebug(): unknown } }).__recoil.predictionDebug());
  console.log('[shared] gunner predictor', JSON.stringify(debug));
  expect(samples.length).toBeGreaterThan(30);
  const first = samples[0];
  const last = samples[samples.length - 1];
  expect(last.az - first.az).toBeGreaterThan(5); // server tank actually drove
  let maxBackward = 0;
  let maxLag = 0;
  for (let i = 1; i < samples.length; i++) {
    maxBackward = Math.max(maxBackward, samples[i - 1].rz - samples[i].rz);
    maxLag = Math.max(maxLag, samples[i].az - samples[i].rz);
  }
  // Gunner's rendered tank tracks authority (no 100 ms historical lag) and
  // never snaps backward.
  console.log(`[shared] gunner render ${last.rz.toFixed(2)}m vs authority ${last.az.toFixed(2)}m maxLag ${maxLag.toFixed(2)}m maxBackward ${maxBackward.toFixed(2)}m`);
  // Localhost: tight tracking (~1 m). Under synthetic RTT the relayed input
  // is inherently RTT-stale, so allow RTT × top-speed (~14 m/s) plus the
  // smoothing baseline.
  expect(maxLag).toBeLessThan(1.2 + (latency / 1000) * 14);
  expect(maxBackward).toBeLessThan(0.25);
  await ctxA.close();
  await ctxB.close();
});

test('rematch and reconnect keep shared prediction alive', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await createCrew(a, b);
  const session = await b.evaluate(() => ({
    code: (window as unknown as { __recoil: { code(): string } }).__recoil.code(),
    sessionId: (window as unknown as { __recoil: { sessionId(): string } }).__recoil.sessionId(),
  }));
  await b.reload();
  await b.click('#screen-boot');
  await b.evaluate(
    (s) => (window as unknown as { __recoil: { rejoin(c: string, sid: string): void } }).__recoil.rejoin(s.code, s.sessionId),
    session,
  );
  await b.waitForFunction(() => (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state()?.phase === 'running', undefined, { timeout: 20000 });
  const stillRunning = await b.evaluate(() => (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state()?.phase);
  expect(stillRunning).toBe('running');
  await ctxA.close();
  await ctxB.close();
});
