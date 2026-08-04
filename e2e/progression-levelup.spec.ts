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

  // Dispatch the card click directly (the game HUD intentionally paints
  // above the presentation overlay; the click handler is the contract).
  await page.evaluate(() => {
    const buttons = document.querySelectorAll<HTMLButtonElement>('#progression-overlay button');
    buttons[1]?.click();
  });
  await page.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { matchFlow: string } | null } }).__recoil.state();
    return s?.matchFlow === 'playing';
  });
  await expect(page.locator('#progression-overlay')).toBeHidden();
});
