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
    expect(input.key('left')).toBe(true);
    windowTarget.dispatch('keyup', keyEvent('KeyW'));
    expect(input.key('forward')).toBe(false);
    expect(input.key('left')).toBe(true);
  });

  it('Space latches exactly one jump edge per press', () => {
    const input = new InputManager();
    input.attach(canvas as unknown as HTMLElement);
    windowTarget.dispatch('keydown', keyEvent('Space'));
    expect(input.edge('jump')).toBe(true);
    expect(input.edge('dash')).toBe(false);
    // The latch persists across frames until the input frame consumes it.
    expect(input.edge('jump')).toBe(true);
    input.clearDriverEdges();
    expect(input.edge('jump')).toBe(false);
  });

  it('holding Space never repeats the jump edge and keyup re-arms it', () => {
    const input = new InputManager();
    input.attach(canvas as unknown as HTMLElement);
    windowTarget.dispatch('keydown', keyEvent('Space'));
    // Browser key-repeat events (no keyup between) must not re-latch.
    windowTarget.dispatch('keydown', { ...keyEvent('Space'), repeat: true });
    windowTarget.dispatch('keydown', { ...keyEvent('Space'), repeat: true });
    input.clearDriverEdges();
    expect(input.edge('jump')).toBe(false);
    // Still held: no new edge even after clearing.
    windowTarget.dispatch('keydown', keyEvent('Space'));
    expect(input.edge('jump')).toBe(false);
    // Release, then a fresh press produces a new edge.
    windowTarget.dispatch('keyup', keyEvent('Space'));
    windowTarget.dispatch('keydown', keyEvent('Space'));
    expect(input.edge('jump')).toBe(true);
  });

  it('Shift latches exactly one dash edge per press from either Shift key', () => {
    const input = new InputManager();
    input.attach(canvas as unknown as HTMLElement);
    windowTarget.dispatch('keydown', keyEvent('ShiftLeft'));
    expect(input.edge('dash')).toBe(true);
    windowTarget.dispatch('keyup', keyEvent('ShiftLeft'));
    windowTarget.dispatch('keydown', keyEvent('ShiftRight'));
    expect(input.edge('dash')).toBe(true);
    input.clearDriverEdges();
    expect(input.edge('dash')).toBe(false);
  });

  it('blur, visibility loss, pointer-lock loss, and disable clear latches', () => {
    const input = new InputManager();
    input.attach(canvas as unknown as HTMLElement);
    const relatch = () => {
      windowTarget.dispatch('keydown', keyEvent('Space'));
      windowTarget.dispatch('keydown', keyEvent('ShiftLeft'));
    };
    relatch();
    windowTarget.dispatch('blur', {});
    expect(input.edge('jump')).toBe(false);
    expect(input.edge('dash')).toBe(false);

    relatch();
    (documentTarget as unknown as { visibilityState: string }).visibilityState = 'hidden';
    documentTarget.dispatch('visibilitychange', {});
    expect(input.edge('jump')).toBe(false);
    expect(input.edge('dash')).toBe(false);
    (documentTarget as unknown as { visibilityState: string }).visibilityState = 'visible';

    relatch();
    input.setEnabled(false);
    expect(input.edge('jump')).toBe(false);
    expect(input.edge('dash')).toBe(false);
    input.setEnabled(true);

    relatch();
    documentTarget.pointerLockElement = null;
    documentTarget.dispatch('pointerlockchange', {});
    expect(input.edge('jump')).toBe(false);
    expect(input.edge('dash')).toBe(false);
  });

  it('exposes latched edges in the debug test hook', () => {
    const input = new InputManager();
    input.attach(canvas as unknown as HTMLElement);
    windowTarget.dispatch('keydown', keyEvent('Space'));
    expect(input.debugState().latches).toContain('jump');
    input.clearDriverEdges();
    expect(input.debugState().latches).toEqual([]);
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
    expect(input.button('primary')).toBe(false);
    canvas.requestPointerLock();
    canvas.dispatch('mousedown', mouseEvent({ button: 0 }));
    canvas.dispatch('mousedown', mouseEvent({ button: 2 }));
    expect(input.button('primary')).toBe(true);
    expect(input.button('secondary')).toBe(true);
    windowTarget.dispatch('mouseup', mouseEvent({ button: 2 }));
    expect(input.button('secondary')).toBe(false);
    expect(input.button('primary')).toBe(true);
  });

  it('requests pointer lock from a canvas click while unlocked', () => {
    const input = new InputManager();
    input.attach(canvas as unknown as HTMLElement);
    expect(canvas.requestPointerLockCalls).toBe(0);
    canvas.dispatch('mousedown', mouseEvent({ button: 0 }));
    expect(canvas.requestPointerLockCalls).toBe(1);
    expect(input.locked).toBe(true);
    // The click that acquired the lock must not fire a weapon button.
    expect(input.button('primary')).toBe(false);
  });

  it('clears held keys and buttons when pointer lock is lost', () => {
    const input = new InputManager();
    input.attach(canvas as unknown as HTMLElement);
    windowTarget.dispatch('keydown', keyEvent('KeyW'));
    canvas.requestPointerLock();
    canvas.dispatch('mousedown', mouseEvent({ button: 0 }));
    expect(input.key('forward')).toBe(true);
    expect(input.button('primary')).toBe(true);
    documentTarget.pointerLockElement = null;
    documentTarget.dispatch('pointerlockchange', {});
    expect(input.locked).toBe(false);
    expect(input.key('forward')).toBe(false);
    expect(input.button('primary')).toBe(false);
  });
});
