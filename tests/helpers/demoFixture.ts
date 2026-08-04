/**
 * Phase 0 deterministic Demo regression harness.
 *
 * Runs the authoritative `Match` simulation with a fixed-seed RNG and
 * scripted Driver/Gunner inputs, then captures canonical checkpoints that
 * later refactor phases must reproduce exactly.
 *
 * Canonicalization rules (per REFACTOR_03 §5):
 * - wall-clock time is stripped (`matchId`, event `t` fields);
 * - client-only presentation is stripped (pitch/roll, flash timers,
 *   cannonFlash, mgFiring, sirenT, event positions/labels);
 * - unstable ordering is normalized (entity arrays sorted by id);
 * - all floats are rounded to a fixed precision.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { GAME } from '../../src/shared/config';
import { clamp, wrapAngle } from '../../src/shared/math';
import { Match } from '../../src/shared/sim/match';
import type {
  DriverInput,
  EnemyState,
  GunnerInput,
  MatchResults,
  MatchState,
  ModifierId,
  SimEvent,
} from '../../src/shared/types';

export const DEMO_SEED = 20260802;
export const DEMO_DT = 1 / 30;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(HERE, '../fixtures');
export const GOLDEN_PATH = path.join(FIXTURES_DIR, 'demo-golden.json');

/** Deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Run a function with a deterministic `Math.random`, restoring afterwards. */
export function withSeededRandom<T>(seed: number, fn: () => T): T {
  const original = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

export function round(value: number, dp = 6): number {
  // toFixed() normalizes -0 to "0"; keep the in-memory canonical state
  // identical to the serialized golden (isDeepStrictEqual distinguishes -0).
  const rounded = Number(value.toFixed(dp));
  return rounded === 0 ? 0 : rounded;
}

export interface CanonicalTank {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  yaw: number; yawVel: number;
  integrity: number; dashCooldown: number; dashPresentationT: number; dashDamageT: number;
  shieldedT: number; deadT: number; grounded: boolean; drift: boolean;
  prevOnRamp: boolean;
}

export interface CanonicalTurret {
  yaw: number; pitch: number; cannonHeld: boolean; cannonHoldT: number;
  cannonChargeRatio: number; cannonChargeFull: boolean; chargeT: number;
  cannonCooldown: number; mgCooldown: number;
  jackpotReady: boolean; jackpotCooldown: number;
}

export interface CanonicalEnemy {
  id: number; type: EnemyState['type']; x: number; y: number; z: number;
  yaw: number; hp: number; maxHp: number; state: string; stateT: number;
  aimYaw: number; speed: number; alive: boolean; telegraph: number;
  spawnT: number; hitCd: number | null; shotsFired: number | null;
}

export interface CanonicalPickup {
  id: number; kind: string; x: number; y: number; z: number;
  life: number; collected: boolean;
}

export interface CanonicalShell {
  id: number; kind: string; x: number; y: number; z: number;
  vx: number; vy: number; vz: number; life: number;
}

export interface CanonicalBarrel {
  id: number; x: number; z: number; exploded: boolean; fuseT: number; hp: number;
}

export interface CanonicalTruck {
  active: boolean; x: number; y: number; z: number; yaw: number;
  hp: number; waypoint: number; escaped: boolean;
}

export interface CanonicalState {
  time: number; duration: number; phase: string; modifier: string; countdown: number;
  tank: CanonicalTank;
  turret: CanonicalTurret;
  combo: { multiplier: number; points: number; lastDriverT: number; lastGunnerT: number; lastAnyT: number; best: number };
  build: { capabilities: string[] };
  stats: {
    score: number; jackpotMeter: number; jackpotFired: number; kills: number;
    scrapCollected: number; links: number; dashKills: number; dodgeCount: number;
    wipeouts: number; bestCombo: number; anyContribution: boolean;
  };
  enemies: CanonicalEnemy[];
  pickups: CanonicalPickup[];
  shells: CanonicalShell[];
  barrels: CanonicalBarrel[];
  truck: CanonicalTruck;
}

export interface CanonicalEvent {
  type: SimEvent['type'];
  kind?: string;
  id?: number;
  value?: number;
}

export interface CanonicalResults {
  score: number; bestCombo: number; jackpotFired: number; kills: number;
  scrapCollected: number; links: number; wipeouts: number;
  grade: string; title: string; modifier: string;
}

export interface DemoCheckpoint {
  label: string;
  simTime: number;
  state: CanonicalState;
}

export interface DemoFixtureOutput {
  schemaVersion: 1;
  seed: number;
  modifier: string;
  duration: number;
  checkpoints: DemoCheckpoint[];
  results: CanonicalResults;
  eventCounts: Record<string, number>;
  eventTrace: CanonicalEvent[];
}

export function canonicalizeState(s: MatchState): CanonicalState {
  const enemies: CanonicalEnemy[] = [...s.enemies]
    .sort((a, b) => a.id - b.id)
    .map((e) => ({
      id: e.id,
      type: e.type,
      x: round(e.x), y: round(e.y), z: round(e.z),
      yaw: round(e.yaw),
      hp: round(e.hp), maxHp: round(e.maxHp),
      state: e.state, stateT: round(e.stateT),
      aimYaw: round(e.aimYaw), speed: round(e.speed), alive: e.alive,
      telegraph: round(e.telegraph), spawnT: round(e.spawnT),
      hitCd: e.hitCd === undefined ? null : round(e.hitCd),
      shotsFired: e.shotsFired === undefined ? null : round(e.shotsFired),
    }));
  const pickups: CanonicalPickup[] = [...s.pickups]
    .sort((a, b) => a.id - b.id)
    .map((p) => ({
      id: p.id, kind: p.kind,
      x: round(p.x), y: round(p.y), z: round(p.z),
      life: round(p.life), collected: p.collected,
    }));
  const shells: CanonicalShell[] = [...s.shells]
    .sort((a, b) => a.id - b.id)
    .map((sh) => ({
      id: sh.id, kind: sh.kind,
      x: round(sh.x), y: round(sh.y), z: round(sh.z),
      vx: round(sh.vx), vy: round(sh.vy), vz: round(sh.vz), life: round(sh.life),
    }));
  const barrels: CanonicalBarrel[] = [...s.barrels]
    .sort((a, b) => a.id - b.id)
    .map((b) => ({
      id: b.id, x: round(b.x), z: round(b.z),
      exploded: b.exploded, fuseT: round(b.fuseT), hp: round(b.hp),
    }));
  return {
    time: round(s.time),
    duration: s.duration,
    phase: s.phase,
    modifier: s.modifier,
    countdown: round(s.countdown),
    tank: {
      x: round(s.tank.x), y: round(s.tank.y), z: round(s.tank.z),
      vx: round(s.tank.vx), vy: round(s.tank.vy), vz: round(s.tank.vz),
      yaw: round(s.tank.yaw), yawVel: round(s.tank.yawVel),
      integrity: round(s.tank.integrity),
      dashCooldown: round(s.tank.dashCooldown),
      dashPresentationT: round(s.tank.dashPresentationT),
      dashDamageT: round(s.tank.dashDamageT),
      shieldedT: round(s.tank.shieldedT), deadT: round(s.tank.deadT),
      grounded: s.tank.grounded, drift: s.tank.drift,
      prevOnRamp: s.tank.prevOnRamp ?? false,
    },
    turret: {
      yaw: round(s.turret.yaw), pitch: round(s.turret.pitch),
      cannonHeld: s.turret.cannonHeld,
      cannonHoldT: round(s.turret.cannonHoldT),
      cannonChargeRatio: round(s.turret.cannonChargeRatio),
      cannonChargeFull: s.turret.cannonChargeFull,
      chargeT: round(s.turret.chargeT),
      cannonCooldown: round(s.turret.cannonCooldown),
      mgCooldown: round(s.turret.mgCooldown),
      jackpotReady: s.turret.jackpotReady,
      jackpotCooldown: round(s.turret.jackpotCooldown),
    },
    combo: {
      multiplier: s.combo.multiplier,
      points: round(s.combo.points),
      lastDriverT: round(s.combo.lastDriverT),
      lastGunnerT: round(s.combo.lastGunnerT),
      lastAnyT: round(s.combo.lastAnyT),
      best: s.combo.best,
    },
    build: {
      capabilities: [...s.build.capabilities],
    },
    stats: {
      score: s.stats.score,
      jackpotMeter: round(s.stats.jackpotMeter),
      jackpotFired: s.stats.jackpotFired,
      kills: s.stats.kills,
      scrapCollected: s.stats.scrapCollected,
      links: s.stats.links,
      dashKills: s.stats.dashKills,
      dodgeCount: s.stats.dodgeCount,
      wipeouts: s.stats.wipeouts,
      bestCombo: s.stats.bestCombo,
      anyContribution: s.stats.anyContribution,
    },
    enemies,
    pickups,
    shells,
    barrels,
    truck: {
      active: s.truck.active,
      x: round(s.truck.x), y: round(s.truck.y), z: round(s.truck.z),
      yaw: round(s.truck.yaw), hp: round(s.truck.hp),
      waypoint: s.truck.waypoint, escaped: s.truck.escaped,
    },
  };
}

export function canonicalizeEvent(ev: SimEvent): CanonicalEvent {
  const out: CanonicalEvent = { type: ev.type };
  if (ev.kind !== undefined) out.kind = ev.kind;
  if (ev.id !== undefined) out.id = ev.id;
  if (ev.value !== undefined) out.value = round(ev.value, 3);
  return out;
}

export function canonicalizeResults(r: MatchResults): CanonicalResults {
  return {
    score: r.score,
    bestCombo: r.bestCombo,
    jackpotFired: r.jackpotFired,
    kills: r.kills,
    scrapCollected: r.scrapCollected,
    links: r.links,
    wipeouts: r.wipeouts,
    grade: r.grade,
    title: r.title,
    modifier: r.modifier,
  };
}

/** Scripted Driver input: drive toward the nearest pickup, dash on a rhythm. */
export function scriptedDriver(state: MatchState, t: number): DriverInput {
  let target: { x: number; z: number } | null = null;
  for (const p of state.pickups) {
    if (p.collected) continue;
    const d = Math.hypot(p.x - state.tank.x, p.z - state.tank.z);
    if (d < 60 && (!target || d < Math.hypot(target.x - state.tank.x, target.z - state.tank.z))) {
      target = p;
    }
  }
  let steer = Math.sin(t / 2.4) * 0.65;
  if (target) {
    const yawTo = Math.atan2(target.x - state.tank.x, target.z - state.tank.z);
    steer = clamp(wrapAngle(yawTo - state.tank.yaw) * 1.8, -1, 1);
  }
  return {
    throttle: 0.85,
    steer,
    dashPressed: t % 8 < DEMO_DT,
    jumpPressed: t % 6 < DEMO_DT,
  };
}

/**
 * Scripted Gunner input: aim at the nearest non-truck enemy (chassis-local
 * yaw per the current wire contract), fire the MG on a rhythm, fire the
 * cannon on cooldown edges, charge JACKPOT when ready.
 */
export function scriptedGunner(state: MatchState, t: number, lastCannonSent: boolean): { input: GunnerInput; cannonSent: boolean } {
  let target: EnemyState | null = null;
  for (const e of state.enemies) {
    if (!e.alive || e.type === 'lootTruck') continue;
    if (!target || Math.hypot(e.x - state.tank.x, e.z - state.tank.z) < Math.hypot(target.x - state.tank.x, target.z - state.tank.z)) {
      target = e;
    }
  }
  let aimYaw = wrapAngle(state.tank.yaw + Math.PI / 2);
  if (target) {
    aimYaw = wrapAngle(Math.atan2(target.x - state.tank.x, target.z - state.tank.z) - state.tank.yaw);
  }
  const ready = state.turret.cannonCooldown <= 0;
  const cannon = ready && !lastCannonSent;
  return {
    input: {
      aimYaw,
      aimPitch: 0.05,
      primary: t % 3 < 2,
      secondary: cannon,
      ability: state.turret.jackpotReady,
    },
    cannonSent: ready,
  };
}

/**
 * Step a Match with the scripted Driver/Gunner inputs. The caller must run
 * this inside `withSeededRandom` (or an equivalent) for determinism.
 */
export function stepScriptedMatch(match: Match, seconds: number): void {
  const steps = Math.round(seconds / DEMO_DT);
  let lastCannonSent = false;
  for (let i = 0; i < steps; i++) {
    const state = match.state;
    match.setDriverInput(scriptedDriver(state, state.time));
    const gunner = scriptedGunner(state, state.time, lastCannonSent);
    lastCannonSent = gunner.cannonSent;
    match.setGunnerInput(gunner.input);
    match.step(DEMO_DT);
    match.takeEvents();
  }
}

export interface RunOptions {
  seed?: number;
  modifier?: ModifierId;
  /** Checkpoint capture times. Overridable for focused tests. */
  checkpointTimes?: { t10?: number; t30?: number; lootTruckWindow?: number; jackpotWindow?: number };
}

/**
 * Run the deterministic Demo and capture canonical checkpoints:
 * initial, 10s, 30s, Loot Truck window (t=44), JACKPOT window (t=60),
 * completion, results, and rematch reset.
 */
export function runDemoFixture(options: RunOptions = {}): DemoFixtureOutput {
  const seed = options.seed ?? DEMO_SEED;
  const modifier = options.modifier ?? 'none';
  const times = {
    t10: options.checkpointTimes?.t10 ?? 10,
    t30: options.checkpointTimes?.t30 ?? 30,
    lootTruckWindow: options.checkpointTimes?.lootTruckWindow ?? 44,
    jackpotWindow: options.checkpointTimes?.jackpotWindow ?? 60,
  };
  return withSeededRandom(seed, () => {
    const match = new Match('demo-golden', modifier);
    const checkpoints: DemoCheckpoint[] = [];
    const eventTrace: CanonicalEvent[] = [];
    const captured = new Set<string>();
    const addCheckpoint = (label: string) => {
      checkpoints.push({ label, simTime: round(match.state.time), state: canonicalizeState(match.state) });
    };

    addCheckpoint('initial');
    const totalSteps = Math.round(GAME.roundDuration / DEMO_DT);
    let lastCannonSent = false;
    for (let i = 0; i < totalSteps; i++) {
      const state = match.state;
      const t = state.time;
      match.setDriverInput(scriptedDriver(state, t));
      const gunner = scriptedGunner(state, t, lastCannonSent);
      lastCannonSent = gunner.cannonSent;
      match.setGunnerInput(gunner.input);
      match.step(DEMO_DT);
      for (const ev of match.takeEvents()) eventTrace.push(canonicalizeEvent(ev));

      const now = match.state.time;
      if (now >= times.t10 && !captured.has('t10')) { captured.add('t10'); addCheckpoint('t10'); }
      if (now >= times.t30 && !captured.has('t30')) { captured.add('t30'); addCheckpoint('t30'); }
      if (now >= times.lootTruckWindow && !captured.has('lootTruckWindow')) {
        captured.add('lootTruckWindow'); addCheckpoint('lootTruckWindow');
      }
      if (now >= times.jackpotWindow && !captured.has('jackpotWindow')) {
        captured.add('jackpotWindow'); addCheckpoint('jackpotWindow');
      }
      if (match.state.phase === 'results') {
        addCheckpoint('completion');
        break;
      }
    }

    // Safety net: absorb tiny floating-point summation variance across
    // environments so the fixture always reaches the results transition.
    for (let guard = 0; guard < 8 && match.state.phase !== 'results'; guard++) {
      match.setDriverInput(scriptedDriver(match.state, match.state.time));
      match.setGunnerInput(scriptedGunner(match.state, match.state.time, lastCannonSent).input);
      match.step(DEMO_DT);
      for (const ev of match.takeEvents()) eventTrace.push(canonicalizeEvent(ev));
      if ((match.state.phase as string) === 'results') {
        addCheckpoint('completion');
      }
    }

    if (!match.results) {
      throw new Error('demo fixture did not reach results; duration or phase logic changed');
    }

    // Rematch reset: a fresh match in the same (seeded) world must equal the
    // initial checkpoint.
    const rematch = new Match('demo-rematch', modifier);
    checkpoints.push({ label: 'rematchReset', simTime: 0, state: canonicalizeState(rematch.state) });

    const eventCounts: Record<string, number> = {};
    for (const ev of eventTrace) eventCounts[ev.type] = (eventCounts[ev.type] ?? 0) + 1;

    return {
      schemaVersion: 1,
      seed,
      modifier,
      duration: GAME.roundDuration,
      checkpoints,
      results: canonicalizeResults(match.results),
      eventCounts,
      eventTrace,
    };
  });
}

export function loadGolden(): DemoFixtureOutput {
  if (!existsSync(GOLDEN_PATH)) {
    throw new Error(`golden fixture missing: ${GOLDEN_PATH} — run \`npm run demo:write\` first`);
  }
  return JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as DemoFixtureOutput;
}

export function saveGolden(output: DemoFixtureOutput): void {
  mkdirSync(FIXTURES_DIR, { recursive: true });
  writeFileSync(GOLDEN_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
}

export function verifyGolden(output: DemoFixtureOutput): boolean {
  return isDeepStrictEqual(output, loadGolden());
}
