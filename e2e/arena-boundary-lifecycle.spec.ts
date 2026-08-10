import { expect, test, type Page } from '@playwright/test';

interface RecoilLifecycleHooks {
  arena(): { arenaBaseSeed: number; arenaChecksum: number } | null;
  code(): string;
  sessionId(): string;
  rejoin(code: string, sessionId: string): void;
  state(): { phase: string; tank: { x: number; z: number } } | null;
  input(role: string, data: unknown): void;
  quality(): {
    apron: { enabled: boolean; instances: number; drawCalls: number };
    boundary?: {
      enabled: boolean;
      assetId: string;
      segmentCount: number;
      instanceBatches: number;
      drawCalls: number;
    };
  } | null;
}

async function enter(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.click('#screen-boot');
}

async function expectCleanBoundary(page: Page): Promise<number> {
  await page.waitForFunction(() => {
    const quality = (window as unknown as { __recoil: RecoilLifecycleHooks }).__recoil.quality();
    return quality?.boundary?.enabled === true;
  });
  const quality = await page.evaluate(() =>
    (window as unknown as { __recoil: RecoilLifecycleHooks }).__recoil.quality(),
  );
  expect(quality?.apron).toMatchObject({ enabled: false, instances: 0, drawCalls: 0 });
  expect(quality?.boundary).toMatchObject({
    enabled: true,
    assetId: 'prop.barrier',
    instanceBatches: 3,
    drawCalls: 4,
  });
  expect(quality?.boundary?.segmentCount).toBeGreaterThan(0);
  return quality!.boundary!.segmentCount;
}

async function createCrew(driver: Page, gunner: Page): Promise<string> {
  await enter(driver);
  await driver.click('#screen-main [data-act="multiplayer"]');
  await driver.click('#screen-main [data-act="create"]');
  await driver.waitForFunction(() =>
    (window as unknown as { __recoil: RecoilLifecycleHooks }).__recoil.code().length === 6,
  );
  const code = await driver.evaluate(() =>
    (window as unknown as { __recoil: RecoilLifecycleHooks }).__recoil.code(),
  );

  await enter(gunner);
  await gunner.click('#screen-main [data-act="multiplayer"]');
  await gunner.click('#screen-main [data-act="join"]');
  await gunner.fill('#join-code', code);
  await gunner.click('#join-go');
  await driver.click('#lobby-ready');
  await gunner.click('#lobby-ready');
  for (const page of [driver, gunner]) {
    await page.waitForFunction(() =>
      (window as unknown as { __recoil: RecoilLifecycleHooks }).__recoil.state()?.phase === 'running',
    );
  }
  return code;
}

async function startRoundInputs(driver: Page, gunner: Page): Promise<void> {
  await driver.evaluate(() => {
    const hooks = (window as unknown as { __recoil: RecoilLifecycleHooks }).__recoil;
    const id = setInterval(() => {
      hooks.input('driver', {
        throttle: .85,
        steer: Math.sin(Date.now() / 500) * .6,
        dashPressed: false,
        jumpPressed: false,
      });
    }, 100);
    (window as unknown as { __stopBoundaryInput?: () => void }).__stopBoundaryInput = () => clearInterval(id);
  });
  await gunner.evaluate(() => {
    const hooks = (window as unknown as { __recoil: RecoilLifecycleHooks }).__recoil;
    const id = setInterval(() => {
      hooks.input('gunner', { aimYaw: 0, aimPitch: .05, primary: true, secondary: false });
    }, 100);
    (window as unknown as { __stopBoundaryInput?: () => void }).__stopBoundaryInput = () => clearInterval(id);
  });
}

test('two clients retain a clean boundary through reconnect and arena reroll', async ({ browser }) => {
  test.setTimeout(150_000);
  const driverContext = await browser.newContext();
  const gunnerContext = await browser.newContext();
  const driver = await driverContext.newPage();
  const gunner = await gunnerContext.newPage();
  const code = await createCrew(driver, gunner);
  const sessionId = await driver.evaluate(() =>
    (window as unknown as { __recoil: RecoilLifecycleHooks }).__recoil.sessionId(),
  );
  const seedBefore = await driver.evaluate(() =>
    (window as unknown as { __recoil: RecoilLifecycleHooks }).__recoil.arena()!.arenaBaseSeed,
  );
  const firstDriverSegments = await expectCleanBoundary(driver);
  const firstGunnerSegments = await expectCleanBoundary(gunner);
  expect(firstGunnerSegments).toBe(firstDriverSegments);

  await driverContext.close();
  const rejoinContext = await browser.newContext();
  const rejoinedDriver = await rejoinContext.newPage();
  await enter(rejoinedDriver);
  await rejoinedDriver.evaluate(({ roomCode, sid }) => {
    (window as unknown as { __recoil: RecoilLifecycleHooks }).__recoil.rejoin(roomCode, sid);
  }, { roomCode: code, sid: sessionId });
  await rejoinedDriver.waitForFunction(() =>
    (window as unknown as { __recoil: RecoilLifecycleHooks }).__recoil.state()?.phase === 'running',
  );
  const rejoinedSegments = await expectCleanBoundary(rejoinedDriver);
  expect(rejoinedSegments).toBe(firstDriverSegments);

  await startRoundInputs(rejoinedDriver, gunner);
  await rejoinedDriver.waitForFunction(() =>
    (window as unknown as { __recoil: RecoilLifecycleHooks }).__recoil.state()?.phase === 'results',
  );
  for (const page of [rejoinedDriver, gunner]) {
    await page.evaluate(() =>
      (window as unknown as { __stopBoundaryInput?: () => void }).__stopBoundaryInput?.(),
    );
  }
  await rejoinedDriver.click('#rematch-btn');
  for (const page of [rejoinedDriver, gunner]) {
    await page.waitForFunction(() =>
      (window as unknown as { __recoil: { flow(): string } }).__recoil.flow() === 'lobby',
    );
    await page.click('#lobby-ready');
  }
  await rejoinedDriver.waitForFunction((oldSeed) => {
    const hooks = (window as unknown as { __recoil: RecoilLifecycleHooks }).__recoil;
    return hooks.state()?.phase === 'running' && hooks.arena()?.arenaBaseSeed !== oldSeed;
  }, seedBefore);
  const rerolledDriverSegments = await expectCleanBoundary(rejoinedDriver);
  const rerolledGunnerSegments = await expectCleanBoundary(gunner);
  expect(rerolledDriverSegments).toBe(rerolledGunnerSegments);

  await gunnerContext.close();
  await rejoinContext.close();
});
