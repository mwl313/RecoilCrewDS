import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface ScenarioResult {
  frameP50Ms: number;
  frameP95Ms: number;
  frameP99Ms: number;
  drawCalls: number;
  triangles: number;
  mixers: number;
  farInstances: number;
  aggregateGroups: number;
  aggregateInstances: number;
  loadedModels: number;
  loadedBytes: number;
}

test('monsterpack10 browser rendering benchmark', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
  });
  await page.goto('http://localhost:8097/?monster=1&bench=1', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const deadline = Date.now() + 90_000;
  let done = false;
  while (Date.now() < deadline && !done) {
    done = await page.evaluate(() => {
      const w = window as unknown as { __monsterBench?: unknown; __monsterBenchError?: string };
      return w.__monsterBench !== undefined || w.__monsterBenchError !== undefined;
    });
    if (!done) await page.waitForTimeout(2000);
  }
  const state = await page.evaluate(() => {
    const w = window as unknown as { __monsterBench?: Record<string, ScenarioResult>; __monsterBenchError?: string };
    return {
      results: w.__monsterBench ?? null,
      error: w.__monsterBenchError ?? null,
      progress: (w as unknown as { __monsterProgress?: string }).__monsterProgress ?? '',
      info: (document.getElementById('info') as HTMLElement | null)?.textContent ?? '',
      controls: (document.getElementById('controls') as HTMLElement | null)?.textContent?.slice(0, 200) ?? '',
    };
  });
  expect(state.error, `benchmark page error: ${state.error ?? ''}; progress=${state.progress}; pageErrors=${errors.join(' | ')}; info=${state.info}`).toBeNull();
  expect(state.results, `results missing; progress=${state.progress}; pageErrors=${errors.join(' | ')}`).not.toBeNull();
  const results = state.results!;
  const required = ['heroBoss', 'heroElite', 'commonNear25', 'commonFar100', 'commonFar300', 'commonFar500', 'aggregateStress'];
  for (const name of required) {
    expect(results[name], `scenario ${name}`).toBeDefined();
    expect(Number.isFinite(results[name].frameP50Ms)).toBe(true);
  }
  const outDir = path.join(process.cwd(), 'build', 'monsterpack10-import');
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'BENCHMARK_RESULTS.json');
  writeFileSync(outFile, JSON.stringify(results, null, 2), 'utf8');
  // The list reporter prints these on failure; the JSON file is the record.
  console.log(`[monsterpack10-rendering] results written to ${outFile}`);
});
