#!/usr/bin/env node
/**
 * Long-run netcode soak (network03): runs full 90-second rounds back to back
 * against the local server and requires every round to complete with a
 * positive score, JACKPOT, rematch, and a healthy snapshot count.
 *
 * Usage: node scripts/verify-soak.mjs [rounds] [ws://host:port]
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROUNDS = Number(process.argv[2] ?? 8);
const WS_URL = process.argv[3] ?? 'ws://localhost:8080/ws';
const script = path.join(ROOT, 'scripts', 'verify-full-round.mjs');

const results = [];
const startedAt = Date.now();
for (let i = 1; i <= ROUNDS; i++) {
  const t0 = Date.now();
  try {
    execFileSync(process.execPath, [script, WS_URL], { stdio: 'inherit', timeout: 180000 });
    results.push({ round: i, ok: true, ms: Date.now() - t0 });
    console.log(`[soak] round ${i}/${ROUNDS} PASS (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (err) {
    results.push({ round: i, ok: false, ms: Date.now() - t0 });
    console.error(`[soak] round ${i}/${ROUNDS} FAIL`);
    process.exitCode = 1;
    break;
  }
}
const total = (Date.now() - startedAt) / 1000;
const ok = results.filter((r) => r.ok).length;
console.log(`[soak] ${ok}/${results.length} rounds passed in ${total.toFixed(0)}s`);
if (ok !== results.length) process.exit(1);
