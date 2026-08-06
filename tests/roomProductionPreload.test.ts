import { describe, expect, it } from 'vitest';
import { RoomManager, type SocketLike } from '../src/server/room';
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';
import { ENEMY_DEFINITION_ORDER_HASH } from '../src/generated/enemyDefinitionIndex.generated';

class FakeSocket implements SocketLike {
  sent: Record<string, unknown>[] = [];
  closed = false;
  send(msg: unknown) {
    this.sent.push(msg as Record<string, unknown>);
  }
  close() {
    this.closed = true;
  }
  last(t: string) {
    return [...this.sent].reverse().find((m) => m.t === t);
  }
}

const pack = loadContentPackFromFilesystem('content');

function makeManager(modeId: string) {
  let now = 2_000_000;
  const manager = new RoomManager({
    now: () => now,
    content: {
      packId: pack.id,
      version: pack.version,
      hash: pack.hash,
      modeId,
    },
    pack,
  });
  return {
    manager,
    advance(ms: number) {
      now += ms;
    },
  };
}

function stepSeconds(manager: RoomManager, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 30); i++) manager.tick(1 / 30);
}

function createCrew(manager: RoomManager, modeId: string): { driver: FakeSocket; gunner: FakeSocket; code: string } {
  const driver = new FakeSocket();
  manager.handle(driver, { t: 'create' });
  const code = driver.last('created')!.code as string;
  const gunner = new FakeSocket();
  manager.handle(gunner, { t: 'join', code });
  manager.handle(driver, { t: 'lobbyReadySet', ready: true, lobbyRevision: 999 });
  manager.handle(gunner, { t: 'lobbyReadySet', ready: true, lobbyRevision: 999 });
  void modeId;
  return { driver, gunner, code };
}

describe('production asset-ready preload gate', () => {
  it('broadcasts runConfig and waits for both clients before the countdown', () => {
    const { manager, advance } = makeManager('mode.mainStage');
    const { driver, gunner } = createCrew(manager, 'mode.mainStage');

    const runConfig = driver.last('runConfig') as Record<string, unknown> | undefined;
    expect(runConfig).toBeDefined();
    expect(runConfig!.run).not.toBeNull();
    expect((runConfig!.run as { boss: { enemyId: string } }).boss.enemyId).toMatch(/^enemy\./);
    const matchId = runConfig!.matchId as string;
    expect(driver.last('countdown')).toBeUndefined();
    expect(gunner.last('countdown')).toBeUndefined();

    // Stepping during loading must not start the countdown.
    advance(1_000);
    stepSeconds(manager, 1);
    expect(driver.last('countdown')).toBeUndefined();

    manager.handle(driver, {
      t: 'assetReady',
      matchId,
      contentHash: pack.hash,
      definitionOrderHash: ENEMY_DEFINITION_ORDER_HASH,
    });
    expect(driver.last('countdown')).toBeUndefined();
    manager.handle(gunner, {
      t: 'assetReady',
      matchId,
      contentHash: pack.hash,
      definitionOrderHash: ENEMY_DEFINITION_ORDER_HASH,
    });
    expect(driver.last('countdown')).toBeDefined();
    expect(gunner.last('countdown')).toBeDefined();

    advance(3_500);
    stepSeconds(manager, 3.5);
    const start = driver.last('start') as Record<string, unknown> | undefined;
    expect(start?.matchId).toBe(matchId);
  });

  it('times out after the readiness deadline and starts the countdown anyway', () => {
    const { manager, advance } = makeManager('mode.mainStage');
    const { driver, gunner } = createCrew(manager, 'mode.mainStage');
    const matchId = driver.last('runConfig')!.matchId as string;
    manager.handle(driver, {
      t: 'assetReady',
      matchId,
      contentHash: pack.hash,
      definitionOrderHash: ENEMY_DEFINITION_ORDER_HASH,
    });
    advance(16_000);
    stepSeconds(manager, 16);
    expect(gunner.last('countdown')).toBeDefined();
  });

  it('rejects assetReady with mismatched content/definition hashes before match start', () => {
    const { manager, advance } = makeManager('mode.mainStage');
    const { driver } = createCrew(manager, 'mode.mainStage');
    const matchId = driver.last('runConfig')!.matchId as string;
    manager.handle(driver, {
      t: 'assetReady',
      matchId,
      contentHash: 'wrong-content',
      definitionOrderHash: ENEMY_DEFINITION_ORDER_HASH,
    });
    const error = driver.last('error') as Record<string, unknown> | undefined;
    expect(error?.code).toBe('compatibility');
    expect(driver.closed).toBe(true);
    advance(2_000);
    stepSeconds(manager, 2);
    expect(driver.last('countdown')).toBeUndefined();
  });

  it('demo rooms keep the immediate countdown and never send runConfig', () => {
    const { manager, advance } = makeManager('mode.demoScoreAttack');
    const { driver, gunner } = createCrew(manager, 'mode.demoScoreAttack');
    expect(driver.last('runConfig')).toBeUndefined();
    expect(driver.last('countdown')).toBeDefined();
    expect(gunner.last('countdown')).toBeDefined();
    advance(3_500);
    stepSeconds(manager, 3.5);
    expect(driver.last('start')).toBeDefined();
  });
});
