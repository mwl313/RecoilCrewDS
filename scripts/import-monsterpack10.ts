#!/usr/bin/env tsx
/**
 * Monster Pack 10 importer — reproducible native Recoil Crew integration.
 *
 *   npm run import:monsterpack [-- --dry-run | --validate-only | --clean-staging]
 *
 * Source of truth: local-imports/monsterpack09/Ultimate monster pack - Horde Ready.zip
 * Staging:        build/monsterpack10-import/ (ignored, disposable)
 * Destination:    public/assets/models/enemies/quaternius/ (runtime GLBs)
 * Docs:           docs/monsterpack10/ (source evidence + generated native content)
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readGlbSummary } from './monsterpack10/glbSummary';
import { repairMonsterRuntimeAsset } from './monsterpack10/runtimeAssetRepairs';
import { convertMonsterPack } from './monsterpack10/convert';
import type {
  MonsterPackSourceManifests,
  MonsterRuntimeVariant,
  NativeAnimationProfile,
  NativeArtRoster,
  NativeAssetEntry,
  NativePresentationProfile,
} from './monsterpack10/types';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ZIP_PATH = path.join(
  PROJECT_ROOT,
  'local-imports',
  'monsterpack09',
  'Ultimate monster pack - Horde Ready.zip',
);
const STAGE_ROOT = path.join(PROJECT_ROOT, 'build', 'monsterpack10-import');
const WRAPPER = 'Ultimate monster pack - Horde Ready';
const SOURCE_ROOT = path.join(STAGE_ROOT, WRAPPER);
const DEST_ROOT = path.join(PROJECT_ROOT, 'public', 'assets', 'models', 'enemies', 'quaternius');
const DOCS_ROOT = path.join(PROJECT_ROOT, 'docs', 'monsterpack10');
const GENERATED_ROOT = path.join(DOCS_ROOT, 'generated');
const SOURCE_MANIFEST_ROOT = path.join(DOCS_ROOT, 'source-manifests');
const SOURCE_REPORT_ROOT = path.join(DOCS_ROOT, 'source-reports');

const REQUIRED_MANIFESTS = [
  'monster_catalog.json',
  'runtime_variants.json',
  'animation_profiles.json',
  'rig_families.json',
  'scale_profiles.json',
  'socket_profiles.json',
  'source_inventory.json',
] as const;

const REQUIRED_REPORTS = [
  'FINAL_DELIVERY_REPORT.md',
  'VALIDATION_REPORT.md',
  'PERFORMANCE_GUIDANCE.md',
  'ROLE_CLASSIFICATION.md',
  'RIG_FAMILY_REPORT.md',
  'ANIMATION_MAPPING_REPORT.md',
  'SCALE_AND_BOUNDS_REPORT.md',
  'KNOWN_LIMITATIONS.md',
] as const;

const TIER_DIRS: Record<string, string> = {
  hero: 'hero',
  commonNear: 'common-near',
  commonFar: 'common-far',
  aggregate: 'aggregate',
};

const REQUIRED_PIPELINE_VERSION = '1.1.1-color-fidelity';

interface ImportOptions {
  dryRun?: boolean;
  validateOnly?: boolean;
  cleanStaging?: boolean;
  expectedZipHash?: string;
  quiet?: boolean;
}

export interface ImportIssue {
  sourceModel: string;
  nativeId: string;
  path: string;
  expected: string;
  actual: string;
  suggestedFix: string;
}

export interface ImportPlan {
  copies: Array<{
    variantId: string;
    from: string;
    to: string;
    action: 'copy' | 'replace' | 'skip';
  }>;
  staleRemovals: string[];
  generatedContentFiles: string[];
  generatedDocFiles: string[];
  counts: Record<string, number>;
  hashValid: number;
  hashInvalid: number;
  glbValidations: number;
  issues: ImportIssue[];
}

function sha256Buffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function sha256File(file: string): string {
  return sha256Buffer(readFileSync(file));
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, entry.name);
      if (entry.isDirectory()) walk(abs);
      else out.push(abs);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

export function verifyZip(zipPath: string, expectedHash?: string): { sha256: string; bytes: number } {
  if (!existsSync(zipPath)) {
    throw new Error(`ZIP not found at the exact expected path: ${zipPath}`);
  }
  const stat = statSync(zipPath);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`ZIP is not a readable file: ${zipPath}`);
  }
  const sha256 = sha256File(zipPath);
  if (expectedHash && sha256 !== expectedHash.toLowerCase()) {
    throw new Error(`ZIP hash mismatch: expected ${expectedHash}, actual ${sha256}`);
  }
  return { sha256, bytes: stat.size };
}

export function extractZip(zipPath: string, stageRoot: string): void {
  mkdirSync(stageRoot, { recursive: true });
  const result = spawnSync('tar', ['-xf', zipPath, '-C', stageRoot], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`ZIP extraction failed (tar): ${result.stderr || result.stdout || 'unknown error'}`);
  }
}

export function cleanStaging(stageRoot: string): void {
  const resolved = path.resolve(stageRoot);
  const expected = path.resolve(PROJECT_ROOT, 'build', 'monsterpack10-import');
  if (resolved !== expected && !resolved.startsWith(expected + path.sep)) {
    throw new Error(`refusing to clean staging outside build/monsterpack10-import: ${resolved}`);
  }
  rmSync(resolved, { recursive: true, force: true });
}

function loadManifests(sourceRoot: string): {
  manifests: MonsterPackSourceManifests;
  variants: Record<string, MonsterRuntimeVariant>;
} {
  const manifestDir = path.join(sourceRoot, 'manifests');
  for (const name of REQUIRED_MANIFESTS) {
    if (!existsSync(path.join(manifestDir, name))) {
      throw new Error(`required manifest missing: ${name}`);
    }
  }
  const manifests = {
    catalog: readJson(path.join(manifestDir, 'monster_catalog.json')),
    runtimeVariants: readJson(path.join(manifestDir, 'runtime_variants.json')),
    animationProfiles: readJson(path.join(manifestDir, 'animation_profiles.json')),
    scaleProfiles: readJson(path.join(manifestDir, 'scale_profiles.json')),
    socketProfiles: readJson(path.join(manifestDir, 'socket_profiles.json')),
    rigFamilies: readJson(path.join(manifestDir, 'rig_families.json')),
  } as MonsterPackSourceManifests;
  return { manifests, variants: manifests.runtimeVariants.variants };
}

function validateSource(
  sourceRoot: string,
  variants: Record<string, MonsterRuntimeVariant>,
  issues: ImportIssue[],
): { counts: Record<string, number>; hashValid: number; hashInvalid: number; glbValidations: number } {
  const counts: Record<string, number> = { hero: 0, commonNear: 0, commonFar: 0, aggregate: 0 };
  let hashValid = 0;
  let hashInvalid = 0;
  let glbValidations = 0;

  const entries = Object.values(variants);
  if (entries.length !== 90) {
    issues.push({
      sourceModel: '(pack)',
      nativeId: '(pack)',
      path: 'runtime_variants.json',
      expected: '90 runtime variants',
      actual: String(entries.length),
      suggestedFix: 'Re-run the standalone pipeline; the ZIP must contain exactly 90 variants.',
    });
  }
  for (const v of entries) {
    if (v.pipelineVersion !== REQUIRED_PIPELINE_VERSION) {
      issues.push({
        sourceModel: v.sourceModelId,
        nativeId: v.id,
        path: 'runtime_variants.json',
        expected: `pipelineVersion ${REQUIRED_PIPELINE_VERSION}`,
        actual: v.pipelineVersion ?? '(missing)',
        suggestedFix:
          'Reject the pack: regenerate with the color-fidelity pipeline so linear material colors are not encoded as sRGB twice.',
      });
    }
    if (!TIER_DIRS[v.variant]) {
      issues.push({
        sourceModel: v.sourceModelId,
        nativeId: v.id,
        path: 'runtime_variants.json',
        expected: 'variant in hero/commonNear/commonFar/aggregate',
        actual: v.variant,
        suggestedFix: 'Reject the ZIP: unknown variant.',
      });
      continue;
    }
    counts[v.variant] = (counts[v.variant] ?? 0) + 1;
    const glbPath = path.join(sourceRoot, v.outputFile);
    if (!existsSync(glbPath)) {
      issues.push({
        sourceModel: v.sourceModelId,
        nativeId: v.id,
        path: v.outputFile,
        expected: 'file exists',
        actual: 'missing',
        suggestedFix: 'Re-extract the ZIP or re-run the standalone export.',
      });
      continue;
    }
    const actual = sha256File(glbPath);
    if (actual !== v.outputSha256.toLowerCase()) {
      hashInvalid++;
      issues.push({
        sourceModel: v.sourceModelId,
        nativeId: v.id,
        path: v.outputFile,
        expected: v.outputSha256,
        actual,
        suggestedFix: 'Re-run the standalone pipeline; recorded output hash does not match.',
      });
      continue;
    }
    hashValid++;
    const summary = readGlbSummary(readFileSync(glbPath));
    glbValidations++;
    const skinned = v.variant === 'hero' || v.variant === 'commonNear';
    if (skinned && !summary.hasSkinnedMesh) {
      issues.push({
        sourceModel: v.sourceModelId,
        nativeId: v.id,
        path: v.outputFile,
        expected: 'skinned mesh (hero/common-near)',
        actual: 'no skins',
        suggestedFix: 'Reject the ZIP: hero/common-near must be skinned.',
      });
    }
    if (!skinned && summary.hasSkinnedMesh) {
      issues.push({
        sourceModel: v.sourceModelId,
        nativeId: v.id,
        path: v.outputFile,
        expected: 'rigid model (common-far/aggregate)',
        actual: 'skinned mesh present',
        suggestedFix: 'Reject the ZIP: far/aggregate must be rigid.',
      });
    }
    if (v.variant === 'aggregate' && summary.hasAnimation) {
      issues.push({
        sourceModel: v.sourceModelId,
        nativeId: v.id,
        path: v.outputFile,
        expected: 'no animation (aggregate)',
        actual: `${summary.clipNames.length} clips`,
        suggestedFix: 'Reject the ZIP: aggregate models must not animate.',
      });
    }
    for (const clip of v.measured.clipNames) {
      if (!summary.clipNames.includes(clip)) {
        issues.push({
          sourceModel: v.sourceModelId,
          nativeId: v.id,
          path: v.outputFile,
          expected: `manifest clip '${clip}' present in GLB`,
          actual: 'missing from GLB',
          suggestedFix: 'Re-run the standalone pipeline or correct the manifest.',
        });
      }
    }
  }
  return { counts, hashValid, hashInvalid, glbValidations };
}

export function planImport(
  sourceRoot: string,
  variants: Record<string, MonsterRuntimeVariant>,
  counts: Record<string, number>,
  issues: ImportIssue[],
  previousOwnership: string[],
): ImportPlan {
  const copies: ImportPlan['copies'] = [];
  const expectedDest: string[] = [];
  for (const v of Object.values(variants)) {
    const from = path.join(sourceRoot, v.outputFile);
    const fileName = v.outputFile.split('/').pop()!;
    const to = path.join(DEST_ROOT, TIER_DIRS[v.variant], fileName);
    const expectedRuntimeHash = sha256Buffer(repairMonsterRuntimeAsset(v.id, readFileSync(from)));
    expectedDest.push(path.resolve(to));
    if (!existsSync(to)) {
      copies.push({ variantId: v.id, from, to, action: 'copy' });
    } else if (sha256File(to) !== expectedRuntimeHash) {
      copies.push({ variantId: v.id, from, to, action: 'replace' });
    } else {
      copies.push({ variantId: v.id, from, to, action: 'skip' });
    }
  }
  const staleRemovals: string[] = [];
  for (const owned of previousOwnership) {
    if (!owned.startsWith(path.join(DEST_ROOT, 'hero')) && !owned.startsWith(path.join(DEST_ROOT, 'common-near')) &&
        !owned.startsWith(path.join(DEST_ROOT, 'common-far')) && !owned.startsWith(path.join(DEST_ROOT, 'aggregate'))) {
      continue;
    }
    if (!expectedDest.includes(path.resolve(owned)) && existsSync(owned)) {
      staleRemovals.push(owned);
    }
  }
  return {
    copies,
    staleRemovals,
    generatedContentFiles: [],
    generatedDocFiles: [],
    counts,
    hashValid: 0,
    hashInvalid: 0,
    glbValidations: 0,
    issues,
  };
}

function convertAndWriteNative(
  manifests: MonsterPackSourceManifests,
  variants: Record<string, MonsterRuntimeVariant>,
  sourceRoot: string,
): {
  assetEntries: NativeAssetEntry[];
  heroAnimationProfiles: NativeAnimationProfile[];
  commonAnimationProfiles: NativeAnimationProfile[];
  heroPresentationProfiles: NativePresentationProfile[];
  commonPresentationProfiles: NativePresentationProfile[];
  roster: NativeArtRoster;
  scaleMappings: Record<string, unknown>;
  socketMappings: Record<string, unknown>;
  nativeIndex: Record<string, unknown>;
  glbSummaries: Record<string, ReturnType<typeof readGlbSummary>>;
} {
  const hashes: Record<string, string> = {};
  for (const v of Object.values(variants)) hashes[v.variant] = v.outputSha256.toLowerCase();
  const converted = convertMonsterPack({ manifests, variants, hashes });
  const glbSummaries: Record<string, ReturnType<typeof readGlbSummary>> = {};
  for (const v of Object.values(variants)) {
    glbSummaries[v.id] = readGlbSummary(readFileSync(path.join(sourceRoot, v.outputFile)));
  }
  return {
    ...converted,
    glbSummaries,
  };
}

export interface ImportResult {
  zip: { sha256: string; bytes: number };
  plan: ImportPlan;
  counts: Record<string, number>;
  issues: ImportIssue[];
  wrote: string[];
}

export async function runImport(options: ImportOptions = {}): Promise<ImportResult> {
  const { dryRun = false, validateOnly = false, cleanStaging: clean = false, expectedZipHash } = options;
  const issues: ImportIssue[] = [];
  const zip = verifyZip(ZIP_PATH, expectedZipHash);

  if (clean && !dryRun) cleanStaging(STAGE_ROOT);
  if (!existsSync(path.join(STAGE_ROOT, WRAPPER))) {
    if (dryRun) {
      // Read-only dry run: report that staging would be extracted.
      return {
        zip,
        plan: {
          copies: [],
          staleRemovals: [],
          generatedContentFiles: [],
          generatedDocFiles: [],
          counts: {},
          hashValid: 0,
          hashInvalid: 0,
          glbValidations: 0,
          issues: [],
        },
        counts: {},
        issues: [],
        wrote: [],
      };
    }
    extractZip(ZIP_PATH, STAGE_ROOT);
  }
  if (!existsSync(path.join(STAGE_ROOT, WRAPPER))) {
    throw new Error(`wrapper directory missing after extraction: ${path.join(STAGE_ROOT, WRAPPER)}`);
  }

  const sourceRoot = SOURCE_ROOT;
  const { manifests, variants } = loadManifests(sourceRoot);
  for (const name of REQUIRED_REPORTS) {
    if (!existsSync(path.join(sourceRoot, 'reports', name))) {
      issues.push({
        sourceModel: '(pack)',
        nativeId: '(pack)',
        path: `reports/${name}`,
        expected: 'report file exists',
        actual: 'missing',
        suggestedFix: 'Re-run the standalone pipeline with full reports.',
      });
    }
  }
  if (!existsSync(path.join(sourceRoot, 'README.md')) || !existsSync(path.join(sourceRoot, 'LICENSE_AND_SOURCE.md'))) {
    issues.push({
      sourceModel: '(pack)',
      nativeId: '(pack)',
      path: 'README.md / LICENSE_AND_SOURCE.md',
      expected: 'both files exist',
      actual: 'missing',
      suggestedFix: 'Re-run the standalone pipeline with README and license.',
    });
  }

  const validation = validateSource(sourceRoot, variants, issues);
  let previousOwnership: string[] = [];
  const ownershipFile = path.join(GENERATED_ROOT, 'IMPORT_OWNERSHIP.json');
  if (existsSync(ownershipFile)) {
    try {
      previousOwnership = (readJson<{ files: string[] }>(ownershipFile).files ?? []).map((f) =>
        path.resolve(PROJECT_ROOT, f),
      );
    } catch {
      previousOwnership = [];
    }
  }
  const plan = planImport(sourceRoot, variants, validation.counts, issues, previousOwnership);
  plan.hashValid = validation.hashValid;
  plan.hashInvalid = validation.hashInvalid;
  plan.glbValidations = validation.glbValidations;

  if (issues.length > 0) {
    const summary = issues
      .slice(0, 12)
      .map((i) => `  - ${i.nativeId} @ ${i.path}: expected ${i.expected}, actual ${i.actual} (${i.suggestedFix})`)
      .join('\n');
    throw new Error(`Monster Pack 10 import validation failed (${issues.length} issues):\n${summary}`);
  }
  if (validation.counts.hero !== 45 || validation.counts.commonNear !== 15 ||
      validation.counts.commonFar !== 15 || validation.counts.aggregate !== 15) {
    throw new Error(
      `runtime GLB counts invalid: hero=${validation.counts.hero} commonNear=${validation.counts.commonNear} ` +
      `commonFar=${validation.counts.commonFar} aggregate=${validation.counts.aggregate}`,
    );
  }

  if (validateOnly || dryRun) {
    return {
      zip,
      plan,
      counts: validation.counts,
      issues,
      wrote: [],
    };
  }

  const wrote: string[] = [];
  // 1. Copy runtime GLBs.
  for (const copy of plan.copies) {
    if (copy.action === 'skip') continue;
    mkdirSync(path.dirname(copy.to), { recursive: true });
    writeFileSync(copy.to, repairMonsterRuntimeAsset(copy.variantId, readFileSync(copy.from)));
    wrote.push(copy.to);
  }
  // 2. Remove stale managed GLBs.
  for (const stale of plan.staleRemovals) {
    rmSync(stale, { force: true });
    wrote.push(`removed:${stale}`);
  }
  // 3. Archive source evidence.
  const docCopyTargets = [
    [path.join(sourceRoot, 'README.md'), path.join(DOCS_ROOT, 'README.md')],
    [path.join(sourceRoot, 'LICENSE_AND_SOURCE.md'), path.join(DOCS_ROOT, 'QUATERNIUS_LICENSE_AND_SOURCE.md')],
    ...REQUIRED_MANIFESTS.map((name) => [
      path.join(sourceRoot, 'manifests', name),
      path.join(SOURCE_MANIFEST_ROOT, name),
    ]),
    ...REQUIRED_REPORTS.map((name) => [
      path.join(sourceRoot, 'reports', name),
      path.join(SOURCE_REPORT_ROOT, name),
    ]),
  ] as const;
  for (const [from, to] of docCopyTargets) {
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(from, to);
    wrote.push(to);
  }

  // 4. Native content conversion.
  const native = convertAndWriteNative(manifests, variants, sourceRoot);
  const contentRoot = path.join(PROJECT_ROOT, 'content');

  const projectJsonPath = path.join(contentRoot, 'assets', 'project.json');
  const existingCatalog = readJson<{ id: string; builtins: string[]; project: Array<Record<string, unknown>> }>(projectJsonPath);
  const byId = new Map(existingCatalog.project.map((p) => [p.id, p]));
  for (const entry of native.assetEntries) byId.set(entry.id, entry as unknown as Record<string, unknown>);
  const mergedProject = [...byId.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  writeJson(projectJsonPath, { id: existingCatalog.id, builtins: existingCatalog.builtins, project: mergedProject });
  wrote.push(projectJsonPath);

  const writeProfiles = (dir: string, profiles: NativeAnimationProfile[] | NativePresentationProfile[]): void => {
    mkdirSync(dir, { recursive: true });
    for (const profile of profiles) {
      const file = path.join(dir, `${profile.id.replace(/^enemyAnimation\.|^enemyPresentation\./, '')}.json`);
      writeJson(file, profile);
      wrote.push(file);
    }
  };
  writeProfiles(path.join(contentRoot, 'enemy-animation-profiles', 'quaternius'), native.heroAnimationProfiles);
  writeProfiles(path.join(contentRoot, 'enemy-animation-profiles', 'quaternius'), native.commonAnimationProfiles);
  writeProfiles(path.join(contentRoot, 'enemy-presentation-profiles', 'quaternius'), native.heroPresentationProfiles);
  writeProfiles(path.join(contentRoot, 'enemy-presentation-profiles', 'quaternius'), native.commonPresentationProfiles);

  mkdirSync(path.join(contentRoot, 'enemy-art-rosters'), { recursive: true });
  const rosterFile = path.join(contentRoot, 'enemy-art-rosters', 'quaternius.integrationPreview.json');
  writeJson(rosterFile, native.roster);
  wrote.push(rosterFile);

  // 5. Generated docs JSON.
  mkdirSync(GENERATED_ROOT, { recursive: true });
  const ownershipFiles = [
    ...plan.copies.map((c) => c.to),
    projectJsonPath,
    rosterFile,
    ...native.heroAnimationProfiles.map((p) => path.join(contentRoot, 'enemy-animation-profiles', 'quaternius', `${p.id.replace(/^enemyAnimation\./, '')}.json`)),
    ...native.commonAnimationProfiles.map((p) => path.join(contentRoot, 'enemy-animation-profiles', 'quaternius', `${p.id.replace(/^enemyAnimation\./, '')}.json`)),
    ...native.heroPresentationProfiles.map((p) => path.join(contentRoot, 'enemy-presentation-profiles', 'quaternius', `${p.id.replace(/^enemyPresentation\./, '')}.json`)),
    ...native.commonPresentationProfiles.map((p) => path.join(contentRoot, 'enemy-presentation-profiles', 'quaternius', `${p.id.replace(/^enemyPresentation\./, '')}.json`)),
    ...docCopyTargets.map(([, to]) => to),
  ];
  const ownership = {
    format: 1,
    sourceZip: 'local-imports/monsterpack09/Ultimate monster pack - Horde Ready.zip',
    zipSha256: zip.sha256,
    managed: true,
    files: ownershipFiles.map((f) => path.relative(PROJECT_ROOT, f).replace(/\\/g, '/')).sort(),
  };
  writeJson(path.join(GENERATED_ROOT, 'IMPORT_OWNERSHIP.json'), ownership);
  wrote.push(path.join(GENERATED_ROOT, 'IMPORT_OWNERSHIP.json'));

  const scaleMappingsFile = path.join(GENERATED_ROOT, 'SCALE_MAPPING.json');
  writeJson(scaleMappingsFile, native.scaleMappings);
  wrote.push(scaleMappingsFile);
  const socketMappingsFile = path.join(GENERATED_ROOT, 'SOCKET_MAPPING.json');
  writeJson(socketMappingsFile, native.socketMappings);
  wrote.push(socketMappingsFile);
  const nativeIndexFile = path.join(GENERATED_ROOT, 'NATIVE_CONTENT_INDEX.json');
  writeJson(nativeIndexFile, native.nativeIndex);
  wrote.push(nativeIndexFile);

  const summary = {
    format: 1,
    importedAtUtc: new Date().toISOString(),
    zip: { path: path.relative(PROJECT_ROOT, ZIP_PATH), sha256: zip.sha256, bytes: zip.bytes },
    counts: validation.counts,
    hashValid: validation.hashValid,
    hashInvalid: validation.hashInvalid,
    glbValidations: validation.glbValidations,
    assetsRegistered: native.assetEntries.length,
    heroAnimationProfiles: native.heroAnimationProfiles.length,
    commonAnimationProfiles: native.commonAnimationProfiles.length,
    heroPresentationProfiles: native.heroPresentationProfiles.length,
    commonPresentationProfiles: native.commonPresentationProfiles.length,
    rosterId: native.roster.id,
    preloadAssetIds: native.roster.preloadAssetIds.length,
    filesWritten: wrote.length,
  };
  const summaryFile = path.join(GENERATED_ROOT, 'IMPORT_SUMMARY.json');
  writeJson(summaryFile, summary);
  wrote.push(summaryFile);

  return { zip, plan, counts: validation.counts, issues, wrote };
}

function formatIssues(issues: ImportIssue[]): string {
  return issues
    .map(
      (i) =>
        `| ${i.sourceModel} | ${i.nativeId} | ${i.path} | ${i.expected} | ${i.actual} | ${i.suggestedFix} |`,
    )
    .join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const validateOnly = args.includes('--validate-only');
  const clean = args.includes('--clean-staging');
  const hashIndex = args.indexOf('--zip-hash');
  const expectedZipHash = hashIndex >= 0 ? args[hashIndex + 1] : undefined;

  const t0 = Date.now();
  const result = await runImport({ dryRun, validateOnly, cleanStaging: clean, expectedZipHash });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(`[monsterpack10] zip sha256=${result.zip.sha256} bytes=${result.zip.bytes}`);
  console.log(`[monsterpack10] counts=${JSON.stringify(result.counts)} hashValid=${result.plan.hashValid} glbValidations=${result.plan.glbValidations}`);
  console.log(
    `[monsterpack10] copies=${result.plan.copies.filter((c) => c.action !== 'skip').length} skipped=${result.plan.copies.filter((c) => c.action === 'skip').length} staleRemovals=${result.plan.staleRemovals.length}`,
  );
  if (validateOnly || dryRun) {
    console.log(`[monsterpack10] ${validateOnly ? 'VALIDATE-ONLY' : 'DRY-RUN'} completed in ${elapsed}s — no project files written`);
  } else {
    console.log(`[monsterpack10] import completed in ${elapsed}s — ${result.wrote.length} files written`);
    const reportPath = path.join(DOCS_ROOT, 'IMPORT_REPORT.md');
    const report = [
      '# Monster Pack 10 — Import Report',
      '',
      `Imported at ${new Date().toISOString()} (elapsed ${elapsed}s).`,
      '',
      '## ZIP',
      '',
      `- Path: \`${path.relative(PROJECT_ROOT, ZIP_PATH)}\``,
      `- SHA-256: \`${result.zip.sha256}\``,
      `- Bytes: ${result.zip.bytes}`,
      '',
      '## Validation',
      '',
      `- Runtime variants: ${JSON.stringify(result.counts)}`,
      `- Output hashes valid: ${result.plan.hashValid}`,
      `- Output hashes invalid: ${result.plan.hashInvalid}`,
      `- GLB introspections: ${result.plan.glbValidations}`,
      `- Issues: ${result.issues.length}`,
      '',
      result.issues.length > 0 ? '## Issues\n\n| source | native id | path | expected | actual | fix |\n| --- | --- | --- | --- | --- | --- |\n' + formatIssues(result.issues) : '',
      '',
      '## Writes',
      '',
      `- Runtime GLB copies/replacements: ${result.plan.copies.filter((c) => c.action !== 'skip').length}`,
      `- Stale managed removals: ${result.plan.staleRemovals.length}`,
      `- Source evidence archived: 1 README + 1 license + 7 manifests + 8 reports`,
      `- Native content: 90 asset entries, 45 hero + 15 common animation profiles, 45 hero + 15 common presentation profiles, 1 art roster`,
      `- Generated docs: IMPORT_OWNERSHIP.json, IMPORT_SUMMARY.json, NATIVE_CONTENT_INDEX.json, SCALE_MAPPING.json, SOCKET_MAPPING.json`,
      '',
      '## Commands',
      '',
      '```bash',
      'npm run import:monsterpack -- --dry-run',
      'npm run import:monsterpack',
      'npm run validate:monsterpack-import',
      '```',
      '',
    ].join('\n');
    writeFileSync(reportPath, report, 'utf8');
  }
}

if (!process.env.VITEST && process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('import-monsterpack10.ts')) {
  main().catch((err) => {
    console.error(`[monsterpack10] FAIL: ${(err as Error).message}`);
    process.exit(1);
  });
}
