import { expect, test } from '@playwright/test';

test('60-second real-pointer-lock aim and driving qualification stays continuous', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/?test=1');
  await page.click('#screen-boot');
  await page.click('#screen-main [data-act="single"]');
  await page.waitForFunction(
    () => (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state()?.phase === 'running',
    undefined,
    { timeout: 20_000 },
  );
  await page.mouse.click(640, 360);
  await page.waitForFunction(() => document.pointerLockElement !== null, undefined, { timeout: 5_000 });
  await page.keyboard.down('w');

  const result = await page.evaluate(async () => {
    type CameraState = {
      yaw: number;
      pitch: number;
      position: { x: number; y: number; z: number };
      follow: { boomPitch: number; lookPitch: number; cameraUpdateCount: number; horizontalLag: number };
      aim: null | { resolvedWorldYaw: number; resolvedPitch: number; poleBlendWeight: number };
    };
    const api = (window as unknown as {
      __recoil: {
        cameraState(): CameraState;
        turretSpaces(): { desiredPitch: number; predictedPitch: number };
        inputState(): { pointer: { accumulatedDx: number; accumulatedDy: number } };
      };
    }).__recoil;
    const canvas = document.querySelector('canvas#game-canvas');
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const samples: Array<{ camera: CameraState; extremeInput: boolean }> = [];
    let sawExactDown = false;
    let sawExactUp = false;
    let downTurret = 0;
    let upTurret = 0;

    // 240 × 250 ms = 60 seconds. The phases combine ordinary driving,
    // cornering, horizontal flicks, slow/fast vertical approaches, yaw at
    // each pole, and a return to ordinary aiming.
    for (let i = 0; i < 240; i++) {
      let movementX = Math.sin(i * 0.37) * 5;
      let movementY = Math.cos(i * 0.29) * 2;
      if (i === 60 || i === 64 || i === 68) movementX = i % 2 === 0 ? 900 : -900;
      if (i >= 80 && i < 116) movementY = 10;
      if (i === 116) movementY = 20_000;
      if (i > 116 && i < 152) {
        movementX = 24;
        movementY = 0;
      }
      if (i >= 152 && i < 188) movementY = -10;
      if (i === 188) movementY = -40_000;
      if (i > 188 && i < 220) {
        movementX = -24;
        movementY = 0;
      }
      canvas?.dispatchEvent(new MouseEvent('mousemove', { movementX, movementY }));
      if (i === 20) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
      if (i === 52) window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA' }));
      if (i === 132) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
      if (i === 164) window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));
      await sleep(250);
      const camera = api.cameraState();
      samples.push({ camera, extremeInput: [60, 64, 68, 116, 188].includes(i) });
      const turret = api.turretSpaces();
      if (Math.abs(camera.pitch + Math.PI / 2) < 1e-6) {
        sawExactDown = true;
        downTurret = turret.predictedPitch;
      }
      if (Math.abs(camera.pitch - Math.PI / 2) < 1e-6) {
        sawExactUp = true;
        upTurret = turret.predictedPitch;
      }
    }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));

    let maxPositionStep = 0;
    let maxHorizontalLag = 0;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1].camera.position;
      const b = samples[i].camera.position;
      if (!samples[i].extremeInput) {
        maxPositionStep = Math.max(maxPositionStep, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
      }
      maxHorizontalLag = Math.max(maxHorizontalLag, samples[i].camera.follow.horizontalLag);
    }
    return {
      allFinite: samples.every(({ camera: sample }) => [
        sample.yaw,
        sample.pitch,
        sample.position.x,
        sample.position.y,
        sample.position.z,
        sample.follow.boomPitch,
        sample.follow.lookPitch,
        sample.aim?.resolvedWorldYaw ?? 0,
        sample.aim?.resolvedPitch ?? 0,
      ].every(Number.isFinite)),
      sawExactDown,
      sawExactUp,
      downTurret,
      upTurret,
      maxPositionStep,
      maxHorizontalLag,
      updateCountDelta: samples.at(-1)!.camera.follow.cameraUpdateCount - samples[0].camera.follow.cameraUpdateCount,
      pointer: api.inputState().pointer,
      locked: document.pointerLockElement !== null,
    };
  });
  await page.keyboard.up('w');

  expect(result.allFinite).toBe(true);
  expect(result.sawExactDown).toBe(true);
  expect(result.sawExactUp).toBe(true);
  expect(result.downTurret).toBeCloseTo(-Math.PI / 2, 4);
  expect(result.upTurret).toBeCloseTo(Math.PI / 2, 4);
  expect(result.maxPositionStep).toBeLessThan(12);
  expect(result.maxHorizontalLag).toBeLessThan(1e-6);
  expect(result.updateCountDelta).toBeGreaterThan(3_000);
  expect(result.pointer.accumulatedDx).toBe(0);
  expect(result.pointer.accumulatedDy).toBe(0);
  expect(result.locked).toBe(true);
});
