import { describe, expect, it } from 'vitest';
import {
  readGlbNodeTransform,
  rewriteGlbNodeTransform,
} from '../../scripts/monsterpack10/glbSummary';

function minimalGlb(): Buffer {
  const json = Buffer.from(JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'HordeReadyContent', translation: [0, 0, 0], scale: [1, 1, 1] }],
  }));
  const jsonLength = Math.ceil(json.length / 4) * 4;
  const totalLength = 12 + 8 + jsonLength;
  const output = Buffer.alloc(totalLength, 0x20);
  output.write('glTF', 0, 4, 'ascii');
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  output.writeUInt32LE(jsonLength, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  json.copy(output, 20);
  return output;
}

describe('GLB runtime transform repair', () => {
  it('rewrites only the requested node transform deterministically', () => {
    const transform = {
      translation: [1, 2, 3] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
      scale: [0.5, 0.5, 0.5] as [number, number, number],
    };
    const repaired = rewriteGlbNodeTransform(minimalGlb(), 'HordeReadyContent', transform);
    expect(readGlbNodeTransform(repaired, 'HordeReadyContent')).toEqual(transform);
    expect(rewriteGlbNodeTransform(repaired, 'HordeReadyContent', transform)).toEqual(repaired);
    expect(repaired.readUInt32LE(8)).toBe(repaired.length);
  });
});
