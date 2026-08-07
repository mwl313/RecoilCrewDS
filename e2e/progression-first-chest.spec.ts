import { expect, test } from '@playwright/test';

async function startSinglePlayer(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/?test=1');
  await page.click('#screen-boot');
  await expect(page.locator('#screen-main')).toBeVisible();
  await page.click('#screen-main [data-act="single"]');
  await page.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state();
    return s?.phase === 'running';
  });
}

test('first chest is Epic/Legendary only; second uses the normal table', async ({ page }) => {
  await startSinglePlayer(page);
  const state = await page.evaluate(() => {
    const w = window as unknown as {
      __recoil: {
        state(): { tank: { x: number; z: number } };
        progression: {
          chest(x: number, z: number): number;
          openChest(id: number): unknown;
          skipRelic(): void;
        };
      };
    };
    const s = w.__recoil.state();
    const c1 = w.__recoil.progression.chest(s.tank.x, s.tank.z);
    w.__recoil.progression.openChest(c1);
    return { c1 };
  });
  await page.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { matchFlow: string; teamProgression: { treasureChestsOpened: number; activeSelection: { kind: string; relicResult: { rarity: string } | null } | null } } | null } }).__recoil.state();
    return (
      s?.matchFlow === 'relicSelection' &&
      s.teamProgression.activeSelection?.kind === 'relic' &&
      (s.teamProgression.activeSelection.relicResult?.rarity === 'epic' ||
        s.teamProgression.activeSelection.relicResult?.rarity === 'legendary')
    );
  });
  const first = await page.evaluate(() => {
    const s = (window as unknown as { __recoil: { state(): { teamProgression: { activeSelection: { relicResult: { rarity: string } | null } | null } } } }).__recoil.state();
    return s.teamProgression.activeSelection?.relicResult?.rarity;
  });
  expect(['epic', 'legendary']).toContain(first);
  await page.waitForTimeout(1_850);
  await page.evaluate(() =>
    (window as unknown as { __recoil: { progression: { skipRelic(): void } } }).__recoil.progression.skipRelic(),
  );
  await page.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { matchFlow: string } | null } }).__recoil.state();
    return s?.matchFlow === 'playing';
  });
  const second = await page.evaluate(() => {
    const w = window as unknown as {
      __recoil: {
        state(): { tank: { x: number; z: number } };
        progression: { chest(x: number, z: number): number; openChest(id: number): unknown };
      };
    };
    const s = w.__recoil.state();
    const c2 = w.__recoil.progression.chest(s.tank.x, s.tank.z);
    w.__recoil.progression.openChest(c2);
    return c2;
  });
  await page.waitForFunction((id) => {
    const s = (window as unknown as { __recoil: { state(): { teamProgression: { treasureChestsOpened: number; activeSelection: { kind: string; relicResult: { rarity: string } | null } | null } } | null } }).__recoil.state();
    return (
      s?.teamProgression.treasureChestsOpened === 2 &&
      s.teamProgression.activeSelection?.kind === 'relic' &&
      s.teamProgression.activeSelection.relicResult !== null
    );
  }, second);
  const secondRarity = await page.evaluate(() => {
    const s = (window as unknown as { __recoil: { state(): { teamProgression: { activeSelection: { relicResult: { rarity: string } | null } | null } } } }).__recoil.state();
    return s.teamProgression.activeSelection?.relicResult?.rarity;
  });
  expect(['common', 'rare', 'epic', 'legendary']).toContain(secondRarity);
});
