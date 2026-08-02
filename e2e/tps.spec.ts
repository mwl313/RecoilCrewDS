import { expect, test, type Page } from '@playwright/test';

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

async function enableRealInput(page: Page) {
  await page.evaluate(() => (window as unknown as { __recoil: { setAutoInput(v: boolean): void } }).__recoil.setAutoInput(true));
}

async function lockPointer(page: Page) {
  const locked = await page.evaluate(() => document.pointerLockElement !== null);
  if (!locked) {
    await page.mouse.click(640, 360);
    await page.waitForFunction(() => document.pointerLockElement !== null, undefined, { timeout: 5000 });
  }
}

function cameraState(page: Page) {
  return page.evaluate(() => (window as unknown as { __recoil: { cameraState(): { yaw: number; pitch: number; recentering: boolean } } }).__recoil.cameraState());
}

function turretSpaces(page: Page) {
  return page.evaluate(() => (window as unknown as { __recoil: { turretSpaces(): { desiredYawLocal: number; predictedYawLocal: number; authoritativeYawLocal: number } } }).__recoil.turretSpaces());
}

test('Driver mouse right looks right and mouse up looks up (non-inverted)', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await createCrew(a, b);
  await lockPointer(a);
  const y0 = (await cameraState(a)).yaw;
  const p0 = (await cameraState(a)).pitch;
  await a.evaluate(() => {
    const canvas = document.querySelector('canvas#game-canvas');
    canvas?.dispatchEvent(new MouseEvent('mousemove', { movementX: 200, movementY: -100 }));
  });
  await a.waitForTimeout(100);
  const s1 = await cameraState(a);
  expect(s1.yaw - y0).toBeLessThan(-0.3);
  expect(s1.pitch - p0).toBeGreaterThan(0.15);
  await ctxA.close();
  await ctxB.close();
});

test('Gunner mouse uses the same non-inverted directions', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await createCrew(a, b);
  await lockPointer(b);
  const y0 = (await cameraState(b)).yaw;
  await b.evaluate(() => {
    const canvas = document.querySelector('canvas#game-canvas');
    canvas?.dispatchEvent(new MouseEvent('mousemove', { movementX: -150, movementY: 0 }));
  });
  await b.waitForTimeout(100);
  expect((await cameraState(b)).yaw - y0).toBeGreaterThan(0.2);
  await ctxA.close();
  await ctxB.close();
});

test('Driver A/D are chassis-left/right forward and reverse, independent of camera', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await createCrew(a, b);
  await enableRealInput(a);
  const yaw0 = await a.evaluate(() => (window as unknown as { __recoil: { state(): { tank: { yaw: number } } } }).__recoil.state().tank.yaw);
  await a.keyboard.down('a');
  await a.waitForTimeout(700);
  await a.keyboard.up('a');
  const yawA = await a.evaluate(() => (window as unknown as { __recoil: { state(): { tank: { yaw: number } } } }).__recoil.state().tank.yaw);
  expect(yawA - yaw0).toBeGreaterThan(0.2); // A → left (yaw increases toward +X = screen-left)

  await a.keyboard.down('d');
  await a.waitForTimeout(700);
  await a.keyboard.up('d');
  const yawD = await a.evaluate(() => (window as unknown as { __recoil: { state(): { tank: { yaw: number } } } }).__recoil.state().tank.yaw);
  expect(yawD - yawA).toBeLessThan(-0.2); // D → right (yaw decreases toward -X = screen-right)

  // Reverse must not flip A/D.
  await a.keyboard.down('s');
  await a.keyboard.down('a');
  await a.waitForTimeout(700);
  await a.keyboard.up('a');
  await a.keyboard.up('s');
  const yawRev = await a.evaluate(() => (window as unknown as { __recoil: { state(): { tank: { yaw: number } } } }).__recoil.state().tank.yaw);
  expect(yawRev - yawD).toBeGreaterThan(0.05); // still left while reversing

  // Looking backward (camera yaw = chassis + π) must not change W behavior.
  await a.evaluate(() => {
    const canvas = document.querySelector('canvas#game-canvas');
    canvas?.dispatchEvent(new MouseEvent('mousemove', { movementX: 3000, movementY: 0 }));
  });
  const vz0 = await a.evaluate(() => (window as unknown as { __recoil: { state(): { tank: { vz: number } } } }).__recoil.state().tank.vz);
  await a.keyboard.down('w');
  await a.waitForTimeout(900);
  await a.keyboard.up('w');
  const vz1 = await a.evaluate(() => (window as unknown as { __recoil: { state(): { tank: { vz: number } } } }).__recoil.state().tank.vz);
  expect(vz1 - vz0).toBeGreaterThan(2);
  await ctxA.close();
  await ctxB.close();
});

test('Driver R recenters smoothly behind the chassis and camera never touches the turret', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await createCrew(a, b);
  await lockPointer(a);
  const chassis = await a.evaluate(() => (window as unknown as { __recoil: { state(): { tank: { yaw: number } } } }).__recoil.state().tank.yaw);
  const turretBefore = await a.evaluate(() => (window as unknown as { __recoil: { state(): { turret: { yaw: number } } } }).__recoil.state().turret.yaw);
  await a.evaluate(() => {
    const canvas = document.querySelector('canvas#game-canvas');
    canvas?.dispatchEvent(new MouseEvent('mousemove', { movementX: 800, movementY: 0 }));
  });
  await a.keyboard.press('r');
  // Wait for the recenter to actually start (flag turns on), then finish.
  await a.waitForFunction(() => {
    const c = (window as unknown as { __recoil: { cameraState(): { recentering: boolean } } }).__recoil.cameraState();
    return c.recentering;
  }, undefined, { timeout: 5000 });
  await a.waitForFunction(() => {
    const c = (window as unknown as { __recoil: { cameraState(): { recentering: boolean; yaw: number } } }).__recoil.cameraState();
    return !c.recentering;
  }, undefined, { timeout: 5000 });
  const cam = await cameraState(a);
  expect(Math.abs(cam.yaw - chassis) % (Math.PI * 2)).toBeLessThan(0.12);
  const turretAfter = await a.evaluate(() => (window as unknown as { __recoil: { state(): { turret: { yaw: number } } } }).__recoil.state().turret.yaw);
  expect(Math.abs(turretAfter - turretBefore)).toBeLessThan(0.01);
  await ctxA.close();
  await ctxB.close();
});

test('Gunner keeps the intended world aim while the chassis rotates', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await createCrew(a, b);
  await enableRealInput(a);
  await lockPointer(b);
  const t0 = await turretSpaces(b);
  const yaw0 = await b.evaluate(() => (window as unknown as { __recoil: { renderTank(): { yaw: number } | null } }).__recoil.renderTank()?.yaw ?? 0);
  const worldAim0 = t0.desiredYawLocal + yaw0;
  await a.keyboard.down('d');
  await a.waitForTimeout(800);
  await a.keyboard.up('d');
  const t1 = await turretSpaces(b);
  const yaw1 = await b.evaluate(() => (window as unknown as { __recoil: { renderTank(): { yaw: number } | null } }).__recoil.renderTank()?.yaw ?? 0);
  const worldAim1 = t1.desiredYawLocal + yaw1;
  const diff = Math.abs(((worldAim1 - worldAim0 + Math.PI) % (Math.PI * 2)) - Math.PI);
  expect(diff).toBeLessThan(0.35);
  await ctxA.close();
  await ctxB.close();
});

test('Driver tank renders smoothly between 20 Hz snapshots (no stepping)', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await createCrew(a, b);
  await enableRealInput(a);
  await a.keyboard.down('w');
  const samples: number[] = [];
  const started = Date.now();
  while (Date.now() - started < 350) {
    const t = await a.evaluate(() => (window as unknown as { __recoil: { renderTank(): { z: number } | null } }).__recoil.renderTank());
    if (t) samples.push(t.z);
    await a.waitForTimeout(16);
  }
  await a.keyboard.up('w');
  const distinct = new Set(samples.map((v) => v.toFixed(2))).size;
  expect(samples.length).toBeGreaterThan(10);
  expect(distinct).toBeGreaterThan(6); // far more than 20 Hz snapshot steps
  await ctxA.close();
  await ctxB.close();
});

test('wall and high-speed collisions stop the tank without penetration or tunneling', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await createCrew(a, b);
  // Guided approach: drive straight +Z at x=-6 past the bowl barrier
  // (x -4..4, z 16..18), steer toward the gate lane (x≈-2), then boost
  // straight into the crusher gate (x -5..5, z 35.25..37.75) at high speed.
  await a.evaluate(async () => {
    const w = window as unknown as { __recoil: { input(r: string, d: unknown): void; state(): { tank: { yaw: number; x: number; z: number; vz: number } } } };
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    // 1. Straight +Z at x=-6 until safely past the bowl barrier.
    w.__recoil.input('driver', { throttle: 1, steer: 0, boost: false, brace: false });
    for (let i = 0; i < 30; i++) {
      const s = w.__recoil.state();
      if (s && s.tank.z > 19.5) break;
      await delay(100);
    }
    // 2. Guide toward the gate lane with a small P-controller until z reaches
    // 26 (yaw+ comes from steer -1 under the project convention), leaving a
    // long enough runway to reach full boost speed before impact.
    for (let i = 0; i < 45; i++) {
      const s = w.__recoil.state();
      if (!s || s.tank.z >= 26) break;
      const desiredYaw = Math.max(-0.45, Math.min(0.45, Math.atan2(-2 - s.tank.x, 29 - s.tank.z)));
      const steer = Math.max(-1, Math.min(1, (s.tank.yaw - desiredYaw) * 2.5));
      w.__recoil.input('driver', { throttle: 1, steer, boost: false, brace: false });
      await delay(100);
    }
    // 3. Boost straight into the gate; track the peak forward speed.
    let maxVz = 0;
    let lastZ = -1;
    for (let i = 0; i < 25; i++) {
      const s = w.__recoil.state();
      if (!s) {
        await delay(100);
        continue;
      }
      maxVz = Math.max(maxVz, s.tank.vz);
      if (lastZ > 0 && s.tank.z - lastZ < 0.05 && i > 5) break; // impact
      lastZ = s.tank.z;
      w.__recoil.input('driver', { throttle: 1, steer: 0, boost: true, brace: false });
      await delay(100);
    }
    w.__recoil.input('driver', { throttle: 0, steer: 0, boost: false, brace: false });
    (window as unknown as Record<string, unknown>).__maxVz = maxVz;
  });
  await a.waitForTimeout(600);
  const maxVz = await a.evaluate(() => (window as unknown as { __maxVz: number }).__maxVz);
  const z = await a.evaluate(() => (window as unknown as { __recoil: { state(): { tank: { z: number } } } }).__recoil.state().tank.z);
  const z2 = await a.evaluate(() => (window as unknown as { __recoil: { state(): { tank: { z: number } } } }).__recoil.state().tank.z);
  await a.waitForTimeout(500);
  const z3 = await a.evaluate(() => (window as unknown as { __recoil: { state(): { tank: { z: number } } } }).__recoil.state().tank.z);
  expect(maxVz).toBeGreaterThan(18); // genuinely high-speed impact
  expect(z).toBeLessThan(35.2); // never penetrated the z 35.25..37.75 gate
  expect(z).toBeGreaterThan(31.0); // actually reached the gate
  expect(Math.abs(z3 - z2)).toBeLessThan(0.3); // came to rest, no oscillation
  await ctxA.close();
  await ctxB.close();
});

test('copy button gives visible feedback and fires exactly one attempt per click', async ({ browser }) => {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    const calls: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: (t: string) => {
          calls.push(t);
          return Promise.resolve();
        },
      },
      configurable: true,
    });
    (window as unknown as Record<string, unknown>).__copyCalls = calls;
  });
  await enter(page);
  await page.click('#screen-main [data-act="create"]');
  await page.waitForFunction(() => (window as unknown as { __recoil: { code(): string } }).__recoil.code().length === 6);
  const copyBtn = page.locator('#copy-code');
  await expect(copyBtn).toBeEnabled();
  await copyBtn.click();
  await expect(copyBtn).toHaveText('COPIED');
  await copyBtn.click();
  await page.waitForTimeout(200);
  const calls = await page.evaluate(() => (window as unknown as { __copyCalls: string[] }).__copyCalls);
  expect(calls.length).toBe(2);
  expect(calls[0]).toMatch(/^[A-Z2-9]{6}$/);
  await page.close();
});

test('pointer-capture click acquires lock without firing a weapon', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await createCrew(a, b);
  await b.evaluate(() => (window as unknown as { __recoil: { setInputEnabled(v: boolean): void } }).__recoil.setInputEnabled(true));
  const locked0 = await b.evaluate(() => document.pointerLockElement !== null);
  if (!locked0) {
    await b.mouse.click(640, 360);
    await b.waitForFunction(() => document.pointerLockElement !== null, undefined, { timeout: 5000 });
  }
  await b.waitForTimeout(400);
  const mg = await b.evaluate(() => (window as unknown as { __recoil: { state(): { turret: { mgCooldown: number } } } }).__recoil.state().turret.mgCooldown);
  expect(mg).toBe(0);
  await ctxA.close();
  await ctxB.close();
});

test('pause overlay neutralizes gameplay input and one practice click starts one game', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await createCrew(a, b);
  await enableRealInput(a);
  await a.keyboard.press('Escape');
  await a.waitForTimeout(300);
  await a.keyboard.press('Escape');
  await expect(a.locator('#screen-pause:not(.hidden)')).toBeVisible();
  const z0 = await a.evaluate(() => (window as unknown as { __recoil: { state(): { tank: { z: number } } } }).__recoil.state().tank.z);
  await a.keyboard.down('w');
  await a.waitForTimeout(600);
  await a.keyboard.up('w');
  const z1 = await a.evaluate(() => (window as unknown as { __recoil: { state(): { tank: { z: number } } } }).__recoil.state().tank.z);
  expect(Math.abs(z1 - z0)).toBeLessThan(0.3);
  await a.click('#resume-btn');
  await ctxA.close();
  await ctxB.close();

  const practice = await browser.newPage();
  await enter(practice);
  await practice.click('#screen-main [data-act="practice"]');
  await practice.waitForTimeout(600);
  const canvases = await practice.evaluate(() => document.querySelectorAll('canvas#game-canvas').length);
  expect(canvases).toBe(1);
  const passes = await practice.evaluate(() => (window as unknown as { __recoil: { composerPasses(): number } }).__recoil.composerPasses());
  for (let i = 0; i < 5; i++) {
    await practice.keyboard.press('Tab');
    await practice.waitForTimeout(150);
  }
  const passesAfter = await practice.evaluate(() => (window as unknown as { __recoil: { composerPasses(): number } }).__recoil.composerPasses());
  expect(passes).toBe(2);
  expect(passesAfter).toBe(2);
  await practice.close();
});
