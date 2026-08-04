/**
 * Farming countdown clock. It only runs while farming; waves pause it and
 * leader death resumes it. It is not a total match timer.
 */
export class FarmingClock {
  private running = true;
  constructor(public remaining: number) {}

  get isRunning(): boolean {
    return this.running;
  }

  advance(dt: number): void {
    if (this.running) this.remaining = Math.max(0, this.remaining - dt);
  }

  pause(): void {
    this.running = false;
  }

  resume(): void {
    this.running = true;
  }
}
