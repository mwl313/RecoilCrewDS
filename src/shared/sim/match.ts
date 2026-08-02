import type { GameConfig } from '../config';
import type { ContentPack } from '../content/contentPack';
import type {
  DriverInput,
  EnemyState,
  EnemyType,
  GunnerInput,
  MatchConfig,
  MatchResults,
  MatchState,
  ModifierId,
  Role,
  SimEvent,
} from '../types';
import { MatchRuntime } from './matchRuntime';

export { MatchRuntime } from './matchRuntime';

/**
 * Legacy Match facade. All current callers (server rooms, Practice, tests,
 * the Phase 0 golden fixture) keep using this API; the implementation now
 * lives in MatchRuntime with immutable per-match rules and extracted
 * systems. When a content pack is provided, rules resolve from validated
 * JSON; otherwise they resolve from legacy constants with identical values.
 */
export class Match {
  readonly runtime: MatchRuntime;

  constructor(matchId: string, modifier: ModifierId = 'none', pack?: ContentPack) {
    this.runtime = pack
      ? MatchRuntime.fromContentPack(pack, matchId, modifier)
      : MatchRuntime.fromLegacy(matchId, modifier);
  }

  get state(): MatchState {
    return this.runtime.state;
  }

  get cfg(): GameConfig {
    return this.runtime.cfg;
  }

  get mcfg(): MatchConfig {
    return this.runtime.mcfg;
  }

  get rules() {
    return this.runtime.rules;
  }

  get events(): SimEvent[] {
    return this.runtime.events;
  }

  get results(): MatchResults | null {
    return this.runtime.results;
  }

  takeEvents(): SimEvent[] {
    return this.runtime.takeEvents();
  }

  setDriverInput(input: DriverInput): void {
    this.runtime.setDriverInput(input);
  }

  setGunnerInput(input: GunnerInput): void {
    this.runtime.setGunnerInput(input);
  }

  getDriverInput(): DriverInput {
    return this.runtime.getDriverInput();
  }

  getGunnerInput(): GunnerInput {
    return this.runtime.getGunnerInput();
  }

  clearInputs(): void {
    this.runtime.clearInputs();
  }

  clearDriverInput(): void {
    this.runtime.clearDriverInput();
  }

  clearGunnerInput(): void {
    this.runtime.clearGunnerInput();
  }

  step(dt: number): void {
    this.runtime.step(dt);
  }

  damageTank(amount: number, source: string): void {
    this.runtime.damageTank(amount, source);
  }

  spawnEnemy(type: EnemyType, x?: number, z?: number): EnemyState | null {
    return this.runtime.spawnEnemy(type, x, z);
  }

  damageEnemy(enemy: EnemyState, damage: number, source: string): void {
    this.runtime.damageEnemy(enemy, damage, source);
  }

  addJackpot(amount: number): void {
    this.runtime.addJackpot(amount);
  }

  addContribution(role: Role, points: number, jackpotExtra?: number): void {
    this.runtime.addContribution(role, points, jackpotExtra);
  }
}
