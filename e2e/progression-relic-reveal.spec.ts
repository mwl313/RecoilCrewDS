import { expect, test } from '@playwright/test';

test('single player relic early input reveals, then a fresh input continues', async ({ page }) => {
  await page.goto('/?test=1');
  await page.click('#screen-boot');
  await expect(page.locator('#screen-main')).toBeVisible();
  await page.click('#screen-main [data-act="single"]');
  await page.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state();
    return s?.phase === 'running';
  });
  await page.click('#game-canvas');
  await page.waitForFunction(() =>
    (window as unknown as { __recoil: { inputState(): { locked: boolean } } }).__recoil.inputState().locked,
  );
  await page.evaluate(() => {
    const w = window as unknown as {
      __recoil: {
        state(): { tank: { x: number; z: number } };
        progression: { chest(x: number, z: number): number; openChest(id: number): unknown };
      };
    };
    const s = w.__recoil.state();
    const id = w.__recoil.progression.chest(s.tank.x, s.tank.z);
    w.__recoil.progression.openChest(id);
  });
  await page.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { matchFlow: string } | null } }).__recoil.state();
    return s?.matchFlow === 'relicSelection';
  });
  await expect(page.locator('#progression-relic-layer')).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __recoil: { inputState(): { context: string } } }).__recoil.inputState().context,
  )).toBe('progressionRelic');
  await expect(page.locator('#progression-selection-layer')).toBeHidden();
  await expect(page.locator('#progression-relic-layer')).toContainText('RELIC');
  await page.keyboard.press('Space');
  await expect(page.locator('#progression-relic-layer')).toHaveAttribute('data-phase', 'revealed');
  await page.waitForTimeout(300);
  const afterFastForward = await page.evaluate(() =>
    (window as unknown as { __recoil: { state(): { matchFlow: string } } }).__recoil.state().matchFlow,
  );
  expect(afterFastForward).toBe('relicSelection');
  await expect(page.locator('#progression-overlay')).toHaveClass(/reward-overlay--shake/);
  expect(await page.locator('.reward-shard--active').count()).toBeGreaterThan(0);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { matchFlow: string } | null } }).__recoil.state();
    return s?.matchFlow === 'playing';
  });
  await expect(page.locator('#progression-relic-layer')).toBeHidden();
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __recoil: { inputState(): { context: string } } }).__recoil.inputState().context,
  )).toBe('gameplay');

  const yawBefore = await page.evaluate(() =>
    (window as unknown as { __recoil: { cameraState(): { yaw: number } } }).__recoil.cameraState().yaw,
  );
  await page.evaluate(() => {
    document.querySelector('#game-canvas')?.dispatchEvent(
      new MouseEvent('mousemove', { movementX: -200, movementY: 0 }),
    );
  });
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __recoil: { cameraState(): { yaw: number } } }).__recoil.cameraState().yaw,
  )).toBeGreaterThan(yawBefore + 0.3);
});
