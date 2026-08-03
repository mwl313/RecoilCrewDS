#!/usr/bin/env tsx
/**
 * Presentation content pipeline:
 *
 *   content/scenes, content/hud, content/scene-flows, content/themes,
 *   content/assets
 *     → Zod schema validation + cross-reference validation
 *     → src/generated/presentationContent.generated.ts (plain data, hash)
 *
 * The runtime and the presentation preview consume the generated module.
 * Old hardcoded presentation stays active until each migration milestone
 * passes its parity tests.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalStringify } from '../src/shared/content/hash';
import {
  ACTION_IDS,
  assetCatalogDefinitionSchema,
  HUD_BINDING_PATHS,
  hudDefinitionSchema,
  projectAssetDefinitionSchema,
  SCENE_BINDING_PATHS,
  sceneDefinitionSchema,
  sceneFlowDefinitionSchema,
  themeDefinitionSchema,
  type AssetCatalogDefinition,
  type HudDefinition,
  type SceneDefinition,
  type SceneFlowDefinition,
  type ThemeDefinition,
  type UiNodeInput,
} from '../src/shared/presentation/schemas';

export const PRESENTATION_CONTENT_FORMAT = 1;
export const MAX_NODE_DEPTH = 24;
export const MAX_NODE_COUNT = 500;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_ROOT = path.join(ROOT, 'content');
const OUT_DIR = path.join(ROOT, 'src', 'generated');
const OUT_FILE =
  process.env.PRESENTATION_OUT ?? path.join(OUT_DIR, 'presentationContent.generated.ts');

class PresentationValidationError extends Error {}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function listJson(dir: string): string[] {
  const full = path.join(CONTENT_ROOT, dir);
  if (!exists(full)) return [];
  return readdirSync(full).filter((f) => f.endsWith('.json')).sort();
}

function exists(p: string): boolean {
  return existsSync(p);
}

export interface PresentationContentOutput {
  format: number;
  sourceHash: string;
  defaultFlowId: string;
  scenes: Record<string, SceneDefinition>;
  huds: Record<string, HudDefinition>;
  flows: Record<string, SceneFlowDefinition>;
  themes: Record<string, ThemeDefinition>;
  assets: AssetCatalogDefinition;
}

export function loadPresentationContent(contentRoot = CONTENT_ROOT): {
  scenes: Record<string, SceneDefinition>;
  huds: Record<string, HudDefinition>;
  flows: Record<string, SceneFlowDefinition>;
  themes: Record<string, ThemeDefinition>;
  assets: AssetCatalogDefinition;
} {
  const scenes: Record<string, SceneDefinition> = {};
  for (const file of listJson('scenes')) {
    const parsed = sceneDefinitionSchema.safeParse(readJson(path.join(contentRoot, 'scenes', file)));
    if (!parsed.success) throw new PresentationValidationError(`scene ${file}: ${JSON.stringify(parsed.error).slice(0, 400)}`);
    scenes[parsed.data.id] = parsed.data;
  }
  const huds: Record<string, HudDefinition> = {};
  for (const file of listJson('hud')) {
    const parsed = hudDefinitionSchema.safeParse(readJson(path.join(contentRoot, 'hud', file)));
    if (!parsed.success) throw new PresentationValidationError(`hud ${file}: ${JSON.stringify(parsed.error).slice(0, 400)}`);
    huds[parsed.data.id] = parsed.data;
  }
  const flows: Record<string, SceneFlowDefinition> = {};
  for (const file of listJson('scene-flows')) {
    const parsed = sceneFlowDefinitionSchema.safeParse(readJson(path.join(contentRoot, 'scene-flows', file)));
    if (!parsed.success) throw new PresentationValidationError(`flow ${file}: ${JSON.stringify(parsed.error).slice(0, 400)}`);
    flows[parsed.data.id] = parsed.data;
  }
  const themes: Record<string, ThemeDefinition> = {};
  for (const file of listJson('themes')) {
    const parsed = themeDefinitionSchema.safeParse(readJson(path.join(contentRoot, 'themes', file)));
    if (!parsed.success) throw new PresentationValidationError(`theme ${file}: ${JSON.stringify(parsed.error).slice(0, 400)}`);
    themes[parsed.data.id] = parsed.data;
  }
  const catalogFiles = listJson('assets');
  const catalogs = catalogFiles.map((f) => {
    const parsed = assetCatalogDefinitionSchema.safeParse(readJson(path.join(contentRoot, 'assets', f)));
    if (!parsed.success) throw new PresentationValidationError(`assets ${f}: ${JSON.stringify(parsed.error).slice(0, 400)}`);
    return parsed.data;
  });
  const assets: AssetCatalogDefinition = {
    id: 'catalog.presentation',
    builtins: [...new Set(catalogs.flatMap((c) => c.builtins))].sort(),
    project: catalogs.flatMap((c) => c.project),
  };
  validateCrossReferences({ scenes, huds, flows, themes, assets });
  return { scenes, huds, flows, themes, assets };
}

function validateCrossReferences(input: ReturnType<typeof loadPresentationContent>): void {
  const { scenes, huds, flows, themes, assets } = input;
  const assetIds = new Set<string>([...assets.builtins, ...assets.project.map((p) => p.id)]);
  const builtinIds = new Set(assets.builtins);
  const projectIds = new Set<string>();

  // Asset catalog rules.
  for (const p of assets.project) {
    if (projectIds.has(p.id)) throw new PresentationValidationError(`assets: duplicate project asset ${p.id}`);
    projectIds.add(p.id);
    if (!p.namespace) throw new PresentationValidationError(`assets: project asset ${p.id} requires a namespace`);
    if (builtinIds.has(p.id) && !p.replacesBuiltIn) {
      throw new PresentationValidationError(`assets: ${p.id} collides with a built-in (use replacesBuiltIn to override)`);
    }
    if (p.replacesBuiltIn && !builtinIds.has(p.replacesBuiltIn)) {
      throw new PresentationValidationError(`assets: ${p.id} replacesBuiltIn unknown id ${p.replacesBuiltIn}`);
    }
  }

  // Scene/HUD tree rules.
  for (const scene of Object.values(scenes)) {
    walkUi(scene.root, `scene ${scene.id}`, {
      assetIds,
      allowedBindings: SCENE_BINDING_PATHS,
      allowRepeaterItems: false,
      inRepeater: false,
    });
    const entityIds = new Set<string>();
    const walkEntity = (e: { id: string; components: Array<{ type: string; props?: Record<string, unknown> }>; children?: unknown[] }, depth: number) => {
      if (entityIds.has(e.id)) throw new PresentationValidationError(`scene ${scene.id}: duplicate entity id ${e.id}`);
      entityIds.add(e.id);
      if (depth > MAX_NODE_DEPTH) throw new PresentationValidationError(`scene ${scene.id}: entity depth exceeds ${MAX_NODE_DEPTH}`);
      for (const c of e.components) {
        const props = c.props ?? {};
        if (c.type === 'model' && typeof props.assetId === 'string' && !assetIds.has(props.assetId)) {
          throw new PresentationValidationError(`scene ${scene.id}: entity ${e.id} references unknown asset ${props.assetId}`);
        }
        if (c.type === 'audioSource' && typeof props.assetId === 'string' && !assetIds.has(props.assetId)) {
          throw new PresentationValidationError(`scene ${scene.id}: entity ${e.id} references unknown audio ${props.assetId}`);
        }
      }
      for (const child of e.children ?? []) walkEntity(child as never, depth + 1);
    };
    for (const e of scene.entities ?? []) walkEntity(e, 0);
    if (scene.environment?.postProcessPresetId && !assetIds.has(scene.environment.postProcessPresetId)) {
      throw new PresentationValidationError(`scene ${scene.id}: unknown postProcessPresetId ${scene.environment.postProcessPresetId}`);
    }
    for (const a of scene.audio ?? []) {
      if (!assetIds.has(a.assetId)) throw new PresentationValidationError(`scene ${scene.id}: unknown audio asset ${a.assetId}`);
    }
  }
  for (const hud of Object.values(huds)) {
    if (!themes[hud.themeId]) throw new PresentationValidationError(`hud ${hud.id}: unknown theme ${hud.themeId}`);
    walkUi(hud.root, `hud ${hud.id}`, { assetIds, allowedBindings: HUD_BINDING_PATHS, allowRepeaterItems: false, inRepeater: false });
  }
  for (const flow of Object.values(flows)) {
    if (!scenes[flow.initialSceneId]) throw new PresentationValidationError(`flow ${flow.id}: unknown initial scene ${flow.initialSceneId}`);
    for (const s of flow.states) {
      if (!scenes[s.sceneId]) throw new PresentationValidationError(`flow ${flow.id}: unknown scene ${s.sceneId}`);
    }
    for (const t of flow.transitions ?? []) {
      if (t.action && !ACTION_IDS.includes(t.action)) throw new PresentationValidationError(`flow ${flow.id}: unknown action ${t.action}`);
    }
  }
}

function walkUi(
  node: UiNodeInput,
  context: string,
  opts: { assetIds: Set<string>; allowedBindings: readonly string[]; allowRepeaterItems: boolean; inRepeater: boolean },
  depth = 0,
  seen = new Set<string>(),
): void {
  if (depth > MAX_NODE_DEPTH) throw new PresentationValidationError(`${context}: node depth exceeds ${MAX_NODE_DEPTH}`);
  if (seen.size > MAX_NODE_COUNT) throw new PresentationValidationError(`${context}: node count exceeds ${MAX_NODE_COUNT}`);
  if (seen.has(node.id)) throw new PresentationValidationError(`${context}: duplicate node id ${node.id}`);
  seen.add(node.id);
  const inRepeater = opts.inRepeater || node.type === 'repeater';
  for (const b of node.bindings ?? []) {
    const sourceOk = b.source.startsWith('item.') ? opts.allowRepeaterItems || inRepeater : opts.allowedBindings.includes(b.source as never);
    if (!sourceOk) throw new PresentationValidationError(`${context}: node ${node.id} invalid binding source ${b.source}`);
    if (b.transform === 'booleanClass' || b.transform === 'ratio') {
      if (!b.attribute) throw new PresentationValidationError(`${context}: node ${node.id} transform ${b.transform} requires attribute`);
    }
  }
  if (node.assetId && !opts.assetIds.has(node.assetId)) {
    throw new PresentationValidationError(`${context}: node ${node.id} references unknown asset ${node.assetId}`);
  }
  for (const child of node.children ?? []) {
    walkUi(child, context, { ...opts, allowRepeaterItems: inRepeater, inRepeater }, depth + 1, seen);
  }
}

export function buildPresentationContent(contentRoot = CONTENT_ROOT): PresentationContentOutput {
  const loaded = loadPresentationContent(contentRoot);
  const canonical = canonicalStringify({ format: PRESENTATION_CONTENT_FORMAT, ...loaded });
  return {
    format: PRESENTATION_CONTENT_FORMAT,
    sourceHash: createHash('sha256').update(canonical, 'utf8').digest('hex'),
    defaultFlowId: Object.keys(loaded.flows)[0] ?? '',
    ...loaded,
  };
}

function renderModule(input: ReturnType<typeof buildPresentationContent>): string {
  const data = {
    scenes: input.scenes,
    huds: input.huds,
    flows: input.flows,
    themes: input.themes,
    assets: input.assets,
  };
  return [
    '/**',
    ' * AUTO-GENERATED — do not edit by hand.',
    ' * Run `npm run generate:presentation-content` after changing presentation content.',
    ' * Source: content/{scenes,hud,scene-flows,themes,assets}.',
    ' * Format: plain data only (no functions/runtime objects).',
    ' */',
    `export const PRESENTATION_CONTENT_FORMAT = ${input.format};`,
    `export const PRESENTATION_CONTENT_SOURCE_HASH = '${input.sourceHash}';`,
    `export const DEFAULT_PRESENTATION_FLOW_ID = '${input.defaultFlowId}';`,
    '',
    'import type { SceneDefinition, HudDefinition, SceneFlowDefinition, ThemeDefinition, AssetCatalogDefinition } from \'../shared/presentation/schemas\';',
    '',
    `export const PRESENTATION_SCENES: Record<string, SceneDefinition> = ${canonicalStringify(data.scenes)};`,
    `export const PRESENTATION_HUDS: Record<string, HudDefinition> = ${canonicalStringify(data.huds)};`,
    `export const PRESENTATION_FLOWS: Record<string, SceneFlowDefinition> = ${canonicalStringify(data.flows)};`,
    `export const PRESENTATION_THEMES: Record<string, ThemeDefinition> = ${canonicalStringify(data.themes)};`,
    `export const PRESENTATION_ASSET_CATALOG: AssetCatalogDefinition = ${canonicalStringify(data.assets)};`,
    '',
  ].join('\n');
}

export function writePresentationContent(contentRoot = CONTENT_ROOT, outFile = OUT_FILE): string {
  const input = buildPresentationContent(contentRoot);
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, renderModule(input), 'utf8');
  return input.sourceHash;
}

export function readPresentationSourceHash(): string {
  const text = readFileSync(OUT_FILE, 'utf8');
  const match = text.match(/PRESENTATION_CONTENT_SOURCE_HASH = '([0-9a-f]{64})'/);
  if (!match) throw new Error(`cannot read presentation source hash from ${OUT_FILE}`);
  return match[1];
}

export function validateProjectAsset(def: unknown): void {
  projectAssetDefinitionSchema.parse(def);
}

if (!process.env.VITEST && process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('generate-presentation-content.ts')) {
  const hash = writePresentationContent();
  console.log(`[presentation] wrote src/generated/presentationContent.generated.ts`);
  console.log(`[presentation] sourceHash ${hash.slice(0, 12)}… scenes: ${Object.keys(loadPresentationContent().scenes).length}, huds: ${Object.keys(loadPresentationContent().huds).length}`);
  console.log('[presentation] PASS');
}
