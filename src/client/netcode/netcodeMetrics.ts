/**
 * Netcode metrics service (Milestone 0). Records real latency, rates,
 * timing, queue depths, and corrections; the F4 overlay and tests read it.
 * Development only — zero gameplay impact when unused.
 */
export interface NetcodeMetricsSnapshot {
  rttMs: number;
  snapshotRate: number;
  snapshotJitterMs: number;
  inputRate: number;
  actionLatencyMs: number;
  renderDelayMs: number;
  snapshotBytes: number;
  parseMs: number;
  snapshotHandleMs: number;
  interpMs: number;
  worldSyncMs: number;
  cameraQueryMs: number;
  aimQueryMs: number;
  colliderCandidates: number;
  colliderTests: number;
  mainRenderMs: number;
  pipRenderMs: number;
  pendingInputs: number;
  pendingImpulses: number;
  pendingActions: number;
  pendingAimFrames: number;
  tankCorrection: number;
  turretCorrection: number;
  predictorDisabledReason: string;
  serverTick: number;
  serverTickDurationMs: number;
  serverDroppedMs: number;
  serverDriftMs: number;
  outboundBuffered: number;
}

class NetcodeMetrics {
  private arrivals: number[] = [];
  private inputs: number[] = [];
  private corrections: number[] = [];
  private turretCorrections: number[] = [];
  private actionLatencies: number[] = [];

  rttMs = 0;
  renderDelayMs = 0;
  snapshotBytes = 0;
  parseMs = 0;
  snapshotHandleMs = 0;
  interpMs = 0;
  worldSyncMs = 0;
  cameraQueryMs = 0;
  aimQueryMs = 0;
  colliderCandidates = 0;
  colliderTests = 0;
  mainRenderMs = 0;
  pipRenderMs = 0;
  pendingInputs = 0;
  pendingImpulses = 0;
  pendingActions = 0;
  pendingAimFrames = 0;
  predictorDisabledReason = '';
  serverTick = 0;
  serverTickDurationMs = 0;
  serverDroppedMs = 0;
  serverDriftMs = 0;
  outboundBuffered = 0;

  markSnapshotArrival(now: number): void {
    this.arrivals.push(now);
    if (this.arrivals.length > 120) this.arrivals.shift();
  }

  markInput(now: number): void {
    this.inputs.push(now);
    if (this.inputs.length > 120) this.inputs.shift();
  }

  markCorrection(meters: number): void {
    this.corrections.push(meters);
    if (this.corrections.length > 120) this.corrections.shift();
  }

  markTurretCorrection(radians: number): void {
    this.turretCorrections.push(radians);
    if (this.turretCorrections.length > 120) this.turretCorrections.shift();
  }

  markActionLatency(ms: number): void {
    this.actionLatencies.push(ms);
    if (this.actionLatencies.length > 120) this.actionLatencies.shift();
  }

  private rate(times: number[]): number {
    if (times.length < 2) return 0;
    const span = (times[times.length - 1] - times[0]) / 1000;
    return span > 0 ? (times.length - 1) / span : 0;
  }

  private jitterMs(times: number[]): number {
    if (times.length < 3) return 0;
    let sum = 0;
    let count = 0;
    for (let i = 1; i < times.length; i++) {
      sum += times[i] - times[i - 1];
      count++;
    }
    const mean = sum / count;
    let variance = 0;
    for (let i = 1; i < times.length; i++) {
      variance += (times[i] - times[i - 1] - mean) ** 2;
    }
    return Math.sqrt(variance / count);
  }

  private lastValue(values: number[]): number {
    return values.length > 0 ? values[values.length - 1] : 0;
  }

  snapshot(): NetcodeMetricsSnapshot {
    return {
      rttMs: this.rttMs,
      snapshotRate: this.rate(this.arrivals),
      snapshotJitterMs: this.jitterMs(this.arrivals),
      inputRate: this.rate(this.inputs),
      actionLatencyMs: this.lastValue(this.actionLatencies),
      renderDelayMs: this.renderDelayMs,
      snapshotBytes: this.snapshotBytes,
      parseMs: this.parseMs,
      snapshotHandleMs: this.snapshotHandleMs,
      interpMs: this.interpMs,
      worldSyncMs: this.worldSyncMs,
      cameraQueryMs: this.cameraQueryMs,
      aimQueryMs: this.aimQueryMs,
      colliderCandidates: this.colliderCandidates,
      colliderTests: this.colliderTests,
      mainRenderMs: this.mainRenderMs,
      pipRenderMs: this.pipRenderMs,
      pendingInputs: this.pendingInputs,
      pendingImpulses: this.pendingImpulses,
      pendingActions: this.pendingActions,
      pendingAimFrames: this.pendingAimFrames,
      tankCorrection: this.lastValue(this.corrections),
      turretCorrection: this.lastValue(this.turretCorrections),
      predictorDisabledReason: this.predictorDisabledReason,
      serverTick: this.serverTick,
      serverTickDurationMs: this.serverTickDurationMs,
      serverDroppedMs: this.serverDroppedMs,
      serverDriftMs: this.serverDriftMs,
      outboundBuffered: this.outboundBuffered,
    };
  }
}

export const netcodeMetrics = new NetcodeMetrics();

/** Throttled DOM overlay (F4, dev/test only). */
export class F4Overlay {
  private readonly panel: HTMLElement;
  private lastUpdate = 0;
  private visible = false;

  constructor() {
    this.panel = document.createElement('div');
    this.panel.id = 'netcode-debug';
    this.panel.style.cssText =
      'position:fixed;right:10px;top:10px;z-index:60;background:rgba(8,14,18,0.9);color:#9ff3ff;' +
      'font:11px monospace;padding:8px 10px;border:1px solid rgba(127,212,255,0.35);border-radius:6px;' +
      'white-space:pre;pointer-events:none;display:none;';
    document.body.appendChild(this.panel);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F4') {
        e.preventDefault();
        this.visible = !this.visible;
        this.panel.style.display = this.visible ? 'block' : 'none';
      }
    });
  }

  update(now: number): void {
    if (now - this.lastUpdate < 250 || !this.visible) return;
    this.lastUpdate = now;
    const m = netcodeMetrics.snapshot();
    this.panel.textContent = [
      'NETCODE',
      `rtt: ${m.rttMs.toFixed(0)}ms  delay: ${m.renderDelayMs.toFixed(0)}ms`,
      `snap: ${m.snapshotRate.toFixed(1)}Hz  jitter: ${m.snapshotJitterMs.toFixed(1)}ms`,
      `input: ${m.inputRate.toFixed(1)}Hz  action: ${m.actionLatencyMs.toFixed(0)}ms`,
      `parse: ${m.parseMs.toFixed(2)}ms  handle: ${m.snapshotHandleMs.toFixed(2)}ms`,
      `interp: ${m.interpMs.toFixed(2)}ms  sync: ${m.worldSyncMs.toFixed(2)}ms`,
      `cam: ${m.cameraQueryMs.toFixed(2)}ms  aim: ${m.aimQueryMs.toFixed(2)}ms  coll: ${m.colliderCandidates}`,
      `render: ${m.mainRenderMs.toFixed(2)}ms  pip: ${m.pipRenderMs.toFixed(2)}ms`,
      `pending: d${m.pendingInputs} i${m.pendingImpulses} a${m.pendingActions} t${m.pendingAimFrames}`,
      `corr: tank ${m.tankCorrection.toFixed(2)}m  turret ${m.turretCorrection.toFixed(3)}rad`,
      `server: tick ${m.serverTick}  dur ${m.serverTickDurationMs.toFixed(2)}ms  drop ${m.serverDroppedMs.toFixed(0)}ms  drift ${m.serverDriftMs.toFixed(1)}ms`,
      m.predictorDisabledReason ? `DISABLED: ${m.predictorDisabledReason}` : '',
    ].join('\n');
  }

  dispose(): void {
    this.panel.remove();
  }
}
