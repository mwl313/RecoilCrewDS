import { describe, expect, it } from 'vitest';
import { CLIENT_CONTENT_PACK } from '../../src/generated/contentPack.generated';
import { RoomManager, type SocketLike } from '../../src/server/room';
import { Match } from '../../src/shared/sim/match';
import { MatchRuntime } from '../../src/shared/sim/matchRuntime';
import type { SimEvent } from '../../src/shared/types';

class CaptureSocket implements SocketLike {
  sent: Record<string, unknown>[] = [];
  serialized: string[] = [];

  send(message: unknown): void {
    this.sent.push(message as Record<string, unknown>);
  }

  sendText(message: string): void {
    this.serialized.push(message);
  }

  close(): void {}
}

function configureDrop(runtime: MatchRuntime, height: number, stacks = 1): void {
  const tank = runtime.state.tank;
  runtime.state.teamProgression.relicStacks['relic.ground_pound'] = stacks;
  tank.vx = 0;
  tank.vy = 0;
  tank.vz = 0;
  tank.y = runtime.world.groundHeightAt(tank.x, tank.z) + height;
  tank.grounded = false;
  runtime.resetFallTrackingFromAuthority();
}

function eventFrom(socket: CaptureSocket, type: SimEvent['type']): SimEvent | undefined {
  const messages = [
    ...socket.sent,
    ...socket.serialized.map((message) => JSON.parse(message) as Record<string, unknown>),
  ] as Array<{ t?: string; event?: SimEvent }>;
  return messages
    .find((message) => message.t === 'event' && message.event?.type === type)
    ?.event;
}

describe('authoritative Ground Pound replication', () => {
  it('matches Single Player authority and sends byte-identical impact data to Driver and Gunner', () => {
    const single = MatchRuntime.fromContentPack(
      CLIENT_CONTENT_PACK,
      'ground-pound-single-authority',
      'none',
      'mode.singlePlayerMainStage',
    );
    configureDrop(single, 6, 2);
    const singleEvents: SimEvent[] = [];
    for (let index = 0; index < 180 && !singleEvents.some((event) => event.type === 'groundPoundImpact'); index++) {
      single.step(1 / 30);
      singleEvents.push(...single.takeEvents());
    }
    const singleImpact = singleEvents.find((event) => event.type === 'groundPoundImpact');

    const manager = new RoomManager();
    const driver = new CaptureSocket();
    const gunner = new CaptureSocket();
    manager.handle(driver, { t: 'create' });
    const code = driver.sent.find((message) => message.t === 'created')?.code as string;
    manager.handle(gunner, { t: 'join', code });
    const room = manager.getClient(driver)!.room!;
    room.match = new Match(
      'ground-pound-multiplayer-authority',
      'none',
      CLIENT_CONTENT_PACK,
      undefined,
      'mode.mainStage',
    );
    room.phase = 'running';
    configureDrop(room.match.runtime, 6, 2);
    for (let index = 0; index < 180 && !eventFrom(driver, 'groundPoundImpact'); index++) {
      manager.tick(1 / 30);
    }

    const driverImpact = eventFrom(driver, 'groundPoundImpact');
    const gunnerImpact = eventFrom(gunner, 'groundPoundImpact');
    expect(singleImpact).toMatchObject({
      radius: 7.925,
      damage: 42.5,
      fallDistance: 6,
      stacks: 2,
    });
    expect(driverImpact).toMatchObject({
      radius: singleImpact?.radius,
      damage: singleImpact?.damage,
      fallDistance: singleImpact?.fallDistance,
      stacks: singleImpact?.stacks,
    });
    expect(gunnerImpact).toEqual(driverImpact);
    const driverWire = JSON.stringify(driver.sent.find(
      (message) => message.t === 'event' && (message.event as SimEvent | undefined)?.type === 'groundPoundImpact',
    ));
    const gunnerWire = JSON.stringify(gunner.sent.find(
      (message) => message.t === 'event' && (message.event as SimEvent | undefined)?.type === 'groundPoundImpact',
    ));
    expect(gunnerWire).toBe(driverWire);
    expect(eventFrom(driver, 'tankLanding')).toMatchObject({
      fallDistance: 6,
      kind: 'heavy',
      groundPound: true,
    });
    expect(eventFrom(gunner, 'tankLanding')).toEqual(eventFrom(driver, 'tankLanding'));
  });
});
