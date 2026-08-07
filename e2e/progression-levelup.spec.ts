import { expect, test } from '@playwright/test';

test('single player collects XP, levels up, chooses a card, and resumes', async ({ page }) => {
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

  // Inject deterministic team XP through the test hook.
  await page.evaluate(() => {
    (window as unknown as { __recoil: { progression: { xp(v: number): void } } }).__recoil.progression.xp(20);
  });

  // The authoritative flow pauses and the roulette overlay appears.
  await page.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { matchFlow: string; teamProgression: { level: number } } | null } }).__recoil.state();
    return s?.matchFlow === 'upgradeSelection';
  });
  const state = await page.evaluate(() =>
    (window as unknown as { __recoil: { state(): { teamProgression: { level: number } } } }).__recoil.state(),
  );
  expect(state.teamProgression.level).toBe(2);
  await expect(page.locator('#progression-overlay')).toBeVisible();
  await expect(page.locator('#progression-overlay button')).toHaveCount(3);
  expect(await page.evaluate(() =>
    (window as unknown as { __recoil: { inputState(): { locked: boolean } } }).__recoil.inputState().locked,
  )).toBe(true);

  // Pointer-lock-safe direct selection never needs Escape or a DOM cursor.
  await page.keyboard.press('Digit2');
  await page.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { matchFlow: string } | null } }).__recoil.state();
    return s?.matchFlow === 'playing';
  });
  expect(await page.evaluate(() =>
    (window as unknown as { __recoil: { inputState(): { locked: boolean; buttons: string[] } } }).__recoil.inputState(),
  )).toMatchObject({ locked: true, buttons: [] });
  await expect(page.locator('#progression-overlay')).toBeHidden();
});
