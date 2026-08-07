import { clamp01 } from './proceduralSoundMath';

export function hordePresenceAmount(count: number, averageDistance = 35): number {
  const n = Math.max(0, count);
  let amount = 0;
  if (n <= 5) amount = 0;
  else if (n <= 15) amount = 0.08 + ((n - 6) / 9) * 0.17;
  else if (n <= 30) amount = 0.25 + ((n - 15) / 15) * 0.3;
  else if (n <= 50) amount = 0.55 + ((n - 30) / 20) * 0.3;
  else amount = 0.85 + Math.min(0.15, (n - 50) / 100);
  const distanceColor = averageDistance <= 25 ? 1 : Math.max(0.35, 1 - (averageDistance - 25) / 100);
  return clamp01(amount * distanceColor);
}

/** One aggregate, continuously reused horde bed; never one loop per enemy. */
export class HordePresenceAudio {
  private readonly source: AudioBufferSourceNode;
  private readonly filter: BiquadFilterNode;
  private readonly noiseGain: GainNode;
  private readonly oscillator: OscillatorNode;
  private readonly oscillatorGain: GainNode;
  private presence = 0;

  constructor(ctx: AudioContext, noiseBuffer: AudioBuffer, destination: AudioNode) {
    this.source = ctx.createBufferSource();
    this.filter = ctx.createBiquadFilter();
    this.noiseGain = ctx.createGain();
    this.oscillator = ctx.createOscillator();
    this.oscillatorGain = ctx.createGain();
    this.source.buffer = noiseBuffer;
    this.source.loop = true;
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 420;
    this.noiseGain.gain.value = 0;
    this.oscillator.type = 'triangle';
    this.oscillator.frequency.value = 46;
    this.oscillatorGain.gain.value = 0;
    this.source.connect(this.filter).connect(this.noiseGain).connect(destination);
    this.oscillator.connect(this.oscillatorGain).connect(destination);
    this.source.start();
    this.oscillator.start();
  }

  update(ctx: AudioContext, count: number, averageDistance: number): void {
    this.presence = hordePresenceAmount(count, averageDistance);
    const t = ctx.currentTime;
    this.noiseGain.gain.setTargetAtTime(this.presence * 0.055, t, 0.35);
    this.oscillatorGain.gain.setTargetAtTime(this.presence * 0.018, t, 0.45);
    this.filter.frequency.setTargetAtTime(240 + this.presence * 620, t, 0.45);
    this.oscillator.frequency.setTargetAtTime(42 + this.presence * 16, t, 0.5);
  }

  get amount(): number {
    return this.presence;
  }

  dispose(): void {
    try { this.source.stop(); } catch { /* already stopped */ }
    try { this.oscillator.stop(); } catch { /* already stopped */ }
    this.source.disconnect();
    this.filter.disconnect();
    this.noiseGain.disconnect();
    this.oscillator.disconnect();
    this.oscillatorGain.disconnect();
  }
}
