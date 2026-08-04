import type { MatchState, Role } from '../../shared/types';
import { BASE_CONFIG } from '../../shared/config';

/**
 * Safe, typed projection of authoritative/interpolated state + client
 * context for the gameplay HUD. Content bindings may only read these fields
 * (HUD_BINDING_PATHS enforces it at generation time).
 */
export interface HudViewModel {
  role: Role;
  session: {
    kind: 'multiplayer' | 'singlePlayer';
    showRoleIdentity: boolean;
    showPeerStatus: boolean;
  };
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
    cannonCooldown: number;
    cooldownRatio: number;
    chargeUnlocked: boolean;
    chargeHeld: boolean;
    chargeRatio: number;
    chargeFull: boolean;
    chargeMax: number;
  };
  /** Local predicted charge (same-frame for Gunner/Single Player). */
  localCharge?: { unlocked: boolean; held: boolean; ratio: number; full: boolean };
  prompt: string;
  promptSub: string;
  crosshairVisible: boolean;
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
  session: {
    kind: 'multiplayer' | 'singlePlayer';
    showRoleIdentity: boolean;
    showPeerStatus: boolean;
  };
  /** Local predicted charge (same-frame for Gunner/Single Player). */
  localCharge?: { unlocked: boolean; held: boolean; ratio: number; full: boolean };
  /**
   * Resolved gameplay denominators for presentation (replicated online or
   * local Single Player rules). Falls back to BASE_CONFIG when absent.
   */
  rules?: {
    maxIntegrity?: number;
    cannonCooldown?: number;
    chargeTapMaxSeconds?: number;
    chargeFullSeconds?: number;
  };
  objective: { x: number; y: number; visible: boolean } | null;
}

export function emptyHudViewModel(): HudViewModel {
  return {
    role: 'driver',
    session: { kind: 'multiplayer', showRoleIdentity: true, showPeerStatus: true },
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
      cannonCooldown: 0,
      cooldownRatio: 0,
      chargeUnlocked: false,
      chargeHeld: false,
      chargeRatio: 0,
      chargeFull: false,
      chargeMax: 1,
    },
    prompt: '',
    promptSub: '',
    crosshairVisible: false,
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
    const single = opts.session.kind === 'singlePlayer';
    const remaining = Math.max(0, Math.ceil(state.duration - state.time));
    const chargeUnlocked = state.build.capabilities.includes('cannon.charge');
    const local = opts.localCharge;
    const chargeHeld = local?.held ?? state.turret.cannonHeld;
    const chargeRatio = local?.ratio ?? state.turret.cannonChargeRatio;
    const chargeFull = local?.full ?? (chargeUnlocked && state.turret.cannonChargeFull);
    const maxIntegrity = opts.rules?.maxIntegrity ?? BASE_CONFIG.tank.maxIntegrity;
    const cannonCooldownMax = opts.rules?.cannonCooldown ?? BASE_CONFIG.weapons.cannonCooldown;
    let prompt = '';
    let promptSub = '';
    if (chargeFull) {
      prompt = 'CHARGE READY';
      promptSub = single ? 'HOLD RIGHT MOUSE TO CHARGE' : opts.role === 'driver' ? 'GUNNER — HOLD RIGHT MOUSE TO CHARGE' : 'HOLD RIGHT MOUSE TO CHARGE';
    } else if (chargeUnlocked && chargeHeld) {
      prompt = 'HOLD TO CHARGE';
      promptSub = 'RELEASE TO FIRE';
    } else if (state.time < 8) {
      prompt = single ? 'DRIVE · AIM · FIRE' : opts.role === 'driver' ? 'DRIVE · COLLECT SCRAP' : 'FIRE · KILL ENEMIES';
      promptSub = single ? 'WASD · SHIFT · SPACE · LMB · RMB' : opts.role === 'driver' ? 'WASD + SHIFT + SPACE' : 'LMB MG · RMB CANNON';
    } else if (state.time > 40 && state.truck.active) {
      prompt = 'LOOT TRUCK';
      promptSub = 'DESTROY IT FOR LOOT SCRAP';
    }
    if (!opts.pointerLocked) {
      prompt = 'CLICK TO AIM';
      promptSub = '';
    }
    const objectiveVisible = Boolean(opts.objective?.visible && state.truck.active);
    return {
      role: opts.role,
      session: opts.session,
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
        cannonCooldown: state.turret.cannonCooldown,
        cooldownRatio: Math.max(0, state.turret.cannonCooldown / Math.max(0.001, cannonCooldownMax)),
        chargeUnlocked,
        chargeHeld,
        chargeRatio,
        chargeFull,
        chargeMax: 1,
      },
      prompt,
      promptSub,
      crosshairVisible: single || opts.role === 'gunner',
      objective: {
        visible: objectiveVisible,
        screenX: opts.objective?.x ?? 0,
        screenY: opts.objective?.y ?? 0,
        label: 'LOOT TRUCK',
      },
    };
  }
}
