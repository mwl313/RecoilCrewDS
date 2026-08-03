import type { ContentPack } from '../content/contentPack';
import type { ModeDefinition } from '../content/schemas/mode';
import type { GameModeRegistry } from '../core/gameModeRegistry';
import type { SystemContext } from '../sim/systems/systemContext';

/**
 * DemoScoreAttackModeDefinition: immutable metadata for the score-attack
 * loop selected by the content pack. All ids resolve from the validated
 * mode definition; nothing is hardcoded here.
 */
export class DemoScoreAttackModeDefinition {
  readonly id: string;
  readonly label: string;
  readonly objectiveId: string;
  readonly scoringId: string;
  readonly resultsId: string;
  readonly spawnDirectorId: string;
  readonly tankId: string;
  readonly loadoutId: string;
  readonly difficultyId: string;

  constructor(readonly definition: ModeDefinition, readonly pack?: ContentPack) {
    this.id = definition.id;
    this.label = definition.label ?? definition.id;
    this.objectiveId = definition.objectives[0];
    this.scoringId = definition.scoring;
    this.resultsId = definition.results;
    this.spawnDirectorId = definition.spawnDirector;
    this.tankId = definition.tank;
    this.loadoutId = definition.loadout;
    this.difficultyId = definition.difficulty;
  }
}

/**
 * DemoScoreAttackModeRuntime: the extracted Demo systems selected by the
 * mode. It owns assistance pacing, combo decay, round completion, and
 * results selection; MatchRuntime only orchestrates the shared step order.
 */
export class DemoScoreAttackModeRuntime {
  constructor(
    readonly definition: DemoScoreAttackModeDefinition,
    readonly systems: SystemContext,
  ) {}

  get durationSeconds(): number {
    return this.systems.round.durationSeconds;
  }

  stepAssistance(): void {
    this.systems.objective.update();
  }

  stepCombo(dt: number): void {
    this.systems.combo.step(dt);
  }

  computeResults() {
    return this.systems.results.compute();
  }

  checkCompletion() {
    return this.systems.round.checkCompletion();
  }
}

/** Register the Demo mode in a GameModeRegistry (Phase 1 core contract). */
export function registerDemoScoreAttackMode(
  registry: GameModeRegistry<ModeDefinition>,
  pack: ContentPack,
): void {
  const definition = pack.getMode(pack.modeId);
  registry.register(definition, () => new DemoScoreAttackModeDefinition(definition, pack));
}
