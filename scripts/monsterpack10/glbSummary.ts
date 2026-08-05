/**
 * Minimal GLB introspection for the Monster Pack 10 importer.
 *
 * The runtime pipeline (three.js GLTFLoader) remains the only loader used
 * by the game. This parser is import-time validation only: it extracts the
 * embedded JSON chunk to verify node/socket names, animation clip names,
 * skinned meshes, and mesh/material counts against the source manifests.
 */

export interface GlbSummary {
  nodeNames: string[];
  clipNames: string[];
  meshCount: number;
  materialCount: number;
  skinCount: number;
  hasSkinnedMesh: boolean;
  hasAnimation: boolean;
}

interface GlbJson {
  nodes?: Array<{ name?: string }>;
  meshes?: unknown[];
  materials?: unknown[];
  skins?: unknown[];
  animations?: Array<{ name?: string }>;
}

export function readGlbSummary(buffer: Buffer): GlbSummary {
  if (buffer.length < 12) throw new Error('GLB too small (missing 12-byte header)');
  const magic = buffer.toString('ascii', 0, 4);
  if (magic !== 'glTF') throw new Error(`invalid GLB magic '${magic}'`);
  const json = readJsonChunk(buffer);
  const nodeNames = (json.nodes ?? [])
    .map((n) => n.name)
    .filter((n): n is string => typeof n === 'string');
  const clipNames = (json.animations ?? [])
    .map((a) => a.name)
    .filter((n): n is string => typeof n === 'string');
  return {
    nodeNames,
    clipNames,
    meshCount: (json.meshes ?? []).length,
    materialCount: (json.materials ?? []).length,
    skinCount: (json.skins ?? []).length,
    hasSkinnedMesh: (json.skins ?? []).length > 0,
    hasAnimation: clipNames.length > 0,
  };
}

function readJsonChunk(buffer: Buffer): GlbJson {
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + chunkLength;
    if (end > buffer.length) throw new Error('GLB chunk exceeds file length');
    if (chunkType === 0x4e4f534a) {
      // 'JSON'
      const text = buffer.toString('utf8', start, end);
      return JSON.parse(text) as GlbJson;
    }
    offset = end;
  }
  throw new Error('GLB contains no JSON chunk');
}
