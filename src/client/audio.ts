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
  | 'drift';

export class AudioManager {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  musicGain: GainNode | null = null;
  private engineNodes: { osc1: OscillatorNode; osc2: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private engineSpeed = 0;
  private lastMg = 0;
  private lastCannon = 0;
  private chargeSweep: OscillatorNode | null = null;
  private chargeGain: GainNode | null = null;
  private musicStep = 0;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicIntensity = 0;
  private sirenToggle = 0;
  private noiseBuf: AudioBuffer | null = null;

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.34;
    this.musicGain.connect(this.master);
    this.noiseBuf = this.makeNoise(1.5);
    this.startEngine();
    this.startMusic();
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private startEngine() {
    const ctx = this.ctx!;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc1.type = 'sawtooth';
    osc2.type = 'square';
    osc1.frequency.value = 42;
    osc2.frequency.value = 41.5;
    filter.type = 'lowpass';
    filter.frequency.value = 180;
    gain.gain.value = 0;
    const g1 = ctx.createGain();
    g1.gain.value = 0.5;
    const g2 = ctx.createGain();
    g2.gain.value = 0.16;
    osc1.connect(g1).connect(filter);
    osc2.connect(g2).connect(filter);
    filter.connect(gain).connect(this.master!);
    osc1.start();
    osc2.start();
    this.engineNodes = { osc1, osc2, filter, gain };
  }

  setEngine(speed: number) {
    this.engineSpeed = Math.max(0, Math.min(1, speed));
    if (!this.ctx || !this.engineNodes) return;
    const t = this.ctx.currentTime;
    const f = 38 + this.engineSpeed * 78;
    this.engineNodes.osc1.frequency.setTargetAtTime(f, t, 0.06);
    this.engineNodes.osc2.frequency.setTargetAtTime(f * 0.985, t, 0.06);
    this.engineNodes.filter.frequency.setTargetAtTime(140 + this.engineSpeed * 520, t, 0.08);
    this.engineNodes.gain.gain.setTargetAtTime(0.05 + this.engineSpeed * 0.1, t, 0.08);
  }

  setMusicIntensity(v: number) {
    this.musicIntensity = Math.max(0, Math.min(1.4, v));
  }

  private startMusic() {
    if (this.musicTimer) return;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 90);
  }

  private scheduleMusic() {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const stepDur = 0.24;
    const ahead = ctx.currentTime + 0.25;
    while (this.musicStep * stepDur < ahead) {
      const t = this.musicStep * stepDur;
      const step = this.musicStep % 8;
      const intensity = this.musicIntensity;
      if (intensity > 0.02) {
        // Kick.
        if (step % 4 === 0) {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(150, t);
          osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
          g.gain.setValueAtTime(0.34 * Math.min(1, intensity), t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
          osc.connect(g).connect(this.musicGain);
          osc.start(t);
          osc.stop(t + 0.2);
        }
        // Hat.
        if (step % 2 === 1 && this.noiseBuf) {
          const src = ctx.createBufferSource();
          src.buffer = this.noiseBuf;
          const hp = ctx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = 7000;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.08 * intensity, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
          src.connect(hp).connect(g).connect(this.musicGain);
          src.start(t, Math.random() * 0.4, 0.08);
        }
        // Bass.
        const bassNotes = [55, 55, 65.4, 55, 49, 49, 65.4, 73.4];
        if (step % 2 === 0) {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.value = bassNotes[step];
          g.gain.setValueAtTime(0.2 * intensity, t);
          g.gain.exponentialRampToValueAtTime(0.01, t + stepDur * 1.8);
          osc.connect(g).connect(this.musicGain);
          osc.start(t);
          osc.stop(t + stepDur * 1.9);
        }
        // Pad when intense.
        if (intensity > 0.65 && step % 4 === 0) {
          const padNotes = [220, 261.6, 329.6];
          for (const f of padNotes) {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.value = f;
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 900;
            g.gain.setValueAtTime(0.028, t);
            g.gain.exponentialRampToValueAtTime(0.005, t + 1.6);
            osc.connect(lp).connect(g).connect(this.musicGain);
            osc.start(t);
            osc.stop(t + 1.7);
          }
        }
      }
      this.musicStep++;
    }
  }

  private now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  play(name: SoundName, opts: { kind?: string; charge?: number } = {}) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = this.now();
    const noise = () => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf!;
      return src;
    };
    switch (name) {
      case 'ui': {
        this.blip(620, t, 0.08, 'square', 0.12);
        break;
      }
      case 'machineGun': {
        if (t - this.lastMg < 0.045) return;
        this.lastMg = t;
        const src = noise();
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 1600;
        f.Q.value = 1.4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.16, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        src.connect(f).connect(g).connect(this.master);
        src.start(t, Math.random() * 0.5, 0.06);
        this.blip(190, t, 0.04, 'square', 0.05);
        break;
      }
      case 'cannon': {
        if (t - this.lastCannon < 0.08) return;
        this.lastCannon = t;
        const src = noise();
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(900, t);
        f.frequency.exponentialRampToValueAtTime(90, t + 0.5);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.9, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        src.connect(f).connect(g).connect(this.master);
        src.start(t, 0, 0.6);
        const osc = ctx.createOscillator();
        const og = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(130, t);
        osc.frequency.exponentialRampToValueAtTime(38, t + 0.4);
        og.gain.setValueAtTime(0.65, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        osc.connect(og).connect(this.master);
        osc.start(t);
        osc.stop(t + 0.5);
        break;
      }
      case 'enemyHit':
        this.blip(240 + Math.random() * 80, t, 0.06, 'triangle', 0.18);
        break;
      case 'enemyDeath': {
        const src = noise();
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(1800, t);
        f.frequency.exponentialRampToValueAtTime(200, t + 0.3);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.4, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
        src.connect(f).connect(g).connect(this.master);
        src.start(t, 0, 0.4);
        const osc = ctx.createOscillator();
        const og = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, t);
        osc.frequency.exponentialRampToValueAtTime(70, t + 0.28);
        og.gain.setValueAtTime(0.2, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.connect(og).connect(this.master);
        osc.start(t);
        osc.stop(t + 0.32);
        break;
      }
      case 'scrapPickup': {
        const notes = opts.kind === 'heavy' ? [523, 784] : [660, 880];
        notes.forEach((f, i) => this.blip(f, t + i * 0.055, 0.12, 'sine', 0.22));
        break;
      }
      case 'collision': {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(110, t);
        osc.frequency.exponentialRampToValueAtTime(35, t + 0.14);
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.connect(g).connect(this.master);
        osc.start(t);
        osc.stop(t + 0.2);
        break;
      }
      case 'rammerTelegraph': {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(520, t);
        osc.frequency.setValueAtTime(410, t + 0.2);
        g.gain.setValueAtTime(0.12, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
        osc.connect(g).connect(this.master);
        osc.start(t);
        osc.stop(t + 0.45);
        break;
      }
      case 'towerFire': {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1100, t);
        osc.frequency.exponentialRampToValueAtTime(180, t + 0.13);
        g.gain.setValueAtTime(0.14, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        osc.connect(g).connect(this.master);
        osc.start(t);
        osc.stop(t + 0.16);
        break;
      }
      case 'truckSiren': {
        this.sirenToggle = 1 - this.sirenToggle;
        this.blip(this.sirenToggle ? 620 : 470, t, 0.34, 'sine', 0.16);
        break;
      }
      case 'dash': {
        const src = noise();
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.setValueAtTime(900, t);
        f.frequency.exponentialRampToValueAtTime(2400, t + 0.12);
        f.Q.value = 1.6;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.28, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        src.connect(f).connect(g).connect(this.master);
        src.start(t, 0, 0.18);
        this.blip(150, t, 0.08, 'square', 0.08);
        break;
      }
      case 'jump': {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(90, t);
        osc.frequency.exponentialRampToValueAtTime(210, t + 0.14);
        g.gain.setValueAtTime(0.3, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        osc.connect(g).connect(this.master);
        osc.start(t);
        osc.stop(t + 0.18);
        const src = noise();
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 500;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.12, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        src.connect(f).connect(ng).connect(this.master);
        src.start(t, 0, 0.12);
        break;
      }
      case 'wipeout': {
        const src = noise();
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(2400, t);
        f.frequency.exponentialRampToValueAtTime(60, t + 1.1);
        const g = ctx.createGain();
        g.gain.setValueAtTime(1.0, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
        src.connect(f).connect(g).connect(this.master);
        src.start(t, 0, 1.3);
        const osc = ctx.createOscillator();
        const og = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(80, t);
        osc.frequency.exponentialRampToValueAtTime(28, t + 0.9);
        og.gain.setValueAtTime(0.8, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
        osc.connect(og).connect(this.master);
        osc.start(t);
        osc.stop(t + 1.1);
        break;
      }
      case 'cannonChargeStart':
      case 'cannonChargeLoop': {
        this.stopCharge();
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, t);
        osc.frequency.exponentialRampToValueAtTime(1500, t + 1.0);
        g.gain.setValueAtTime(0.05, t);
        g.gain.exponentialRampToValueAtTime(0.24, t + 1.0);
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.setValueAtTime(300, t);
        f.frequency.exponentialRampToValueAtTime(2400, t + 1.0);
        osc.connect(f).connect(g).connect(this.master);
        osc.start(t);
        osc.stop(t + 1.1);
        this.chargeSweep = osc;
        this.chargeGain = g;
        break;
      }
      case 'cannonChargeFull': {
        this.stopCharge();
        const pulse = ctx.createOscillator();
        const pg = ctx.createGain();
        pulse.type = 'square';
        pulse.frequency.setValueAtTime(880, t);
        pg.gain.setValueAtTime(0.12, t);
        pg.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        pulse.connect(pg).connect(this.master);
        pulse.start(t);
        pulse.stop(t + 0.4);
        break;
      }
      case 'cannonChargeRelease': {
        this.stopCharge();
        const src = noise();
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(3200, t);
        f.frequency.exponentialRampToValueAtTime(80, t + 1.6);
        const g = ctx.createGain();
        g.gain.setValueAtTime(1.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.7);
        src.connect(f).connect(g).connect(this.master);
        src.start(t, 0, 1.8);
        for (const [freq, delay] of [[110, 0], [164.8, 0.08], [220, 0.16]] as const) {
          this.blip(freq, t + delay, 1.0, 'sine', 0.3);
        }
        break;
      }
      case 'results': {
        for (const [freq, delay] of [[261.6, 0], [329.6, 0.12], [392, 0.24], [523.3, 0.4]] as const) {
          this.blip(freq, t + delay, 0.5, 'triangle', 0.25);
        }
        break;
      }
      case 'drift': {
        const src = noise();
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 700;
        f.Q.value = 2;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.06, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        src.connect(f).connect(g).connect(this.master);
        src.start(t, 0, 0.22);
        break;
      }
    }
  }

  private stopCharge() {
    if (this.chargeSweep) {
      try {
        this.chargeSweep.stop();
      } catch {
        // already stopped
      }
      this.chargeSweep = null;
      this.chargeGain = null;
    }
  }

  private blip(freq: number, t: number, dur: number, type: OscillatorType, gain: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  dispose() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
  }
}
