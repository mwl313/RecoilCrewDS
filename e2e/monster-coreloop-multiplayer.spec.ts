import { expect, test } from '@playwright/test';

/**
 * Production two-client multiplayer qualification (mode.mainStage).
 *
 * Verifies the asset-ready preload handshake, identical selected runs on
 * both clients, elite encounter-bar agreement, boss-intro and boss-death
 * victory agreement, and a clean rematch through the preload gate.
 * Elite/boss kills use the qualification-server test damage hook.
 */
test.use({ baseURL: 'http://localhost:8096' });

test('production multiplayer agrees on run, wave, and boss presentation across two clients', async ({ browser }) => {
  test.setTimeout(420_000);
  const ctx = await browser.newContext();
  const driver = await ctx.newPage();
  const gunner = await ctx.newPage();

  const errors: string[][] = [[], []];
  for (const [i, page] of [driver, gunner].entries()) {
    page.on('pageerror', (e) => errors[i].push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors[i].push(m.text());
      if (m.text().includes('runConfig') || m.text().includes('asset')) console.log(`[page${i}]`, m.text());
    });
  }

  await driver.goto('/?test=1');
  await driver.click('#screen-boot');
  await driver.click('#screen-main [data-act="create"]');
  await driver.waitForFunction(() => {
    const w = window as unknown as { __recoil: { code(): string } };
    return w.__recoil.code().length === 6;
  });
  const code = await driver.evaluate(() => (window as unknown as { __recoil: { code(): string } }).__recoil.code());

  await gunner.goto('/?test=1');
  await gunner.click('#screen-boot');
  await gunner.click('#screen-main [data-act="join"]');
  await gunner.fill('#join-code', code);
  await gunner.click('#join-go');
  await expect(gunner.locator('#screen-ready')).toBeVisible();

  // Ready both players; the server then broadcasts the authoritative run
  // config, clients preload, and the countdown waits for assetReady.
  await driver.click('#lobby-ready');
  await gunner.click('#lobby-ready');
  for (const [i, page] of [driver, gunner].entries()) {
    try {
      await page.waitForFunction(() => {
        const w = window as unknown as { __recoil: { runConfig(): { t: string; run: unknown } | null } };
        return w.__recoil.runConfig()?.t === 'runConfig' && w.__recoil.runConfig()?.run !== null;
      }, undefined, { timeout: 45_000 });
    } catch {
      const dump = await page.evaluate(() => {
        const w = window as unknown as {
          __recoil: {
            runConfig(): unknown;
            run(): unknown;
            state(): { phase: string } | null;
          };
        };
        return { runConfig: w.__recoil.runConfig(), run: w.__recoil.run(), phase: w.__recoil.state()?.phase ?? null };
      });
      console.log(`[mp-qualify] page${i} never received runConfig:`, JSON.stringify(dump), 'errors:', errors[i]);
      throw new Error(`page${i} never received runConfig`);
    }
  }
  const runDriver = await driver.evaluate(() => (window as unknown as { __recoil: { run(): unknown } }).__recoil.run());
  const runGunner = await gunner.evaluate(() => (window as unknown as { __recoil: { run(): unknown } }).__recoil.run());
  expect(runGunner).toEqual(runDriver);

  for (const page of [driver, gunner]) {
    await page.waitForFunction(() => {
      const s = (window as unknown as { __recoil: { state(): { phase: string } | null } }).__recoil.state();
      return s?.phase === 'running';
    });
  }
  // Exact generalized identity on both clients: a monster with the run's
  // close-fodder defId must exist and never reconstruct as Scrap Bug.
  const closeFodder = (runDriver as { phases: Array<{ closeFodderEnemyId: string }> }).phases[0].closeFodderEnemyId;
  for (const page of [driver, gunner]) {
    await page.waitForFunction(
      (defId) => {
        const s = (window as unknown as {
          __recoil: { state(): { enemies: Array<{ type: string; defId: string }> } };
        }).__recoil.state();
        return s.enemies.some((e) => e.type === 'monster' && e.defId === defId);
      },
      closeFodder,
      { timeout: 60_000 },
    );
    const bad = await page.evaluate(() => {
      const s = (window as unknown as {
        __recoil: { state(): { enemies: Array<{ type: string; defId: string }> } };
      }).__recoil.state();
      return s.enemies.filter((e) => e.type === 'monster' && (e.defId === '' || e.defId === 'enemy.scrapBug'));
    });
    expect(bad).toEqual([]);
  }
  // Qualification guard: keep the idle tank alive so ambient/wave pressure
  // cannot end the run before the boss encounter is exercised.
  await driver.evaluate(() => {
    const w = window as unknown as { __recoil: { testHealTank(): void } };
    const heal = w.__recoil.testHealTank;
    heal();
    setInterval(heal, 3000);
  });

  // Farming HUD agreement on both clients.
  for (const page of [driver, gunner]) {
    await expect(page.locator('#stage-wave-timer-label')).toHaveText('TIME UNTIL NEW WAVE');
  }

  // Wave 1 elite encounter bar appears on both clients with identical data.
  await expect(driver.locator('#encounter-elite1')).toBeVisible({ timeout: 100_000 });
  await expect(gunner.locator('#encounter-elite1')).toBeVisible({ timeout: 100_000 });
  const labelD = await driver.textContent('#encounter-elite1-label');
  const labelG = await gunner.textContent('#encounter-elite1-label');
  const hpD = await driver.textContent('#encounter-elite1-hp');
  const hpG = await gunner.textContent('#encounter-elite1-hp');
  expect(labelG).toBe(labelD);
  expect(hpG).toBe(hpD);
  expect(hpD?.trim()).toMatch(/^\d+ \/ \d+$/);
  await driver.screenshot({ path: 'docs/monster-system/qualification-screenshots/mp-wave1-driver.png' });
  await gunner.screenshot({ path: 'docs/monster-system/qualification-screenshots/mp-wave1-gunner.png' });

  // Kill wave 1 elite (qualification server test hook) -> farming resumes.
  const runForKill = runDriver as { eliteWaves: Array<Array<{ enemyId: string }>>; boss: { enemyId: string } };
  await driver.evaluate(
    ({ defId }) => {
      const w = window as unknown as { __recoil: { testDamage(defId: string, amount: number): void } };
      w.__recoil.testDamage(defId, 1_000_000);
    },
    { defId: runForKill.eliteWaves[0][0].enemyId },
  );
  for (const page of [driver, gunner]) {
    await page.waitForFunction(
      () => {
        const w = window as unknown as { __recoil: { stageView(): { phase: string } | null } };
        return w.__recoil.stageView()?.phase === 'farming2';
      },
      undefined,
      { timeout: 60_000 },
    );
  }

  // Wait for wave 2, then kill its elite -> farming3.
  await driver.waitForFunction(
    () => {
      const w = window as unknown as { __recoil: { stageView(): { phase: string } | null } };
      return w.__recoil.stageView()?.phase === 'wave2';
    },
    undefined,
    { timeout: 100_000 },
  );
  await driver.evaluate(
    ({ defId }) => {
      const w = window as unknown as { __recoil: { testDamage(defId: string, amount: number): void } };
      w.__recoil.testDamage(defId, 1_000_000);
    },
    { defId: runForKill.eliteWaves[1][0].enemyId },
  );

  // Boss intro agreement at ~180 s.
  for (const page of [driver, gunner]) {
    await page.waitForFunction(
      () => document.getElementById('stage-wave-timer-label')?.textContent === 'BOSS INCOMING',
      undefined,
      { timeout: 120_000 },
    );
  }
  await expect(driver.locator('#encounter-boss')).toBeVisible({ timeout: 30_000 });
  await expect(gunner.locator('#encounter-boss')).toBeVisible({ timeout: 30_000 });
  const bossLabelD = await driver.textContent('#encounter-boss-label');
  const bossLabelG = await gunner.textContent('#encounter-boss-label');
  const bossHpD = await driver.textContent('#encounter-boss-hp');
  const bossHpG = await gunner.textContent('#encounter-boss-hp');
  expect(bossLabelG).toBe(bossLabelD);
  expect(bossHpG).toBe(bossHpD);
  expect(bossHpD?.trim()).toMatch(/^\d+ \/ \d+$/);
  await driver.screenshot({ path: 'docs/monster-system/qualification-screenshots/mp-boss-driver.png' });
  await gunner.screenshot({ path: 'docs/monster-system/qualification-screenshots/mp-boss-gunner.png' });

  // Kill the boss -> victory on both clients.
  await driver.evaluate(
    ({ defId }) => {
      const w = window as unknown as { __recoil: { testDamage(defId: string, amount: number): void } };
      w.__recoil.testDamage(defId, 10_000_000);
    },
    { defId: runForKill.boss.enemyId },
  );
  for (const page of [driver, gunner]) {
    await page.waitForFunction(
      () => {
        const w = window as unknown as { __recoil: { state(): { phase: string } | null } };
        return w.__recoil.state()?.phase === 'results';
      },
      undefined,
      { timeout: 60_000 },
    );
    await expect(page.locator('#screen-results:not(.hidden)')).toBeVisible();
  }

  // Rematch vote: both pick a modifier, the room re-runs the preload gate,
  // and both clients enter a fresh match.
  await driver.locator('#mods .mod').first().click();
  await gunner.locator('#mods .mod').first().click();
  const oldMatchId = await driver.evaluate(
    () => (window as unknown as { __recoil: { state(): { matchId: string } } }).__recoil.state().matchId,
  );
  for (const page of [driver, gunner]) {
    await page.waitForFunction(
      (oldId) => {
        const s = (window as unknown as { __recoil: { state(): { phase: string; matchId: string } | null } }).__recoil.state();
        return s?.phase === 'running' && s.matchId !== oldId;
      },
      oldMatchId,
      { timeout: 90_000 },
    );
    await expect(page.locator('#stage-wave-timer-label')).toHaveText('TIME UNTIL NEW WAVE');
    await expect(page.locator('#encounter-elite1')).not.toBeVisible();
    await expect(page.locator('#encounter-boss')).not.toBeVisible();
  }

  for (const list of errors) {
    const critical = list.filter(
      (e) => !e.includes('WebGL') && !e.includes('GPU') && !e.includes('ERR_CACHE_WRITE_FAILURE'),
    );
    expect(critical).toEqual([]);
  }
  await ctx.close();
});
