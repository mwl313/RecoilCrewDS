import { expect, test, type Page } from '@playwright/test';

test.use({ baseURL: process.env.LANDING_TEST_BASE_URL ?? 'http://localhost:8096' });

type LandingEvent = {
  type: 'tankLanding' | 'groundPoundImpact';
  fallDistance?: number;
  impactSpeed?: number;
  kind?: string;
  groundPound?: boolean;
  radius?: number;
  damage?: number;
  stacks?: number;
};

type LandingHooks = {
  events(): LandingEvent[];
  clear(): void;
  drop(height: number, stacks?: number): void;
  vfx(): {
    activeRings: number;
    pooledRings: number;
    activeRingEndRadii: number[];
    activeRingCurrentRadii: number[];
  } | null;
};

async function enterMenu(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.click('#screen-boot');
  await expect(page.locator('#screen-main')).toBeVisible();
}

async function waitForRunning(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    (window as unknown as {
      __recoil: { state(): { phase: string } | null; landing?: LandingHooks };
    }).__recoil.state()?.phase === 'running'
      && Boolean((window as unknown as { __recoil: { landing?: LandingHooks } }).__recoil.landing),
  );
}

async function dropAndWait(page: Page, height: number, stacks: number): Promise<LandingEvent[]> {
  await page.evaluate(({ height, stacks }) => {
    const hooks = (window as unknown as { __recoil: { landing: LandingHooks } }).__recoil.landing;
    hooks.clear();
    hooks.drop(height, stacks);
  }, { height, stacks });
  await page.waitForFunction(() => {
    const events = (window as unknown as { __recoil: { landing: LandingHooks } }).__recoil.landing.events();
    return events.some((event) => event.type === 'tankLanding');
  }, undefined, { timeout: 10_000 });
  return page.evaluate(() =>
    (window as unknown as { __recoil: { landing: LandingHooks } }).__recoil.landing.events(),
  );
}

test('manual fall matrix and radius-truthful Ground Pound in Single Player', async ({ page }) => {
  await enterMenu(page);
  await page.click('#screen-main [data-act="single"]');
  await waitForRunning(page);

  const subThreshold = await dropAndWait(page, 2.49, 0);
  expect(subThreshold.find((event) => event.type === 'tankLanding')).toMatchObject({
    fallDistance: 2.49,
    kind: 'none',
    groundPound: false,
  });
  expect(subThreshold.some((event) => event.type === 'groundPoundImpact')).toBe(false);

  const expected = [
    { height: 3, damage: 17.5, radius: 5.975, tier: 'light' },
    { height: 6, damage: 32.5, radius: 7.925, tier: 'heavy' },
    { height: 10, damage: 52.5, radius: 10.525, tier: 'massive' },
    { height: 15, damage: 60, radius: 12, tier: 'massive' },
  ];
  for (const row of expected) {
    const events = await dropAndWait(page, row.height, 1);
    expect(events.find((event) => event.type === 'tankLanding')).toMatchObject({
      fallDistance: row.height,
      kind: row.tier,
      groundPound: true,
    });
    expect(events.find((event) => event.type === 'groundPoundImpact')).toMatchObject({
      fallDistance: row.height,
      damage: row.damage,
      radius: row.radius,
      stacks: 1,
    });
  }

  await page.evaluate(() => {
    const hooks = (window as unknown as { __recoil: { landing: LandingHooks } }).__recoil.landing;
    hooks.clear();
    hooks.drop(15, 1);
  });
  await page.waitForFunction(() => {
    const hooks = (window as unknown as { __recoil: { landing: LandingHooks } }).__recoil.landing;
    return hooks.events().some((event) => event.type === 'groundPoundImpact')
      && (hooks.vfx()?.activeRingEndRadii.includes(12) ?? false)
      && (hooks.vfx()?.activeRingCurrentRadii.some((radius) => radius >= 11.9) ?? false);
  }, undefined, { timeout: 10_000, polling: 16 });
  await page.screenshot({
    path: 'docs/final-patch-batch/workstream-03-landing-ground-pound/ground-pound-single-player-15m.png',
  });
});

test('Driver and Gunner receive one identical authoritative Ground Pound', async ({ browser }) => {
  const context = await browser.newContext();
  const driver = await context.newPage();
  const gunner = await context.newPage();
  await enterMenu(driver);
  await driver.click('#screen-main [data-act="multiplayer"]');
  await driver.click('#screen-main [data-act="create"]');
  await driver.waitForFunction(() =>
    (window as unknown as { __recoil: { code(): string } }).__recoil.code().length === 6,
  );
  const code = await driver.evaluate(() =>
    (window as unknown as { __recoil: { code(): string } }).__recoil.code(),
  );

  await enterMenu(gunner);
  await gunner.click('#screen-main [data-act="multiplayer"]');
  await gunner.click('#screen-main [data-act="join"]');
  await gunner.fill('#join-code', code);
  await gunner.click('#join-go');
  await driver.click('#lobby-ready');
  await gunner.click('#lobby-ready');
  await Promise.all([waitForRunning(driver), waitForRunning(gunner)]);
  // Let the normal spawn shield expire so the radius evidence is unobscured.
  await driver.waitForTimeout(3_000);

  await driver.evaluate(() => {
    const hooks = (window as unknown as { __recoil: { landing: LandingHooks } }).__recoil;
    hooks.landing.clear();
    hooks.landing.drop(6, 2);
  });
  await gunner.evaluate(() =>
    (window as unknown as { __recoil: { landing: LandingHooks } }).__recoil.landing.clear(),
  );
  await Promise.all([driver, gunner].map((page) =>
    page.waitForFunction(() => {
      const hooks = (window as unknown as { __recoil: { landing: LandingHooks } }).__recoil.landing;
      return hooks.events().some((event) => event.type === 'groundPoundImpact')
        && (hooks.vfx()?.activeRingEndRadii.includes(7.925) ?? false)
        && (hooks.vfx()?.activeRingCurrentRadii.some((radius) => radius >= 7.85) ?? false);
    }, undefined, { timeout: 10_000, polling: 16 }),
  ));
  const [driverEvents, gunnerEvents] = await Promise.all([driver, gunner].map((page) =>
    page.evaluate(() =>
      (window as unknown as { __recoil: { landing: LandingHooks } }).__recoil.landing.events(),
    ),
  ));
  expect(gunnerEvents).toEqual(driverEvents);
  expect(driverEvents.filter((event) => event.type === 'groundPoundImpact')).toHaveLength(1);
  expect(driverEvents.filter((event) => event.type === 'tankLanding')).toHaveLength(1);
  await driver.screenshot({
    path: 'docs/final-patch-batch/workstream-03-landing-ground-pound/ground-pound-driver-6m.png',
  });
  await gunner.screenshot({
    path: 'docs/final-patch-batch/workstream-03-landing-ground-pound/ground-pound-gunner-6m.png',
  });
  await context.close();
});
