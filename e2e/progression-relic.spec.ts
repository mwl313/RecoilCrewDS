import { expect, test } from '@playwright/test';

test('single player opens a chest and receives a relic', async ({ page }) => {
  await page.goto('/?test=1');
  await page.click('#screen-boot');
  await expect(page.locator('#screen-main')).toBeVisible();
  await page.click('#screen-main [data-act="single"]');
  await page.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state();
    return s?.phase === 'running';
  });

  // Spawn + open synchronously before the hostile arena can end the match.
  const chestId = await page.evaluate(() => {
    const w = window as unknown as {
      __recoil: {
        state(): { tank: { x: number; z: number } };
        progression: { chest(x: number, z: number): number; openChest(id: number): unknown };
      };
    };
    const s = w.__recoil.state();
    const id = w.__recoil.progression.chest(s.tank.x, s.tank.z);
    w.__recoil.progression.openChest(id);
    return id;
  });
  await page.waitForFunction((id) => {
    const s = (window as unknown as { __recoil: { state(): { teamProgression: { treasureChestsOpened: number; lastRelicResult: unknown } } | null } }).__recoil.state();
    return s?.teamProgression.treasureChestsOpened === 1 && s.teamProgression.lastRelicResult !== null;
  }, chestId);
  const state = await page.evaluate(() =>
    (window as unknown as { __recoil: { state(): { teamProgression: { lastRelicResult: { relicId: string } | null } } } }).__recoil.state(),
  );
  expect(state.teamProgression.lastRelicResult?.relicId).toBeTruthy();
});
