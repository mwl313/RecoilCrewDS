export class InputManager {
  private keys = new Set<string>();
  /** Keys currently held down that can re-arm a one-shot action edge. */
  private actionArmed = new Set<string>();
  /** Pending one-shot action edges, cleared after the next input frame. */
  private actionLatches = new Set<string>();
  private mouse = new Set<string>();
  private dx = 0;
  private dy = 0;
  private lastRawDx = 0;
  private lastRawDy = 0;
  private pointerLockChangedAt = 0;
  private rejectedMouseEvents = 0;
  locked = false;
  private enabled = true;

  onLockChange: ((locked: boolean) => void) | null = null;

  private keyMap: Record<string, string> = {
    KeyW: 'forward',
    ArrowUp: 'forward',
    KeyS: 'back',
    ArrowDown: 'back',
    KeyA: 'left',
    ArrowLeft: 'left',
    KeyD: 'right',
    ArrowRight: 'right',
    ShiftLeft: 'dash',
    ShiftRight: 'dash',
    Space: 'jump',
    KeyR: 'recenter',
  };

  attach(canvas: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', this.onLock);
  }

  detach() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    document.removeEventListener('pointerlockchange', this.onLock);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.clearAll();
  }

  private clearAll() {
    this.keys.clear();
    this.actionArmed.clear();
    this.actionLatches.clear();
    this.mouse.clear();
    this.clearPointerDeltas();
    this.recenterPressed = false;
    this.escapePressed = false;
  }

  private clearPointerDeltas() {
    this.dx = 0;
    this.dy = 0;
    this.lastRawDx = 0;
    this.lastRawDy = 0;
  }

  private onBlur = () => {
    this.clearAll();
  };

  private onVisibility = () => {
    if (document.visibilityState === 'hidden') this.clearAll();
  };

  requestLock() {
    const el = document.getElementById('game-canvas') ?? document.querySelector('canvas');
    if (el && !this.locked) {
      try {
        const p = el.requestPointerLock() as unknown as Promise<void> | undefined;
        if (p && typeof p.catch === 'function') p.catch(() => undefined);
      } catch {
        // unsupported
      }
    }
  }

  releaseLock() {
    if (this.locked && document.pointerLockElement) document.exitPointerLock();
  }

  private onLock = () => {
    this.locked = document.pointerLockElement !== null;
    // Browsers may report a stale movement delta at either edge of a lock
    // transition. Never carry that delta into the first gameplay RAF.
    this.clearPointerDeltas();
    this.pointerLockChangedAt = nowMs();
    if (!this.locked) {
      this.clearAll();
    }
    this.onLockChange?.(this.locked);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    const name = this.keyMap[e.code];
    if (name === 'dash' || name === 'jump') {
      e.preventDefault();
      // Browser key-repeat and any keydown while already held are ignored;
      // the edge latches once and waits for keyup before re-arming.
      if (!this.actionArmed.has(name)) {
        this.actionArmed.add(name);
        this.actionLatches.add(name);
      }
      return;
    }
    if (name === 'recenter') {
      this.recenterPressed = true;
      return;
    }
    if (name) {
      this.keys.add(name);
    }
    if (e.code === 'Escape') {
      this.escapePressed = true;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    const name = this.keyMap[e.code];
    if (name === 'dash' || name === 'jump') {
      this.actionArmed.delete(name);
      return;
    }
    if (name) this.keys.delete(name);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked || !this.enabled) return;
    if (!Number.isFinite(e.movementX) || !Number.isFinite(e.movementY)) {
      this.rejectedMouseEvents++;
      return;
    }
    this.lastRawDx = e.movementX;
    this.lastRawDy = e.movementY;
    this.dx += e.movementX;
    this.dy += e.movementY;
  };

  private onMouseDown = (e: MouseEvent) => {
    if (!this.enabled) return;
    if (!this.locked) {
      // First click after countdown/pause acquires pointer lock (must run
      // inside the user gesture for Chrome to accept it).
      this.requestLock();
      return;
    }
    if (e.button === 0) this.mouse.add('primary');
    if (e.button === 2) this.mouse.add('secondary');
  };

  private onMouseUp = (e: MouseEvent) => {
    if (!this.enabled) return;
    if (e.button === 0) this.mouse.delete('primary');
    if (e.button === 2) this.mouse.delete('secondary');
  };

  recenterPressed = false;
  escapePressed = false;

  consumeRecenter(): boolean {
    const v = this.recenterPressed;
    this.recenterPressed = false;
    return v;
  }

  consumeEscape(): boolean {
    const v = this.escapePressed;
    this.escapePressed = false;
    return v;
  }

  consumeMouse(): { dx: number; dy: number } {
    const out = { dx: this.dx, dy: this.dy };
    this.dx = 0;
    this.dy = 0;
    return out;
  }

  key(name: string): boolean {
    return this.keys.has(name);
  }

  button(name: string): boolean {
    return this.mouse.has(name);
  }

  /** Latched one-shot action edge (not consumed; survives until the next frame). */
  edge(name: 'dash' | 'jump'): boolean {
    return this.actionLatches.has(name);
  }

  /** Clear pending action edges after a Driver input frame was created. */
  clearDriverEdges(): void {
    this.actionLatches.clear();
  }

  /** Test hook: currently held semantic keys/buttons. */
  debugState(): {
    keys: string[];
    latches: string[];
    buttons: string[];
    enabled: boolean;
    locked: boolean;
    recenterPressed: boolean;
    escapePressed: boolean;
    pointer: {
      accumulatedDx: number;
      accumulatedDy: number;
      lastRawDx: number;
      lastRawDy: number;
      rejectedEvents: number;
      msSinceLockChange: number;
    };
  } {
    return {
      keys: [...this.keys],
      latches: [...this.actionLatches],
      buttons: [...this.mouse],
      enabled: this.enabled,
      locked: this.locked,
      recenterPressed: this.recenterPressed,
      escapePressed: this.escapePressed,
      pointer: {
        accumulatedDx: this.dx,
        accumulatedDy: this.dy,
        lastRawDx: this.lastRawDx,
        lastRawDy: this.lastRawDy,
        rejectedEvents: this.rejectedMouseEvents,
        msSinceLockChange: this.pointerLockChangedAt > 0
          ? Math.max(0, nowMs() - this.pointerLockChangedAt)
          : 0,
      },
    };
  }
}

function nowMs(): number {
  return typeof performance !== 'undefined' && Number.isFinite(performance.now())
    ? performance.now()
    : Date.now();
}
