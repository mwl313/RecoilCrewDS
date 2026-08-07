import { lerp } from '../../shared/math';
import { NET_TUNING } from '../../shared/net/tuning';

export interface QualityTargets {
  setPixelRatio(ratio: number): void;
  setShadows(enabled: boolean): void;
  setBloomStrength(strength: number): void;
  setApronQuality(quality: 'high' | 'low'): void;
}

/** FPS sampling + adaptive quality (procedural client presentation). */
export class QualityManager {
  private readonly samples: number[] = [];
  private lastFpsT = 0;
  private fps = 60;
  quality: 'high' | 'low' = 'high';

  constructor(private readonly targets: QualityTargets) {}

  beginFrame(now: number): number {
    if (this.lastFpsT === 0) this.lastFpsT = now;
    const dtRaw = Math.min(0.05, (now - this.lastFpsT) / 1000);
    this.lastFpsT = now;
    this.fps = lerp(this.fps, 1 / Math.max(0.0001, dtRaw), 0.06);
    this.samples.push(this.fps);
    if (this.samples.length > 240) this.samples.shift();
    this.adapt();
    return dtRaw;
  }

  get currentFps(): number {
    return this.fps;
  }

  reset(): void {
    this.samples.length = 0;
    this.quality = 'high';
    this.fps = 60;
    this.targets.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.targets.setShadows(true);
    this.targets.setBloomStrength(0.55);
    this.targets.setApronQuality('high');
  }

  private adapt(): void {
    if (this.samples.length < 60) return;
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    if (avg < 42 && this.quality === 'high') {
      this.quality = 'low';
      this.targets.setPixelRatio(1);
      this.targets.setShadows(false);
      this.targets.setBloomStrength(0.18);
      this.targets.setApronQuality('low');
    } else if (avg > 55 && this.quality === 'low' && this.samples.length > 240) {
      this.quality = 'high';
      this.targets.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      this.targets.setShadows(true);
      this.targets.setBloomStrength(0.55);
      this.targets.setApronQuality('high');
      this.samples.length = 0;
    }
  }
}
