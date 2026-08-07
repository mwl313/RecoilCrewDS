import { expect, test } from '@playwright/test';

/**
 * Regression: overlay cards move without changing opacity. The old CSS had
 * a base `.screen { animation: fadein }` that restarted from opacity 0 when
 * transition classes were cleaned up, causing a one-frame flicker.
 */
test('overlay summon remains solid and never re-fades', async ({ page }) => {
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
      // Overlay exit+entry choreography can defer mounting for ~840 ms.
      if (performance.now() - start < 1800) requestAnimationFrame(rec);
    };
    requestAnimationFrame(rec);
  });
  await page.click('#screen-main [data-act="howto"]');
  await page.waitForTimeout(2000);
  const samples = await page.evaluate(() => (window as unknown as { __flicker: { t: number; o: number }[] }).__flicker);
  expect(samples.length).toBeGreaterThan(10);
  const mountedAt = samples[0].t;
  // The established overlay motion language is a solid bottom slide: no
  // opacity modulation while entering and no re-fade after cleanup.
  expect(Math.min(...samples.map((s) => s.o))).toBeGreaterThan(0.99);
  const late = samples.filter((s) => s.t > mountedAt + 500);
  expect(late.length).toBeGreaterThan(5);
  expect(Math.min(...late.map((s) => s.o))).toBeGreaterThan(0.99);
});
