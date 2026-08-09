import type { MatchState, Role } from '../../shared/types';
import type { HordeEncounterView, HordeMonsterStageView } from '../../shared/net/protocol';
import { BASE_CONFIG } from '../../shared/config';
import {
  formatCombatDisplayValue,
  toCombatDisplayValue,
} from '../../shared/presentation/combatDisplayUnits';

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
    degraded: boolean;
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
    integrityText: string;
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
  progression: {
    visible: boolean;
    level: number;
    currentXp: number;
    xpForNextLevel: number;
    ratio: number;
    ratioMax: number;
    pendingLevelUps: number;
    upgradePending: boolean;
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
  /** Core Loop 06 M11: stage/wave progression block. */
  stage: {
    phase: string;
    farmingLabel: string;
    waveLabel: string;
    waveActive: boolean;
    leaderHpRatio: number;
    leaderHpMax: number;
    stageClear: boolean;
    gameOver: boolean;
    /** Production monster loop (present only in main-stage modes). */
    monster: {
      level: number;
      phase: 'FARMING' | 'BOSS_INTRO' | 'BOSS_ACTIVE' | 'RESULTS';
      waveTimerLabel: string;
      waveCountdownText: string;
      waveWarning: string;
      waveWarningVisible: boolean;
      elite1: HudEncounterBar;
      elite2: HudEncounterBar;
      boss: HudEncounterBar;
    };
  };
}

export interface HudEncounterBar {
  visible: boolean;
  label: string;
  /** Presentation-only values; authoritative health remains in HordeEncounterView. */
  displayHp: number;
  displayMaxHp: number;
  hpText: string;
  ratio: number;
  ratioMax: number;
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
    progressionEnabled?: boolean;
  };
  objective: { x: number; y: number; visible: boolean } | null;
  stage?: {
    phase: string;
    farmingTimeRemaining: number;
    waveId: number | null;
    leaderHp: number;
    leaderMaxHp: number;
    monster?: HordeMonsterStageView;
  };
}

export function emptyHudViewModel(): HudViewModel {
  return {
    role: 'driver',
    session: { kind: 'multiplayer', showRoleIdentity: true, showPeerStatus: true },
    pointerLocked: false,
    connection: { peerConnected: false, pingMs: 0, fps: 60, degraded: true },
    match: { timeRemaining: 90, timeUrgent: false, score: 0, scoreText: '0', combo: 1, comboHot: false },
    tank: {
      integrity: 100,
      integrityMax: 100,
      integrityText: '1,000 / 1,000',
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
    progression: {
      visible: false,
      level: 1,
      currentXp: 0,
      xpForNextLevel: 1,
      ratio: 0,
      ratioMax: 1,
      pendingLevelUps: 0,
      upgradePending: false,
    },
    prompt: '',
    promptSub: '',
    crosshairVisible: false,
    objective: { visible: false, screenX: 0, screenY: 0, label: '' },
    stage: {
      phase: 'farming1',
      farmingLabel: '',
      waveLabel: '',
      waveActive: false,
      leaderHpRatio: 0,
      leaderHpMax: 1,
      stageClear: false,
      gameOver: false,
      monster: {
        level: 0,
        phase: 'FARMING',
        waveTimerLabel: '',
        waveCountdownText: '',
        waveWarning: '',
        waveWarningVisible: false,
        elite1: emptyEncounterBar(),
        elite2: emptyEncounterBar(),
        boss: emptyEncounterBar(),
      },
    },
  };
}

export function emptyEncounterBar(): HudEncounterBar {
  return { visible: false, label: '', displayHp: 0, displayMaxHp: 10, hpText: '', ratio: 0, ratioMax: 1 };
}

export function encounterBar(row: HordeEncounterView | undefined): HudEncounterBar {
  if (!row) return emptyEncounterBar();
  const ratio = row.maxHp > 0 ? Math.max(0, Math.min(1, row.hp / row.maxHp)) : 0;
  const displayHp = toCombatDisplayValue(Math.max(0, row.hp));
  const displayMaxHp = toCombatDisplayValue(Math.max(1, row.maxHp));
  return {
    visible: row.alive && row.maxHp > 0,
    label: row.label,
    displayHp,
    displayMaxHp,
    hpText: `${formatCombatDisplayValue(Math.max(0, row.hp))} / ${formatCombatDisplayValue(Math.max(1, row.maxHp))}`,
    ratio,
    ratioMax: 1,
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
    const stage = opts.stage;
    const farming = Math.max(0, Math.ceil(stage?.farmingTimeRemaining ?? 0));
    const mm = Math.floor(farming / 60);
    const ss = farming % 60;
    const waveActive = stage !== undefined && stage.waveId !== null;
    const waveLabel =
      stage?.phase === 'bossWave'
        ? 'BOSS WAVE'
        : stage?.phase === 'wave1'
          ? 'WAVE 1'
          : stage?.phase === 'wave2'
            ? 'WAVE 2'
            : stage?.phase === 'clear'
              ? 'STAGE CLEAR'
              : stage?.phase === 'gameOver'
                ? 'GAME OVER'
                : '';
    const leaderHpRatio =
      stage && stage.leaderMaxHp > 0
        ? Math.max(0, Math.min(1, stage.leaderHp / stage.leaderMaxHp))
        : 0;
    const monsterView = stage?.monster;
    const monsterPhase = monsterView?.phase ?? 'FARMING';
    const rem = stage?.farmingTimeRemaining ?? 0;
    const stagePhase = stage?.phase ?? 'farming1';
    const waveCountdown =
      monsterPhase === 'FARMING'
        ? Math.max(
            0,
            Math.ceil(
              stagePhase === 'farming1' || stagePhase === 'wave1'
                ? rem - 120
                : stagePhase === 'farming2' || stagePhase === 'wave2'
                  ? rem - 60
                  : rem,
            ),
          )
        : 0;
    const waveTimerLabel =
      monsterPhase === 'FARMING'
        ? 'TIME UNTIL NEW WAVE'
        : monsterPhase === 'BOSS_INTRO'
          ? 'BOSS INCOMING'
          : '';
    const waveWarning =
      monsterPhase === 'FARMING' && waveCountdown <= 5 && waveCountdown > 0
        ? stagePhase === 'farming1' || stagePhase === 'wave1'
          ? 'WAVE 1 INCOMING'
          : stagePhase === 'farming2' || stagePhase === 'wave2'
            ? 'WAVE 2 INCOMING'
            : 'BOSS INCOMING'
        : '';
    const eliteRows = monsterView?.encounters.filter((e) => e.kind === 'elite') ?? [];
    const aliveElites = eliteRows.filter((e) => e.alive);
    // Default one-elite matches promote the single active elite to the
    // primary bar; two-elite matches keep slot order so each bar stays
    // bound to its own encounter and hides independently on death.
    const elites =
      aliveElites.length <= 1 ? (aliveElites[0] ? [aliveElites[0]] : eliteRows) : eliteRows;
    const boss = monsterView?.encounters.find((e) => e.kind === 'boss');
    const teamProgression = state.teamProgression;
    const progressionVisible = opts.rules?.progressionEnabled ?? teamProgression !== undefined;
    const currentXp = teamProgression?.currentXp ?? 0;
    const xpForNextLevel = Math.max(1, teamProgression?.xpForNextLevel ?? 1);
    return {
      role: opts.role,
      session: opts.session,
      pointerLocked: opts.pointerLocked,
      connection: {
        peerConnected: opts.peerConnected,
        pingMs: Math.round(opts.ping),
        fps: Math.round(opts.fps),
        degraded: !opts.peerConnected || opts.ping >= 180,
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
        integrityText: `${formatCombatDisplayValue(t.integrity)} / ${formatCombatDisplayValue(maxIntegrity)}`,
        integrityLow: t.integrity / Math.max(1, maxIntegrity) < .35,
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
      progression: {
        visible: progressionVisible,
        level: teamProgression?.level ?? 1,
        currentXp,
        xpForNextLevel,
        ratio: Math.max(0, Math.min(1, currentXp / xpForNextLevel)),
        ratioMax: 1,
        pendingLevelUps: teamProgression?.pendingLevelUps ?? 0,
        upgradePending: (teamProgression?.pendingLevelUps ?? 0) > 0 || state.matchFlow === 'upgradeSelection',
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
      stage: {
        phase: stage?.phase ?? 'farming1',
        farmingLabel: !stage ? '' : waveActive ? '' : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`,
        waveLabel,
        waveActive,
        leaderHpRatio,
        leaderHpMax: 1,
        stageClear: stage?.phase === 'clear',
        gameOver: stage?.phase === 'gameOver',
        monster: {
          level: monsterView?.level ?? 0,
          phase: monsterPhase,
          waveTimerLabel,
          waveCountdownText:
            waveTimerLabel && monsterPhase === 'FARMING'
              ? waveCountdown > 0
                ? `${String(Math.floor(waveCountdown / 60)).padStart(2, '0')}:${String(waveCountdown % 60).padStart(2, '0')}`
                : '00:00'
              : '',
          waveWarning,
          waveWarningVisible: waveWarning !== '',
          elite1: encounterBar(elites[0]),
          elite2: encounterBar(elites[1]),
          boss: encounterBar(boss),
        },
      },
    };
  }
}
