import { expect, test } from '@playwright/test';

/**
 * Production Single Player qualification (mode.singlePlayerMainStage).
 *
 * Runs the full loop on the live production server: farming, wave 1/2
 * elites, boss intro, boss defeat victory, and a clean rematch. TEST_MODE
 * hooks kill wave leaders/boss deterministically so the run completes in
 * ~3.5 minutes; real aiming/combat remains a manual qualification item.
 */
test.use({ baseURL: 'http://localhost:8096' });

test('production single player completes the full monster loop and rematches cleanly', async ({ page }) => {
  test.setTimeout(340_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/?test=1');
  await page.click('#screen-boot');
  await page.click('#screen-main [data-act="single"]');
  await page.waitForFunction(() => {
    const w = window as unknown as { __recoil: { state(): { phase: string } | null } };
    return w.__recoil.state()?.phase === 'running';
  });
  const runInfo = await page.evaluate(() => {
    const w = window as unknown as { __recoil: { monster: { run(): unknown } } };
    return w.__recoil.monster.run();
  });
  console.log('[sp-qualify] selected run:', JSON.stringify(runInfo));
  // Qualification guard: keep the idle tank alive so ambient/wave pressure
  // cannot end the run before the boss encounter is exercised.
  await page.evaluate(() => {
    const w = window as unknown as { __recoil: { monster: { healTank(): void } } };
    const heal = w.__recoil.monster.healTank;
    heal();
    setInterval(heal, 3000);
  });

  // Farming HUD: exact wave-timer label, monster level, no encounter bars.
  await expect(page.locator('#stage-wave-timer-label')).toHaveText('TIME UNTIL NEW WAVE');
  await expect(page.locator('#stage-monster-level')).toHaveText(/^LV 1$/);
  await expect(page.locator('#encounter-elite1')).not.toBeVisible();
  await page.screenshot({ path: 'docs/monster-system/qualification-screenshots/sp-farming.png' });

  // Wave 1: elite encounter bar appears at ~60 s.
  await expect(page.locator('#encounter-elite1')).toBeVisible({ timeout: 100_000 });
  await expect(page.locator('#encounter-elite1-label')).not.toHaveText('');
  await page.screenshot({ path: 'docs/monster-system/qualification-screenshots/sp-wave1.png' });
  // The farming clock is frozen during the elite wave (bug-fix phase 4).
  await expect(page.locator('#stage-wave-countdown')).toHaveText('00:00');
  await page.waitForTimeout(3000);
  await expect(page.locator('#stage-wave-countdown')).toHaveText('00:00');

  // Kill wave 1 elite -> farming resumes.
  await page.evaluate(() => {
    const w = window as unknown as {
      __recoil: {
        monster: {
          run(): { eliteWaves: Array<Array<{ enemyId: string }>> } | null;
          enemies(): Array<{ id: number; defId: string; alive: boolean }>;
          damage(id: number, amount: number): number;
        };
      };
    };
    const run = w.__recoil.monster.run();
    const target = run?.eliteWaves[0]?.[0]?.enemyId;
    const enemy = w.__recoil.monster.enemies().find((e) => e.defId === target && e.alive);
    if (enemy) w.__recoil.monster.damage(enemy.id, 1_000_000);
  });
  await page.waitForFunction(() => {
    const w = window as unknown as { __recoil: { monster: { phase(): string | null } } };
    return w.__recoil.monster.phase() === 'farming2';
  });
  // XP shards are present in the authoritative state visible to the browser.
  await page.waitForFunction(() => {
    const w = window as unknown as { __recoil: { state(): { xpShards: unknown[] } } };
    return w.__recoil.state().xpShards.length > 0;
  });

  // Wave 2 elite at ~120 s reuses the single active elite bar (one elite
  // per wave by default); its label must differ from wave 1's.
  await page.waitForFunction(() => {
    const w = window as unknown as {
      __recoil: {
        monster: {
          run(): { eliteWaves: Array<Array<{ enemyId: string }>> } | null;
          enemies(): Array<{ id: number; defId: string; alive: boolean }>;
        };
      };
    };
    const target = w.__recoil.monster.run()?.eliteWaves[1]?.[0]?.enemyId;
    return w.__recoil.monster.enemies().some((e) => e.defId === target && e.alive);
  }, undefined, { timeout: 100_000 });
  await expect(page.locator('#encounter-elite1')).toBeVisible();
  await page.screenshot({ path: 'docs/monster-system/qualification-screenshots/sp-wave2.png' });
  await page.evaluate(() => {
    const w = window as unknown as {
      __recoil: {
        monster: {
          run(): { eliteWaves: Array<Array<{ enemyId: string }>> } | null;
          enemies(): Array<{ id: number; defId: string; alive: boolean }>;
          damage(id: number, amount: number): number;
        };
      };
    };
    const run = w.__recoil.monster.run();
    const target = run?.eliteWaves[1]?.[0]?.enemyId;
    const enemy = w.__recoil.monster.enemies().find((e) => e.defId === target && e.alive);
    if (enemy) w.__recoil.monster.damage(enemy.id, 1_000_000);
  });
  await page.waitForFunction(() => {
    const w = window as unknown as { __recoil: { monster: { phase(): string | null } } };
    return w.__recoil.monster.phase() === 'farming3';
  });

  // Boss intro at ~180 s, then the boss encounter bar.
  await page.waitForFunction(
    () => {
      const el = document.getElementById('stage-wave-timer-label');
      return el?.textContent === 'BOSS INCOMING';
    },
    undefined,
    { timeout: 100_000 },
  );
  await page.screenshot({ path: 'docs/monster-system/qualification-screenshots/sp-boss-intro.png' });
  await expect(page.locator('#encounter-boss')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#encounter-boss-label')).not.toHaveText('');
  await page.screenshot({ path: 'docs/monster-system/qualification-screenshots/sp-boss.png' });

  // Kill the boss -> victory.
  await page.evaluate(() => {
    const w = window as unknown as {
      __recoil: {
        monster: {
          run(): { boss: { enemyId: string } } | null;
          enemies(): Array<{ id: number; defId: string; alive: boolean }>;
          damage(id: number, amount: number): number;
        };
      };
    };
    const run = w.__recoil.monster.run();
    const enemy = w.__recoil.monster.enemies().find((e) => e.defId === run?.boss.enemyId && e.alive);
    if (enemy) w.__recoil.monster.damage(enemy.id, 10_000_000);
  });
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __recoil: { state(): { phase: string } | null } };
      return w.__recoil.state()?.phase === 'results';
    },
    undefined,
    { timeout: 60_000 },
  );
  const resultsInfo = await page.evaluate(() => {
    const w = window as unknown as { __recoil: { monster: { resultsState(): unknown } } };
    return w.__recoil.monster.resultsState();
  });
  console.log('[sp-qualify] results state:', JSON.stringify(resultsInfo));
  await expect(page.locator('#screen-results:not(.hidden)')).toBeVisible();
  await page.screenshot({ path: 'docs/monster-system/qualification-screenshots/sp-victory.png' });

  // Rematch: fresh match, fresh HUD, no lingering encounter bars.
  const oldMatchId = await page.evaluate(
    () => (window as unknown as { __recoil: { state(): { matchId: string } } }).__recoil.state().matchId,
  );
  await page.click('#sp-play-again');
  await page.waitForFunction(
    (oldId) => {
      const s = (window as unknown as { __recoil: { state(): { phase: string; matchId: string } | null } }).__recoil.state();
      return s?.phase === 'running' && s.matchId !== oldId;
    },
    oldMatchId,
  );
  await expect(page.locator('#stage-wave-timer-label')).toHaveText('TIME UNTIL NEW WAVE');
  await expect(page.locator('#encounter-elite1')).not.toBeVisible();
  await expect(page.locator('#encounter-boss')).not.toBeVisible();

  const critical = errors.filter(
    (e) => !e.includes('WebGL') && !e.includes('GPU') && !e.includes('ERR_CACHE_WRITE_FAILURE'),
  );
  expect(critical).toEqual([]);
});
