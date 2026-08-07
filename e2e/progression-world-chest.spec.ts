import { expect, test } from '@playwright/test';

type ChestState = {
  id: number;
  source: string;
  lifecycle: string;
  openingStartedAtWallMs?: number;
  fullyOpenAtWallMs?: number;
};

type WorldRelicState = {
  matchFlow: string;
  tank: { x: number; z: number };
  chests: ChestState[];
  teamProgression: {
    relicStacks: Record<string, number>;
    relicAcquisitionOrder?: string[];
    activeSelection: { relicResult?: { relicId: string } } | null;
  };
};

test('production world chest completes proximity open, reveal, HUD, and despawn', async ({ page }) => {
  await page.goto('/?test=1');
  await page.click('#screen-boot');
  await expect(page.locator('#screen-main')).toBeVisible();
  await page.click('#screen-main [data-act="single"]');
  await page.waitForFunction(() => {
    const state = (window as unknown as { __recoil: { state(): WorldRelicState | null } }).__recoil.state();
    return state?.chests.filter((chest) => chest.source === 'mapStart').length === 10;
  });

  const initial = await page.evaluate(() =>
    (window as unknown as { __recoil: { state(): WorldRelicState } }).__recoil.state(),
  );
  expect(initial.chests.filter((chest) => chest.source === 'mapStart')).toHaveLength(10);
  expect(initial.teamProgression.relicStacks).toEqual({});
  await expect(page.locator('#relic-inventory-rail')).toBeHidden();

  const chestId = await page.evaluate(() => {
    const hooks = (window as unknown as {
      __recoil: {
        state(): WorldRelicState;
        progression: { chest(x: number, z: number): number };
      };
    }).__recoil;
    const state = hooks.state();
    return hooks.progression.chest(state.tank.x, state.tank.z);
  });

  await page.waitForFunction((id) => {
    const state = (window as unknown as { __recoil: { state(): WorldRelicState } }).__recoil.state();
    return state.chests.find((chest) => chest.id === id)?.lifecycle === 'opening';
  }, chestId);
  const opening = await page.evaluate((id) => {
    const state = (window as unknown as { __recoil: { state(): WorldRelicState } }).__recoil.state();
    return state.chests.find((chest) => chest.id === id)!;
  }, chestId);
  expect((opening.fullyOpenAtWallMs ?? 0) - (opening.openingStartedAtWallMs ?? 0)).toBe(650);

  await page.waitForFunction(() => {
    const state = (window as unknown as { __recoil: { state(): WorldRelicState } }).__recoil.state();
    return state.matchFlow === 'relicSelection';
  });
  await expect(page.locator('#progression-relic-layer')).toBeVisible();
  await expect(page.locator('#relic-inventory-rail')).toBeVisible();
  await expect(page.locator('#relic-inventory-rail .relic-rail-cell')).toHaveCount(1);
  const railIcon = page.locator('#relic-inventory-rail .relic-rail-icon img');
  await expect(railIcon).toHaveCount(1);
  await expect(railIcon).toHaveAttribute('src', /^\/assets\/images\/relics\/[a-z0-9-]+\.png$/);
  await expect.poll(() => railIcon.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(page.locator('#relic-inventory-rail .relic-rail-icon--fallback')).toHaveCount(0);
  const revealText = await page.locator('#progression-relic-layer').innerText();
  expect(revealText).not.toContain('relic.');

  await page.waitForFunction(() => {
    const button = document.querySelector<HTMLButtonElement>('#progression-relic-layer button');
    return button !== null && !button.disabled;
  });
  await page.evaluate(() =>
    (window as unknown as { __recoil: { progression: { skipRelic(): void } } }).__recoil.progression.skipRelic(),
  );
  await page.waitForFunction(() => {
    const state = (window as unknown as { __recoil: { state(): WorldRelicState } }).__recoil.state();
    return state.matchFlow === 'playing';
  });
  await page.waitForFunction((id) => {
    const state = (window as unknown as { __recoil: { state(): WorldRelicState } }).__recoil.state();
    return !state.chests.some((chest) => chest.id === id);
  }, chestId);
  await expect(page.locator('#relic-inventory-rail .relic-rail-cell')).toHaveCount(1);
});
