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

interface GlbNode {
  name?: string;
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  matrix?: number[];
}

interface GlbJson {
  nodes?: GlbNode[];
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

/** Read one authored node's local translation from the import-time GLB JSON. */
export function readGlbNodeTranslation(
  buffer: Buffer,
  nodeName: string,
): [number, number, number] | undefined {
  const node = (readJsonChunk(buffer).nodes ?? []).find((candidate) => candidate.name === nodeName);
  return node ? [...(node.translation ?? [0, 0, 0])] : undefined;
}

export interface GlbNodeTransform {
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
}

/** Read one authored node's complete local transform from the GLB JSON. */
export function readGlbNodeTransform(
  buffer: Buffer,
  nodeName: string,
): GlbNodeTransform | undefined {
  const node = (readJsonChunk(buffer).nodes ?? []).find((candidate) => candidate.name === nodeName);
  if (!node) return undefined;
  return {
    translation: node.translation ? [...node.translation] : undefined,
    rotation: node.rotation ? [...node.rotation] : undefined,
    scale: node.scale ? [...node.scale] : undefined,
  };
}

/**
 * Deterministically replace one node transform without touching binary mesh,
 * skin, or animation payloads. This is used for narrowly scoped runtime
 * corrections to otherwise valid third-party exports.
 */
export function rewriteGlbNodeTransform(
  buffer: Buffer,
  nodeName: string,
  transform: GlbNodeTransform,
): Buffer {
  const chunks = readChunks(buffer);
  const jsonChunk = chunks.find((chunk) => chunk.type === 0x4e4f534a);
  if (!jsonChunk) throw new Error('GLB contains no JSON chunk');
  const json = JSON.parse(jsonChunk.data.toString('utf8').replace(/[\u0000 ]+$/g, '')) as GlbJson;
  const node = (json.nodes ?? []).find((candidate) => candidate.name === nodeName);
  if (!node) throw new Error(`GLB node '${nodeName}' not found`);
  if (node.matrix) delete node.matrix;
  if (transform.translation) node.translation = [...transform.translation];
  if (transform.rotation) node.rotation = [...transform.rotation];
  if (transform.scale) node.scale = [...transform.scale];

  const encoded = Buffer.from(JSON.stringify(json), 'utf8');
  const paddedLength = Math.ceil(encoded.length / 4) * 4;
  const padded = Buffer.alloc(paddedLength, 0x20);
  encoded.copy(padded);
  jsonChunk.data = padded;

  const totalLength = 12 + chunks.reduce((sum, chunk) => sum + 8 + chunk.data.length, 0);
  const output = Buffer.alloc(totalLength);
  output.write('glTF', 0, 4, 'ascii');
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  let offset = 12;
  for (const chunk of chunks) {
    output.writeUInt32LE(chunk.data.length, offset);
    output.writeUInt32LE(chunk.type, offset + 4);
    chunk.data.copy(output, offset + 8);
    offset += 8 + chunk.data.length;
  }
  return output;
}

function readJsonChunk(buffer: Buffer): GlbJson {
  for (const chunk of readChunks(buffer)) {
    if (chunk.type === 0x4e4f534a) {
      // 'JSON'
      const text = chunk.data.toString('utf8').replace(/[\u0000 ]+$/g, '');
      return JSON.parse(text) as GlbJson;
    }
  }
  throw new Error('GLB contains no JSON chunk');
}

function readChunks(buffer: Buffer): Array<{ type: number; data: Buffer }> {
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'glTF') {
    throw new Error('invalid GLB header');
  }
  const chunks: Array<{ type: number; data: Buffer }> = [];
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + chunkLength;
    if (end > buffer.length) throw new Error('GLB chunk exceeds file length');
    chunks.push({ type, data: Buffer.from(buffer.subarray(start, end)) });
    offset = end;
  }
  return chunks;
}
