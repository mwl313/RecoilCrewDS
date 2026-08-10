import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
] as const;

test('credits are complete, readable, responsive, and return to the main menu', async ({ page }, testInfo) => {
  await page.goto('/?test=1&nodebug=1');
  await page.click('#screen-boot');
  await expect(page.locator('#screen-main')).toBeVisible();
  await expect(page.locator('#main-credits')).toHaveText('CREDITS');
  await page.click('#main-credits');

  const credits = page.locator('#screen-credits');
  await expect(credits).toBeVisible();
  await expect(page.locator('#credits-title')).toHaveText('CREDITS & ASSET LICENSES');
  await expect(page.locator('#credits-development-name')).toHaveText('MinWoo Lim');
  await expect(page.locator('#credits-assets-list')).toContainText('Ultimate Monsters');
  await expect(page.locator('#credits-assets-list')).toContainText('Ultimate RPG Pack');
  await expect(page.locator('#credits-music-tracks')).toHaveText('“Recoil Crew BGM 1” and “Recoil Crew BGM 2”');
  await expect(page.locator('#credits-sfx-runtime')).toContainText('Web Audio API');
  await expect(page.locator('#credits-copyright')).toHaveText('Recoil Crew © 2026 MinWoo Lim');
  await page.waitForTimeout(500);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    const layout = await page.locator('#credits-panel').evaluate((panel) => {
      const rect = panel.getBoundingClientRect();
      const back = panel.querySelector<HTMLElement>('#credits-back')!.getBoundingClientRect();
      return {
        viewport: { width: innerWidth, height: innerHeight },
        panel: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        back: { left: back.left, right: back.right, top: back.top, bottom: back.bottom },
      };
    });
    expect(layout.panel.left).toBeGreaterThanOrEqual(0);
    expect(layout.panel.right).toBeLessThanOrEqual(layout.viewport.width);
    expect(layout.panel.top).toBeGreaterThanOrEqual(0);
    expect(layout.panel.bottom).toBeLessThanOrEqual(layout.viewport.height);
    expect(layout.back.left).toBeGreaterThanOrEqual(layout.panel.left);
    expect(layout.back.right).toBeLessThanOrEqual(layout.panel.right);
    expect(layout.back.bottom).toBeLessThanOrEqual(layout.panel.bottom);
    await page.screenshot({ path: testInfo.outputPath(`credits-${viewport.width}x${viewport.height}.png`) });
  }

  await page.locator('#credits-body').evaluate((body) => { body.scrollTop = body.scrollHeight; });
  await expect(page.locator('#credits-copyright')).toBeInViewport();
  await expect(page.locator('#credits-exception')).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('credits-390x844-bottom.png') });

  await page.click('#credits-back');
  await expect(page.locator('#screen-main')).toBeVisible();
  await expect(credits).toBeHidden();
  await expect(page.locator('#main-credits')).toBeInViewport();
});
