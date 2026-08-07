import { describe, expect, it } from 'vitest';
import { claimChest, completeRelicReveal, makeMatch, revealChest, step } from './helpers';

describe('authoritative relic chest opening and reveal flow', () => {
  it('claims into opening, waits 0.4 s, then applies exactly once at reveal start', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'reveal-enter');
    const chest = m.systems.progression.spawnChest('mapStart', 3, 3);
    const offer = claimChest(m, chest, 1_000);
    expect(offer.candidates).toHaveLength(1);
    expect(offer.selectionMode).toBe('automaticSingle');
    expect(offer.selectedIndex).toBe(0);
    expect(m.state.matchFlow).toBe('relicOpening');
    expect(chest.lifecycle).toBe('opening');
    expect(m.state.teamProgression.relicStacks).toEqual({});
    expect(m.checkProgressionTimeout(1_399)).toBe(false);
    expect(m.checkProgressionTimeout(1_401)).toBe(true);
    expect(chest.lifecycle).toBe('revealing');
    expect(m.state.matchFlow).toBe('relicSelection');
    const result = m.state.teamProgression.lastRelicResult!;
    expect(m.state.teamProgression.relicStacks[result.relicId]).toBe(1);
    expect(m.checkProgressionTimeout(1_800)).toBe(false);
    expect(m.state.teamProgression.relicStacks[result.relicId]).toBe(1);
  });

  it('pauses gameplay throughout physical opening and reveal', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'reveal-pause');
    const chest = m.systems.progression.spawnChest('mapStart', 3, 3);
    claimChest(m, chest, 1_000);
    const tankX = m.state.tank.x;
    step(m, 60);
    expect(m.state.time).toBe(0);
    expect(m.state.tank.x).toBe(tankX);
    m.checkProgressionTimeout(1_401);
    step(m, 60);
    expect(m.state.time).toBe(0);
  });

  it('enforces minimum acknowledgement delay and makes acknowledgement idempotent', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'reveal-skip');
    const chest = m.systems.progression.spawnChest('mapStart', 3, 3);
    const result = revealChest(m, chest, 1_000);
    const active = m.state.teamProgression.activeSelection!;
    expect(m.skipProgressionRelic(result.acquisitionSequence, (active.continueAllowedAtWallMs ?? 0) - 1)).toEqual({
      accepted: false,
      reason: 'minimum_delay',
    });
    completeRelicReveal(m);
    expect(m.state.matchFlow).toBe('playing');
    expect(chest.lifecycle).toBe('open');
    expect(m.skipProgressionRelic(result.acquisitionSequence, 99_999).accepted).toBe(false);
    expect(m.state.teamProgression.relicStacks[result.relicId]).toBe(1);
  });

  it('has no normal relic countdown or automatic resolution', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'reveal-timeout');
    const chest = m.systems.progression.spawnChest('mapStart', 3, 3);
    revealChest(m, chest, 1_000);
    const active = m.state.teamProgression.activeSelection!;
    expect(active.expiresAtWallMs).toBeUndefined();
    expect(active.revealStartedAtWallMs).toBe(1_401);
    expect(m.checkProgressionTimeout(999_999)).toBe(false);
    expect(m.state.matchFlow).toBe('relicSelection');
    expect(chest.lifecycle).toBe('revealing');
  });

  it('serializes opening/revealing offers for reconnect without rerolling', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'reveal-reconnect');
    const chest = m.systems.progression.spawnChest('mapStart', 3, 3);
    const offer = claimChest(m, chest, 5_000);
    const openingSnapshot = JSON.parse(JSON.stringify(m.state));
    expect(openingSnapshot.chests.find((entry: { id: number }) => entry.id === chest.id).lifecycle).toBe('opening');
    expect(openingSnapshot.chests.find((entry: { id: number }) => entry.id === chest.id).rewardOffer).toEqual(offer);
    m.checkProgressionTimeout(5_401);
    const firstResult = { ...m.state.teamProgression.lastRelicResult! };
    const revealingSnapshot = JSON.parse(JSON.stringify(m.state));
    expect(revealingSnapshot.chests.find((entry: { id: number }) => entry.id === chest.id).lifecycle).toBe('revealing');
    m.checkProgressionTimeout(50_700);
    expect(m.state.teamProgression.lastRelicResult).toEqual(firstResult);
  });

  it('waits for every currently required Multiplayer acknowledgement', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'reveal-multi-ack');
    const chest = m.systems.progression.spawnChest('mapStart', 3, 3);
    const result = revealChest(m, chest, 1_000);
    const allowed = m.state.teamProgression.activeSelection!.continueAllowedAtWallMs! + 1;
    const first = m.acknowledgeProgressionRelic('driver', result.acquisitionSequence, ['driver', 'gunner'], allowed);
    expect(first).toEqual({ accepted: true, waitingFor: ['gunner'] });
    expect(m.state.matchFlow).toBe('relicSelection');
    expect(m.state.teamProgression.activeSelection?.driverRelicAcknowledged).toBe(true);
    const second = m.acknowledgeProgressionRelic('gunner', result.acquisitionSequence, ['driver', 'gunner'], allowed + 1);
    expect(second.accepted).toBe(true);
    expect(m.state.matchFlow).toBe('playing');
  });

  it('drops disconnected peers from the acknowledgement gate', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'reveal-disconnect-gate');
    const chest = m.systems.progression.spawnChest('mapStart', 3, 3);
    const result = revealChest(m, chest, 1_000);
    const allowed = m.state.teamProgression.activeSelection!.continueAllowedAtWallMs! + 1;
    m.acknowledgeProgressionRelic('driver', result.acquisitionSequence, ['driver', 'gunner'], allowed);
    expect(m.refreshProgressionRelicGate(['driver'], allowed + 1)).toBe(true);
    expect(m.state.matchFlow).toBe('playing');
  });

  it('starts continuous despawn after minimum open lifetime and removes the chest', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'reveal-despawn');
    const chest = m.systems.progression.spawnChest('mapStart', 30, 30);
    revealChest(m, chest, 1_000);
    completeRelicReveal(m);
    expect(chest.lifecycle).toBe('open');
    m.state.time = (chest.fullyOpenStartedAtGameTime ?? 0) + 2.01;
    m.systems.progression.step(0.01);
    expect(chest.lifecycle).toBe('despawning');
    m.state.time = (chest.despawnStartedAtGameTime ?? 0) + 0.46;
    m.systems.progression.step(0.01);
    expect(m.state.chests.some((entry) => entry.id === chest.id)).toBe(false);
  });
});
