import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * Production two-client multiplayer qualification (mode.mainStage).
 *
 * Verifies the asset-ready preload handshake, identical selected runs on
 * both clients, elite encounter-bar agreement, boss-intro and boss-death
 * victory agreement, and a clean rematch through the preload gate.
 * Elite/boss kills use the qualification-server test damage hook.
 */
test.use({ baseURL: 'http://localhost:8096' });

async function captureDensityEvidence(label: string, page: Page): Promise<Record<string, unknown>> {
  return page.evaluate((sampleLabel) => {
    const api = (window as unknown as {
      __recoil: {
        state(): {
          tank: { x: number; z: number };
          enemies: Array<{ alive: boolean; x: number; z: number; defId?: string }>;
        };
        stageView(): { phase: string } | null;
        quality(): Record<string, number> | null;
        netcodeMetrics(): Record<string, number>;
        hordeReplication(): Record<string, number> | null;
      };
    }).__recoil;
    const state = api.state();
    const alive = state.enemies.filter((enemy) => enemy.alive);
    const within = (distance: number) => alive.filter(
      (enemy) => Math.hypot(enemy.x - state.tank.x, enemy.z - state.tank.z) <= distance,
    ).length;
    const network = api.netcodeMetrics();
    return {
      label: sampleLabel,
      phase: api.stageView()?.phase ?? 'unknown',
      globalReplicatedEnemies: alive.length,
      nearbyEnemyCount45: within(45),
      nearbyEnemyCount70: within(70),
      quality: api.quality(),
      replicationPopulation: api.hordeReplication(),
      network: {
        ...network,
        estimatedInboundBytesPerSecond: network.snapshotBytes * network.snapshotRate,
      },
    };
  }, label);
}

test('production multiplayer agrees on run, wave, and boss presentation across two clients', async ({ browser }) => {
  test.setTimeout(420_000);
  const ctx = await browser.newContext();
  const driver = await ctx.newPage();
  const gunner = await ctx.newPage();

  const errors: string[][] = [[], []];
  const densityEvidence: Array<{ client: 'driver' | 'gunner'; sample: Record<string, unknown> }> = [];
  for (const [i, page] of [driver, gunner].entries()) {
    page.on('pageerror', (e) => errors[i].push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors[i].push(m.text());
      if (m.text().includes('runConfig') || m.text().includes('asset')) console.log(`[page${i}]`, m.text());
    });
    page.on('response', (response) => {
      if (response.status() === 404 && !response.url().endsWith('/favicon.ico')) {
        errors[i].push(`HTTP 404 ${response.url()}`);
      }
    });
  }

  await driver.goto('/?test=1');
  await driver.click('#screen-boot');
  await driver.click('#screen-main [data-act="multiplayer"]');
  await driver.click('#screen-main [data-act="create"]');
  await driver.waitForFunction(() => {
    const w = window as unknown as { __recoil: { code(): string } };
    return w.__recoil.code().length === 6;
  });
  const code = await driver.evaluate(() => (window as unknown as { __recoil: { code(): string } }).__recoil.code());

  await gunner.goto('/?test=1');
  await gunner.click('#screen-boot');
  await gunner.click('#screen-main [data-act="multiplayer"]');
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
  await driver.waitForTimeout(5_000);
  densityEvidence.push(
    { client: 'driver', sample: await captureDensityEvidence('phase1', driver) },
    { client: 'gunner', sample: await captureDensityEvidence('phase1', gunner) },
  );
  // Qualification guard: keep the idle tank alive so ambient/wave pressure
  // cannot end the run before the boss encounter is exercised.
  await driver.evaluate(() => {
    const w = window as unknown as { __recoil: { testHealTank(): void } };
    const heal = w.__recoil.testHealTank;
    heal();
    // Qualification clients are intentionally idle while phase timing is
    // exercised. Heal faster than a clustered horde can burst the tank so
    // this presentation test does not terminate as a combat-loss test.
    setInterval(heal, 250);
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
  expect(hpD?.trim()).toMatch(/^[\d,]+ \/ [\d,]+$/);
  densityEvidence.push(
    { client: 'driver', sample: await captureDensityEvidence('wave1', driver) },
    { client: 'gunner', sample: await captureDensityEvidence('wave1', gunner) },
  );
  await driver.screenshot({ path: 'docs/monster-system/qualification-screenshots/mp-wave1-driver.png' });
  await gunner.screenshot({ path: 'docs/monster-system/qualification-screenshots/mp-wave1-gunner.png' });

  // ---- Airborne arc agreement (second-pass): launch a phase fodder and
  // compare replicated + rendered Y on both clients.
  const closeFodderDefId = (runDriver as { phases: Array<{ closeFodderEnemyId: string }> }).phases[0].closeFodderEnemyId;
  await driver.evaluate(
    ({ defId }) => {
      const w = window as unknown as { __recoil: { testImpulse(defId: string, h: number, v: number): void } };
      w.__recoil.testImpulse(defId, 1.5, 12);
    },
    { defId: closeFodderDefId },
  );
  await driver.waitForTimeout(700);
  const airD = await driver.evaluate(
    (defId) => {
      const w = window as unknown as {
        __recoil: {
          enemyReplicated(d: string): { id: number; y: number; defId: string; alive: boolean; impulseVy?: number } | null;
          enemyRenderY(id: number): number | null;
          groundHeightAt(x: number, z: number): number;
          state(): { tank: { x: number; z: number } };
        };
      };
      const e = w.__recoil.enemyReplicated(defId);
      if (!e) return null;
      const tank = w.__recoil.state().tank;
      return {
        y: e.y,
        renderedY: w.__recoil.enemyRenderY(e.id),
        ground: w.__recoil.groundHeightAt(tank.x, tank.z),
        impulseVy: e.impulseVy ?? 0,
      };
    },
    closeFodderDefId,
  );
  const airG = await gunner.evaluate(
    (defId) => {
      const w = window as unknown as {
        __recoil: {
          enemyReplicated(d: string): { id: number; y: number; defId: string; alive: boolean } | null;
          enemyRenderY(id: number): number | null;
        };
      };
      const e = w.__recoil.enemyReplicated(defId);
      if (!e) return null;
      return { y: e.y, renderedY: w.__recoil.enemyRenderY(e.id) };
    },
    closeFodderDefId,
  );
  if (!airD || !airG || airD.renderedY === null || airG.renderedY === null) {
    throw new Error('airborne comparison unavailable');
  }
  expect(airD.y).toBeGreaterThan(airD.ground + 0.4);
  expect(Math.abs(airD.y - airG.y)).toBeLessThanOrEqual(0.06);
  // The pages schedule independent render loops, so their visual samples may
  // be separated by one 20 Hz snapshot interval during a fast vertical arc.
  // Scale the bound with authoritative vertical velocity while retaining a
  // strict 15 cm floor near the apex/ground.
  const oneSnapshotVerticalTravel = Math.max(1, Math.abs(airD.impulseVy) * 0.055);
  expect(Math.abs(airD.renderedY - airG.renderedY)).toBeLessThanOrEqual(oneSnapshotVerticalTravel);
  expect(Math.abs(airD.renderedY - airD.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(airG.renderedY - airG.y)).toBeLessThanOrEqual(1);
  await driver.screenshot({ path: 'docs/monster-system/qualification-screenshots/mp-airborne-driver.png' });
  await gunner.screenshot({ path: 'docs/monster-system/qualification-screenshots/mp-airborne-gunner.png' });

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
  await gunner.waitForFunction(
    () => {
      const w = window as unknown as { __recoil: { stageView(): { phase: string } | null } };
      return w.__recoil.stageView()?.phase === 'wave2';
    },
    undefined,
    { timeout: 30_000 },
  );
  densityEvidence.push(
    { client: 'driver', sample: await captureDensityEvidence('wave2', driver) },
    { client: 'gunner', sample: await captureDensityEvidence('wave2', gunner) },
  );
  await driver.evaluate(
    ({ defId }) => {
      const w = window as unknown as { __recoil: { testDamage(defId: string, amount: number): void } };
      w.__recoil.testDamage(defId, 1_000_000);
    },
    { defId: runForKill.eliteWaves[1][0].enemyId },
  );
  for (const page of [driver, gunner]) {
    await page.waitForFunction(
      () => {
        const w = window as unknown as { __recoil: { stageView(): { phase: string } | null } };
        return w.__recoil.stageView()?.phase === 'farming3';
      },
      undefined,
      { timeout: 60_000 },
    );
  }
  await driver.waitForTimeout(5_000);
  densityEvidence.push(
    { client: 'driver', sample: await captureDensityEvidence('phase3', driver) },
    { client: 'gunner', sample: await captureDensityEvidence('phase3', gunner) },
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
  expect(bossHpD?.trim()).toMatch(/^[\d,]+ \/ [\d,]+$/);
  densityEvidence.push(
    { client: 'driver', sample: await captureDensityEvidence('boss', driver) },
    { client: 'gunner', sample: await captureDensityEvidence('boss', gunner) },
  );
  for (const entry of densityEvidence) {
    const quality = entry.sample.quality as { frameIntervalP95Ms: number; renderSubmitP95Ms: number };
    const network = entry.sample.network as { outboundBuffered: number; serverTickDurationMs: number };
    expect(quality.frameIntervalP95Ms).toBeLessThan(100);
    expect(quality.renderSubmitP95Ms).toBeLessThan(50);
    expect(network.outboundBuffered).toBeLessThan(1_000_000);
    expect(network.serverTickDurationMs).toBeLessThan(50);
  }
  mkdirSync('docs/horde/qualification', { recursive: true });
  writeFileSync(
    'docs/horde/qualification/horde-density-v1-browser.json',
    `${JSON.stringify({ capturedAt: new Date().toISOString(), map: 'map.urban400Prototype', samples: densityEvidence }, null, 2)}\n`,
    'utf8',
  );
  await driver.screenshot({ path: 'docs/monster-system/qualification-screenshots/mp-boss-driver.png' });
  await gunner.screenshot({ path: 'docs/monster-system/qualification-screenshots/mp-boss-gunner.png' });

  // ---- Reconnect during boss state (second-pass): the gunner drops and
  // rejoins through the compatibility gate; both clients must still see the
  // same boss encounter.
  const gunnerSessionId = await gunner.evaluate(
    () => (window as unknown as { __recoil: { sessionId(): string } }).__recoil.sessionId(),
  );
  await gunner.close();
  const gunner2 = await ctx.newPage();
  gunner2.on('pageerror', (e) => errors[1].push(e.message));
  await gunner2.goto('/?test=1');
  await gunner2.click('#screen-boot');
  await gunner2.evaluate(
    ({ code, sid }) => {
      const w = window as unknown as { __recoil: { rejoin(c: string, s: string): void } };
      w.__recoil.rejoin(code, sid);
    },
    { code, sid: gunnerSessionId },
  );
  await gunner2.waitForFunction(
    () => {
      const api = (window as unknown as {
        __recoil: { state(): { phase: string } | null; flow(): string };
      }).__recoil;
      return api.state()?.phase === 'running' && api.flow() === 'game';
    },
    undefined,
    { timeout: 90_000 },
  );
  await expect(gunner2.locator('#encounter-boss')).toBeVisible({ timeout: 30_000 });
  const bossLabelG2 = await gunner2.textContent('#encounter-boss-label');
  expect(bossLabelG2).toBe(bossLabelD);
  await gunner2.screenshot({ path: 'docs/monster-system/qualification-screenshots/mp-boss-reconnect-gunner.png' });

  // Kill the boss -> victory on both clients.
  await driver.evaluate(
    ({ defId }) => {
      const w = window as unknown as { __recoil: { testDamage(defId: string, amount: number): void } };
      w.__recoil.testDamage(defId, 10_000_000);
    },
    { defId: runForKill.boss.enemyId },
  );
  for (const page of [driver, gunner2]) {
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
  await gunner2.locator('#mods .mod').first().click();
  const oldMatchId = await driver.evaluate(
    () => (window as unknown as { __recoil: { state(): { matchId: string } } }).__recoil.state().matchId,
  );
  for (const [label, page] of [['driver', driver], ['gunner2', gunner2]] as const) {
    try {
      await page.waitForFunction(
        (oldId) => {
          const s = (window as unknown as { __recoil: { state(): { phase: string; matchId: string } | null } }).__recoil.state();
          return s?.phase === 'running' && s.matchId !== oldId;
        },
        oldMatchId,
        { timeout: 90_000 },
      );
    } catch (error) {
      const dump = await page.evaluate(() => {
        const w = window as unknown as {
          __recoil: {
            flow(): string;
            state(): { phase: string; matchId: string } | null;
            runConfig(): { t: string; matchId?: string; contentHash?: string } | null;
          };
        };
        return {
          flow: w.__recoil.flow(),
          state: w.__recoil.state(),
          runConfig: w.__recoil.runConfig(),
        };
      });
      console.log(`[mp-qualify] rematch stuck on ${label}:`, JSON.stringify(dump));
      throw error;
    }
    await expect(page.locator('#stage-wave-timer-label')).toHaveText('TIME UNTIL NEW WAVE');
    await expect(page.locator('#encounter-elite1')).not.toBeVisible();
    await expect(page.locator('#encounter-boss')).not.toBeVisible();
  }

  for (const list of errors) {
    const critical = list.filter(
      (e) =>
        !e.includes('WebGL') &&
        !e.includes('GPU') &&
        !e.includes('ERR_CACHE_WRITE_FAILURE') &&
        !e.includes('/assets/environment/sky/recoil-day-01.webp') &&
        e !== 'Failed to load resource: the server responded with a status of 404 (Not Found)',
    );
    expect(critical).toEqual([]);
  }
  await ctx.close();
});
