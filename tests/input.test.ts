import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InputManager } from '../src/client/input';

type Handler = (e: unknown) => void;

class FakeTarget {
  listeners = new Map<string, Handler[]>();
  addEventListener(type: string, fn: Handler) {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  removeEventListener(type: string, fn: Handler) {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      list.filter((h) => h !== fn),
    );
  }
  dispatch(type: string, event: unknown) {
    for (const fn of this.listeners.get(type) ?? []) fn(event);
  }
}

class FakeCanvas extends FakeTarget {
  requestPointerLockCalls = 0;
  requestPointerLock() {
    this.requestPointerLockCalls++;
    (globalThis.document as unknown as FakeDocument).pointerLockElement = {};
    (globalThis.document as unknown as FakeDocument).dispatch('pointerlockchange', {});
  }
}

class FakeDocument extends FakeTarget {
  pointerLockElement: unknown = null;
  exitPointerLock() {
    this.pointerLockElement = null;
    this.dispatch('pointerlockchange', {});
  }
  getElementById() {
    return canvas;
  }
  querySelector() {
    return canvas;
  }
}

const windowTarget = new FakeTarget();
let documentTarget: FakeDocument;
let canvas: FakeCanvas;

function keyEvent(code: string) {
  return { code, preventDefault() {} };
}

function mouseEvent(partial: Record<string, unknown> = {}) {
  return {
    button: 0,
    movementX: 0,
    movementY: 0,
    preventDefault() {},
    ...partial,
  };
}

beforeEach(() => {
  documentTarget = new FakeDocument();
  canvas = new FakeCanvas();
  (globalThis as Record<string, unknown>).window = windowTarget;
  (globalThis as Record<string, unknown>).document = documentTarget;
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).document;
});

describe('InputManager', () => {
  it('maps keyboard events to semantic key names', () => {
    const input = new InputManager();
    input.attach(canvas as unknown as HTMLElement);
    windowTarget.dispatch('keydown', keyEvent('KeyW'));
    expect(input.key('forward')).toBe(true);
    windowTarget.dispatch('keydown', keyEvent('KeyA'));
    windowTarget.dispatch('keydown', keyEvent('Space'));
    expect(input.key('left')).toBe(true);
    expect(input.key('brace')).toBe(true);
    windowTarget.dispatch('keyup', keyEvent('KeyW'));
    expect(input.key('forward')).toBe(false);
    expect(input.key('left')).toBe(true);
  });

  it('records swap, recenter, and escape as one-shot flags', () => {
    const input = new InputManager();
    input.attach(canvas as unknown as HTMLElement);
    windowTarget.dispatch('keydown', keyEvent('Tab'));
    windowTarget.dispatch('keydown', keyEvent('KeyR'));
    windowTarget.dispatch('keydown', keyEvent('Escape'));
    expect(input.consumeSwap()).toBe(true);
    expect(input.consumeRecenter()).toBe(true);
    expect(input.consumeEscape()).toBe(true);
    expect(input.consumeSwap()).toBe(false);
    expect(input.consumeRecenter()).toBe(false);
    expect(input.consumeEscape()).toBe(false);
  });

  it('consumes pointer-locked mouse movement deltas once', () => {
    const input = new InputManager();
    input.attach(canvas as unknown as HTMLElement);
    canvas.requestPointerLock();
    expect(input.locked).toBe(true);
    canvas.dispatch('mousemove', mouseEvent({ movementX: 12, movementY: -7 }));
    canvas.dispatch('mousemove', mouseEvent({ movementX: 3, movementY: 2 }));
    const first = input.consumeMouse();
    expect(first.dx).toBe(15);
    expect(first.dy).toBe(-5);
    const second = input.consumeMouse();
    expect(second.dx).toBe(0);
    expect(second.dy).toBe(0);
  });

  it('records mouse buttons only while pointer is locked', () => {
    const input = new InputManager();
    input.attach(canvas as unknown as HTMLElement);
    canvas.dispatch('mousedown', mouseEvent({ button: 0 }));
    expect(input.button('mg')).toBe(false);
    canvas.requestPointerLock();
    canvas.dispatch('mousedown', mouseEvent({ button: 0 }));
    canvas.dispatch('mousedown', mouseEvent({ button: 2 }));
    expect(input.button('mg')).toBe(true);
    expect(input.button('cannon')).toBe(true);
    windowTarget.dispatch('mouseup', mouseEvent({ button: 2 }));
    expect(input.button('cannon')).toBe(false);
    expect(input.button('mg')).toBe(true);
  });

  it('requests pointer lock from a canvas click while unlocked', () => {
    const input = new InputManager();
    input.attach(canvas as unknown as HTMLElement);
    expect(canvas.requestPointerLockCalls).toBe(0);
    canvas.dispatch('mousedown', mouseEvent({ button: 0 }));
    expect(canvas.requestPointerLockCalls).toBe(1);
    expect(input.locked).toBe(true);
    // The click that acquired the lock must not fire a weapon button.
    expect(input.button('mg')).toBe(false);
  });

  it('clears held keys and buttons when pointer lock is lost', () => {
    const input = new InputManager();
    input.attach(canvas as unknown as HTMLElement);
    windowTarget.dispatch('keydown', keyEvent('KeyW'));
    canvas.requestPointerLock();
    canvas.dispatch('mousedown', mouseEvent({ button: 0 }));
    expect(input.key('forward')).toBe(true);
    expect(input.button('mg')).toBe(true);
    documentTarget.pointerLockElement = null;
    documentTarget.dispatch('pointerlockchange', {});
    expect(input.locked).toBe(false);
    expect(input.key('forward')).toBe(false);
    expect(input.button('mg')).toBe(false);
  });
});
