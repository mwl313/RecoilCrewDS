import { describe, expect, it } from 'vitest';
import {
  crack,
  thump,
  type PrimitiveRuntime,
} from '../../src/client/audio/procedural/proceduralSoundPrimitives';

class FakeParam {
  value = 0;
  calls: Array<[string, number, number]> = [];
  setValueAtTime(value: number, at: number): void { this.value = value; this.calls.push(['set', value, at]); }
  exponentialRampToValueAtTime(value: number, at: number): void { this.value = value; this.calls.push(['ramp', value, at]); }
}

class FakeNode {
  disconnected = false;
  connect(destination: unknown): unknown { return destination; }
  disconnect(): void { this.disconnected = true; }
}

class FakeOscillator extends FakeNode {
  type = 'sine';
  frequency = new FakeParam();
  startedAt = -1;
  stoppedAt = -1;
  start(at = 0): void { this.startedAt = at; }
  stop(at = 0): void { this.stoppedAt = at; }
}

class FakeBufferSource extends FakeNode {
  buffer: unknown = null;
  startedAt = -1;
  stoppedAt = -1;
  start(at = 0): void { this.startedAt = at; }
  stop(at = 0): void { this.stoppedAt = at; }
}

class FakeFilter extends FakeNode {
  type = 'lowpass';
  frequency = new FakeParam();
  Q = { value: 0 };
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

describe('procedural primitive lifecycle', () => {
  it('schedules every short-lived source to stop and supports early cleanup', () => {
    const oscillators: FakeOscillator[] = [];
    const buffers: FakeBufferSource[] = [];
    const cleanups: Array<() => void> = [];
    const ctx = {
      createOscillator: () => { const node = new FakeOscillator(); oscillators.push(node); return node; },
      createBufferSource: () => { const node = new FakeBufferSource(); buffers.push(node); return node; },
      createBiquadFilter: () => new FakeFilter(),
      createGain: () => new FakeGain(),
    } as unknown as AudioContext;
    const runtime: PrimitiveRuntime = {
      ctx,
      destination: new FakeNode() as unknown as AudioNode,
      noiseBuffer: { duration: 2 } as AudioBuffer,
      variation: { pitch: 1, gain: 1, filter: 1, noiseOffset: 0.25 },
      registerCleanup: (cleanup) => cleanups.push(cleanup),
    };

    thump(runtime, { at: 1, frequencyStart: 120, frequencyEnd: 40, duration: 0.4, gain: 0.5 });
    crack(runtime, { at: 1, frequencyStart: 2_400, duration: 0.04, gain: 0.2 });

    expect(oscillators[0].startedAt).toBe(1);
    expect(oscillators[0].stoppedAt).toBeGreaterThan(1.4);
    expect(buffers[0].startedAt).toBe(1);
    expect(cleanups).toHaveLength(2);
    cleanups.forEach((cleanup) => cleanup());
    expect(oscillators[0].disconnected).toBe(true);
    expect(buffers[0].disconnected).toBe(true);
  });
});
