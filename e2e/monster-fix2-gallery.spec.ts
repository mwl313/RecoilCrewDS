import { expect, test } from '@playwright/test';

/**
 * Second-pass visual gallery (Single Player, production server 8096).
 *
 * Captures real rendered screenshots for the grounding convention, XP
 * instancing pressure/overflow, an airborne cannon-launch arc, and a raw
 * protocol-mismatch rejection. Screenshots are reviewed visually and the
 * review record is written into the final report.
 */
test.use({ baseURL: 'http://localhost:8096' });

const SHOT_DIR = 'docs/monster-system/qualification-screenshots';

test('monster-fix2 gallery: grounding, XP pressure, airborne, protocol gate', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/?test=1&seed=20260806');
  await page.click('#screen-boot');
  await page.click('#screen-main [data-act="single"]');
  await page.waitForFunction(() => {
    const w = window as unknown as { __recoil: { state(): { phase: string } | null } };
    return w.__recoil.state()?.phase === 'running';
  });

  // Keep the idle tank alive so ambient pressure cannot end the round.
  await page.evaluate(() => {
    const w = window as unknown as { __recoil: { monster: { healTank(): void } } };
    const heal = w.__recoil.monster.healTank;
    heal();
    setInterval(heal, 3000);
  });

  // ---- Grounding gallery: small/elite/boss on one flat row + one raised row.
  const placed = await page.evaluate(() => {
    const w = window as unknown as {
      __recoil: {
        state(): { tank: { x: number; z: number } };
        groundHeightAt(x: number, z: number): number;
        monsterSpawn(defId: string, x: number, z: number): number;
        enemyById(id: number): { id: number; defId: string; y: number; alive: boolean } | null;
      };
    };
    const rows: number[][] = [];
    const defs = [
      'enemy.quaternius.ninja',
      'enemy.quaternius.ninja-high-detail',
      'enemy.quaternius.ninja-high-detail.boss',
    ];
    const tank = w.__recoil.state().tank;
    for (const row of [0, 1]) {
      const z = tank.z + 14 + row * 18;
      for (let i = 0; i < defs.length; i++) {
        const x = tank.x - 14 + i * 14;
        const id = w.__recoil.monsterSpawn(defs[i], x, z);
        const e = w.__recoil.enemyById(id);
        rows.push([id, e?.y ?? -999, w.__recoil.groundHeightAt(x, z)]);
      }
    }
    return rows;
  });
  for (const [, y, ground] of placed) {
    expect(Math.abs(y - ground)).toBeLessThanOrEqual(0.05);
  }
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOT_DIR}/fix2-grounding.png` });

  // ---- XP pressure: 300 live shards (all individually packed) then 520
  // (visible overflow cluster, no silent invisible XP).
  const pressureCount = await page.evaluate(() => {
    const w = window as unknown as {
      __recoil: {
        xp: {
          spawn(count: number): number;
        };
      };
    };
    return w.__recoil.xp.spawn(300);
  });
  expect(pressureCount).toBeGreaterThanOrEqual(300);
  await page.waitForTimeout(250);
  const pressureStats = await page.evaluate(() => {
    const w = window as unknown as { __recoil: { xp: { stats(): unknown } } };
    return w.__recoil.xp.stats() as {
      liveCount: number;
      popCount: number;
      overflow: number;
      capacity: number;
      drawCount: number;
      overflowVisible: boolean;
    };
  });
  expect(pressureStats.drawCount).toBe(300);
  expect(pressureStats.overflow).toBe(0);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOT_DIR}/fix2-xp-300.png` });

  const overflowCount = await page.evaluate(() => {
    const w = window as unknown as {
      __recoil: {
        xp: { spawn(count: number): number };
      };
    };
    return w.__recoil.xp.spawn(520);
  });
  expect(overflowCount).toBe(820);
  await page.waitForTimeout(250);
  const overflowStats = await page.evaluate(() => {
    const w = window as unknown as { __recoil: { xp: { stats(): unknown } } };
    return w.__recoil.xp.stats() as {
      liveCount: number;
      popCount: number;
      overflow: number;
      capacity: number;
      drawCount: number;
      overflowVisible: boolean;
    };
  });
  expect(overflowStats.liveCount).toBe(820);
  expect(overflowStats.drawCount).toBe(512);
  expect(overflowStats.overflow).toBe(820 - 512);
  expect(overflowStats.overflowVisible).toBe(true);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOT_DIR}/fix2-xp-overflow.png` });

  // ---- Airborne cannon-launch comparison (SP authoritative vs rendered).
  const airborne = await page.evaluate(() => {
    const w = window as unknown as {
      __recoil: {
        monsterSpawn(defId: string, x: number, z: number): number;
        monsterImpulse(id: number, h: number, v: number): boolean;
        enemyById(id: number): { id: number; defId: string; y: number; alive: boolean } | null;
      };
    };
    const id = w.__recoil.monsterSpawn('enemy.quaternius.ninja', 6, 8);
    w.__recoil.monsterImpulse(id, 2, 11);
    return id;
  });
  const airborneSamples = await page.evaluate(
    (id) => {
      const w = window as unknown as {
        __recoil: {
          enemyById(e: number): { id: number; defId: string; y: number; alive: boolean } | null;
          enemyRenderY(e: number): number | null;
          groundHeightAt(x: number, z: number): number;
        };
      };
      const out: Array<{ serverY: number; renderedY: number | null; ground: number }> = [];
      return new Promise<typeof out>((resolve) => {
        let remaining = 20;
        const tick = () => {
          const e = w.__recoil.enemyById(id);
          if (e) {
            out.push({
              serverY: e.y,
              renderedY: w.__recoil.enemyRenderY(id),
              ground: w.__recoil.groundHeightAt(6, 8),
            });
          }
          remaining--;
          if (remaining <= 0) resolve(out);
          else setTimeout(tick, 100);
        };
        tick();
      });
    },
    airborne,
  );
  const peak = airborneSamples.reduce(
    (best, s) => (s.serverY > best.serverY ? s : best),
    { serverY: -Infinity, renderedY: null as number | null, ground: 0 },
  );
  if (peak.renderedY === null || !Number.isFinite(peak.serverY)) {
    throw new Error('airborne state unavailable');
  }
  expect(peak.serverY).toBeGreaterThan(peak.ground + 0.4);
  expect(Math.abs(peak.renderedY - peak.serverY)).toBeLessThanOrEqual(0.2);
  await page.screenshot({ path: `${SHOT_DIR}/fix2-airborne.png` });

  // ---- Large boss melee attack: body-scaled hold without overlap.
  const bossId = await page.evaluate(() => {
    const w = window as unknown as {
      __recoil: {
        state(): { tank: { x: number; z: number } };
        monsterSpawn(defId: string, x: number, z: number): number;
        enemyById(id: number): { id: number; defId: string; y: number; alive: boolean } | null;
      };
    };
    const tank = w.__recoil.state().tank;
    const id = w.__recoil.monsterSpawn(
      'enemy.quaternius.ninja-high-detail.boss',
      tank.x + 10,
      tank.z + 10,
    );
    return id;
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOT_DIR}/fix2-boss-attack.png` });
  const bossCheck = await page.evaluate(async (id) => {
    const w = window as unknown as {
      __recoil: {
        monsterSemantic(e: number): string | null;
        state(): { tank: { x: number; z: number } };
        enemyById(e: number): {
          id: number;
          defId: string;
          x: number;
          y: number;
          z: number;
          alive: boolean;
        } | null;
        monsterDims(d: string): { collisionRadius: number; finalHeight: number } | null;
      };
    };
    let semantic = w.__recoil.monsterSemantic(id);
    for (let i = 0; i < 60 && semantic !== 'Attack'; i++) {
      await new Promise((r) => setTimeout(r, 100));
      semantic = w.__recoil.monsterSemantic(id);
    }
    const e = w.__recoil.enemyById(id);
    if (!e) return null;
    const tank = w.__recoil.state().tank;
    const dims = w.__recoil.monsterDims(e.defId);
    if (!dims) return null;
    return {
      semantic,
      dist: Math.hypot(e.x - tank.x, e.z - tank.z),
      collisionRadius: dims.collisionRadius,
    };
  }, bossId);
  if (!bossCheck) throw new Error('boss attack state unavailable');
  expect(bossCheck.semantic).toBe('Attack');
  // Body-scaled attack hold: center distance stays above collider overlap.
  expect(bossCheck.dist).toBeGreaterThan(bossCheck.collisionRadius + 1.35 - 0.05);

  // ---- Raw protocol mismatch: old protocol is rejected and closed.
  const mismatch = await page.evaluate(
    () =>
      new Promise<{ closed: boolean; code: number | null; reason: string }>((resolve) => {
        const ws = new WebSocket('ws://localhost:8096/ws');
        ws.onopen = () => ws.send(JSON.stringify({ protocol: 9, t: 'create' }));
        ws.onclose = (ev) => resolve({ closed: true, code: ev.code, reason: ev.reason });
        ws.onerror = () => undefined;
        setTimeout(() => resolve({ closed: false, code: null, reason: 'timeout' }), 4000);
      }),
  );
  expect(mismatch.closed).toBe(true);
  expect(mismatch.code).toBe(1008);

  const critical = errors.filter(
    (e) => !e.includes('WebGL') && !e.includes('GPU') && !e.includes('ERR_CACHE_WRITE_FAILURE'),
  );
  expect(critical).toEqual([]);
});
