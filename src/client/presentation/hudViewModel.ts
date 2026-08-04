import type { MatchState, Role } from '../../shared/types';
import { BASE_CONFIG } from '../../shared/config';

/**
 * Safe, typed projection of authoritative/interpolated state + client
 * context for the gameplay HUD. Content bindings may only read these fields
 * (HUD_BINDING_PATHS enforces it at generation time).
 */
export interface HudViewModel {
  role: Role;
  practice: boolean;
  pointerLocked: boolean;
  connection: {
    peerConnected: boolean;
    pingMs: number;
    fps: number;
  };
  match: {
    timeRemaining: number;
    timeUrgent: boolean;
    score: number;
    scoreText: string;
    combo: number;
    comboHot: boolean;
  };
  tank: {
    integrity: number;
    integrityMax: number;
    integrityLow: boolean;
    speed: number;
    grounded: boolean;
    dashReady: boolean;
    dashActive: boolean;
    dashCooling: boolean;
  };
  gunner: {
    jackpot: number;
    jackpotMax: number;
    jackpotReady: boolean;
    chargeRatio: number;
    chargeMax: number;
    cannonCooldown: number;
    cooldownRatio: number;
  };
  prompt: string;
  promptSub: string;
  crosshairVisible: boolean;
  chargeVisible: boolean;
  objective: {
    visible: boolean;
    screenX: number;
    screenY: number;
    label: string;
  };
}

export interface HudProjectionContext {
  role: Role;
  peerConnected: boolean;
  ping: number;
  fps: number;
  pointerLocked: boolean;
  practice: boolean;
  /**
   * Resolved gameplay denominators for presentation (replicated online or
   * local practice rules). Falls back to BASE_CONFIG when absent.
   */
  rules?: {
    maxIntegrity?: number;
    cannonCooldown?: number;
    jackpotChargeTime?: number;
  };
  objective: { x: number; y: number; visible: boolean } | null;
}

export function emptyHudViewModel(): HudViewModel {
  return {
    role: 'driver',
    practice: false,
    pointerLocked: false,
    connection: { peerConnected: false, pingMs: 0, fps: 60 },
    match: { timeRemaining: 90, timeUrgent: false, score: 0, scoreText: '0', combo: 1, comboHot: false },
    tank: {
      integrity: 100,
      integrityMax: 100,
      integrityLow: false,
      speed: 0,
      grounded: true,
      dashReady: true,
      dashActive: false,
      dashCooling: false,
    },
    gunner: {
      jackpot: 0,
      jackpotMax: 100,
      jackpotReady: false,
      chargeRatio: 0,
      chargeMax: 1,
      cannonCooldown: 0,
      cooldownRatio: 0,
    },
    prompt: '',
    promptSub: '',
    crosshairVisible: false,
    chargeVisible: false,
    objective: { visible: false, screenX: 0, screenY: 0, label: '' },
  };
}

/**
 * HudProjector converts authoritative state + client context into the safe
 * view model. It is the ONLY place HUD content learns about MatchState.
 */
export class HudProjector {
  project(state: MatchState, opts: HudProjectionContext): HudViewModel {
    const t = state.tank;
    const remaining = Math.max(0, Math.ceil(state.duration - state.time));
    const jp = state.turret.jackpotReady;
    const maxIntegrity = opts.rules?.maxIntegrity ?? BASE_CONFIG.tank.maxIntegrity;
    const cannonCooldownMax = opts.rules?.cannonCooldown ?? BASE_CONFIG.weapons.cannonCooldown;
    const chargeSeconds = opts.rules?.jackpotChargeTime ?? BASE_CONFIG.weapons.jackpotChargeTime;
    let prompt = '';
    let promptSub = '';
    if (jp) {
      prompt = 'JACKPOT READY';
      promptSub = opts.role === 'driver' ? 'GUNNER — HOLD RIGHT MOUSE TO CHARGE' : 'HOLD RIGHT MOUSE TO CHARGE';
    } else if (state.time < 8) {
      prompt = opts.role === 'driver' ? 'DRIVE · COLLECT SCRAP' : 'FIRE · KILL ENEMIES';
      promptSub = opts.role === 'driver' ? 'WASD + SHIFT + SPACE' : 'LMB MG · RMB CANNON';
    } else if (state.time > 40 && state.truck.active) {
      prompt = 'LOOT TRUCK';
      promptSub = 'DESTROY IT FOR JACKPOT SCRAP';
    }
    if (!opts.pointerLocked && !opts.practice) {
      prompt = 'CLICK TO AIM';
      promptSub = '';
    }
    const objectiveVisible = Boolean(opts.objective?.visible && state.truck.active);
    return {
      role: opts.role,
      practice: opts.practice,
      pointerLocked: opts.pointerLocked,
      connection: {
        peerConnected: opts.peerConnected,
        pingMs: Math.round(opts.ping),
        fps: Math.round(opts.fps),
      },
      match: {
        timeRemaining: remaining,
        timeUrgent: remaining <= 5,
        score: Math.floor(state.stats.score),
        scoreText: Math.floor(state.stats.score).toLocaleString(),
        combo: state.combo.multiplier,
        comboHot: state.combo.multiplier >= 3,
      },
      tank: {
        integrity: t.integrity,
        integrityMax: maxIntegrity,
        integrityLow: t.integrity < 35,
        speed: Math.round(Math.hypot(t.vx, t.vz) * 3.6),
        grounded: t.grounded,
        dashReady: t.dashCooldown <= 0,
        dashActive: t.dashPresentationT > 0,
        dashCooling: t.dashCooldown > 0,
      },
      gunner: {
        jackpot: state.stats.jackpotMeter,
        jackpotMax: 100,
        jackpotReady: jp,
        chargeRatio: Math.min(1, state.turret.chargeT / Math.max(0.001, chargeSeconds)),
        chargeMax: 1,
        cannonCooldown: state.turret.cannonCooldown,
        cooldownRatio: Math.max(0, state.turret.cannonCooldown / Math.max(0.001, cannonCooldownMax)),
      },
      prompt,
      promptSub,
      crosshairVisible: opts.role === 'gunner' || opts.practice,
      chargeVisible: state.turret.chargeT > 0,
      objective: {
        visible: objectiveVisible,
        screenX: opts.objective?.x ?? 0,
        screenY: opts.objective?.y ?? 0,
        label: 'LOOT TRUCK',
      },
    };
  }
}
