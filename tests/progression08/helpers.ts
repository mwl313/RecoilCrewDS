import { MatchRuntime } from '../../src/shared/sim/matchRuntime';
import { CLIENT_CONTENT_PACK } from '../../src/generated/contentPack.generated';
import type { EnemyState } from '../../src/shared/types';

export function makeMatch(modeId = 'mode.singlePlayerScoreAttack', id = 'prog-test'): MatchRuntime {
  return MatchRuntime.fromContentPack(CLIENT_CONTENT_PACK, id, 'none', modeId);
}

export function step(m: MatchRuntime, n = 1, dt = 1 / 30): void {
  for (let i = 0; i < n; i++) {
    m.step(dt);
    m.takeEvents();
  }
}

export function spawnEnemy(m: MatchRuntime, defId = 'enemy.scrapBug', x = 10, z = 10): EnemyState {
  const def = m.systems.enemies.defById(defId)!;
  return m.systems.enemies.spawnEnemyDef(def, x, z)!;
}

export function killEnemy(m: MatchRuntime, id: number, source: 'cannon' | 'mg' | 'dash' | 'test' = 'cannon'): void {
  const e = m.state.enemies.find((candidate) => candidate.id === id);
  if (e) m.systems.damage.applyEnemy(e, 9999, source);
  m.takeEvents();
}

export function resolveAnyOffer(m: MatchRuntime): void {
  const active = m.state.teamProgression.activeSelection;
  if (!active) return;
  const policy = m.rules.singlePlayerProgressionPolicy;
  const role = policy?.levelUpSelection === 'roleSeparated' ? 'driver' : 'single';
  const offer = policy?.levelUpSelection === 'roleSeparated' ? active.driverOffer : active.singlePlayerOffer;
  if (offer && offer.length > 0) {
    m.submitProgressionSelection(role, active.offerId, 0);
  }
}

export function resolveAllOffers(m: MatchRuntime): void {
  let guard = 0;
  while (m.state.teamProgression.activeSelection && guard++ < 20) {
    resolveAnyOffer(m);
  }
}
