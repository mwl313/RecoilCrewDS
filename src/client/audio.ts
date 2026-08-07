import { HordePresenceAudio } from './audio/procedural/hordePresenceAudio';
import { seededVariation, spatialize } from './audio/procedural/proceduralSoundMath';
import { createProceduralNoiseBuffer } from './audio/procedural/proceduralSoundPrimitives';
import { describeRecipe, playProceduralRecipe } from './audio/procedural/proceduralSoundRecipes';
import type {
  AudioDebugStats,
  ListenerPose,
  ProceduralBusName,
  ProceduralRecipeOptions,
  ProceduralSoundRecipe,
  WorldRecipeOptions,
} from './audio/procedural/proceduralSoundTypes';
import { ProceduralVoiceManager } from './audio/procedural/proceduralVoiceManager';

export type SoundName =
  | 'ui'
  | 'machineGun'
  | 'cannon'
  | 'enemyHit'
  | 'enemyDeath'
  | 'scrapPickup'
  | 'collision'
  | 'rammerTelegraph'
  | 'towerFire'
  | 'truckSiren'
  | 'dash'
  | 'jump'
  | 'wipeout'
  | 'cannonChargeStart'
  | 'cannonChargeLoop'
  | 'cannonChargeFull'
  | 'cannonChargeRelease'
  | 'results'
  | 'drift'
  | 'rewardLevelImpact'
  | 'rewardTick'
  | 'rewardCardLock'
  | 'rewardFocus'
  | 'rewardConfirm'
  | 'relicLock'
  | 'rewardExit';

interface EngineNodes {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  harmonic: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  harmonicGain: GainNode;
  trackSource: AudioBufferSourceNode;
  trackFilter: BiquadFilterNode;
  trackGain: GainNode;
}

const BUS_GAINS: Record<ProceduralBusName, number> = {
  playerWeapon: 1,
  enemyWeapon: 0.78,
  impact: 0.9,
  vehicle: 0.62,
  worldAmbience: 0.35,
  uiReward: 0.72,
};

export class AudioManager {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  musicGain: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private readonly buses = new Map<ProceduralBusName, GainNode>();
  private readonly voiceManager = new ProceduralVoiceManager();
  private engineNodes: EngineNodes | null = null;
  private engineSpeed = 0;
  private lastMg = 0;
  private lastCannon = 0;
  private lastDrift = 0;
  private chargeSweep: OscillatorNode | null = null;
  private chargeGain: GainNode | null = null;
  private musicStep = 0;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicIntensity = 0;
  private noiseBuf: AudioBuffer | null = null;
  private reverb: ConvolverNode | null = null;
  private reverbReturn: GainNode | null = null;
  private horde: HordePresenceAudio | null = null;
  private driftSource: AudioBufferSourceNode | null = null;
  private driftFilter: BiquadFilterNode | null = null;
  private driftGain: GainNode | null = null;
  private eventSequence = 1;
  private listener: ListenerPose = { x: 0, y: 0, z: 0, yaw: 0 };
  private lastRecipe: ProceduralSoundRecipe | null = null;
  private lastWorldDistance = 0;
  private lastPan = 0;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.22;
    this.master.connect(compressor);
    compressor.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);
    for (const [name, gainValue] of Object.entries(BUS_GAINS) as Array<[ProceduralBusName, number]>) {
      const gain = this.ctx.createGain();
      gain.gain.value = gainValue;
      gain.connect(this.sfxBus);
      this.buses.set(name, gain);
    }

    // The legacy procedural music remains independent of SFX. Reward ducking
    // only touches this music gain and never any combat bus.
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.34;
    this.musicGain.connect(this.master);
    this.noiseBuf = createProceduralNoiseBuffer(this.ctx, 2);
    this.createReverb();
    this.startEngine();
    this.startDriftTexture();
    this.horde = new HordePresenceAudio(this.ctx, this.noiseBuf, this.requireBus('worldAmbience'));
    this.startMusic();
  }

  setListenerPose(pose: ListenerPose): void {
    this.listener = {
      x: Number.isFinite(pose.x) ? pose.x : 0,
      y: Number.isFinite(pose.y) ? pose.y : 0,
      z: Number.isFinite(pose.z) ? pose.z : 0,
      yaw: Number.isFinite(pose.yaw) ? pose.yaw : 0,
    };
  }

  setHordePresence(count: number, averageDistance: number): void {
    if (this.ctx && this.horde) this.horde.update(this.ctx, count, averageDistance);
  }

  playLocal(recipe: ProceduralSoundRecipe, options: ProceduralRecipeOptions = {}): boolean {
    return this.playRecipe(recipe, options, null);
  }

  playWorld(recipe: ProceduralSoundRecipe, options: WorldRecipeOptions): boolean {
    return this.playRecipe(recipe, options, options);
  }

  debugStats(): AudioDebugStats {
    const voices = this.voiceManager.stats();
    return {
      activeVoices: voices.active,
      voiceCounts: voices.counts,
      droppedVoices: voices.dropped,
      maxActiveVoices: voices.maxActive,
      lastRecipe: this.lastRecipe,
      lastWorldDistance: this.lastWorldDistance,
      lastPan: this.lastPan,
      hordePresence: this.horde?.amount ?? 0,
      listener: { ...this.listener },
    };
  }

  private playRecipe(
    recipe: ProceduralSoundRecipe,
    options: ProceduralRecipeOptions,
    world: WorldRecipeOptions | null,
  ): boolean {
    if (!this.ctx || !this.noiseBuf || !this.sfxBus) return false;
    const descriptor = describeRecipe(recipe, options);
    const priority = world?.priority ?? descriptor.priority;
    const spatial = world
      ? spatialize(this.listener, world, world.maxDistance ?? descriptor.maxDistance, priority)
      : null;
    if (spatial?.culled) {
      this.voiceManager.recordDrop();
      return false;
    }
    const lease = this.voiceManager.request({
      category: descriptor.category,
      priority,
      distance: spatial?.distance ?? 0,
      duration: descriptor.duration,
    });
    if (!lease) return false;

    const voiceGain = this.ctx.createGain();
    voiceGain.gain.value = spatial?.gain ?? 1;
    const cleanupNodes: AudioNode[] = [voiceGain];
    let tail: AudioNode = voiceGain;
    if (spatial) {
      const lowpass = this.ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = spatial.lowpassHz;
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = spatial.pan;
      voiceGain.connect(lowpass).connect(panner);
      tail = panner;
      cleanupNodes.push(lowpass, panner);
      this.lastWorldDistance = spatial.distance;
      this.lastPan = spatial.pan;
    }
    tail.connect(this.requireBus(descriptor.bus));

    let reverbSend: GainNode | null = null;
    if (this.reverb && descriptor.reverbSend > 0) {
      reverbSend = this.ctx.createGain();
      reverbSend.gain.value = descriptor.reverbSend;
      voiceGain.connect(reverbSend).connect(this.reverb);
      cleanupNodes.push(reverbSend);
    }
    const seed = options.seed ?? this.eventSequence++;
    const playback = playProceduralRecipe({
      ctx: this.ctx,
      destination: voiceGain,
      noiseBuffer: this.noiseBuf,
      recipe,
      options,
      variation: seededVariation(seed),
    });
    lease.bindStop(() => {
      playback.stop();
      for (const node of cleanupNodes) {
        try { node.disconnect(); } catch { /* disconnected */ }
      }
    });
    this.lastRecipe = recipe;
    return true;
  }

  private createReverb(): void {
    if (!this.ctx || !this.sfxBus) return;
    const impulse = this.ctx.createBuffer(2, Math.ceil(this.ctx.sampleRate * 0.32), this.ctx.sampleRate);
    let seed = 0x19d2f841;
    for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        const noise = ((seed >>> 0) / 0x8000_0000) - 1;
        data[i] = noise * Math.pow(1 - i / data.length, 2.8);
      }
    }
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = impulse;
    this.reverbReturn = this.ctx.createGain();
    this.reverbReturn.gain.value = 0.3;
    this.reverb.connect(this.reverbReturn).connect(this.sfxBus);
  }

  private requireBus(name: ProceduralBusName): GainNode {
    const bus = this.buses.get(name);
    if (!bus) throw new Error(`audio bus not initialized: ${name}`);
    return bus;
  }

  private startEngine(): void {
    if (!this.ctx || !this.noiseBuf) return;
    const ctx = this.ctx;
    const destination = this.requireBus('vehicle');
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const harmonic = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const harmonicGain = ctx.createGain();
    const trackSource = ctx.createBufferSource();
    const trackFilter = ctx.createBiquadFilter();
    const trackGain = ctx.createGain();
    osc1.type = 'sawtooth';
    osc2.type = 'square';
    harmonic.type = 'triangle';
    osc1.frequency.value = 42;
    osc2.frequency.value = 41.5;
    harmonic.frequency.value = 84;
    filter.type = 'lowpass';
    filter.frequency.value = 180;
    gain.gain.value = 0;
    harmonicGain.gain.value = 0;
    trackSource.buffer = this.noiseBuf;
    trackSource.loop = true;
    trackFilter.type = 'lowpass';
    trackFilter.frequency.value = 260;
    trackGain.gain.value = 0;
    const g1 = ctx.createGain();
    const g2 = ctx.createGain();
    g1.gain.value = 0.5;
    g2.gain.value = 0.16;
    osc1.connect(g1).connect(filter);
    osc2.connect(g2).connect(filter);
    filter.connect(gain).connect(destination);
    harmonic.connect(harmonicGain).connect(destination);
    trackSource.connect(trackFilter).connect(trackGain).connect(destination);
    osc1.start();
    osc2.start();
    harmonic.start();
    trackSource.start();
    this.engineNodes = { osc1, osc2, harmonic, filter, gain, harmonicGain, trackSource, trackFilter, trackGain };
  }

  setEngine(speed: number): void {
    this.engineSpeed = Math.max(0, Math.min(1, speed));
    if (!this.ctx || !this.engineNodes) return;
    const t = this.ctx.currentTime;
    const f = 38 + this.engineSpeed * 78;
    this.engineNodes.osc1.frequency.setTargetAtTime(f, t, 0.06);
    this.engineNodes.osc2.frequency.setTargetAtTime(f * 0.985, t, 0.06);
    this.engineNodes.harmonic.frequency.setTargetAtTime(f * 2.04, t, 0.08);
    this.engineNodes.filter.frequency.setTargetAtTime(140 + this.engineSpeed * 520, t, 0.08);
    this.engineNodes.gain.gain.setTargetAtTime(0.05 + this.engineSpeed * 0.1, t, 0.08);
    this.engineNodes.harmonicGain.gain.setTargetAtTime(this.engineSpeed * 0.018, t, 0.1);
    this.engineNodes.trackFilter.frequency.setTargetAtTime(170 + this.engineSpeed * 360, t, 0.12);
    this.engineNodes.trackGain.gain.setTargetAtTime(this.engineSpeed * 0.026, t, 0.12);
  }

  private startDriftTexture(): void {
    if (!this.ctx || !this.noiseBuf) return;
    this.driftSource = this.ctx.createBufferSource();
    this.driftFilter = this.ctx.createBiquadFilter();
    this.driftGain = this.ctx.createGain();
    this.driftSource.buffer = this.noiseBuf;
    this.driftSource.loop = true;
    this.driftFilter.type = 'bandpass';
    this.driftFilter.frequency.value = 560;
    this.driftFilter.Q.value = 1.5;
    this.driftGain.gain.value = 0;
    this.driftSource.connect(this.driftFilter).connect(this.driftGain).connect(this.requireBus('vehicle'));
    this.driftSource.start();
  }

  private retriggerDrift(intensity: number): void {
    if (!this.ctx || !this.driftGain || !this.driftFilter) return;
    const t = this.ctx.currentTime;
    if (t - this.lastDrift < 0.06) return;
    this.lastDrift = t;
    const amount = Math.max(0.15, Math.min(1, intensity));
    this.driftFilter.frequency.setTargetAtTime(430 + amount * 360, t, 0.025);
    this.driftGain.gain.cancelScheduledValues(t);
    this.driftGain.gain.setTargetAtTime(0.022 + amount * 0.035, t, 0.018);
    this.driftGain.gain.setTargetAtTime(0.0001, t + 0.1, 0.045);
  }

  setMusicIntensity(value: number): void {
    this.musicIntensity = Math.max(0, Math.min(1.4, value));
  }

  duckForReward(opts: { depth: number; attackMs: number; holdMs: number; releaseMs: number }): void {
    if (!this.ctx || !this.musicGain) return;
    const t = this.ctx.currentTime;
    const base = 0.34;
    const floor = base * Math.max(0, Math.min(1, 1 - opts.depth));
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, t);
    this.musicGain.gain.linearRampToValueAtTime(floor, t + opts.attackMs / 1000);
    this.musicGain.gain.setValueAtTime(floor, t + (opts.attackMs + opts.holdMs) / 1000);
    this.musicGain.gain.linearRampToValueAtTime(base, t + (opts.attackMs + opts.holdMs + opts.releaseMs) / 1000);
  }

  private startMusic(): void {
    if (this.musicTimer) return;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 90);
  }

  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain || !this.noiseBuf) return;
    const stepDuration = 0.24;
    const ahead = ctx.currentTime + 0.25;
    while (this.musicStep * stepDuration < ahead) {
      const t = this.musicStep * stepDuration;
      const step = this.musicStep % 8;
      const intensity = this.musicIntensity;
      if (intensity > 0.02) {
        if (step % 4 === 0) this.blip(150, t, 0.18, 'sine', 0.22 * Math.min(1, intensity), this.musicGain, 42);
        if (step % 2 === 1) this.noiseHit(t, 7_000, 0.05, 0.055 * intensity, this.musicGain, 'highpass');
        const bassNotes = [55, 55, 65.4, 55, 49, 49, 65.4, 73.4];
        if (step % 2 === 0) this.blip(bassNotes[step], t, stepDuration * 1.8, 'triangle', 0.14 * intensity, this.musicGain);
      }
      this.musicStep++;
    }
  }

  private now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Compatibility entrypoint: gameplay routing should prefer semantic recipes. */
  play(name: SoundName, opts: { kind?: string; charge?: number } = {}): void {
    if (!this.ctx || !this.master) return;
    const t = this.now();
    switch (name) {
      case 'machineGun':
        if (t - this.lastMg < 0.045) return;
        this.lastMg = t;
        this.playLocal('playerMg');
        return;
      case 'cannon':
        if (t - this.lastCannon < 0.08) return;
        this.lastCannon = t;
        this.playLocal('playerCannon', { chargeRatio: opts.charge ?? 0 });
        return;
      case 'enemyDeath':
        this.playLocal('enemyDeathFodder');
        return;
      case 'collision':
        this.playLocal('wallCollision');
        return;
      case 'rammerTelegraph':
        this.playLocal('rammerTelegraph');
        return;
      case 'towerFire':
        this.playLocal('enemyRangedFire');
        return;
      case 'truckSiren':
        this.playLocal('truckSiren');
        return;
      case 'dash':
        this.playLocal('dash');
        return;
      case 'jump':
        this.playLocal('jump');
        return;
      case 'wipeout':
        this.playLocal('wipeout');
        return;
      case 'drift':
        this.retriggerDrift(opts.charge ?? 0.7);
        return;
      case 'cannonChargeStart':
      case 'cannonChargeLoop':
        this.startCharge();
        return;
      case 'cannonChargeFull':
        this.playFullChargeCue();
        return;
      case 'cannonChargeRelease':
        this.stopCharge();
        this.playLocal('playerCannon', { chargeRatio: 1 });
        return;
      case 'ui':
        this.blip(620, t, 0.08, 'square', 0.12, this.requireBus('uiReward'));
        return;
      case 'enemyHit':
        this.blip(265, t, 0.06, 'triangle', 0.13, this.requireBus('uiReward'));
        return;
      case 'scrapPickup': {
        const notes = opts.kind === 'heavy' ? [523, 784] : [660, 880];
        notes.forEach((frequency, index) => this.blip(frequency, t + index * 0.055, 0.12, 'sine', 0.22, this.requireBus('uiReward')));
        return;
      }
      case 'results':
        [[261.6, 0], [329.6, 0.12], [392, 0.24], [523.3, 0.4]].forEach(([frequency, delay]) =>
          this.blip(frequency, t + delay, 0.5, 'triangle', 0.25, this.requireBus('uiReward')),
        );
        return;
      case 'rewardLevelImpact':
        this.blip(86, t, 0.28, 'sine', 0.42, this.requireBus('uiReward'));
        this.blip(48, t + 0.018, 0.34, 'sine', 0.24, this.requireBus('uiReward'));
        this.blip(1_180, t + 0.028, 0.055, 'square', 0.09, this.requireBus('uiReward'));
        this.noiseHit(t + 0.018, 2_400, 0.075, 0.13, this.requireBus('uiReward'));
        return;
      case 'rewardTick': {
        const progress = Math.max(0, Math.min(1, opts.charge ?? 0));
        const frequency = 930 - progress * 510;
        this.blip(frequency, t, 0.018 + progress * 0.022, 'square', 0.045 + progress * 0.025, this.requireBus('uiReward'));
        if (progress > 0.72) this.blip(170 - progress * 55, t, 0.045, 'triangle', 0.035 + progress * 0.025, this.requireBus('uiReward'));
        return;
      }
      case 'rewardCardLock':
        this.playRewardCardLock(t, opts.kind ?? 'common');
        return;
      case 'rewardFocus':
        this.blip(540, t, 0.035, 'square', 0.055, this.requireBus('uiReward'));
        return;
      case 'rewardConfirm':
        this.blip(110, t, 0.18, 'sine', 0.3, this.requireBus('uiReward'));
        this.blip(780, t + 0.035, 0.12, 'triangle', 0.12, this.requireBus('uiReward'));
        return;
      case 'relicLock':
        this.playRelicLock(t, opts.kind ?? 'common');
        return;
      case 'rewardExit':
        this.blip(420, t, 0.07, 'triangle', 0.08, this.requireBus('uiReward'));
        return;
    }
  }

  private playRewardCardLock(t: number, rarity: string): void {
    const destination = this.requireBus('uiReward');
    this.noiseHit(t, rarity === 'legendary' ? 1_850 : 1_150, 0.045, rarity === 'common' ? 0.07 : 0.11, destination);
    if (rarity === 'legendary') {
      this.blip(48, t, 0.42, 'sine', 0.46, destination);
      [740, 988, 1_318].forEach((frequency, index) => this.blip(frequency, t + 0.045 + index * 0.055, 0.2, 'sine', 0.09, destination));
    } else if (rarity === 'epic') {
      this.blip(74, t, 0.24, 'sine', 0.33, destination);
      this.blip(660, t + 0.025, 0.14, 'triangle', 0.13, destination);
      this.blip(990, t + 0.075, 0.16, 'sine', 0.08, destination);
    } else if (rarity === 'rare') {
      this.blip(142, t, 0.14, 'triangle', 0.22, destination);
      this.blip(1_180, t + 0.035, 0.13, 'sine', 0.095, destination);
    } else {
      this.blip(165, t, 0.1, 'triangle', 0.19, destination);
      this.blip(880, t + 0.018, 0.035, 'square', 0.055, destination);
    }
  }

  private playRelicLock(t: number, rarity: string): void {
    const destination = this.requireBus('uiReward');
    const hitAt = t + (rarity === 'legendary' ? 0.072 : 0);
    this.noiseHit(hitAt, rarity === 'legendary' ? 2_800 : 1_650, 0.085, rarity === 'common' ? 0.1 : 0.17, destination);
    this.blip(rarity === 'legendary' ? 46 : rarity === 'epic' ? 68 : 86, hitAt, rarity === 'legendary' ? 0.56 : 0.32, 'sine', rarity === 'legendary' ? 0.55 : 0.36, destination);
    this.blip(rarity === 'rare' ? 980 : 740, hitAt + 0.045, 0.18, 'triangle', 0.14, destination);
    if (rarity === 'epic' || rarity === 'legendary') this.blip(988, hitAt + 0.12, 0.28, 'sine', 0.11, destination);
    if (rarity === 'legendary') {
      this.blip(1_318, hitAt + 0.19, 0.3, 'sine', 0.1, destination);
      this.blip(1_760, hitAt + 0.27, 0.32, 'sine', 0.075, destination);
    }
  }

  private startCharge(): void {
    if (!this.ctx) return;
    this.stopCharge();
    const t = this.ctx.currentTime;
    this.chargeSweep = this.ctx.createOscillator();
    this.chargeGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    this.chargeSweep.type = 'sawtooth';
    this.chargeSweep.frequency.setValueAtTime(160, t);
    this.chargeSweep.frequency.exponentialRampToValueAtTime(1_500, t + 1);
    this.chargeGain.gain.setValueAtTime(0.05, t);
    this.chargeGain.gain.exponentialRampToValueAtTime(0.24, t + 1);
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(2_400, t + 1);
    this.chargeSweep.connect(filter).connect(this.chargeGain).connect(this.requireBus('playerWeapon'));
    this.chargeSweep.start(t);
    this.chargeSweep.stop(t + 1.1);
  }

  private playFullChargeCue(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.stopCharge();
    this.blip(880, t, 0.4, 'square', 0.12, this.requireBus('playerWeapon'));
  }

  private stopCharge(): void {
    if (this.chargeSweep) {
      try { this.chargeSweep.stop(); } catch { /* already stopped */ }
      this.chargeSweep.disconnect();
    }
    this.chargeGain?.disconnect();
    this.chargeSweep = null;
    this.chargeGain = null;
  }

  stopCannonCharge(): void {
    this.stopCharge();
  }

  private blip(
    frequency: number,
    at: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    destination: AudioNode,
    frequencyEnd?: number,
  ): void {
    if (!this.ctx) return;
    const oscillator = this.ctx.createOscillator();
    const level = this.ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(1, frequency), at);
    if (frequencyEnd !== undefined) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, frequencyEnd), at + duration);
    level.gain.setValueAtTime(Math.max(0.0001, gain), at);
    level.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(level).connect(destination);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }

  private noiseHit(
    at: number,
    frequency: number,
    duration: number,
    gain: number,
    destination: AudioNode,
    type: BiquadFilterType = 'bandpass',
  ): void {
    if (!this.ctx || !this.noiseBuf) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.85;
    const level = this.ctx.createGain();
    level.gain.setValueAtTime(gain, at);
    level.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(level).connect(destination);
    source.start(at, 0, duration + 0.02);
  }

  dispose(): void {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    this.voiceManager.dispose();
    this.horde?.dispose();
    this.horde = null;
    this.stopCharge();
    if (this.engineNodes) {
      for (const source of [this.engineNodes.osc1, this.engineNodes.osc2, this.engineNodes.harmonic, this.engineNodes.trackSource]) {
        try { source.stop(); } catch { /* already stopped */ }
      }
    }
    if (this.driftSource) {
      try { this.driftSource.stop(); } catch { /* already stopped */ }
    }
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxBus = null;
    this.buses.clear();
  }
}
