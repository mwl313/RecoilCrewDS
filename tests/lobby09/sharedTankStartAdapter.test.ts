import { describe, expect, it } from 'vitest';
import { createAndJoin, makeManager, stepSeconds } from './helpers';

describe('lobby09 shared tank start adapter', () => {
  it('chosen seats map to Driver/Gunner match slots', () => {
    const { manager, a, b, room } = createAndJoin(makeManager().manager);
    // Seat switching uses release-then-request: B becomes Driver, A Gunner.
    manager.handle(a, { t: 'lobbySelectSeat', seat: null, lobbyRevision: 999 });
    manager.handle(b, { t: 'lobbySelectSeat', seat: null, lobbyRevision: 999 });
    manager.handle(a, { t: 'lobbySelectSeat', seat: 'gunner', lobbyRevision: 999 });
    manager.handle(b, { t: 'lobbySelectSeat', seat: 'driver', lobbyRevision: 999 });
    manager.handle(a, { t: 'lobbyReadySet', ready: true, lobbyRevision: 999 });
    manager.handle(b, { t: 'lobbyReadySet', ready: true, lobbyRevision: 999 });
    stepSeconds(manager, 3.6);
    expect(room.phase).toBe('running');
    expect(room.driver).toBe(manager.getClient(b));
    expect(room.gunner).toBe(manager.getClient(a));
    // The shared tank still has exactly one driver input path and one gunner path.
    const match = room.match!;
    manager.handle(b, { t: 'input', seq: 1, driver: { throttle: 1, steer: 0, dashPressed: false, jumpPressed: false } });
    manager.tick(1 / 30);
    expect(match.getDriverInput().throttle).toBe(1);
    manager.handle(a, { t: 'input', seq: 1, gunner: { aimYaw: 0.5, aimPitch: 0.1, primary: false, secondary: false } });
    manager.tick(1 / 30);
    expect(match.getGunnerInput().aimYaw).toBeCloseTo(0.5);
  });

  it('no unsupported multi-tank settings are accepted', () => {
    const { manager, a } = createAndJoin(makeManager().manager);
    manager.handle(a, { t: 'lobbySelectSeat', seat: 'combined', lobbyRevision: 0 } as never);
    expect(a.last('error')!.code).toBe('invalid_seat');
  });
});
