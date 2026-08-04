import { expect, test } from '@playwright/test';

test('trajectory reticle stays on-screen in Single Player (no bottom-right drift)', async ({ page }) => {
  await page.goto('/?test=1');
  await page.click('#screen-boot');
  await page.click('#screen-main [data-act="single"]');
  await page.waitForFunction(() => {
    const s = (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state();
    return s?.phase === 'running';
  });
  await page.waitForTimeout(600);

  const box = await page.evaluate(() => {
    const el = document.querySelector('#crosshair') as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      w: window.innerWidth,
      h: window.innerHeight,
      transform: el.style.transform,
    };
  });
  expect(box).not.toBeNull();
  expect(box!.transform).toContain('translate(-50%, -50%) translate(');
  // The reticle must never be pushed outside the viewport (the old bug put
  // it at the bottom-right corner because left/top px were applied inside a
  // CSS-transformed host).
  expect(box!.left).toBeGreaterThanOrEqual(0);
  expect(box!.top).toBeGreaterThanOrEqual(0);
  expect(box!.right).toBeLessThanOrEqual(box!.w + 1);
  expect(box!.bottom).toBeLessThanOrEqual(box!.h + 1);
  expect(box!.right - box!.left).toBeGreaterThan(0);
  expect(box!.bottom - box!.top).toBeGreaterThan(0);
});
