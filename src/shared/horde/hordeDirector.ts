import type { ContentPack } from '../content/contentPack';
import type {
  BossWaveDefinition,
  EnemyLodPolicyDefinition,
  FarmingPhaseDefinition,
  HordeDirectorDefinition,
  HordeNavigationPolicyDefinition,
  HordeReplicationPolicyDefinition,
  PopulationLimitsDefinition,
  RewardTableDefinition,
  SpawnAnchorPolicyDefinition,
  SpawnPackDefinition,
  StageSequenceDefinition,
  WaveDefinition,
} from '../content/schemas/horde';
import { pushEvent, type SystemContext } from '../sim/systems/systemContext';
import type { StageEvent } from '../stage/stageTypes';
import { PopulationManager, type PopulationTally } from './populationManager';
import type { SpawnOwnership } from './spawnOwnership';

export interface ResolvedHordeDirector {
  def: HordeDirectorDefinition;
  stageSequence: StageSequenceDefinition;
  farmingPhases: FarmingPhaseDefinition[];
  limits: PopulationLimitsDefinition;
  packs: Map<string, SpawnPackDefinition>;
  waves: Map<string, WaveDefinition>;
  bossWave: BossWaveDefinition;
  rewardTables: Map<string, RewardTableDefinition>;
  policies: {
    anchor: SpawnAnchorPolicyDefinition;
    navigation: HordeNavigationPolicyDefinition;
    lod: EnemyLodPolicyDefinition;
    replication: HordeReplicationPolicyDefinition;
  };
}

export function resolveHordeDirector(pack: ContentPack, def: HordeDirectorDefinition): ResolvedHordeDirector {
  const rewardTableIds = new Set<string>();
  for (const id of def.waveIds) rewardTableIds.add(pack.getWave(id).rewardTableId);
  rewardTableIds.add(pack.getBossWave(def.bossWaveId).rewardTableId);
  return {
    def,
    stageSequence: pack.getStageSequence(def.stageSequenceId),
    farmingPhases: def.farmingPhaseIds.map((id) => pack.getFarmingPhase(id)),
    limits: pack.getPopulationLimits(def.limitsId),
    packs: new Map(def.packIds.map((id) => [id, pack.getSpawnPack(id)])),
    waves: new Map(def.waveIds.map((id) => [id, pack.getWave(id)])),
    bossWave: pack.getBossWave(def.bossWaveId),
    rewardTables: new Map([...rewardTableIds].map((id) => [id, pack.getRewardTable(id)])),
    policies: {
      anchor: pack.getSpawnAnchorPolicy(def.spawnAnchorPolicyId),
      navigation: pack.getHordeNavigationPolicy(def.navigationPolicyId),
      lod: pack.getEnemyLodPolicy(def.lodPolicyId),
      replication: pack.getHordeReplicationPolicy(def.replicationPolicyId),
    },
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function deterministicOffset(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/**
 * HordeDirector interprets the stage phase, accumulates the spawn budget,
 * selects data-driven packs, and opens/reinforces waves through
 * WaveController. It never owns stage progression.
 */
export class HordeDirector {
  readonly population: PopulationManager;
  spawnBudget = 0;
  lastSelectedPack: string | null = null;
  lastAnchor: { x: number; z: number } | null = null;
  anchorFailures = 0;
  currentWaveId: number | null = null;
  private readonly packCooldowns = new Map<string, number>();

  constructor(
    private readonly ctx: SystemContext,
    readonly resolved: ResolvedHordeDirector,
  ) {
    this.population = new PopulationManager(ctx);
    this.ctx.eventBus.subscribe('stageEvent', (payload) => this.onStageEvent(payload as StageEvent));
    this.ctx.eventBus.subscribe('waveEvent', (payload) => this.onWaveEvent(payload as WaveEventPayload));
  }

  step(dt: number): void {
    const stage = this.ctx.stage;
    const tally = this.population.refresh();
    const phase = stage.state.phase;
    for (const [id, cd] of this.packCooldowns) {
      this.packCooldowns.set(id, cd - dt);
      if (cd - dt <= 0) this.packCooldowns.delete(id);
    }
    if (phase === 'farming1' || phase === 'farming2' || phase === 'farming3') {
      this.stepFarming(dt, tally, phase === 'farming1' ? 0 : phase === 'farming2' ? 1 : 2);
    } else if (phase === 'wave1' || phase === 'wave2' || phase === 'bossWave') {
      this.stepWave(dt);
    }
  }

  private stepFarming(dt: number, tally: PopulationTally, phaseIndex: number): void {
    const phase = this.resolved.farmingPhases[phaseIndex];
    const stage = this.ctx.stage;
    const progress = Math.max(0, Math.min(1, (phase.durationSeconds - stage.state.farmingTimeRemaining) / Math.max(0.001, phase.durationSeconds)));
    const entityTarget = lerp(phase.entityTargetStart, phase.entityTargetEnd, progress);
    const threatTarget = lerp(phase.threatTargetStart, phase.threatTargetEnd, progress);
    const income = lerp(phase.spawnIncomeStart, phase.spawnIncomeEnd, progress);
    this.spawnBudget = Math.min(this.resolved.limits.maximumStoredBudget, this.spawnBudget + income * dt);

    if (tally.entities >= entityTarget || tally.threat >= threatTarget) return;
    const capacity = this.population.ambientCapacity(this.resolved.limits, tally);
    if (!capacity.entities || !capacity.threat) return;
    const pack = this.pickPack(phase.eligiblePackTags, 'farming');
    if (!pack) return;
    if (this.spawnBudget < pack.threatCost) return;
    const anchor = this.pickAnchor(pack);
    if (!anchor) {
      this.anchorFailures++;
      return;
    }
    if (!this.population.hardCapacity(this.resolved.limits, tally, pack.entityCost, pack.threatCost)) return;
    this.spawnPack(pack, anchor, 'ambient', null, null);
    this.spawnBudget -= pack.threatCost;
    this.lastSelectedPack = pack.id;
    this.lastAnchor = anchor;
    this.packCooldowns.set(pack.id, pack.cooldownSeconds ?? 1);
  }

  private stepWave(dt: number): void {
    if (this.currentWaveId === null) return;
    const waves = this.ctx.waves;
    const runtime = waves.waves.get(this.currentWaveId);
    if (!runtime || runtime.state === 'leaderDead' || runtime.state === 'complete') return;
    const def =
      this.resolved.waves.get(runtime.definitionId) ??
      (runtime.definitionId === this.resolved.bossWave.id ? this.resolved.bossWave : undefined);
    if (!def) return;
    runtime.reinforcementAccumulator += def.reinforcementThreatPerSecond * dt;
    if (runtime.reinforcementAccumulator >= 1) {
      runtime.reinforcementAccumulator -= 1;
      const packId = def.reinforcementPackIds[0];
      const pack = this.resolved.packs.get(packId);
      const entry = pack?.entries[0];
      if (pack && entry && waves.spendReinforcement(runtime.waveId, pack.threatCost, entry.enemyId, entry.count)) {
        this.lastSelectedPack = packId;
      }
    }
  }

  private onWaveEvent(event: WaveEventPayload): void {
    if (event.type === 'wavePurged' && this.currentWaveId === event.waveId) {
      this.currentWaveId = null;
    }
  }

  private onStageEvent(event: StageEvent): void {
    if (event.type !== 'waveRequested' || this.currentWaveId !== null) return;
    const isBoss = event.waveId === 3;
    const def = isBoss ? this.resolved.bossWave : this.resolved.waves.get(this.waveIdToDefinitionId(event.waveId));
    if (!def) return;
    const runtime = this.ctx.waves.openWave({
      definitionId: def.id,
      leaderEnemyId: def.leaderEnemyId,
      openingThreat: def.openingThreat,
      reinforcementThreat: def.reinforcementThreat,
      reinforcementThreatPerSecond: def.reinforcementThreatPerSecond,
      maximumActiveWaveThreat: def.maximumActiveWaveThreat,
      maximumActiveWaveEntities: def.maximumActiveWaveEntities,
      boss: isBoss,
    });
    this.currentWaveId = runtime.waveId;
    for (const packId of def.openingPackIds) {
      const pack = this.resolved.packs.get(packId);
      if (pack) {
        this.ctx.waves.spawnCohort(runtime.waveId, pack.entries[0].enemyId, pack.entries[0].count, pack.threatCost);
      }
    }
    pushEvent(this.ctx, 'assist', this.ctx.state.tank.x, this.ctx.state.tank.y + 2, this.ctx.state.tank.z, {
      label: isBoss ? 'BOSS INCOMING' : `WAVE ${event.waveId} INCOMING`,
    });
  }

  private waveIdToDefinitionId(waveId: number | undefined): string {
    if (waveId === 1) return 'wave.vanguard';
    if (waveId === 2) return 'wave.encirclement';
    return 'wave.vanguard';
  }

  private pickPack(tags: string[], fallbackTag: string): SpawnPackDefinition | undefined {
    for (const pack of this.resolved.packs.values()) {
      const matches = pack.tags.some((t) => tags.includes(t)) || pack.tags.includes(fallbackTag);
      if (!matches) continue;
      const cooldown = this.packCooldowns.get(pack.id);
      if (cooldown !== undefined) continue;
      if (pack.minimumPhase && !this.ctx.stage.state.phase.startsWith(pack.minimumPhase)) continue;
      return pack;
    }
    return undefined;
  }

  /** M3 anchor provider: deterministic perimeter gates with distance check. */
  private pickAnchor(pack: SpawnPackDefinition): { x: number; z: number } | null {
    const gates = this.ctx.world.bugSpawns;
    if (gates.length === 0) return null;
    const min = pack.anchorRequirements?.minimumTankDistance ?? 18;
    const max = pack.anchorRequirements?.maximumTankDistance ?? 120;
    const index = (this.resolved.def.id.length + (this.lastSelectedPack?.length ?? 0)) % gates.length;
    for (let i = 0; i < gates.length; i++) {
      const g = gates[(index + i) % gates.length];
      const d = Math.hypot(g.x - this.ctx.state.tank.x, g.z - this.ctx.state.tank.z);
      if (d >= min && d <= max) return { x: g.x, z: g.z };
    }
    return null;
  }

  private spawnPack(
    pack: SpawnPackDefinition,
    anchor: { x: number; z: number },
    populationClass: SpawnOwnership['populationClass'],
    waveId: number | null,
    leaderId: number | null,
  ): void {
    let seed = pack.id.length + this.ctx.state.nextEnemyId;
    for (const entry of pack.entries) {
      const def = this.ctx.enemies.defById(entry.enemyId);
      if (!def) continue;
      for (let i = 0; i < entry.count; i++) {
        seed += 1;
        const ox = deterministicOffset(seed) * pack.radius;
        const oz = deterministicOffset(seed * 1.7) * pack.radius;
        this.ctx.enemies.spawnEnemyDef(def, anchor.x + ox, anchor.z + oz, {
          populationClass,
          waveId,
          leaderId,
          packInstanceId: seed,
          spawnAnchorId: null,
          purgeOnLeaderDeath: waveId !== null,
        });
      }
    }
  }
}

interface WaveEventPayload {
  type: string;
  waveId: number;
  leaderId: number;
  count: number;
}
