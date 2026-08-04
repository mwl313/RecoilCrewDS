#!/usr/bin/env tsx
/**
 * Enemy animation asset validation CLI.
 *
 * Validates every registered presentation/animation profile and every
 * supplied model file under public/assets. Checks that can only be
 * performed reliably in the export tool are documented as manual export
 * checks rather than pretended to be validated.
 *
 * Usage: npm run validate:enemy-animations
 */
import * as THREE from 'three';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEnemyAnimationContent } from './generate-enemy-animation-content';
import { assetCatalogDefinitionSchema } from '../src/shared/presentation/schemas';
import { REQUIRED_ASSET_IDS } from '../src/shared/assetRegistry';
import { ENEMY_ANIMATION_ROLES } from '../src/shared/animation/animationRoles';
import type { EnemyPresentationProfileDefinition } from '../src/shared/animation/animationProfileTypes';
import { resolveRoleWithFallback } from '../src/shared/animation/animationContentValidation';

type Severity = 'error' | 'warning' | 'info';

interface ValidationIssue {
  severity: Severity;
  assetId: string;
  message: string;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_ASSETS = path.join(ROOT, 'public', 'assets');

function loadCatalog(): { files: Map<string, string> } {
  const files = new Map<string, string>();
  const dir = path.join(ROOT, 'content', 'assets');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const raw = JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as unknown;
    const parsed = assetCatalogDefinitionSchema.safeParse(raw);
    if (!parsed.success) continue;
    for (const p of parsed.data.project) {
      if (p.kind === 'model' && p.file) files.set(p.id, path.join(PUBLIC_ASSETS, p.file));
    }
  }
  const manifestFile = path.join(PUBLIC_ASSETS, 'manifest.json');
  if (existsSync(manifestFile)) {
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as {
      assets?: Array<{ id?: string; file?: string }>;
    };
    for (const entry of manifest.assets ?? []) {
      if (entry.id && entry.file) files.set(entry.id, path.join(PUBLIC_ASSETS, entry.file));
    }
  }
  return { files };
}

async function loadGlb(file: string): Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] } | null> {
  const mod = await import('three/addons/loaders/GLTFLoader.js');
  const loader = new mod.GLTFLoader();
  try {
    const gltf = await loader.loadAsync(file);
    return { scene: gltf.scene, animations: gltf.animations ?? [] };
  } catch {
    return null;
  }
}

function countBones(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) n++;
  });
  return n;
}

function countMeshes(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) n++;
  });
  return n;
}

function countMaterials(root: THREE.Object3D): number {
  const set = new Set<THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) set.add(m);
  });
  return set.size;
}

function hasCameraOrLight(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((o) => {
    if ((o as THREE.Camera).isCamera || (o as THREE.Light).isLight) found = true;
  });
  return found;
}

function boundsPlausible(root: THREE.Object3D): { ok: boolean; diagonal: number } {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  return { ok: size.length() >= 0.3 && size.length() <= 20, diagonal: size.length() };
}

function rootMotionWarning(clip: THREE.AnimationClip): number | null {
  let maxDisplacement = 0;
  let found = false;
  for (const track of clip.tracks) {
    if (!(track instanceof THREE.VectorKeyframeTrack)) continue;
    if (!track.name.endsWith('.position')) continue;
    found = true;
    const values = track.values;
    const start = values.slice(0, 3);
    for (let i = 3; i < values.length; i += 3) {
      maxDisplacement = Math.max(
        maxDisplacement,
        Math.hypot(values[i] - start[0], values[i + 1] - start[1], values[i + 2] - start[2]),
      );
    }
  }
  return found ? maxDisplacement : null;
}

async function validateModels(
  profiles: readonly EnemyPresentationProfileDefinition[],
  files: Map<string, string>,
  issues: ValidationIssue[],
): Promise<void> {
  const seenFiles = new Set<string>();
  for (const profile of profiles) {
    const ids = [profile.nearModelAssetId];
    if (profile.farModelAssetId) ids.push(profile.farModelAssetId);
    if (profile.aggregateModelAssetId) ids.push(profile.aggregateModelAssetId);
    for (const assetId of ids) {
      const file = files.get(assetId);
      if (!file || !existsSync(file)) {
        if (assetId.startsWith('custom.')) {
          issues.push({
            severity: 'info',
            assetId,
            message: 'placeholder model (no file); procedural fallback will be used',
          });
        } else if (!REQUIRED_ASSET_IDS.includes(assetId as never)) {
          issues.push({
            severity: 'warning',
            assetId,
            message: 'no model file supplied; fallback presentation used',
          });
        }
        continue;
      }
      if (seenFiles.has(file)) continue;
      seenFiles.add(file);
      await validateGlbFile(file, assetId, profile, issues);
    }
  }
}

async function validateGlbFile(
  file: string,
  assetId: string,
  profile: EnemyPresentationProfileDefinition,
  issues: ValidationIssue[],
): Promise<void> {
  const gltf = await loadGlb(file);
  if (!gltf) {
    issues.push({ severity: 'error', assetId, message: `GLB failed to load: ${file}` });
    return;
  }
  if (!gltf.scene) {
    issues.push({ severity: 'error', assetId, message: `GLB has no scene: ${file}` });
    return;
  }
  const names = gltf.animations.map((c) => c.name);
  if (new Set(names).size !== names.length) {
    issues.push({ severity: 'error', assetId, message: `duplicate animation clip names in ${path.basename(file)}` });
  }
  let skinned = false;
  gltf.scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
  });
  const isFar = profile.farModelAssetId === assetId;
  if (isFar && skinned) {
    issues.push({ severity: 'warning', assetId, message: 'far model contains a SkinnedMesh; far tier should be rigid' });
  }
  const bones = countBones(gltf.scene);
  const isBoss = profile.id.endsWith('.boss');
  const boneBudget = isBoss ? 160 : 64;
  if (bones > boneBudget) {
    issues.push({ severity: 'warning', assetId, message: `model has ${bones} bones (budget ${boneBudget})` });
  }
  const materials = countMaterials(gltf.scene);
  if (materials > 4) {
    issues.push({ severity: 'warning', assetId, message: `model has ${materials} materials (budget 4)` });
  }
  const bounds = boundsPlausible(gltf.scene);
  if (!bounds.ok) {
    issues.push({
      severity: 'warning',
      assetId,
      message: `model bounds diagonal ${bounds.diagonal.toFixed(2)} m is outside the plausible 0.3..20 m range`,
    });
  }
  if (hasCameraOrLight(gltf.scene)) {
    issues.push({ severity: 'error', assetId, message: 'model contains cameras or lights (unsupported)' });
  }
  issues.push({
    severity: 'info',
    assetId,
    message: `${path.basename(file)}: ${countMeshes(gltf.scene)} meshes, ${bones} bones, ${materials} materials, ${names.length} clips${skinned ? ', skinned' : ', rigid'}`,
  });

  if (profile.animationProfileId && !isFar) {
    const { bundle } = buildEnemyAnimationContent();
    const anim = bundle.animationProfiles[profile.animationProfileId];
    if (anim) {
      const clips = new Map(gltf.animations.map((c) => [c.name, c]));
      for (const role of ENEMY_ANIMATION_ROLES) {
        if (!anim.clips[role]) continue;
        const resolved = resolveRoleWithFallback(anim, role, (n) => clips.has(n));
        if (!resolved) {
          const required = role === 'idle' || role === 'attackPrimary' || role === 'death';
          issues.push({
            severity: required ? 'error' : 'warning',
            assetId,
            message: `${required ? 'required' : 'optional'} semantic role '${role}' (clip '${anim.clips[role]}') does not resolve in ${path.basename(file)}`,
          });
        }
      }
      for (const clip of gltf.animations) {
        const displacement = rootMotionWarning(clip);
        if (displacement !== null && displacement > 0.35) {
          issues.push({
            severity: 'warning',
            assetId,
            message: `root translates ${displacement.toFixed(2)} m during '${clip.name}' (tolerance 0.35 m)`,
          });
        }
      }
    }
  }
}

async function main(): Promise<void> {
  const issues: ValidationIssue[] = [];
  const { bundle } = buildEnemyAnimationContent();
  const files = loadCatalog().files;
  await validateModels(Object.values(bundle.presentationProfiles), files, issues);

  const counts = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) counts[issue.severity]++;
  issues.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  console.log(
    `[validate-enemy-animations] ${Object.keys(bundle.presentationProfiles).length} presentation profiles, ${Object.keys(bundle.animationProfiles).length} animation profiles`,
  );
  for (const issue of issues) {
    console.log(`  [${issue.severity.toUpperCase()}] ${issue.assetId}: ${issue.message}`);
  }
  console.log(`[validate-enemy-animations] ${counts.error} errors, ${counts.warning} warnings, ${counts.info} info`);
  console.log(
    '[validate-enemy-animations] manual export checks (documented in GLTF_EXPORT_GUIDE): vertex influences, texture dimensions, unsupported compression',
  );
  if (counts.error > 0) {
    console.error('[validate-enemy-animations] FAIL');
    process.exitCode = 1;
  } else {
    console.log('[validate-enemy-animations] PASS');
  }
}

function severityRank(s: Severity): number {
  return s === 'error' ? 0 : s === 'warning' ? 1 : 2;
}

void main();
