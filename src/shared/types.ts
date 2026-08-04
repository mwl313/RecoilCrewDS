import type { MovementRulesBlock } from './stats/rulesRevision';
import type { DamageSource } from './damage/damageTypes';
import type { SpawnOwnership } from './horde/spawnOwnership';
import type { EnemyActionCue } from './animation/enemyActionCue';
import type {
  MatchFlowState,
  ProgressionSelectionState,
  RelicRollResult,
  TeamProgressionState,
  TreasureChestState,
} from './progression/progressionTypes';

export type Role = 'driver' | 'gunner';
export type Phase = 'lobby' | 'countdown' | 'running' | 'results';

export interface DriverInput {
  throttle: number; // -1 .. 1 (reverse .. forward)
  steer: number; // -1 .. 1
  /** One-shot action edge: true only for the sequenced frame that latched it. */
  dashPressed: boolean;
  /** One-shot action edge: true only for the sequenced frame that latched it. */
  jumpPressed: boolean;
}

export interface GunnerInput {
  aimYaw: number; // desired turret yaw, world radians
  aimPitch: number; // desired pitch, radians
  /** Generic loadout actions (Phase 3+, sole wire contract since Phase 6). */
  primary: boolean;
  secondary: boolean;
  /** Deprecated legacy field (Jackpot removed); retained only for old fixtures. */
  ability?: boolean;
}

export interface PlayerInput {
  seq: number;
  driver?: DriverInput;
  gunner?: GunnerInput;
  ts: number;
}

export type EnemyType = 'scrapBug' | 'rammer' | 'gunTower' | 'lootTruck';

export interface EnemyState {
  id: number;
  type: EnemyType;
  /** Definition id used at spawn (defaults to the type's canonical def). */
  defId?: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  state: string;
  stateT: number;
  aimYaw: number;
  speed: number;
  alive: boolean;
  telegraph: number; // >0 while telegraphing
  flash: number; // visual flash timer
  spawnT: number;
  hitCd?: number;
  shotsFired?: number;
  /** Impulse knockback motion (authoritative, replicated). */
  impulseVx?: number;
  impulseVy?: number;
  impulseVz?: number;
  impulseGrounded?: boolean;
  lastImpulseSource?: DamageSource;
  lastImpulseT?: number;
  /** Core Loop 06 population ownership (ambient/wave/boss cohort). */
  ownership?: SpawnOwnership;
  /** Animation07: explicit presentation profile id (content-driven). */
  presentationProfileId?: string;
  /** Animation07: optional compact authoritative action cue. */
  actionCue?: EnemyActionCue;
}

export type ScrapKind = 'normal' | 'heavy';

export interface PickupState {
  id: number;
  kind: ScrapKind;
  x: number;
  y: number;
  z: number;
  life: number;
  collected: boolean;
}

export interface XpShardState {
  id: number;
  value: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  collected: boolean;
}

export interface ShellState {
  id: number;
  kind: 'cannon' | 'tower';
  /** Weapon that fired this shell (per-weapon knockback stats). */
  weaponId?: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  /** Combat 05: charge ratio at firing time (0 = normal cannon). */
  chargeRatio?: number;
  /** Effective combat payload captured at firing time (immutable in flight). */
  combat?: ShellCombatPayload;
  /** Presentation scale for the shell/impact (charge-scaled). */
  visualScale?: number;
}

export interface ShellCombatPayload {
  damage: number;
  splashRadius: number;
  knockbackMax: number;
  knockbackMin: number;
  knockbackVertical: number;
  knockbackRadiusMultiplier: number;
  knockbackFalloffExponent: number;
}

export interface BarrelState {
  id: number;
  x: number;
  z: number;
  exploded: boolean;
  fuseT: number;
  flash: number;
  hp: number;
}

export interface TruckState {
  active: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  waypoint: number;
  escaped: boolean;
  sirenT: number;
}

export interface TankState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  yawVel: number;
  pitch: number;
  roll: number;
  integrity: number;
  /** Authoritative time until the next dash may be accepted (seconds). */
  dashCooldown: number;
  /** Short presentation window after an accepted dash (seconds). */
  dashPresentationT: number;
  /** Authoritative Dash contact-damage window (seconds remaining). */
  dashDamageT: number;
  shieldedT: number;
  deadT: number;
  grounded: boolean;
  drift: boolean;
  /** Landing momentum grace window (seconds); affects grip while > 0. */
  landingGripT?: number;
  prevOnRamp?: boolean;
}

export interface TurretState {
  yaw: number; // chassis-local yaw (chassis yaw added exactly once at world muzzle)
  pitch: number;
  /** Combat 05 cannon hold state (secondary button, relic-gated). */
  cannonHeld: boolean;
  cannonHoldT: number;
  cannonChargeRatio: number;
  cannonChargeFull: boolean;
  cannonCooldown: number;
  cannonFlash: number;
  mgCooldown: number;
  mgFiring: boolean;
}

export interface ComboState {
  multiplier: number;
  points: number;
  lastDriverT: number;
  lastGunnerT: number;
  lastAnyT: number;
  best: number;
}

/** Authoritative match build state (replicated, resets per match). */
export interface BuildState {
  capabilities: string[];
}

export interface StatsState {
  score: number;
  chargedCannonShots: number;
  fullChargeShots: number;
  kills: number;
  scrapCollected: number;
  links: number;
  dashKills: number;
  dodgeCount: number;
  wipeouts: number;
  bestCombo: number;
  anyContribution: boolean;
}

export type ModifierId =
  | 'none'
  | 'doubleBarrel'
  | 'soapTracks'
  | 'moonYard'
  | 'volatileInventory'
  | 'scrapMagnet'
  | 'overclocked';

export interface MatchConfig {
  timeScale: number;
  modifier: ModifierId;
  cannonCooldown: number;
  cannonBurst: number;
  recoilImpulse: number;
  grip: number;
  gravity: number;
  barrelRadius: number;
  pickupMagnet: number;
  pickupLife: number;
  mgRate: number;
  maxBugs: number;
  maxRammers: number;
  maxTowers: number;
}

export interface MatchState {
  matchId: string;
  time: number;
  duration: number;
  phase: Phase;
  tank: TankState;
  turret: TurretState;
  combo: ComboState;
  build: BuildState;
  /** Progression08: authoritative match flow gate. */
  matchFlow: MatchFlowState;
  /** Progression08: team XP/level/relic state (replicated). */
  teamProgression: TeamProgressionState;
  /** Progression08: treasure chest entities (replicated). */
  chests: TreasureChestState[];
  /** Progression08: XP shard pickups (replicated). */
  xpShards: XpShardState[];
  stats: StatsState;
  enemies: EnemyState[];
  pickups: PickupState[];
  shells: ShellState[];
  barrels: BarrelState[];
  truck: TruckState;
  respawnT: number;
  countdown: number;
  modifier: ModifierId;
  nextEnemyId: number;
  nextPickupId: number;
  nextShellId: number;
  nextXpShardId: number;
  nextChestId: number;
}

export interface MatchResults {
  score: number;
  bestCombo: number;
  chargedCannonShots: number;
  fullChargeShots: number;
  kills: number;
  scrapCollected: number;
  links: number;
  wipeouts: number;
  grade: string;
  title: string;
  modifier: ModifierId;
}

export type SimEventType =
  | 'shot'
  | 'jump'
  | 'dash'
  | 'score'
  | 'mgHit'
  | 'kill'
  | 'barrelExplode'
  | 'chainExplode'
  | 'enemyExplosion'
  | 'pickup'
  | 'recoil'
  | 'wipeout'
  | 'respawn'
  | 'truckSpawn'
  | 'truckEscape'
  | 'rammerTelegraph'
  | 'towerFire'
  | 'link'
  | 'comboChange'
  | 'hit'
  | 'crash'
  | 'assist'
  | 'dashContact'
  | 'roadkillContact'
  | 'tankImpulse';

export interface SimEvent {
  type: SimEventType;
  t: number;
  x?: number;
  y?: number;
  z?: number;
  tx?: number;
  ty?: number;
  tz?: number;
  id?: number;
  kind?: string;
  value?: number;
  label?: string;
  yaw?: number;
  /** Gunner actionSeq for discrete action presentation suppression. */
  actionSeq?: number;
  /** Tank impulse sequencing (typed impulse events). */
  impulseSeq?: number;
  opSeq?: number;
  /** Combat 05: charge ratio of the fired cannon shell. */
  chargeRatio?: number;
  source?: string;
}

export interface ClientState {
  role: Role;
  roomCode: string;
  matchId: string;
}

export interface PeerInfo {
  connected: boolean;
  role: Role;
  action: string;
  since: number;
}

export interface SnapshotMessage {
  t: 'snapshot';
  seq: number;
  serverTime: number;
  serverTick: number;
  lastProcessedDriverInputSeq: number;
  lastProcessedGunnerInputSeq: number;
  state: MatchState;
  /** Phase 2: reliable rules metadata (additive). */
  rulesRevision?: number;
  movementRulesRevision?: number;
  movement?: MovementRulesBlock;
}

export interface EventMessage {
  t: 'event';
  event: SimEvent;
}

export interface ResultsMessage {
  t: 'results';
  results: MatchResults;
  rematch: { driver: boolean; gunner: boolean; modifier: ModifierId };
}
