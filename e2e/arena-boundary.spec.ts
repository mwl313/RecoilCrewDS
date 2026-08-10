import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const EVIDENCE_DIR = 'docs/final-patch-batch/workstream-04-arena-boundary/screenshots';
const CAPTURE_PHASE = process.env.ARENA_BOUNDARY_CAPTURE_PHASE === 'before' ? 'before' : 'after';

interface BoundaryDiagnostics {
  enabled: boolean;
  assetId: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  segmentCount: number;
  instanceBatches: number;
  drawCalls: number;
  footingEnabled: boolean;
}

interface BoundaryHooks {
  state(): {
    tank: {
      x: number;
      y: number;
      z: number;
      yaw: number;
      vx: number;
      vy: number;
      vz: number;
      grounded: boolean;
    };
  } | null;
  groundHeightAt(x: number, z: number): number;
  setAutoInput(enabled: boolean): void;
  quality(): {
    apron: { enabled: boolean; instances: number; drawCalls: number };
    boundary?: BoundaryDiagnostics;
  } | null;
  setApronEnabled(enabled: boolean): void;
}

async function startSinglePlayer(page: Page): Promise<void> {
  await page.goto('/?test=1&nodebug=1&map=map.arena400Primary');
  await page.click('#screen-boot');
  await page.click('#screen-main [data-act="single"]');
  await page.waitForFunction(() =>
    (window as unknown as { __recoil: BoundaryHooks }).__recoil.state() !== null,
  );
  await page.evaluate(() =>
    (window as unknown as { __recoil: BoundaryHooks }).__recoil.setAutoInput(false),
  );
}

async function setTankView(
  page: Page,
  pose: { x: number; z: number; yaw: number; elevated?: boolean },
): Promise<void> {
  await page.evaluate(({ x, z, yaw, elevated }) => {
    const hooks = (window as unknown as { __recoil: BoundaryHooks }).__recoil;
    const state = hooks.state();
    if (!state) throw new Error('arena boundary test requires a running state');
    const tank = state.tank;
    tank.x = x;
    tank.z = z;
    tank.yaw = yaw;
    tank.vx = 0;
    tank.vz = 0;
    tank.vy = 0;
    tank.y = hooks.groundHeightAt(x, z) + (elevated ? 10 : 0);
    tank.grounded = !elevated;
  }, pose);
  await page.waitForTimeout(pose.elevated ? 180 : 320);
}

test('captures matching arena edge and corner viewpoints with no gameplay apron', async ({ page }) => {
  test.setTimeout(90_000);
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await startSinglePlayer(page);

  const views = [
    { name: 'north-ground', x: 0, z: -195.5, yaw: Math.PI },
    { name: 'north-elevated', x: 0, z: -195.5, yaw: Math.PI, elevated: true },
    { name: 'east-ground', x: 195.5, z: 0, yaw: Math.PI / 2 },
    { name: 'south-ground', x: 0, z: 195.5, yaw: 0 },
    { name: 'west-ground', x: -195.5, z: 0, yaw: -Math.PI / 2 },
    { name: 'north-east-corner', x: 193.5, z: -193.5, yaw: Math.PI * .75 },
    { name: 'south-east-corner', x: 193.5, z: 193.5, yaw: Math.PI * .25 },
    { name: 'south-west-corner', x: -193.5, z: 193.5, yaw: -Math.PI * .25 },
    { name: 'north-west-corner', x: -193.5, z: -193.5, yaw: -Math.PI * .75 },
  ] as const;
  for (const view of views) {
    await setTankView(page, view);
    await page.locator('#game-canvas').screenshot({
      path: `${EVIDENCE_DIR}/${CAPTURE_PHASE}-${view.name}.png`,
    });
  }

  if (CAPTURE_PHASE === 'before') {
    expect(errors).toEqual([]);
    return;
  }

  const diagnostics = await page.evaluate(() => {
    const hooks = (window as unknown as { __recoil: BoundaryHooks }).__recoil;
    hooks.setApronEnabled(true);
    return hooks.quality();
  });
  expect(diagnostics?.apron).toEqual({
    enabled: false,
    quality: 'disabled',
    instances: 0,
    drawCalls: 0,
    castsShadows: false,
  });
  expect(diagnostics?.boundary).toMatchObject({
    enabled: true,
    assetId: 'prop.barrier',
    bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
    segmentCount: 868,
    instanceBatches: 3,
    drawCalls: 4,
    footingEnabled: true,
  });
  expect(errors).toEqual([]);
});

test('authoritative tank collision stops on all four visual barrier faces', async ({ page }) => {
  test.skip(CAPTURE_PHASE === 'before', 'baseline capture only');
  await startSinglePlayer(page);
  const probes = [
    { x: -205, z: 0, vx: -12, vz: 3, axis: 'x', expected: -199.5, tangent: 'vz', tangentValue: 3, outward: 'vx' },
    { x: 205, z: 0, vx: 12, vz: -3, axis: 'x', expected: 199.5, tangent: 'vz', tangentValue: -3, outward: 'vx' },
    { x: 0, z: -205, vx: 4, vz: -12, axis: 'z', expected: -199.5, tangent: 'vx', tangentValue: 4, outward: 'vz' },
    { x: 0, z: 205, vx: -4, vz: 12, axis: 'z', expected: 199.5, tangent: 'vx', tangentValue: -4, outward: 'vz' },
  ] as const;
  for (const probe of probes) {
    await page.evaluate(({ x, z, vx, vz }) => {
      const hooks = (window as unknown as { __recoil: BoundaryHooks }).__recoil;
      const tank = hooks.state()!.tank;
      tank.x = x;
      tank.z = z;
      tank.vx = vx;
      tank.vz = vz;
      tank.y = hooks.groundHeightAt(x, z);
      tank.grounded = true;
    }, probe);
    await page.waitForTimeout(80);
    const tank = await page.evaluate(() =>
      (window as unknown as { __recoil: BoundaryHooks }).__recoil.state()!.tank,
    );
    expect(tank[probe.axis]).toBeCloseTo(probe.expected, 4);
    expect(Math.abs(tank[probe.outward])).toBeLessThan(.01);
    expect(tank[probe.tangent] * probe.tangentValue).toBeGreaterThan(0);
  }
});
