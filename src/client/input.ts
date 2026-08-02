export class InputManager {
  private keys = new Set<string>();
  private mouse = new Set<string>();
  private dx = 0;
  private dy = 0;
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
    ShiftLeft: 'boost',
    ShiftRight: 'boost',
    Space: 'brace',
    Tab: 'swap',
    KeyR: 'recenter',
    KeyQ: 'swap',
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
    this.mouse.clear();
    this.dx = 0;
    this.dy = 0;
    this.swapPressed = false;
    this.recenterPressed = false;
    this.escapePressed = false;
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
    if (!this.locked) {
      this.clearAll();
    }
    this.onLockChange?.(this.locked);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    const name = this.keyMap[e.code];
    if (name === 'swap') {
      e.preventDefault();
      this.swapPressed = true;
      return;
    }
    if (name === 'recenter') {
      this.recenterPressed = true;
      return;
    }
    if (name) {
      this.keys.add(name);
      if (e.code === 'Space') e.preventDefault();
    }
    if (e.code === 'Escape') {
      this.escapePressed = true;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    const name = this.keyMap[e.code];
    if (name) this.keys.delete(name);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked || !this.enabled) return;
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

  swapPressed = false;
  recenterPressed = false;
  escapePressed = false;

  consumeSwap(): boolean {
    const v = this.swapPressed;
    this.swapPressed = false;
    return v;
  }

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

  /** Test hook: currently held semantic keys/buttons. */
  debugState(): { keys: string[]; buttons: string[]; enabled: boolean; locked: boolean; recenterPressed: boolean; swapPressed: boolean; escapePressed: boolean } {
    return {
      keys: [...this.keys],
      buttons: [...this.mouse],
      enabled: this.enabled,
      locked: this.locked,
      recenterPressed: this.recenterPressed,
      swapPressed: this.swapPressed,
      escapePressed: this.escapePressed,
    };
  }
}
