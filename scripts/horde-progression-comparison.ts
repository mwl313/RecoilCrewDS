#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { ContentLoader } from '../src/shared/content/contentLoader';
import type { ContentPack } from '../src/shared/content/contentPack';
import { selectArenaSession } from '../src/shared/mapgen/arenaSession';
import { resolveMapBundle } from '../src/shared/mapgen/profiles';
import { Match } from '../src/shared/sim/match';

const DT = 1 / 30;
const TICKS = 60 * 30;

function records(): { manifest: unknown; files: Record<string, unknown> } {
  const root = path.resolve('content');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const files: Record<string, unknown> = {};
  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(absolute, relative);
      else if (entry.name.endsWith('.json')) files[relative] = JSON.parse(fs.readFileSync(absolute, 'utf8'));
    }
  };
  walk(root, '');
  return { manifest, files };
}

function baselinePack(): ContentPack {
  const input = records();
  const replace = (file: string, values: Record<string, unknown>) => {
    input.files[file] = { ...(input.files[file] as object), ...values };
  };
  replace('horde/farmingPhase1.json', {
    entityTargetStart: 10, entityTargetEnd: 18, threatTargetStart: 12, threatTargetEnd: 22,
    spawnIncomeStart: 0.8, spawnIncomeEnd: 1.2,
  });
  replace('horde/farmingPhase2.json', {
    entityTargetStart: 18, entityTargetEnd: 26, threatTargetStart: 22, threatTargetEnd: 32,
    spawnIncomeStart: 1.2, spawnIncomeEnd: 1.6,
  });
  replace('horde/farmingPhase3.json', {
    entityTargetStart: 26, entityTargetEnd: 36, threatTargetStart: 32, threatTargetEnd: 46,
    spawnIncomeStart: 1.6, spawnIncomeEnd: 2.2,
  });
  replace('horde/spawnPackProductionFarmingCluster.json', {
    entries: [{ slotId: 'selected.phase.closeFodder', count: 3, formationRole: 'wanderer' }],
    threatCost: 3, entityCost: 3, radius: 6, cooldownSeconds: 1.5,
  });
  replace('horde/spawnPackProductionMixedFarming.json', {
    entries: [
      { slotId: 'selected.phase.closeFodder', count: 2, formationRole: 'wanderer' },
      { slotId: 'selected.phase.rangedFodder', count: 1, formationRole: 'skirmisher' },
    ],
    threatCost: 4, entityCost: 3, radius: 8, cooldownSeconds: 2,
  });
  replace('enemy-gameplay-rosters/quaternius.mainStage.json', {
    ordinaryMix: { closeFodder: 0.5, rangedFodder: 0.3, specialist: 0.2 },
    bossEscortCount: [4, 6],
  });
  const anchor: Record<string, unknown> = {
    ...(input.files['horde/policyAnchor.json'] as Record<string, unknown>),
    visibleNearField: 18,
  };
  delete anchor.preferredTankDistance;
  input.files['horde/policyAnchor.json'] = anchor;
  replace('horde/populationLimits.json', {
    ambientSoftEntityCap: 80,
    ambientSoftThreatCap: 100,
    waveSoftEntityCap: 100,
    waveSoftThreatCap: 120,
  });
  return new ContentLoader().loadFromRecords(input.manifest, input.files);
}

function currentPack(): ContentPack {
  const input = records();
  return new ContentLoader().loadFromRecords(input.manifest, input.files);
}

function run(label: string, content: ContentPack) {
  const bundle = resolveMapBundle(content, 'map.urban400Prototype');
  const fallbackBundle = bundle.map.fallbackMapId ? resolveMapBundle(content, bundle.map.fallbackMapId) : bundle;
  const session = selectArenaSession({ roomCode: 'DENSITY', matchIndex: 0, bundle, fallbackBundle });
  const match = new Match(`horde-progression-${label}`, 'none', content, session.world, 'mode.singlePlayerMainStage');
  let killAttempts = 0;
  for (let tick = 0; tick < TICKS; tick++) {
    const now = tick * (1000 / 30);
    match.state.tank.integrity = match.runtime.cfg.tank.maxIntegrity;
    match.state.tank.deadT = 0;
    match.state.tank.shieldedT = 1;
    match.checkProgressionTimeout(now);
    const selection = match.state.teamProgression.activeSelection;
    if (selection?.kind === 'upgrade') match.submitProgressionSelection('single', selection.offerId, 0);
    if (tick % 15 === 0) {
      killAttempts++;
      const enemy = match.state.enemies.find(
        (candidate) => candidate.alive && candidate.ownership?.leaderId !== candidate.id,
      );
      if (enemy) match.damageEnemy(enemy, 999_999, 'mg');
    }
    for (const shard of match.state.xpShards) {
      if (!shard.collected) {
        shard.x = match.state.tank.x;
        shard.z = match.state.tank.z;
      }
    }
    match.step(DT);
    match.takeEvents();
  }
  const progression = match.state.teamProgression;
  const telemetry = match.runtime.systems.progression.telemetry;
  return {
    label,
    minutes: 1,
    killAttempts,
    killsPerMinute: match.state.stats.kills,
    xpPerMinute: progression.totalXpCollected,
    levelUpsPerMinute: progression.levelUpOffersCompleted,
    chestsPerRun: telemetry.chestsPerStage,
    enemyDropChestAttemptsPerMinute: Object.values(telemetry.enemyChestRollsByClass).reduce((sum, value) => sum + value, 0),
    enemyDropChestsPerMinute: telemetry.enemyDropChestsSpawned,
    relicAcquisitionsPerRun: telemetry.relicsAcquired,
    scorePerMinute: match.state.stats.score,
  };
}

const output = { baseline: run('baseline', baselinePack()), densityV1: run('density-v1', currentPack()) };
console.log(JSON.stringify(output, null, 2));
console.log('PASS');
