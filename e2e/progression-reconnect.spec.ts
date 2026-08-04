import { expect, test } from '@playwright/test';

test('new match resets progression state (rematch/reconnect recovery)', async ({ page }) => {
  await page.goto('/?test=1');
  await page.click('#screen-boot');
  await expect(page.locator('#screen-main')).toBeVisible();
  await page.click('#screen-main [data-act="single"]');
  await page.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state();
    return s?.phase === 'running';
  });
  await page.evaluate(() => {
    (window as unknown as { __recoil: { progression: { xp(v: number): void } } }).__recoil.progression.xp(50);
  });
  await page.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { matchFlow: string } | null } }).__recoil.state();
    return s?.matchFlow === 'upgradeSelection';
  });
  await page.evaluate(() => {
    (window as unknown as { __recoil: { progression: { submitUpgrade(i: number): void } } }).__recoil.progression.submitUpgrade(0);
  });
  const progressed = await page.evaluate(() =>
    (window as unknown as { __recoil: { state(): { teamProgression: { level: number } } } }).__recoil.state(),
  );
  expect(progressed.teamProgression.level).toBeGreaterThan(1);

  // A fresh match (reload → new Single Player session) resets progression;
  // the reconnect path reconstructs from fresh snapshots with the same reset
  // state.
  await page.reload();
  await page.click('#screen-boot');
  await expect(page.locator('#screen-main')).toBeVisible();
  await page.click('#screen-main [data-act="single"]');
  await page.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { phase: string; teamProgression: { level: number } } | null } }).__recoil.state();
    return s?.phase === 'running' && s.teamProgression.level === 1;
  });
});
