import type { VoiceCategory } from './proceduralSoundTypes';

export const DEFAULT_CATEGORY_CAPS: Readonly<Record<VoiceCategory, number>> = {
  playerWeapon: 8,
  enemyFire: 8,
  enemyTelegraph: 6,
  enemyDeath: 6,
  minorImpact: 8,
  majorExplosion: 4,
  vehicle: 6,
  uiReward: 8,
  horde: 1,
};

export interface VoiceRequest {
  category: VoiceCategory;
  priority: number;
  distance: number;
  duration: number;
}

export interface VoiceLease {
  readonly id: number;
  bindStop(stop: () => void): void;
  release(): void;
}

interface ActiveVoice extends VoiceRequest {
  id: number;
  createdAt: number;
  stop: () => void;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface VoiceManagerStats {
  active: number;
  counts: Record<VoiceCategory, number>;
  dropped: number;
  maxActive: number;
}

export class ProceduralVoiceManager {
  private readonly voices = new Map<number, ActiveVoice>();
  private nextId = 1;
  private dropped = 0;
  private maxActive = 0;

  constructor(
    private readonly globalCap = 28,
    private readonly categoryCaps: Readonly<Record<VoiceCategory, number>> = DEFAULT_CATEGORY_CAPS,
    private readonly now: () => number = () => performance.now() / 1000,
  ) {}

  request(input: VoiceRequest): VoiceLease | null {
    const categoryVoices = [...this.voices.values()].filter((voice) => voice.category === input.category);
    const categoryFull = categoryVoices.length >= this.categoryCaps[input.category];
    const globalFull = this.voices.size >= this.globalCap;
    const replacementPool = categoryFull ? categoryVoices : globalFull ? [...this.voices.values()] : [];
    if (replacementPool.length > 0) {
      const weakest = replacementPool.reduce((candidate, voice) => this.isWeaker(voice, candidate) ? voice : candidate);
      if (!this.canReplace(weakest, input)) {
        this.dropped++;
        return null;
      }
      this.stopVoice(weakest.id, true);
    }

    const id = this.nextId++;
    const voice: ActiveVoice = {
      ...input,
      id,
      createdAt: this.now(),
      stop: () => undefined,
      timer: null,
    };
    this.voices.set(id, voice);
    const durationMs = Math.max(20, input.duration * 1000 + 80);
    voice.timer = setTimeout(() => this.stopVoice(id, false), durationMs);
    this.maxActive = Math.max(this.maxActive, this.voices.size);
    return {
      id,
      bindStop: (stop) => {
        const active = this.voices.get(id);
        if (active) active.stop = stop;
        else stop();
      },
      release: () => this.stopVoice(id, false),
    };
  }

  stats(): VoiceManagerStats {
    const counts = Object.fromEntries(
      Object.keys(this.categoryCaps).map((category) => [category, 0]),
    ) as Record<VoiceCategory, number>;
    for (const voice of this.voices.values()) counts[voice.category]++;
    return { active: this.voices.size, counts, dropped: this.dropped, maxActive: this.maxActive };
  }

  recordDrop(): void {
    this.dropped++;
  }

  dispose(): void {
    for (const id of [...this.voices.keys()]) this.stopVoice(id, false);
  }

  private isWeaker(a: ActiveVoice, b: ActiveVoice): boolean {
    if (a.priority !== b.priority) return a.priority < b.priority;
    if (a.distance !== b.distance) return a.distance > b.distance;
    return a.createdAt < b.createdAt;
  }

  private canReplace(active: ActiveVoice, incoming: VoiceRequest): boolean {
    if (incoming.priority !== active.priority) return incoming.priority > active.priority;
    return incoming.distance + 2 < active.distance;
  }

  private stopVoice(id: number, displaced: boolean): void {
    const voice = this.voices.get(id);
    if (!voice) return;
    this.voices.delete(id);
    if (voice.timer !== null) clearTimeout(voice.timer);
    try {
      voice.stop();
    } catch {
      // A Web Audio source may already have reached its scheduled stop.
    }
    if (displaced) this.dropped++;
  }
}
