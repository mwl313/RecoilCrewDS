import type { MatchRules } from '../../rules/matchRules';
import type { ArenaWorld } from '../arenaWorld';
import { createStaticArenaWorld } from '../arenaWorld';
import { GameplayEventBus } from '../../core/gameplayEventBus';
import { DamageSystem } from '../../damage/damageSystem';
import { RecoilEffect } from '../../effects/recoilEffect';
import { TankImpulseSystem, type TankImpulseWire } from '../../effects/tankImpulseSystem';
import { RadialImpulseEffect } from '../../effects/radialImpulseEffect';
import { ProjectileSystem } from '../../projectiles/projectileSystem';
import { EnemySystem } from '../../enemies/enemySystem';
import { EnemyImpulseController } from '../../enemies/enemyImpulseController';
import { PickupSystem } from '../../pickups/pickupSystem';
import { DropTableResolver } from '../../drops/dropTableResolver';
import { SpawnDirectorRuntime } from '../../spawning/spawnDirectorRuntime';
import { ItemSystem, StatusEffectSystem } from '../../items/itemSystem';
import { TankContactCombat } from '../../combat/tankContactCombat';
import { CapabilitySystem } from '../../items/capabilitySystem';
import { StageDirector } from '../../stage/stageDirector';
import { DEFAULT_STAGE_SEQUENCE } from '../../stage/stageTypes';
import { WaveController } from '../../horde/waveController';
import { HordeDirector, type ResolvedHordeDirector } from '../../horde/hordeDirector';
import { buildSpawnAnchors } from '../../horde/spawnAnchors';
import { SpawnPlanner } from '../../horde/spawnPlanner';
import { hash32 } from '../../mapgen/seed';
import type { MatchState, SimEvent } from '../../types';
import { RoundSystem } from './roundSystem';
import { ObjectiveSystem } from './objectiveSystem';
import { ScoreSystem } from './scoreSystem';
import { ComboSystem } from './comboSystem';
import { ResultSystem } from './resultSystem';
import { createNetcodeOpState, type NetcodeOpState } from '../opLog';

/**
 * Match-scoped context shared by the extracted systems. Systems mutate
 * `state` directly (authoritative simulation) and push typed events in the
 * exact order the legacy Match did.
 */
export interface SystemContext {
  state: MatchState;
  rules: MatchRules;
  events: SimEvent[];
  eventBus: GameplayEventBus;
  world: ArenaWorld;
  round: RoundSystem;
  objective: ObjectiveSystem;
  score: ScoreSystem;
  combo: ComboSystem;
  results: ResultSystem;
  damage: DamageSystem;
  projectiles: ProjectileSystem;
  recoil: RecoilEffect;
  impulses: TankImpulseSystem;
  radialImpulses: RadialImpulseEffect;
  enemyImpulses: EnemyImpulseController;
  /** Unified server op/ack state (inputs + impulses). */
  opState: NetcodeOpState;
  /** Typed tank impulse queue drained by the room. */
  impulseEvents: TankImpulseWire[];
  /** Server simulation tick that produced the current state. */
  simTick: number;
  /** Gunner actionSeq awaiting its authoritative weapon impulse. */
  pendingActionSeq: number | undefined;
  enemies: EnemySystem;
  pickups: PickupSystem;
  drops: DropTableResolver;
  spawnDirector: SpawnDirectorRuntime;
  items: ItemSystem;
  statusEffects: StatusEffectSystem;
  capabilities: CapabilitySystem;
  contact: TankContactCombat;
  stage: StageDirector;
  waves: WaveController;
  horde: HordeDirector | null;
  spawnPlanner: SpawnPlanner;
}

export function pushEvent(
  ctx: SystemContext,
  type: SimEvent['type'],
  x?: number,
  y?: number,
  z?: number,
  extra?: Partial<SimEvent>,
): void {
  ctx.events.push({ type, t: ctx.state.time, x, y, z, ...extra });
}

export function createSystemContext(
  state: MatchState,
  rules: MatchRules,
  events: SimEvent[],
  eventBus = new GameplayEventBus(),
  world: ArenaWorld = createStaticArenaWorld(),
  opState: NetcodeOpState = createNetcodeOpState(),
  impulseEvents: TankImpulseWire[] = [],
  simTick = 0,
  hordeDirector: ResolvedHordeDirector | null = null,
): SystemContext {
  const ctx = {} as SystemContext;
  ctx.state = state;
  ctx.rules = rules;
  ctx.events = events;
  ctx.eventBus = eventBus;
  ctx.world = world;
  ctx.opState = opState;
  ctx.impulseEvents = impulseEvents;
  ctx.simTick = simTick;
  ctx.pendingActionSeq = undefined;
  ctx.damage = new DamageSystem(ctx);
  ctx.projectiles = new ProjectileSystem(ctx);
  ctx.recoil = new RecoilEffect(ctx);
  ctx.impulses = new TankImpulseSystem(ctx);
  ctx.radialImpulses = new RadialImpulseEffect(ctx);
  ctx.enemyImpulses = new EnemyImpulseController(ctx);
  ctx.enemies = new EnemySystem(ctx);
  ctx.pickups = new PickupSystem(ctx);
  ctx.drops = new DropTableResolver(ctx);
  ctx.spawnDirector = new SpawnDirectorRuntime(ctx, rules.spawnDirector);
  ctx.items = new ItemSystem(ctx);
  ctx.statusEffects = new StatusEffectSystem(ctx);
  ctx.capabilities = new CapabilitySystem(state);
  ctx.contact = new TankContactCombat(ctx);
  ctx.stage = new StageDirector(hordeDirector ? hordeDirector.stageSequence : DEFAULT_STAGE_SEQUENCE, eventBus);
  ctx.waves = new WaveController(ctx, (waveId) => ctx.stage.notifyLeaderKilled());
  ctx.horde = hordeDirector ? new HordeDirector(ctx, hordeDirector) : null;
  ctx.spawnPlanner = new SpawnPlanner(
    ctx,
    hash32('spawn-planner', state.matchId),
    buildSpawnAnchors(world).anchors,
  );
  ctx.round = new RoundSystem(ctx);
  ctx.objective = new ObjectiveSystem(ctx);
  ctx.score = new ScoreSystem(ctx);
  ctx.combo = new ComboSystem(ctx);
  ctx.results = new ResultSystem(ctx);
  return ctx;
}
