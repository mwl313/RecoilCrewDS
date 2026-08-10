import { expect, test, type Page } from '@playwright/test';

async function enterMenu(page: Page) {
  await page.goto('/?test=1');
  await page.click('#screen-boot');
  await expect(page.locator('#screen-main')).toBeVisible();
}

async function waitState(page: Page, predicate: string) {
  await page.waitForFunction(
    (fn) => {
      const s = (window as unknown as { __recoil: { state: () => unknown } }).__recoil.state();
      return s ? new Function('s', `return (${fn})(s)`)(s) : false;
    },
    predicate,
    { timeout: 130_000 },
  );
}

async function startDriver(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __recoil: {
        input(role: string, data: unknown): void;
        state(): {
          tank: { x: number; z: number; yaw: number };
          turret: { cannonHeld: boolean };
          pickups: { collected: boolean; x: number; z: number }[];
        };
      };
    };
    let t = 0;
    const id = setInterval(() => {
      const s = w.__recoil.state();
      if (!s) return;
      t += 0.1;
      const wrap = (a: number) => {
        let v = a % (Math.PI * 2);
        if (v > Math.PI) v -= Math.PI * 2;
        if (v < -Math.PI) v += Math.PI * 2;
        return v;
      };
      let target = null as null | { x: number; z: number };
      let bugTarget = null as null | { x: number; z: number };
      for (const p of s.pickups) {
        if (p.collected) continue;
        const d = Math.hypot(p.x - s.tank.x, p.z - s.tank.z);
        if (d < 60 && (!target || d < Math.hypot(target.x - s.tank.x, target.z - s.tank.z))) target = p;
      }
      let steer = Math.sin(t / 2.4) * 0.65;
      if (target) {
        const yawTo = Math.atan2(target.x - s.tank.x, target.z - s.tank.z);
        steer = Math.max(-1, Math.min(1, wrap(yawTo - s.tank.yaw) * 1.8));
      }
      w.__recoil.input('driver', {
        throttle: 0.85,
        steer,
        dashPressed: t % 8 < 0.1,
        jumpPressed: false,
      });
    }, 100);
    (window as unknown as Record<string, unknown>).__stopDriver = () => clearInterval(id);
  });
}

async function startGunner(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __recoil: {
        input(role: string, data: unknown): void;
        state(): {
          tank: { x: number; z: number; yaw: number };
          turret: { cannonCooldown: number; cannonHeld: boolean };
          enemies: { type: string; alive: boolean; x: number; z: number }[];
        };
      };
    };
    let t = 0;
    let lastCannonSent = false;
    const id = setInterval(() => {
      const s = w.__recoil.state();
      if (!s) return;
      t += 0.1;
      // Protocol: gunner aimYaw is chassis-local. Convert from world.
      const toLocal = (world: number) => {
        let v = (world - s.tank.yaw) % (Math.PI * 2);
        if (v > Math.PI) v -= Math.PI * 2;
        if (v < -Math.PI) v += Math.PI * 2;
        return v;
      };
      let aimYaw = toLocal(s.tank.yaw + Math.PI / 2);
      let target = null as null | { x: number; z: number };
      let bugTarget = null as null | { x: number; z: number };
      for (const e of s.enemies) {
        if (!e.alive || e.type === 'lootTruck') continue;
        if (!target) target = e;
        else if (Math.hypot(e.x - s.tank.x, e.z - s.tank.z) < Math.hypot(target.x - s.tank.x, target.z - s.tank.z)) target = e;
      }
      for (const e of s.enemies) {
        if (!e.alive || e.type !== 'scrapBug') continue;
        if (!bugTarget) bugTarget = e;
        else if (Math.hypot(e.x - s.tank.x, e.z - s.tank.z) < Math.hypot(bugTarget.x - s.tank.x, bugTarget.z - s.tank.z)) bugTarget = e;
      }
      const best = bugTarget ?? target;
      if (best) aimYaw = toLocal(Math.atan2(best.x - s.tank.x, best.z - s.tank.z));
      const fire = s.turret.cannonCooldown <= 0;
      const cannon = fire && !lastCannonSent;
      lastCannonSent = fire;
      w.__recoil.input('gunner', {
        aimYaw,
        aimPitch: 0.05,
        primary: t % 3 < 2,
        secondary: cannon,
      });
    }, 100);
    (window as unknown as Record<string, unknown>).__stopGunner = () => clearInterval(id);
  });
}

test('two browsers play a complete round, see results, and rematch', async ({ browser }) => {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const errors: string[] = [];
  for (const p of [a, b]) {
    p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    p.on('console', (m) => {
      if (m.type() === 'error' && !m.text().includes('Failed to load resource')) {
        errors.push(`console: ${m.text()}`);
      }
    });
    p.on('response', (response) => {
      if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
        errors.push(`http ${response.status()}: ${response.url()}`);
      }
    });
  }

  await enterMenu(a);
  await a.click('#screen-main [data-act="multiplayer"]');
  await a.click('#screen-main [data-act="create"]');
  await a.waitForFunction(() => {
    const w = window as unknown as { __recoil: { code: () => string } };
    return w.__recoil.code().length === 6;
  });
  const code = await a.evaluate(() => (window as unknown as { __recoil: { code: () => string } }).__recoil.code());
  expect(code).toMatch(/^[A-Z2-9]{6}$/);

  await enterMenu(b);
  await b.click('#screen-main [data-act="multiplayer"]');
  await b.click('#screen-main [data-act="join"]');
  await b.fill('#join-code', code);
  await b.click('#join-go');
  await expect(b.locator('#screen-ready')).toBeVisible();

  await a.click('#lobby-ready');
  await b.click('#lobby-ready');

  // Countdown -> match start on both clients.
  await waitState(a, 's => s.phase === "running"');
  await waitState(b, 's => s.phase === "running"');
  await expect(a.locator('canvas#game-canvas')).toHaveCount(1);
  await expect(b.locator('canvas#game-canvas')).toHaveCount(1);
  await expect(a.locator('#hud')).toBeVisible();

  // Scripted two-role play until the round ends.
  await startDriver(a);
  await startGunner(b);

  // Driver movement is real.
  await waitState(a, 's => Math.hypot(s.tank.x, s.tank.z) > 8');
  // Enemies die and scrap spawns.
  await waitState(b, 's => s.stats.kills >= 2 && s.pickups.length >= 1');

  // Cannon recoil: watch the auto-Gunner's real shots and confirm a fresh
  // cannon blast changes the shared tank's velocity by roughly the recoil
  // impulse (recoil is always full strength now).
  const recoilOk = await b.evaluate(async () => {
    const w = window as unknown as {
      __recoil: { state(): {
        tank: { deadT: number; vx: number; vz: number };
        turret: { cannonCooldown: number };
      } };
    };
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let prevCd = 0;
    for (let i = 0; i < 80; i++) {
      const s = w.__recoil.state();
      if (s) {
        const cd = s.turret.cannonCooldown;
        if (prevCd < 0.3 && cd > 1.0 && s.tank.deadT <= 0) {
          await delay(250);
          const s2 = w.__recoil.state();
          if (s2) {
            const delta = Math.hypot(s2.tank.vx - s.tank.vx, s2.tank.vz - s.tank.vz);
            if (delta > 2.5) return true;
          }
        }
        prevCd = cd;
      }
      await delay(100);
    }
    return false;
  });
  expect(recoilOk).toBe(true);

  // More enemies die as the round progresses.
  await waitState(a, 's => s.stats.kills >= 5');

  // Round completes to results on both clients.
  await waitState(a, 's => s.phase === "results"');
  await waitState(b, 's => s.phase === "results"');
  await expect(a.locator('#screen-results:not(.hidden)')).toBeVisible();
  const scoreA = Number((await a.textContent('#results-score'))?.replace(/,/g, '') ?? '0');
  expect(scoreA).toBeGreaterThan(0);
  const title = await a.textContent('#results-title');
  expect(title?.trim().length ?? 0).toBeGreaterThan(0);

  await a.evaluate(() => (window as unknown as { __stopDriver?: () => void }).__stopDriver?.());
  await b.evaluate(() => (window as unknown as { __stopGunner?: () => void }).__stopGunner?.());

  // Rematch: both pick a modifier -> same room, fresh round.
  await a.click('.mod[data-mod="doubleBarrel"]');
  await b.click('.mod[data-mod="doubleBarrel"]');
  await waitState(a, 's => s.phase === "running" && s.stats.score === 0');
  const matchA = await a.evaluate(() => (window as unknown as { __recoil: { state(): { matchId: string } } }).__recoil.state().matchId);
  const matchB = await b.evaluate(() => (window as unknown as { __recoil: { state(): { matchId: string } } }).__recoil.state().matchId);
  expect(matchA).toBe(matchB);

  for (const page of [a, b]) {
    await page.waitForFunction(() =>
      (window as unknown as { __recoil: { flow(): string } }).__recoil.flow() === 'game',
    );
  }
  const rematchSpawn = await a.evaluate(() => {
    const tank = (window as unknown as {
      __recoil: { state(): { tank: { x: number; z: number } } };
    }).__recoil.state().tank;
    return { x: tank.x, z: tank.z };
  });
  await startDriver(a);
  await startGunner(b);
  await a.waitForFunction((spawn) => {
    const tank = (window as unknown as {
      __recoil: { state(): { tank: { x: number; z: number } } | null };
    }).__recoil.state()?.tank;
    return !!tank && Math.hypot(tank.x - spawn.x, tank.z - spawn.z) > 2;
  }, rematchSpawn);
  await b.waitForFunction(() =>
    ((window as unknown as {
      __recoil: { state(): { turret: { cannonCooldown: number } } | null };
    }).__recoil.state()?.turret.cannonCooldown ?? 0) > 0.3,
  );
  await a.evaluate(() => (window as unknown as { __stopDriver?: () => void }).__stopDriver?.());
  await b.evaluate(() => (window as unknown as { __stopGunner?: () => void }).__stopGunner?.());

  const critical = errors.filter((e) =>
    !e.includes('WebGL')
    && !e.includes('GPU')
    && !e.includes('Automatic fallback')
    // This authored slot is explicitly optional; SkyEnvironment immediately
    // retains its procedural fallback when the file is absent.
    && !e.includes('/assets/environment/sky/recoil-day-01.webp'),
  );
  expect(critical).toEqual([]);

  await ctxA.close();
  await ctxB.close();
});
