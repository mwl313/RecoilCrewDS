import { describe, expect, it } from 'vitest';
import { Match } from '../src/shared/sim/match';
import { CLIENT_CONTENT_PACK } from '../src/generated/contentPack.generated';
import { createStaticArenaWorld } from '../src/shared/sim/arenaWorld';

describe('authoritative enemy damage presentation', () => {
  it('reports exact post-defense HP loss and clamps lethal overkill presentation', () => {
    const match = new Match('damage-readability', 'none', CLIENT_CONTENT_PACK, createStaticArenaWorld());
    const enemy = match.runtime.systems.enemies.spawnEnemy('scrapBug', 5, 5)!;
    enemy.hp = 7;
    enemy.maxHp = 20;

    const result = match.runtime.systems.damage.applyEnemy(enemy, 999, 'cannon');
    const hit = match.takeEvents().find((event) => event.type === 'hit' && event.id === enemy.id);

    expect(result.amount).toBe(999);
    expect(hit).toMatchObject({ id: enemy.id, value: 7, source: 'cannon' });
  });

  it('uses final applied loss rather than the incoming request', () => {
    const match = new Match('damage-final', 'none', CLIENT_CONTENT_PACK, createStaticArenaWorld());
    const enemy = match.runtime.systems.enemies.spawnEnemy('scrapBug', 5, 5)!;
    const before = enemy.hp;

    const result = match.runtime.systems.damage.applyEnemy(enemy, 3.25, 'mg');
    const hit = match.takeEvents().find((event) => event.type === 'hit' && event.id === enemy.id);

    expect(result.amount).toBe(3.25);
    expect(hit?.value).toBeCloseTo(before - Math.max(0, enemy.hp));
    expect(hit?.source).toBe('mg');
  });
});
