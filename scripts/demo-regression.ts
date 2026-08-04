/**
 * Phase 0 deterministic Demo regression CLI.
 *
 * Usage:
 *   npm run test:demo              # run fixture and compare against golden
 *   npm run demo:write             # regenerate tests/fixtures/demo-golden.json
 *   npx tsx scripts/demo-regression.ts --seed 123
 *   npx tsx scripts/demo-regression.ts --write --seed 123
 */
import { GAME } from '../src/shared/config';
import {
  DEMO_SEED,
  GOLDEN_PATH,
  loadGolden,
  runDemoFixture,
  saveGolden,
  verifyGolden,
  type DemoFixtureOutput,
} from '../tests/helpers/demoFixture';

function parseSeed(argv: string[]): number {
  const i = argv.indexOf('--seed');
  if (i === -1 || i + 1 >= argv.length) return DEMO_SEED;
  const n = Number(argv[i + 1]);
  return Number.isFinite(n) ? n : DEMO_SEED;
}

function summarize(out: DemoFixtureOutput): void {
  const labels = out.checkpoints.map((c) => `${c.label}@${c.simTime.toFixed(2)}s`).join(', ');
  console.log(`[demo] seed=${out.seed} modifier=${out.modifier} duration=${out.duration}s`);
  console.log(`[demo] checkpoints: ${labels}`);
  console.log(`[demo] events: ${out.eventTrace.length} (${Object.keys(out.eventCounts).length} types)`);
  console.log(
    `[demo] results: score=${out.results.score} grade=${out.results.grade} "${out.results.title}" ` +
    `charged x${out.results.chargedCannonShots} full x${out.results.fullChargeShots} combo x${out.results.bestCombo} kills=${out.results.kills}`,
  );
}

const write = process.argv.includes('--write');
const seed = parseSeed(process.argv.slice(2));

const started = Date.now();
const output = runDemoFixture({ seed });
const elapsed = ((Date.now() - started) / 1000).toFixed(2);
summarize(output);

if (write) {
  saveGolden(output);
  console.log(`[demo] wrote ${GOLDEN_PATH} (${elapsed}s)`);
  console.log(`[demo] WROTE`);
} else {
  const ok = verifyGolden(output);
  if (!ok) {
    const golden = loadGolden();
    console.error('[demo] FAIL: fixture output differs from golden.');
    console.error(`[demo] golden checkpoints: ${golden.checkpoints.map((c) => c.label).join(', ')}`);
    console.error('[demo] run `npm run demo:write` only after consciously accepting the change.');
    process.exit(1);
  }
  console.log(`[demo] golden matches ${GOLDEN_PATH} (${elapsed}s)`);
  console.log(`[demo] PASS — ${GAME.roundDuration}s deterministic Demo is reproducible`);
}
