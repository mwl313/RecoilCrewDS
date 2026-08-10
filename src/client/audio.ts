import { HordePresenceAudio } from './audio/procedural/hordePresenceAudio';
import { seededVariation, spatialize } from './audio/procedural/proceduralSoundMath';
import { createProceduralNoiseBuffer } from './audio/procedural/proceduralSoundPrimitives';
import { describeRecipe, playProceduralRecipe } from './audio/procedural/proceduralSoundRecipes';
import { SoundtrackController } from './audio/soundtrackController';
import { SOUNDTRACK_TRACKS } from './audio/soundtrackManifest';
import {
  DeferredSoundtrackAutomation,
  WebAudioSoundtrackAutomation,
} from './audio/soundtrackWebAudio';
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
  | 'chestOpen'
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

const SFX_BUS_BASE_GAIN = 0.9;
export const AUDIO_MIX_MULTIPLIERS = Object.freeze({
  sfx: 1.7,
  bgm: 1.3,
});

export const PHASE_ANNOUNCEMENT_DUCK = Object.freeze({
  depth: 0.2,
  attackMs: 20,
  holdMs: 150,
  releaseMs: 430,
});

export function perceptualVolumeGain(value0to100: number): number {
  const normalized = Math.max(0, Math.min(100, Number.isFinite(value0to100) ? value0to100 : 100)) / 100;
  return normalized ** 2;
}

export class AudioManager {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  musicGain: GainNode | null = null;
  readonly soundtrack: SoundtrackController;
  private sfxBus: GainNode | null = null;
  private sfxUserGain: GainNode | null = null;
  private musicUserGain: GainNode | null = null;
  private bgmMasterGain: GainNode | null = null;
  private bgmVolume = 100;
  private sfxVolume = 100;
  private readonly buses = new Map<ProceduralBusName, GainNode>();
  private readonly voiceManager = new ProceduralVoiceManager();
  private engineNodes: EngineNodes | null = null;
  private engineSpeed = 0;
  private lastMg = 0;
  private lastCannon = 0;
  private lastDrift = 0;
  private chargeSweep: OscillatorNode | null = null;
  private chargeGain: GainNode | null = null;
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
  private readonly soundtrackMedia: HTMLAudioElement;
  private readonly soundtrackAutomation = new DeferredSoundtrackAutomation();

  constructor() {
    this.soundtrackMedia = new Audio();
    this.soundtrack = new SoundtrackController({
      tracks: SOUNDTRACK_TRACKS,
      media: this.soundtrackMedia,
      automation: this.soundtrackAutomation,
      beforePlay: () => this.prepareSoundtrackPlayback(),
    });
    this.soundtrack.start();
  }

  unlock(): void {
    this.ensureInitialized();
    if (this.ctx?.state === 'suspended') {
      void this.ctx.resume().then(() => this.soundtrack.onUserActivation());
    } else {
      void this.soundtrack.onUserActivation();
    }
  }

  private ensureInitialized(): void {
    if (this.ctx) {
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
    this.sfxBus.gain.value = SFX_BUS_BASE_GAIN * AUDIO_MIX_MULTIPLIERS.sfx;
    this.sfxUserGain = this.ctx.createGain();
    this.sfxUserGain.gain.value = perceptualVolumeGain(this.sfxVolume);
    this.sfxBus.connect(this.sfxUserGain).connect(this.master);
    for (const [name, gainValue] of Object.entries(BUS_GAINS) as Array<[ProceduralBusName, number]>) {
      const gain = this.ctx.createGain();
      gain.gain.value = gainValue;
      gain.connect(this.sfxBus);
      this.buses.set(name, gain);
    }

    // Long-form music has its own fade, context/filter, and reward-duck
    // stages. It joins the master after those stages and never crosses the
    // procedural SFX buses.
    const soundtrackSource = this.ctx.createMediaElementSource(this.soundtrackMedia);
    const trackFadeGain = this.ctx.createGain();
    const lowPass = this.ctx.createBiquadFilter();
    const contextGain = this.ctx.createGain();
    const duckGain = this.ctx.createGain();
    this.musicUserGain = this.ctx.createGain();
    this.bgmMasterGain = this.ctx.createGain();
    trackFadeGain.gain.value = 0;
    lowPass.type = 'lowpass';
    lowPass.frequency.value = 2_300;
    lowPass.Q.value = 0.7;
    contextGain.gain.value = 0.72;
    duckGain.gain.value = 1;
    this.musicUserGain.gain.value = perceptualVolumeGain(this.bgmVolume);
    this.bgmMasterGain.gain.value = AUDIO_MIX_MULTIPLIERS.bgm;
    soundtrackSource
      .connect(trackFadeGain)
      .connect(lowPass)
      .connect(contextGain)
      .connect(duckGain)
      .connect(this.musicUserGain)
      .connect(this.bgmMasterGain)
      .connect(this.master);
    this.musicGain = contextGain;
    this.soundtrackAutomation.bind(new WebAudioSoundtrackAutomation(
      this.ctx,
      trackFadeGain,
      lowPass,
      contextGain,
      duckGain,
    ));
    this.noiseBuf = createProceduralNoiseBuffer(this.ctx, 2);
    this.createReverb();
    this.startEngine();
    this.startDriftTexture();
    this.horde = new HordePresenceAudio(this.ctx, this.noiseBuf, this.requireBus('worldAmbience'));
  }

  private prepareSoundtrackPlayback(): void {
    this.ensureInitialized();
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  setBgmVolume(value0to100: number): void {
    this.bgmVolume = Math.max(0, Math.min(100, Math.round(value0to100)));
    this.rampUserGain(this.musicUserGain, perceptualVolumeGain(this.bgmVolume));
  }

  setSfxVolume(value0to100: number): void {
    this.sfxVolume = Math.max(0, Math.min(100, Math.round(value0to100)));
    this.rampUserGain(this.sfxUserGain, perceptualVolumeGain(this.sfxVolume));
  }

  userVolumeState(): { bgmVolume: number; sfxVolume: number; bgmGain: number; sfxGain: number } {
    return {
      bgmVolume: this.bgmVolume,
      sfxVolume: this.sfxVolume,
      bgmGain: perceptualVolumeGain(this.bgmVolume),
      sfxGain: perceptualVolumeGain(this.sfxVolume),
    };
  }

  private rampUserGain(node: GainNode | null, target: number): void {
    if (!node || !this.ctx) return;
    const now = this.ctx.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(target, now + 0.03);
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
      cannonChargeActive: this.chargeSweep !== null,
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
    // Compatibility entrypoint for the gameplay presenter. Long-form music
    // intensity is driven by scene context rather than the match clock.
    void value;
  }

  duckForReward(opts: { depth: number; attackMs: number; holdMs: number; releaseMs: number }): void {
    this.soundtrack.duckForReward(opts);
  }

  playPhaseAnnouncementImpact(intensity: number): boolean {
    const played = this.playLocal('phaseAnnouncementImpact', {
      intensity: Math.max(0.75, Math.min(1.25, intensity)),
    });
    // Existing independent automation preserves the current track/context;
    // user BGM and SFX gain stages remain untouched.
    this.soundtrack.duckForReward(PHASE_ANNOUNCEMENT_DUCK);
    return played;
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
      case 'chestOpen': {
        const destination = this.requireBus('uiReward');
        this.noiseHit(t, 1_050, 0.04, 0.11, destination);
        this.blip(145, t, 0.1, 'triangle', 0.17, destination, 96);
        this.blip(740, t + 0.018, 0.11, 'square', 0.09, destination);
        this.blip(1_174.66, t + 0.064, 0.17, 'sine', 0.14, destination);
        this.blip(1_760, t + 0.108, 0.13, 'sine', 0.075, destination);
        return;
      }
      case 'results':
        [[261.6, 0], [329.6, 0.12], [392, 0.24], [523.3, 0.4]].forEach(([frequency, delay]) =>
          this.blip(frequency, t + delay, 0.5, 'triangle', 0.25, this.requireBus('uiReward')),
        );
        return;
      case 'rewardLevelImpact':
        this.playLevelUpJingle(t);
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

  private playLevelUpJingle(t: number): void {
    const destination = this.requireBus('uiReward');

    // A firm low hit clears space for the ascending fanfare. The octave climb
    // then resolves into a held C chord with a bright sparkle tail.
    this.blip(92, t, 0.38, 'sine', 0.46, destination, 46);
    this.noiseHit(t + 0.012, 2_200, 0.09, 0.14, destination);
    this.blip(330, t + 0.015, 0.24, 'square', 0.085, destination, 660);

    const climb = [
      { frequency: 392, delay: 0.04, duration: 0.32, gain: 0.16 },
      { frequency: 523.25, delay: 0.17, duration: 0.36, gain: 0.18 },
      { frequency: 659.25, delay: 0.3, duration: 0.4, gain: 0.19 },
      { frequency: 783.99, delay: 0.43, duration: 0.46, gain: 0.2 },
      { frequency: 1_046.5, delay: 0.57, duration: 0.86, gain: 0.24 },
    ];
    for (const note of climb) {
      this.blip(note.frequency, t + note.delay, note.duration, 'triangle', note.gain, destination);
      this.blip(note.frequency * 2, t + note.delay, note.duration * 0.72, 'sine', note.gain * 0.34, destination);
    }

    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      this.blip(frequency, t + 0.61, 0.92 - index * 0.07, 'sine', 0.12 - index * 0.012, destination);
    });
    [1_318.51, 1_567.98, 2_093].forEach((frequency, index) => {
      this.blip(frequency, t + 0.72 + index * 0.13, 0.36, 'sine', 0.075 - index * 0.01, destination);
    });
  }

  private playRelicLock(t: number, rarity: string): void {
    const destination = this.requireBus('uiReward');
    const rarityLift = rarity === 'legendary' ? 1.18 : rarity === 'epic' ? 1.08 : rarity === 'rare' ? 1 : 0.9;
    const firstHit = t + 0.05;
    const finalHit = t + 0.4;

    // An unmistakable two-part "ta-da": a short dominant pickup followed by
    // a wide, sustained resolution. Rarity adds brilliance without
    // changing the recognizable phrase.
    this.blip(196, t, 0.34, 'sawtooth', 0.055 * rarityLift, destination, 392);
    this.blip(392, firstHit, 0.42, 'triangle', 0.19 * rarityLift, destination);
    this.blip(493.88, firstHit, 0.38, 'sine', 0.12 * rarityLift, destination);
    this.noiseHit(firstHit, 1_600, 0.07, 0.1 * rarityLift, destination);

    this.blip(65.41, finalHit, 0.88, 'sine', 0.42 * rarityLift, destination, 49);
    this.noiseHit(finalHit, 4_200, 0.34, 0.16 * rarityLift, destination, 'highpass');
    [261.63, 329.63, 392, 523.25].forEach((frequency, index) => {
      const gain = (index === 0 ? 0.2 : index === 3 ? 0.17 : 0.13) * rarityLift;
      this.blip(frequency, finalHit, 1.18 - index * 0.05, index === 0 ? 'triangle' : 'sine', gain, destination);
    });

    const sparkleCount = rarity === 'legendary' ? 5 : rarity === 'epic' ? 4 : rarity === 'rare' ? 3 : 2;
    const sparkleNotes = [1_046.5, 1_318.51, 1_567.98, 2_093, 2_637.02];
    for (let index = 0; index < sparkleCount; index++) {
      this.blip(
        sparkleNotes[index]!,
        finalHit + 0.12 + index * 0.12,
        0.48 - index * 0.035,
        'sine',
        (0.09 - index * 0.009) * rarityLift,
        destination,
      );
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
    this.soundtrack.dispose();
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
    this.musicUserGain = null;
    this.bgmMasterGain = null;
    this.sfxUserGain = null;
    this.buses.clear();
  }
}
