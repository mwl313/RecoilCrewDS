import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PRESENTATION_ASSET_CATALOG } from '../../src/generated/presentationContent.generated';
import { RELIC_CHEST_ASSET_ID } from '../../src/client/relics/relicChestPresentation';

const ROOT = path.resolve(path.dirname(path.dirname(__dirname)));
const GLB_PATH = path.join(ROOT, 'public', 'assets', 'models', 'items', 'relic-chest', 'relic-chest.glb');
const GLB = readFileSync(GLB_PATH);
const JSON_CHUNK = readGlbJson(GLB);

interface GlbJson {
  nodes?: Array<{ name?: string; children?: number[]; mesh?: number; extras?: Record<string, unknown> }>;
  meshes?: Array<{ name?: string; primitives?: Array<{ material?: number }> }>;
  materials?: Array<{
    name?: string;
    emissiveFactor?: number[];
    pbrMetallicRoughness?: {
      baseColorFactor?: number[];
      metallicFactor?: number;
      roughnessFactor?: number;
      baseColorTexture?: unknown;
    };
  }>;
  images?: unknown[];
  textures?: unknown[];
}

describe('relic chest runtime GLB', () => {
  it('loads through the same GLTFLoader used by the runtime', async () => {
    const arrayBuffer = GLB.buffer.slice(GLB.byteOffset, GLB.byteOffset + GLB.byteLength) as ArrayBuffer;
    const gltf = await new GLTFLoader().parseAsync(arrayBuffer, pathToFileURL(path.dirname(GLB_PATH) + path.sep).href);
    expect(gltf.scene.getObjectByName('RelicChest')).toBeTruthy();
  });

  it('contains the required articulated hierarchy and anchors', () => {
    const names = new Set((JSON_CHUNK.nodes ?? []).map((node) => node.name));
    for (const required of ['RelicChest', 'Base', 'Lid', 'GlowOrigin', 'RewardAnchor']) {
      expect(names.has(required), required).toBe(true);
    }

    const nodes = JSON_CHUNK.nodes ?? [];
    const rootIndex = nodes.findIndex((node) => node.name === 'RelicChest');
    const baseIndex = nodes.findIndex((node) => node.name === 'Base');
    const lidIndex = nodes.findIndex((node) => node.name === 'Lid');
    const glowIndex = nodes.findIndex((node) => node.name === 'GlowOrigin');
    const rewardIndex = nodes.findIndex((node) => node.name === 'RewardAnchor');
    expect(nodes[rootIndex].children).toEqual(expect.arrayContaining([baseIndex, lidIndex]));
    expect(nodes[baseIndex].children).toEqual(expect.arrayContaining([glowIndex, rewardIndex]));
    expect(nodes[baseIndex].mesh).not.toBe(nodes[lidIndex].mesh);
  });

  it('contains no ingot geometry or node', () => {
    const serializedNames = [
      ...(JSON_CHUNK.nodes ?? []).map((entry) => entry.name ?? ''),
      ...(JSON_CHUNK.meshes ?? []).map((entry) => entry.name ?? ''),
    ].join(' ').toLowerCase();
    expect(serializedNames).not.toContain('ingot');
    expect(JSON_CHUNK.meshes).toHaveLength(2);
  });

  it('preserves all three source materials and their exact PBR values', () => {
    const materials = new Map((JSON_CHUNK.materials ?? []).map((material) => [material.name, material]));
    expect([...materials.keys()].sort()).toEqual(['DarkMetal', 'Metal', 'Wood']);
    expect(materials.get('DarkMetal')?.pbrMetallicRoughness?.baseColorFactor).toEqual([
      0.06305812299251556, 0.05166768655180931, 0.09462308138608932, 1,
    ]);
    expect(materials.get('Metal')?.pbrMetallicRoughness?.baseColorFactor).toEqual([
      0.07698974758386612, 0.06832612305879593, 0.11493299156427383, 1,
    ]);
    expect(materials.get('Wood')?.pbrMetallicRoughness?.baseColorFactor).toEqual([
      0.20189261436462402, 0.10397916287183762, 0.07928955554962158, 1,
    ]);
    for (const material of materials.values()) {
      expect(material.pbrMetallicRoughness?.metallicFactor).toBe(0);
      expect(material.pbrMetallicRoughness?.roughnessFactor).toBe(0.5);
      expect(material.emissiveFactor).toBeUndefined();
    }
  });

  it('correctly records that the source has no linked texture maps', () => {
    expect(JSON_CHUNK.images ?? []).toHaveLength(0);
    expect(JSON_CHUNK.textures ?? []).toHaveLength(0);
    for (const material of JSON_CHUNK.materials ?? []) {
      expect(material.pbrMetallicRoughness?.baseColorTexture).toBeUndefined();
    }
  });
});

describe('relic chest asset registration', () => {
  it('registers the GLB and both presentation sockets without material overrides', () => {
    const asset = PRESENTATION_ASSET_CATALOG.project.find((entry) => entry.id === RELIC_CHEST_ASSET_ID);
    expect(asset).toMatchObject({
      id: RELIC_CHEST_ASSET_ID,
      kind: 'model',
      namespace: 'custom',
      file: '/assets/models/items/relic-chest/relic-chest.glb',
      optional: true,
    });
    expect(asset?.sockets?.map((socket) => socket.id)).toEqual(['GlowOrigin', 'RewardAnchor']);
    expect(asset?.materialOverrides).toBeUndefined();
  });
});

function readGlbJson(buffer: Buffer): GlbJson {
  if (buffer.toString('ascii', 0, 4) !== 'glTF') throw new Error('Invalid GLB magic');
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    if (type === 0x4e4f534a) {
      return JSON.parse(buffer.subarray(offset + 8, offset + 8 + length).toString('utf8').trim()) as GlbJson;
    }
    offset += 8 + length;
  }
  throw new Error('GLB has no JSON chunk');
}
