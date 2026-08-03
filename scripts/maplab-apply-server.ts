#!/usr/bin/env tsx
/**
 * Local apply helper for Map Lab.
 *
 * The Map Lab browser never writes repository files directly; when the
 * "Apply to Game" / "Save as New Profile" buttons are used, the browser
 * POSTs the validated profile bundle to this localhost-only helper, which
 * runs the exact same validated apply pipeline as `npm run maplab:apply`.
 *
 * Usage:
 *   npm run maplab:apply-server          # http://127.0.0.1:5181
 *   MAPLAB_CONTENT_ROOT=<dir> npm run maplab:apply-server   # tests
 */
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyMapProfileOnly, applyProfileBundle, setModeMapProfileId, validateProfileBundle } from './apply-maplab-profile';
import { computeMapProfileSourceHash, writeGeneratedMapProfiles } from './generate-map-profile-bundle';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_ROOT = process.env.MAPLAB_CONTENT_ROOT ?? path.join(ROOT, 'content');
const HOST = '127.0.0.1';
const PORT = Number(process.env.MAPLAB_APPLY_PORT ?? 5181);

export interface ApplyHelperResponse {
  ok: boolean;
  error?: string;
  changed?: string[];
  hash?: string;
}

export function handleApplyRequest(
  payload: unknown,
  options: { contentRoot?: string; writeGenerated?: boolean } = {},
): ApplyHelperResponse {
  const contentRoot = options.contentRoot ?? CONTENT_ROOT;
  const writeGenerated = options.writeGenerated ?? true;
  try {
    const req = payload as { kind?: string; bundle?: unknown; overwrite?: boolean; onlyMap?: boolean; setModeMapProfile?: boolean };
    if (req?.kind === 'validate') {
      const result = validateProfileBundle(req.bundle);
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    }
    if (req?.kind === 'apply') {
      const changed = req.onlyMap
        ? [...applyMapProfileOnly(req.bundle, { contentRoot, overwrite: req.overwrite === true }).changed]
        : [...applyProfileBundle(req.bundle, { contentRoot, overwrite: req.overwrite === true, writeGenerated: false }).changed];
      if (req.setModeMapProfile) {
        const mapId = (req.bundle as { bundles: { map: { id: string } } }).bundles.map.id;
        changed.push(setModeMapProfileId(contentRoot, mapId));
      }
      if (writeGenerated) {
        writeGeneratedMapProfiles(contentRoot);
        changed.push('src/generated/mapProfiles.generated.ts');
      }
      return { ok: true, changed: [...new Set(changed)].sort(), hash: computeMapProfileSourceHash(contentRoot) };
    }
    return { ok: false, error: `unknown request kind ${String(req?.kind)}` };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

function json(res: { writeHead(status: number, headers: Record<string, string>): unknown; end(body: string): unknown }, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    });
    res.end();
    return;
  }
  if (req.method !== 'POST' || req.url !== '/') {
    json(res, 404, { ok: false, error: 'POST / only' });
    return;
  }
  let body = '';
  req.on('data', (chunk: Buffer) => {
    body += chunk.toString('utf8');
    if (body.length > 64 * 1024 * 1024) req.destroy();
  });
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body) as unknown;
      const result = handleApplyRequest(parsed);
      json(res, result.ok ? 200 : 400, result);
    } catch (error) {
      json(res, 400, { ok: false, error: `invalid JSON: ${(error as Error).message}` });
    }
  });
});

if (!process.env.VITEST && process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('maplab-apply-server.ts')) {
  server.listen(PORT, HOST, () => {
    console.log(`[maplab:apply-server] listening on http://${HOST}:${PORT}`);
    console.log(`[maplab:apply-server] content root: ${CONTENT_ROOT}`);
    console.log('[maplab:apply-server] this helper writes content files; keep it local to your machine');
  });
}
