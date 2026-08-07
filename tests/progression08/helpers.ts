import { MatchRuntime } from '../../src/shared/sim/matchRuntime';
import { CLIENT_CONTENT_PACK } from '../../src/generated/contentPack.generated';
import type { EnemyState } from '../../src/shared/types';
import type { RelicRewardOffer, RelicRollResult, TreasureChestState } from '../../src/shared/progression/progressionTypes';

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

export function claimChest(m: MatchRuntime, chest: TreasureChestState, nowMs = 1_000): RelicRewardOffer {
  chest.lifecycle = 'closed';
  chest.claimableAtGameTime = m.state.time;
  const offer = m.openProgressionChest(chest.id, nowMs);
  if (!offer) throw new Error(`expected chest ${chest.id} to be claimable`);
  return offer;
}

export function revealChest(m: MatchRuntime, chest: TreasureChestState, nowMs = 1_000): RelicRollResult {
  claimChest(m, chest, nowMs);
  const openSeconds = m.rules.relicChestSpawnPolicy?.openAnimationSeconds ?? 0.65;
  m.checkProgressionTimeout(nowMs + openSeconds * 1_000 + 1);
  const result = m.state.teamProgression.lastRelicResult;
  if (!result) throw new Error(`expected chest ${chest.id} to resolve a relic result`);
  return result;
}

export function completeRelicReveal(m: MatchRuntime): void {
  const active = m.state.teamProgression.activeSelection;
  if (!active?.relicResult) return;
  m.skipProgressionRelic(
    active.relicResult.acquisitionSequence,
    (active.continueAllowedAtWallMs ?? 0) + 1,
  );
}
