import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';
import { MatchRules } from '../src/shared/rules/matchRules';
import { RoomManager, type ContentMetadata, type SocketLike } from '../src/server/room';
import { statModifier } from '../src/shared/stats/statModifier';
import { DriverPredictor } from '../src/client/predictor';
import { BASE_CONFIG } from '../src/shared/config';
import type { TankState } from '../src/shared/types';

const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../content');
const pack = loadContentPackFromFilesystem(CONTENT_ROOT);
const CONTENT_META: ContentMetadata = {
  packId: pack.id,
  version: pack.version,
  hash: pack.hash,
  modeId: pack.modeId,
};

class FakeSocket implements SocketLike {
  sent: Record<string, unknown>[] = [];
  send(msg: unknown) {
    this.sent.push(msg as Record<string, unknown>);
  }
  close() {}
  last(t: string) {
    return [...this.sent].reverse().find((m) => m.t === t);
  }
}

function stepSeconds(manager: RoomManager, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 30); i++) manager.tick(1 / 30);
}

function startCrew(manager: RoomManager) {
  const a = new FakeSocket();
  const b = new FakeSocket();
  manager.handle(a, { t: 'create' });
  const code = a.last('created')!.code as string;
  manager.handle(b, { t: 'join', code });
  manager.handle(a, { t: 'ready', ready: true });
  manager.handle(b, { t: 'ready', ready: true });
  stepSeconds(manager, 3.4);
  const room = manager.getClient(a)!.room!;
  if (room.phase === 'countdown') manager.tick(1 / 30);
  expect(room.phase).toBe('running');
  return { a, b, room };
}

describe('server rules flow: ContentPack -> mode -> difficulty -> MatchRules', () => {
  it('rooms created by the server use content-derived rules', () => {
    const manager = new RoomManager({ content: CONTENT_META, pack });
    const { a, room } = startCrew(manager);
    const rules = room.match!.rules;
    expect(rules.packId).toBe('demo');
    expect(rules.contentHash).toBe(pack.hash);
    expect(rules.modeId).toBe('mode.demoScoreAttack');
    expect(rules.objective.durationSeconds).toBe(90);
    expect(room.content).toEqual(CONTENT_META);
    expect(a.last('start')).toMatchObject({ content: CONTENT_META });
  });

  it('snapshots carry rules revisions and the compact movement block on change', () => {
    const manager = new RoomManager({ content: CONTENT_META, pack });
    const { a, room } = startCrew(manager);
    const snapshot = a.last('snapshot') as Record<string, unknown>;
    expect(typeof snapshot.rulesRevision).toBe('number');
    expect(typeof snapshot.movementRulesRevision).toBe('number');
    expect(snapshot.movement).toBeDefined();
    const movement = snapshot.movement as { tank: { forwardSpeed: number }; match: { gravity: number } };
    expect(movement.tank.forwardSpeed).toBe(18);
    expect(movement.match.gravity).toBe(16);
    // Without rule changes, later snapshots do not resend the block.
    stepSeconds(manager, 1);
    const later = a.last('snapshot') as Record<string, unknown>;
    expect('movement' in later).toBe(false);
    expect(typeof later.rulesRevision).toBe('number');
    void room;
  });
});

describe('two simultaneous rooms with different rules', () => {
  it('rematched rooms resolve different rules without contamination', () => {
    const manager = new RoomManager({ content: CONTENT_META, pack });
    const crewA = startCrew(manager);
    const crewB = startCrew(manager);
    stepSeconds(manager, 91); // both rounds finish
    expect(crewA.room.phase).toBe('results');
    expect(crewB.room.phase).toBe('results');
    manager.handle(crewA.a, { t: 'rematch', modifier: 'doubleBarrel' });
    manager.handle(crewA.b, { t: 'rematch', modifier: 'doubleBarrel' });
    manager.handle(crewB.a, { t: 'rematch', modifier: 'moonYard' });
    manager.handle(crewB.b, { t: 'rematch', modifier: 'moonYard' });
    stepSeconds(manager, 3.5);

    const rulesA = crewA.room.match!.rules;
    const rulesB = crewB.room.match!.rules;
    expect(rulesA.matchConfig.cannonBurst).toBe(2);
    expect(rulesB.matchConfig.gravity).toBe(6.5);
    expect(rulesA.config).not.toBe(rulesB.config);
    expect(rulesA.resolver).not.toBe(rulesB.resolver);
    expect(rulesA.movementBlock().match.gravity).toBe(16);
    expect(rulesB.movementBlock().match.gravity).toBe(6.5);

    // A stat modifier on room A never leaks into room B.
    const revB = rulesB.rulesRevision;
    const moveB = rulesB.movementRulesRevision;
    rulesA.addModifier(statModifier('roomA.test', 'tank.forwardSpeed', 'multiply', 1.5, { source: 'test' }));
    expect(rulesA.config.tank.forwardSpeed).toBeCloseTo(27, 6);
    expect(rulesB.config.tank.forwardSpeed).toBe(18);
    expect(rulesB.rulesRevision).toBe(revB);
    expect(rulesB.movementRulesRevision).toBe(moveB);
  });

  it('movement revision changes replicate through snapshots', () => {
    const manager = new RoomManager({ content: CONTENT_META, pack });
    const { a, room } = startCrew(manager);
    const snapshots = () => a.sent.filter((m) => m.t === 'snapshot');
    // A fresh tick without rule changes does not resend the movement block.
    manager.tick(1 / 30);
    manager.tick(1 / 30);
    expect('movement' in snapshots().pop()!).toBe(false);
    const rules = room.match!.rules;
    rules.addModifier(statModifier('test.grav', 'match.gravity', 'override', 6.5, { source: 'test' }));
    manager.tick(1 / 30); // next snapshot round
    manager.tick(1 / 30);
    const latest = snapshots().pop()!;
    expect('movement' in latest).toBe(true);
    expect((latest.movement as { match: { gravity: number } }).match.gravity).toBe(6.5);
  });
});

describe('Driver predictor movement synchronization', () => {
  function tankAt(y: number): TankState {
    return {
      x: 0, y, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, yawVel: 0,
      pitch: 0, roll: 0, integrity: 100, dashCooldown: 0, dashPresentationT: 0,
      shieldedT: 0, deadT: 0, grounded: false, drift: false,
    };
  }

  it('applies the authoritative movement block and matches authority kinematics', () => {
    const rules = MatchRules.fromContentPack(pack, 'moonYard');
    const block = rules.movementBlock();
    const predictor = new DriverPredictor(BASE_CONFIG, 'none');
    predictor.resetFromAuthority(tankAt(10));
    predictor.applyMovementRules(block, rules.movementRulesRevision);
    const neutral = { throttle: 0, steer: 0, dashPressed: false, jumpPressed: false };
    for (let i = 0; i < 30; i++) predictor.sampleInput(neutral, 1 / 30);
    // Falls under the authority gravity (6.5) instead of the default 16.
    expect(predictor.predicted.y).toBeGreaterThan(5);
    expect(predictor.predicted.y).toBeLessThan(8);
  });

  it('ignores stale movement blocks when the revision has not advanced', () => {
    const rules = MatchRules.fromContentPack(pack, 'moonYard');
    const block = rules.movementBlock();
    const predictor = new DriverPredictor(BASE_CONFIG, 'none');
    predictor.resetFromAuthority(tankAt(10));
    predictor.applyMovementRules(block, 5);
    // Re-apply an older/stale revision: no-op.
    predictor.applyMovementRules(block, 4);
    expect((predictor as unknown as { movementRevision: number }).movementRevision).toBe(5);
    // And the applied gravity is the moonYard one.
    const neutral = { throttle: 0, steer: 0, dashPressed: false, jumpPressed: false };
    for (let i = 0; i < 30; i++) predictor.sampleInput(neutral, 1 / 30);
    expect(predictor.predicted.y).toBeGreaterThan(5);
  });
});
