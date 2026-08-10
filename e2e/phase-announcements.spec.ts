import { expect, test, type Page } from '@playwright/test';

const SCREENSHOT_DIR = 'docs/final-patch-batch/workstream-05-phase-announcements/screenshots';

test.use({ baseURL: 'http://localhost:8096' });

async function startSinglePlayer(page: Page): Promise<void> {
  await page.goto('/?test=1&nodebug=1');
  await page.click('#screen-boot');
  await expect(page.locator('#screen-main')).toBeVisible();
  await page.click('#screen-main [data-act="single"]');
  await page.waitForFunction(() =>
    (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state()?.phase === 'running',
  );
}

async function show(
  page: Page,
  kind: 'farming' | 'elite' | 'final',
  locale: 'en' | 'ko',
): Promise<void> {
  await page.evaluate(({ kind, locale }) => {
    (window as unknown as {
      __recoil: { phaseAnnouncement: { show(kind: string, locale: string): void } };
    }).__recoil.phaseAnnouncement.show(kind, locale);
  }, { kind, locale });
  await expect(page.locator('.phase-announcement-layer')).toHaveAttribute('data-active', 'true');
}

async function expectBannerFits(page: Page): Promise<void> {
  const layout = await page.locator('.phase-announcement-layer').evaluate((layer) => {
    const heading = layer.querySelector<HTMLElement>('.phase-announcement-heading')!;
    const frame = layer.querySelector<HTMLElement>('.phase-announcement-frame')!;
    const headingRect = heading.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const style = getComputedStyle(layer);
    return {
      viewport: { width: innerWidth, height: innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
      pointerEvents: style.pointerEvents,
      heading: { left: headingRect.left, right: headingRect.right, top: headingRect.top, bottom: headingRect.bottom },
      frame: { left: frameRect.left, right: frameRect.right, top: frameRect.top, bottom: frameRect.bottom },
    };
  });
  expect(layout.pointerEvents).toBe('none');
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewport.width);
  for (const rect of [layout.heading, layout.frame]) {
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(layout.viewport.width);
    expect(rect.top).toBeGreaterThanOrEqual(0);
    expect(rect.bottom).toBeLessThanOrEqual(layout.viewport.height);
  }
}

test('English and Korean phase banners remain centered, responsive, and non-blocking', async ({ page }) => {
  await startSinglePlayer(page);
  const cases = [
    { width: 1280, height: 720, kind: 'farming', locale: 'en', text: 'SLAY MONSTERS TO PREPARE FOR THE WAVE', shot: 'farming-en-1280x720.png' },
    { width: 800, height: 720, kind: 'final', locale: 'en', text: 'THE FINAL WAVE IS INCOMING', shot: 'final-en-800x720.png' },
    { width: 560, height: 720, kind: 'elite', locale: 'ko', text: '엘리트 몬스터 웨이브 접근 중!', shot: 'elite-ko-560x720.png' },
  ] as const;

  for (const entry of cases) {
    await page.setViewportSize({ width: entry.width, height: entry.height });
    await show(page, entry.kind, entry.locale);
    await expect(page.locator('.phase-announcement-heading')).toHaveText(entry.text);
    await expect(page.locator('.phase-announcement-layer')).toHaveCSS('pointer-events', 'none');
    await expect(page.locator('.app-root')).toHaveClass(/phase-announcement-presenting/);
    await expect(page.locator('#stage-wave-warning')).toHaveCSS('visibility', 'hidden');
    await expectBannerFits(page);
    await page.waitForTimeout(190);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/${entry.shot}` });
  }

  const audio = await page.evaluate(() => {
    const hooks = (window as unknown as {
      __recoil: { audioStats(): { lastRecipe: string | null }; soundtrack(): { currentTrackId: string | null } };
    }).__recoil;
    return { recipe: hooks.audioStats().lastRecipe, track: hooks.soundtrack().currentTrackId };
  });
  expect(audio.recipe).toBe('phaseAnnouncementImpact');
  expect(audio.track).not.toBeNull();
});

test('reduced motion keeps the readable hold while removing slam and shake intent', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startSinglePlayer(page);
  await show(page, 'final', 'ko');

  const state = await page.locator('.phase-announcement-layer').evaluate((layer) => {
    const frame = layer.querySelector<HTMLElement>('.phase-announcement-frame')!;
    return {
      reduced: (layer as HTMLElement).dataset.reducedMotion,
      layerAnimation: getComputedStyle(layer).animationName,
      frameAnimation: getComputedStyle(frame).animationName,
      transform: getComputedStyle(frame).transform,
    };
  });
  expect(state.reduced).toBe('true');
  expect(state.layerAnimation).toContain('phase-announcement-reduced');
  expect(state.frameAnimation).toBe('none');
  expect(state.transform).toBe('none');
  await expectBannerFits(page);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/final-ko-reduced-motion-1280x720.png` });

  await expect(page.locator('.phase-announcement-layer')).toHaveAttribute('data-active', 'false', { timeout: 4_000 });
  await expect(page.locator('.app-root')).not.toHaveClass(/phase-announcement-presenting/);
});
