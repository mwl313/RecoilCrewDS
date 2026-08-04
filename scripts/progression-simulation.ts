#!/usr/bin/env tsx
/**
 * Headless progression simulation (progression08).
 *
 * Runs a progression-enabled Single Player match for a fixed number of
 * ticks, auto-resolving level-up offers deterministically, and prints
 * balance telemetry.
 *
 * Usage: npm run test:progression:simulation
 */
import { Match } from '../src/shared/sim/match';
import { CLIENT_CONTENT_PACK } from '../src/generated/contentPack.generated';

const TICKS = 60 * 30; // 60 simulated seconds at 30 Hz
const DT = 1 / 30;

const match = new Match('progression-sim', 'none', CLIENT_CONTENT_PACK, undefined, 'mode.singlePlayerScoreAttack');

for (let i = 0; i < TICKS; i++) {
  match.checkProgressionTimeout(Date.now() + i * 33);
  match.step(DT);
  match.takeEvents();
  // Auto-resolve any pending offers deterministically (card 0).
  const active = match.state.teamProgression.activeSelection;
  if (active && match.state.matchFlow === 'upgradeSelection') {
    match.submitProgressionSelection('single', active.offerId, 0);
  }
  // Simulate farming kills to drive XP.
  if (i % 60 === 0) {
    const e = match.state.enemies.find((x) => x.alive);
    if (e) match.runtime.systems.damage.applyEnemy(e, 9999, 'mg');
    match.takeEvents();
  }
}

const prog = match.state.teamProgression;
const telemetry = match.runtime.systems.progression.telemetry;
console.log('=== progression simulation (60 s, deterministic auto-pick) ===');
console.log(`level=${prog.level} xp=${prog.currentXp}/${prog.xpForNextLevel} totalXp=${prog.totalXpCollected} pending=${prog.pendingLevelUps}`);
console.log(`offersCompleted=${prog.levelUpOffersCompleted} chestsOpened=${prog.treasureChestsOpened} relics=${Object.keys(prog.relicStacks).length}`);
console.log(`relicStacks=${JSON.stringify(prog.relicStacks)}`);
console.log(`upgradePicks=${JSON.stringify(telemetry.upgradePickRates)}`);
console.log(`rarityDistribution=${JSON.stringify(telemetry.rarityDistribution)}`);
console.log(`roadkillHits=${telemetry.roadkillHits} roadkillKills=${telemetry.roadkillKills}`);
console.log('PASS');
