#!/usr/bin/env tsx
/**
 * Monster Pack 10 validation command.
 *
 *   npm run validate:monsterpack-import
 *
 * Validates ZIP + staging + source manifests + runtime GLB hashes +
 * destination GLBs + generated native content without writing anything.
 */
import { runImport } from './import-monsterpack10';

async function main(): Promise<void> {
  const result = await runImport({ validateOnly: true });
  console.log(`[monsterpack10-validate] counts=${JSON.stringify(result.counts)}`);
  console.log(`[monsterpack10-validate] hashValid=${result.plan.hashValid} hashInvalid=${result.plan.hashInvalid}`);
  console.log(`[monsterpack10-validate] glbValidations=${result.plan.glbValidations}`);
  console.log(`[monsterpack10-validate] copies=${result.plan.copies.length} (${result.plan.copies.filter((c) => c.action === 'skip').length} byte-identical)`);
  console.log(`[monsterpack10-validate] staleRemovals=${result.plan.staleRemovals.length}`);
  console.log('[monsterpack10-validate] PASS');
}

main().catch((err) => {
  console.error(`[monsterpack10-validate] FAIL: ${(err as Error).message}`);
  process.exit(1);
});
