import { expect, test } from '@playwright/test';

test('single player runs a full local round with combined controls and local restart', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // Demo fixture: the permanent single-player score-attack flow (production
  // main-stage SP is qualified separately in monster-coreloop specs).
  await page.goto('/?test=1&mode=demo');
  await page.click('#screen-boot');
  await page.click('#screen-main [data-act="single"]');
  await expect(page.locator('#screen-countdown:not(.hidden)')).toBeVisible();
  await expect(page.locator('#countdown-n')).toHaveText('3');
  expect(await page.evaluate(() => (window as unknown as { __recoil: { state(): unknown } }).__recoil.state())).toBeNull();
  await page.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state();
    return s?.phase === 'running';
  });
  await expect(page.locator('canvas#game-canvas')).toHaveCount(1);
  await expect(page.locator('#hud')).toBeVisible();
  // Single Player hides role/peer identity and shows the combined crosshair.
  await expect(page.locator('#role-chip')).toHaveClass(/hidden/);
  await expect(page.locator('#conn-dot')).toHaveClass(/hidden/);
  await expect(page.locator('#ping')).toBeHidden();
  await expect(page.locator('#practice-tag')).toHaveCount(0);
  await expect(page.locator('#crosshair:not(.hidden)')).toBeVisible();

  // Keyboard driving moves the local tank.
  const z0 = await page.evaluate(() => (window as unknown as { __recoil: { state(): { tank: { z: number } } } }).__recoil.state().tank.z);
  await page.keyboard.down('w');
  await page.waitForFunction((z0) => {
    const s = (window as unknown as { __recoil: { state(): { tank: { z: number } } | null } }).__recoil.state();
    return s ? Math.abs(s.tank.z - z0) > 2 : false;
  }, z0);
  await page.keyboard.up('w');

  // Space jumps (edge-triggered). The arena is hostile, so first wait for
  // an alive, grounded tank before pressing.
  await page.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { tank: { deadT: number; grounded: boolean } } | null } }).__recoil.state();
    return s ? s.tank.deadT <= 0 && s.tank.grounded : false;
  });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { tank: { vy: number; grounded: boolean } } | null } }).__recoil.state();
    return s ? !s.tank.grounded || s.tank.vy > 1 : false;
  }, undefined, { timeout: 5000 });
  await page.keyboard.up('Space');

  // Shift dashes with a cooldown indicator.
  await page.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { tank: { deadT: number; grounded: boolean } } | null } }).__recoil.state();
    return s ? s.tank.deadT <= 0 && s.tank.grounded : false;
  });
  await page.keyboard.press('Shift');
  await page.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { tank: { dashCooldown: number } } | null } }).__recoil.state();
    return s ? s.tank.dashCooldown > 0 : false;
  }, undefined, { timeout: 5000 });
  await page.keyboard.up('Shift');
  await expect(page.locator('#dash-ind')).toBeVisible();

  // Tab opens the tactical presentation without changing role; Q remains unbound.
  await page.keyboard.press('Tab');
  await expect(page.locator('#tactical-drawer')).toHaveClass(/is-open/);
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(300);

  // Single Player reaches results after the 90-second round with local
  // actions instead of a crew rematch vote.
  await page.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state();
    return s?.phase === 'results';
  }, undefined, { timeout: 110_000 });
  await expect(page.locator('#screen-results:not(.hidden)')).toBeVisible();
  const grade = await page.textContent('#results-grade');
  expect(grade?.trim() ?? '').toBeTruthy();
  await expect(page.locator('#sp-play-again')).toBeVisible();
  await expect(page.locator('#results-rematch')).toHaveClass(/hidden/);
  await expect(page.locator('#leave-btn')).toHaveClass(/hidden/);

  // PLAY AGAIN restarts a fresh local match (no network involved).
  const oldMatchId = await page.evaluate(() => (window as unknown as { __recoil: { state(): { matchId: string } } }).__recoil.state().matchId);
  await page.click('#sp-play-again');
  await expect(page.locator('#screen-countdown:not(.hidden)')).toBeVisible();
  await page.waitForFunction((oldId) => {
    const s = (window as unknown as { __recoil: { state(): { phase: string; matchId: string } | null } }).__recoil.state();
    return s?.phase === 'running' && s.matchId !== oldId;
  }, oldMatchId);

  const critical = errors.filter((e) => !e.includes('WebGL') && !e.includes('GPU'));
  expect(critical).toEqual([]);
});
