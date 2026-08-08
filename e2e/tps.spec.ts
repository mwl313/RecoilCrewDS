import { expect, test, type Page } from '@playwright/test';
import {
  TPS_CAMERA_CONTROL_MAX_PITCH,
  mapLookPitchToBoomPitch,
} from '../src/client/tpsCamera';

async function enter(page: Page) {
  await page.goto('/?test=1');
  await page.click('#screen-boot');
}

async function createCrew(a: Page, b: Page): Promise<string> {
  await enter(a);
  await a.click('#screen-main [data-act="multiplayer"]');
  await a.click('#screen-main [data-act="create"]');
  await a.waitForFunction(() => (window as unknown as { __recoil: { code(): string } }).__recoil.code().length === 6);
  const code = await a.evaluate(() => (window as unknown as { __recoil: { code(): string } }).__recoil.code());
  await enter(b);
  await b.click('#screen-main [data-act="multiplayer"]');
  await b.click('#screen-main [data-act="join"]');
  await b.fill('#join-code', code);
  await b.click('#join-go');
  await a.click('#lobby-ready');
  await b.click('#lobby-ready');
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
  return page.evaluate(() => (window as unknown as {
    __recoil: {
      turretSpaces(): {
        desiredYawLocal: number;
        predictedYawLocal: number;
        authoritativeYawLocal: number;
        desiredPitch: number;
        predictedPitch: number;
      };
    };
  }).__recoil.turretSpaces());
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

  for (let i = 0; i < 3; i++) {
    await b.evaluate(() => {
      const canvas = document.querySelector('canvas#game-canvas');
      canvas?.dispatchEvent(new MouseEvent('mousemove', { movementX: 0, movementY: 20_000 }));
    });
    await b.waitForTimeout(50);
  }
  await b.waitForFunction((limit) => {
    const state = (window as unknown as { __recoil: { cameraState(): { pitch: number } } }).__recoil.cameraState();
    return Math.abs(state.pitch + limit) < 1e-5;
  }, TPS_CAMERA_CONTROL_MAX_PITCH);
  const lockedCamera = await cameraState(b);
  const lockedTurret = await turretSpaces(b);
  expect(lockedTurret.desiredPitch).toBeCloseTo(-Math.PI / 2, 4);
  expect(lockedTurret.predictedPitch).toBeCloseTo(-Math.PI / 2, 4);

  await b.evaluate(() => {
    const canvas = document.querySelector('canvas#game-canvas');
    canvas?.dispatchEvent(new MouseEvent('mousemove', { movementX: 1000, movementY: 0 }));
  });
  await b.waitForTimeout(100);
  expect((await cameraState(b)).yaw).toBeLessThan(lockedCamera.yaw - 0.2);
  await ctxA.close();
  await ctxB.close();
});

test('Single Player vertical lock keeps the camera and turret stable at both poles', async ({ page }) => {
  await enter(page);
  await page.click('#screen-main [data-act="single"]');
  await page.waitForFunction(
    () => (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state()?.phase === 'running',
    undefined,
    { timeout: 20000 },
  );
  await lockPointer(page);

  const move = (x: number, y: number) => page.evaluate(({ x, y }) => {
    const canvas = document.querySelector('canvas#game-canvas');
    canvas?.dispatchEvent(new MouseEvent('mousemove', { movementX: x, movementY: y }));
  }, { x, y });
  const fullState = () => page.evaluate(() => {
    const api = (window as unknown as {
      __recoil: {
        cameraState(): {
          yaw: number;
          pitch: number;
          follow: { boomPitch: number; lookPitch: number; cameraUpdateCount: number };
          aim: {
            resolvedWorldYaw: number;
            resolvedPitch: number;
            horizontalRatio: number;
            poleActive: boolean;
            verticalLocked: boolean;
          };
        };
        turretSpaces(): { desiredYawLocal: number; desiredPitch: number; predictedPitch: number };
      };
    }).__recoil;
    return { camera: api.cameraState(), turret: api.turretSpaces() };
  });

  for (let i = 0; i < 3; i++) {
    await move(0, 20_000);
    await page.waitForTimeout(50);
  }
  await page.waitForFunction((limit) => {
    const state = (window as unknown as { __recoil: { cameraState(): { pitch: number } } }).__recoil.cameraState();
    return Math.abs(state.pitch + limit) < 1e-5;
  }, TPS_CAMERA_CONTROL_MAX_PITCH);
  const down = await fullState();
  expect(down.camera.pitch).toBeCloseTo(-TPS_CAMERA_CONTROL_MAX_PITCH, 5);
  expect(down.camera.follow.lookPitch).toBeCloseTo(-TPS_CAMERA_CONTROL_MAX_PITCH, 5);
  expect(down.camera.follow.boomPitch).toBeCloseTo(
    mapLookPitchToBoomPitch(-TPS_CAMERA_CONTROL_MAX_PITCH),
    4,
  );
  expect(down.turret.desiredPitch).toBeCloseTo(-Math.PI / 2, 4);
  expect(down.turret.predictedPitch).toBeCloseTo(-Math.PI / 2, 4);
  expect(down.camera.aim.poleActive).toBe(true);
  expect(down.camera.aim.verticalLocked).toBe(true);

  const yawBefore = down.camera.yaw;
  const updatesBefore = down.camera.follow.cameraUpdateCount;
  await move(-900, 0);
  await page.waitForTimeout(100);
  const rotated = await fullState();
  expect(rotated.camera.yaw - yawBefore).toBeGreaterThan(0.2);
  expect(rotated.camera.follow.cameraUpdateCount).toBeGreaterThan(updatesBefore);
  expect(rotated.camera.aim.resolvedWorldYaw).toBeCloseTo(down.camera.aim.resolvedWorldYaw, 6);
  expect(rotated.turret.desiredPitch).toBeCloseTo(-Math.PI / 2, 4);

  for (let i = 0; i < 4; i++) {
    await move(0, -40_000);
    await page.waitForTimeout(50);
  }
  await page.waitForFunction((limit) => {
    const state = (window as unknown as { __recoil: { cameraState(): { pitch: number } } }).__recoil.cameraState();
    return Math.abs(state.pitch - limit) < 1e-5;
  }, TPS_CAMERA_CONTROL_MAX_PITCH);
  const up = await fullState();
  expect(up.camera.pitch).toBeCloseTo(TPS_CAMERA_CONTROL_MAX_PITCH, 5);
  expect(up.camera.follow.boomPitch).toBeCloseTo(
    mapLookPitchToBoomPitch(TPS_CAMERA_CONTROL_MAX_PITCH),
    4,
  );
  expect(up.turret.desiredPitch).toBeCloseTo(Math.PI / 2, 4);
  expect(up.turret.predictedPitch).toBeCloseTo(Math.PI / 2, 4);

  const reticle = await page.locator('#crosshair').boundingBox();
  expect(reticle).not.toBeNull();
  expect(Number.isFinite(reticle!.x + reticle!.y)).toBe(true);
  await expect(page.locator('#crosshair')).toHaveClass(/vertical-lock/);
});

test('camera and terrain aim queries stay bounded across gameplay RAFs', async ({ page }) => {
  await enter(page);
  await page.click('#screen-main [data-act="single"]');
  await page.waitForFunction(
    () => (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state()?.phase === 'running',
    undefined,
    { timeout: 20000 },
  );
  const samples = await page.evaluate(async () => {
    const api = (window as unknown as {
      __recoil: { netcodeMetrics(): { cameraQueryMs: number; aimQueryMs: number } };
    }).__recoil;
    const camera: number[] = [];
    const aim: number[] = [];
    await new Promise<void>((resolve) => {
      let frames = 0;
      const sample = () => {
        const metrics = api.netcodeMetrics();
        camera.push(metrics.cameraQueryMs);
        aim.push(metrics.aimQueryMs);
        if (++frames >= 120) resolve();
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    const percentile95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.95)];
    return {
      cameraMax: Math.max(...camera),
      cameraP95: percentile95(camera),
      aimMax: Math.max(...aim),
      aimP95: percentile95(aim),
    };
  });
  console.log(`[camera-perf] camera p95=${samples.cameraP95.toFixed(3)}ms max=${samples.cameraMax.toFixed(3)}ms; aim p95=${samples.aimP95.toFixed(3)}ms max=${samples.aimMax.toFixed(3)}ms`);
  expect(samples.cameraP95).toBeLessThan(8);
  expect(samples.aimP95).toBeLessThan(8);
});

test('mouse input remains per-RAF while presentation frames are missing', async ({ page }) => {
  await enter(page);
  await page.click('#screen-main [data-act="single"]');
  await page.waitForFunction(
    () => (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state()?.phase === 'running',
    undefined,
    { timeout: 20000 },
  );
  await lockPointer(page);
  const before = await page.evaluate(() => {
    const api = (window as unknown as {
      __recoil: { cameraState(): { yaw: number; follow: { cameraUpdateCount: number } }; suppressPresentationFrames(v: boolean): void };
    }).__recoil;
    api.suppressPresentationFrames(true);
    return api.cameraState();
  });
  await page.evaluate(() => {
    document.querySelector('canvas#game-canvas')?.dispatchEvent(
      new MouseEvent('mousemove', { movementX: 320, movementY: 0 }),
    );
  });
  await page.waitForTimeout(120);
  const during = await page.evaluate(() => {
    const api = (window as unknown as {
      __recoil: {
        cameraState(): { yaw: number; follow: { cameraUpdateCount: number } };
        inputState(): { pointer: { accumulatedDx: number; accumulatedDy: number } };
        suppressPresentationFrames(v: boolean): void;
      };
    }).__recoil;
    const result = { camera: api.cameraState(), input: api.inputState() };
    api.suppressPresentationFrames(false);
    return result;
  });
  expect(during.camera.follow.cameraUpdateCount).toBeGreaterThan(before.follow.cameraUpdateCount);
  expect(during.camera.yaw - before.yaw).toBeCloseTo(-320 * 0.0024, 3);
  expect(during.input.pointer.accumulatedDx).toBe(0);
  expect(during.input.pointer.accumulatedDy).toBe(0);
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
  // Generated-map approach: steer at the nearest obstacle, dash into it at
  // speed, and verify the tank stops near the obstacle without tunneling.
  await a.evaluate(async () => {
    const w = window as unknown as {
      __recoil: {
        input(r: string, d: unknown): void;
        obstacles(): Array<{ x: number; z: number; w: number; d: number }>;
        state(): { tank: { yaw: number; x: number; z: number; vx: number; vz: number; dashCooldown: number } };
      };
    };
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    // 1. Find the nearest obstacle to the spawn.
    let s0 = w.__recoil.state();
    const obstacles = w.__recoil.obstacles();
    let target = obstacles[0];
    let targetD = Infinity;
    for (const o of obstacles) {
      const d = Math.hypot(o.x - s0.tank.x, o.z - s0.tank.z);
      if (d < targetD) {
        targetD = d;
        target = o;
      }
    }
    // 2. Drive at it with a P-controller, dashing whenever available.
    let maxVz = 0;
    let lastCd = -1;
    let dashAccepted = false;
    let impacted = false;
    let restDistance = Infinity;
    for (let i = 0; i < 900; i++) {
      const s = w.__recoil.state();
      if (!s) {
        await delay(16);
        continue;
      }
      const yawTo = Math.atan2(target.x - s.tank.x, target.z - s.tank.z);
      const yawError = ((s.tank.yaw - yawTo + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const steer = Math.max(-1, Math.min(1, yawError * 2.5));
      maxVz = Math.max(maxVz, s.tank.vz);
      const cd = s.tank.dashCooldown;
      if (cd > 0.5) dashAccepted = true;
      const speed = Math.hypot(s.tank.vx, s.tank.vz);
      const distToTarget = Math.hypot(target.x - s.tank.x, target.z - s.tank.z);
      const distToNearest = Math.min(...obstacles.map((o) => Math.hypot(o.x - s.tank.x, o.z - s.tank.z)));
      if (!impacted && maxVz > 10 && speed < 3 && distToNearest < 16 && i > 15) {
        impacted = true;
        restDistance = distToNearest;
        break;
      }
      const dash = cd <= 0 && lastCd <= 0 && distToTarget > 12;
      const throttle = distToTarget < 20 ? 0.35 : 1;
      w.__recoil.input('driver', { throttle, steer, dashPressed: dash, jumpPressed: false });
      lastCd = cd;
      await delay(16);
    }
    w.__recoil.input('driver', { throttle: 0, steer: 0, dashPressed: false, jumpPressed: false });
    (window as unknown as Record<string, unknown>).__maxVz = maxVz;
    (window as unknown as Record<string, unknown>).__dashAccepted = dashAccepted;
    if (impacted) {
      (window as unknown as Record<string, unknown>).__impactDistance = restDistance;
    } else {
      const end = w.__recoil.state();
      (window as unknown as Record<string, unknown>).__impactDistance = Math.min(
        ...obstacles.map((o) => Math.hypot(o.x - end.tank.x, o.z - end.tank.z)),
      );
    }
  });
  await a.waitForTimeout(600);
  const maxVz = await a.evaluate(() => (window as unknown as { __maxVz: number }).__maxVz);
  const dashAccepted = await a.evaluate(() => (window as unknown as { __dashAccepted: boolean }).__dashAccepted);
  const impactDistance = await a.evaluate(() => (window as unknown as { __impactDistance: number }).__impactDistance);
  const s2 = await a.evaluate(() => (window as unknown as { __recoil: { state(): { tank: { vx: number; vz: number; x: number; z: number } } } }).__recoil.state().tank);
  await a.waitForTimeout(500);
  const s3 = await a.evaluate(() => (window as unknown as { __recoil: { state(): { tank: { vx: number; vz: number; x: number; z: number } } } }).__recoil.state().tank);
  expect(dashAccepted).toBe(true); // the dash burst was accepted
  expect(maxVz).toBeGreaterThan(12); // genuinely high-speed impact
  expect(impactDistance).toBeLessThan(16); // actually reached the obstacle
  expect(impactDistance).toBeGreaterThan(2); // stopped at the surface, not through it
  expect(Math.hypot(s3.vx, s3.vz)).toBeLessThan(2); // came to rest, no oscillation
  expect(Math.hypot(s3.x - s2.x, s3.z - s2.z)).toBeLessThan(1); // no tunneling drift after impact
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
  await page.click('#screen-main [data-act="multiplayer"]');
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

test('pause overlay neutralizes gameplay input and one single-player click starts one game', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await createCrew(a, b);
  await enableRealInput(a);
  // Refractor 02 hardening P0-6: the gameplay HUD pause button must open
  // the pause overlay through app.pause (not resume). While pointer-locked
  // the browser routes input to the canvas (real-world flow: Esc to release
  // the lock, then the DOM button is clickable; Escape itself also pauses).
  await a.keyboard.press('Escape');
  await a.waitForTimeout(200);
  await a.click('#pause-btn');
  await a.waitForTimeout(200);
  await expect(a.locator('#screen-pause:not(.hidden)')).toBeVisible();
  await a.click('#resume-btn');
  await a.waitForTimeout(300);
  await expect(a.locator('#screen-pause')).toHaveClass(/hidden/);
  await expect(a.locator('#hud:not(.hidden)')).toBeVisible();
  // Existing Escape path: pause again and verify input is neutralized.
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
  await a.waitForTimeout(300);
  await expect(a.locator('#screen-pause')).toHaveClass(/hidden/);
  await expect(a.locator('#hud:not(.hidden)')).toBeVisible();
  await ctxA.close();
  await ctxB.close();

  const single = await browser.newPage();
  await enter(single);
  await single.click('#screen-main [data-act="single"]');
  await single.waitForTimeout(600);
  await expect(single.locator('#screen-main')).toHaveClass(/hidden/);
  await expect(single.locator('#hud:not(.hidden)')).toBeVisible();
  const canvases = await single.evaluate(() => document.querySelectorAll('canvas#game-canvas').length);
  expect(canvases).toBe(1);
  const passes = await single.evaluate(() => (window as unknown as { __recoil: { composerPasses(): number } }).__recoil.composerPasses());
  for (let i = 0; i < 5; i++) {
    await single.keyboard.press('KeyR');
    await single.waitForTimeout(150);
  }
  const passesAfter = await single.evaluate(() => (window as unknown as { __recoil: { composerPasses(): number } }).__recoil.composerPasses());
  expect(passes).toBe(2);
  expect(passesAfter).toBe(2);
  await single.close();
});

test('driver tank renders smoothly online (no prediction jitter / backward snapping)', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await createCrew(a, b);
  await enableRealInput(a);
  await a.keyboard.down('w');
  await a.waitForTimeout(700); // let the tank accelerate
  await a.evaluate(() => {
    const w = window as unknown as {
      __recoil: { renderTank(): { x: number; z: number } | null; state(): { tank: { x: number; z: number } } | null };
      __stab: { samples: Array<{ rx: number; rz: number; ax: number; az: number }> };
    };
    w.__stab = { samples: [] };
    const start = performance.now();
    const rec = (now: number): void => {
      const rt = w.__recoil.renderTank();
      const st = w.__recoil.state();
      if (rt && st) w.__stab.samples.push({ rx: rt.x, rz: rt.z, ax: st.tank.x, az: st.tank.z });
      if (now - start < 1500) requestAnimationFrame(rec);
    };
    requestAnimationFrame(rec);
  });
  await a.waitForTimeout(2700);
  await a.keyboard.up('w');
  const samples = await a.evaluate(() => (window as unknown as { __stab: { samples: Array<{ rx: number; rz: number; ax: number; az: number }> } }).__stab.samples);
  expect(samples.length).toBeGreaterThan(30);
  const first = samples[0];
  const last = samples[samples.length - 1];
  const axisX = last.ax - first.ax;
  const axisZ = last.az - first.az;
  const axisLen = Math.hypot(axisX, axisZ);
  expect(axisLen).toBeGreaterThan(5); // the server tank actually drove
  const nx = axisX / axisLen;
  const nz = axisZ / axisLen;
  let backward = 0;
  let maxJump = 0;
  let renderedTotal = 0;
  for (let i = 1; i < samples.length; i++) {
    const drx = samples[i].rx - samples[i - 1].rx;
    const drz = samples[i].rz - samples[i - 1].rz;
    const along = drx * nx + drz * nz;
    renderedTotal += Math.hypot(drx, drz);
    maxJump = Math.max(maxJump, Math.hypot(drx, drz));
    if (along < -0.25) backward++;
  }
  const authTotal = samples.reduce(
    (sum, s, i) => (i === 0 ? 0 : sum + Math.hypot(s.ax - samples[i - 1].ax, s.az - samples[i - 1].az)),
    0,
  );
  const startErr = Math.hypot(samples[0].rx - samples[0].ax, samples[0].rz - samples[0].az);
  const endErr = Math.hypot(last.rx - last.ax, last.rz - last.az);
  console.log(`[stab] rendered ${renderedTotal.toFixed(1)}m auth ${authTotal.toFixed(1)}m maxJump ${maxJump.toFixed(2)}m backward ${backward} startErr ${startErr.toFixed(2)}m endErr ${endErr.toFixed(2)}m`);
  expect(backward).toBe(0); // no hard snap-back to authority
  expect(maxJump).toBeLessThan(2); // no per-frame teleport
  expect(renderedTotal).toBeGreaterThan(authTotal * 0.5); // no runaway prediction
  expect(renderedTotal).toBeLessThan(authTotal * 1.5);
  await ctxA.close();
  await ctxB.close();
});
