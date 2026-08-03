import { expect, test } from '@playwright/test';

/**
 * Regression: scene/overlay shows must fade in exactly once. The old CSS
 * had a base `.screen { animation: fadein }` that restarted from opacity 0
 * the moment the enter-transition class was cleaned up, causing a visible
 * second fade (one-frame flicker) on every scene change / overlay summon.
 */
test('scene show fades in once and never re-fades', async ({ page }) => {
  await page.goto('/?test=1');
  await page.click('#screen-boot');
  await page.waitForTimeout(500); // main menu settled
  await page.evaluate(() => {
    const w = window as unknown as { __flicker: { t: number; o: number }[] };
    w.__flicker = [];
    const start = performance.now();
    const rec = (): void => {
      const el = document.getElementById('screen-howto');
      if (el) w.__flicker.push({ t: performance.now() - start, o: Number(getComputedStyle(el).opacity) });
      if (performance.now() - start < 800) requestAnimationFrame(rec);
    };
    requestAnimationFrame(rec);
  });
  await page.click('#screen-main [data-act="howto"]');
  await page.waitForTimeout(1100);
  const samples = await page.evaluate(() => (window as unknown as { __flicker: { t: number; o: number }[] }).__flicker);
  expect(samples.length).toBeGreaterThan(10);
  // After the enter fade completes (~180 ms), opacity must stay fully
  // visible. The old base `fadein` restart dropped it back to ~0 here.
  const late = samples.filter((s) => s.t > 200);
  expect(late.length).toBeGreaterThan(5);
  expect(Math.min(...late.map((s) => s.o))).toBeGreaterThan(0.5);
  // And it must actually have faded in from transparent (animation ran).
  const early = samples.filter((s) => s.t < 120);
  expect(Math.min(...early.map((s) => s.o))).toBeLessThan(0.9);
});
