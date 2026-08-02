import { describe, expect, it } from 'vitest';
import {
  EntityRegistry,
  GameModeRegistry,
  GameplayEventBus,
  SystemScheduler,
  createSimulationContext,
  type GameplaySystem,
  type SimulationContext,
} from '../src/shared/core';

describe('GameplayEventBus', () => {
  it('delivers queued events in order to subscribers and returns unsubscribers', () => {
    const bus = new GameplayEventBus();
    const seen: string[] = [];
    const off = bus.subscribe<number>('score.awarded', (v) => seen.push(`a:${v}`));
    bus.subscribe<number>('score.awarded', (v) => seen.push(`b:${v}`));
    bus.subscribe('other', () => seen.push('other'));
    bus.emit('score.awarded', 10);
    bus.emit('score.awarded', 20);
    expect(bus.queueLength).toBe(2);
    const drained = bus.drain();
    expect(drained.map((e) => e.type)).toEqual(['score.awarded', 'score.awarded']);
    expect(seen).toEqual(['a:10', 'b:10', 'a:20', 'b:20']);
    off();
    bus.emit('score.awarded', 30);
    bus.drain();
    expect(seen.filter((s) => s === 'a:30')).toEqual([]);
  });

  it('bounds the queue and counts dropped oldest events', () => {
    const bus = new GameplayEventBus(3);
    for (let i = 0; i < 5; i++) bus.emit('ev', i);
    expect(bus.queueLength).toBe(3);
    expect(bus.droppedCount).toBe(2);
    const drained = bus.drain().map((e) => e.payload);
    expect(drained).toEqual([2, 3, 4]);
  });

  it('clear removes handlers and queued events', () => {
    const bus = new GameplayEventBus();
    let count = 0;
    bus.subscribe('x', () => count++);
    bus.emit('x', 1);
    bus.clear();
    bus.emit('x', 2);
    bus.drain();
    expect(count).toBe(0);
  });
});

describe('EntityRegistry', () => {
  it('creates, reads, removes, and clears entities; duplicate ids throw', () => {
    const registry = new EntityRegistry();
    const tank = { hp: 100 };
    expect(registry.create('tank.1', tank)).toBe(tank);
    expect(registry.has('tank.1')).toBe(true);
    expect(registry.get<typeof tank>('tank.1')).toBe(tank);
    expect(registry.ids()).toEqual(['tank.1']);
    expect(() => registry.create('tank.1', { hp: 1 })).toThrow(/already exists/);
    expect(registry.remove('tank.1')).toBe(true);
    expect(registry.remove('tank.1')).toBe(false);
    registry.create('a', 1);
    registry.create('b', 2);
    registry.clear();
    expect(registry.size).toBe(0);
  });
});

describe('SystemScheduler', () => {
  const makeSystem = (id: string, log: string[], priority = 0): GameplaySystem => ({
    id,
    update(ctx, dt) {
      log.push(`${id}:${ctx.time}:${dt}`);
    },
    initialize(ctx) {
      log.push(`init:${id}:${ctx.time}`);
    },
    reset(ctx) {
      log.push(`reset:${id}:${ctx.time}`);
    },
    dispose() {
      log.push(`dispose:${id}`);
    },
  });

  it('runs systems by priority (lower first) with stable registration order', () => {
    const scheduler = new SystemScheduler();
    const log: string[] = [];
    scheduler.add(makeSystem('a', log), 10);
    scheduler.add(makeSystem('b', log, 0));
    scheduler.add(makeSystem('c', log, 0));
    const bus = new GameplayEventBus();
    const ctx = createSimulationContext(bus, new EntityRegistry(), 5, 0.1);
    scheduler.update(ctx, 0.1);
    expect(log).toEqual(['b:5:0.1', 'c:5:0.1', 'a:5:0.1']);
    expect(scheduler.list()).toEqual(['b', 'c', 'a']);
  });

  it('rejects duplicate system ids and supports lifecycle hooks', () => {
    const scheduler = new SystemScheduler();
    const log: string[] = [];
    scheduler.add(makeSystem('x', log));
    expect(() => scheduler.add(makeSystem('x', log))).toThrow(/already registered/);
    const ctx: SimulationContext = createSimulationContext(new GameplayEventBus(), new EntityRegistry(), 1, 0);
    scheduler.initialize(ctx);
    scheduler.reset(ctx);
    scheduler.dispose();
    expect(log).toEqual(['init:x:1', 'reset:x:1', 'dispose:x']);
  });
});

describe('GameModeRegistry', () => {
  interface Mode {
    id: string;
    label: string;
  }

  it('registers, looks up, requires, and loads modes; duplicate ids throw', () => {
    const registry = new GameModeRegistry<Mode>();
    const demo: Mode = { id: 'mode.demoScoreAttack', label: 'Demo' };
    let factoryCalls = 0;
    registry.register(demo, () => {
      factoryCalls++;
      return { runtime: true };
    });
    expect(registry.has('mode.demoScoreAttack')).toBe(true);
    expect(registry.get('mode.demoScoreAttack')).toBe(demo);
    expect(registry.require('mode.demoScoreAttack')).toBe(demo);
    expect(registry.ids()).toEqual(['mode.demoScoreAttack']);
    expect(registry.load('mode.demoScoreAttack')).toEqual({ runtime: true });
    expect(factoryCalls).toBe(1);
    expect(() => registry.register(demo)).toThrow(/already registered/);
    expect(() => registry.require('mode.missing')).toThrow(/unknown game mode/);
    expect(() => registry.load('mode.missing')).toThrow(/unknown game mode/);
    expect(() => registry.load('mode.demoScoreAttack')).not.toThrow();
  });

  it('load() fails loudly when no factory is registered', () => {
    const registry = new GameModeRegistry<Mode>();
    registry.register({ id: 'mode.future', label: 'Future' });
    expect(() => registry.load('mode.future')).toThrow(/no factory/);
  });
});
