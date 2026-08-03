/**
 * Bounded wall-clock fixed-step accumulator (Milestone 8). The simulation
 * always steps by the exact fixed dt; a blocked event loop drops time
 * instead of running an unbounded catch-up burst.
 */
export class FixedStepAccumulator {
  private accMs = 0;
  private droppedTotalMs = 0;

  constructor(
    private readonly simHz: number,
    private readonly maxCatchUpSteps: number,
  ) {}

  get tickMs(): number {
    return 1000 / this.simHz;
  }

  get droppedTimeMs(): number {
    return this.droppedTotalMs;
  }

  accumulate(elapsedMs: number): { steps: number; droppedMs: number; driftMs: number } {
    this.accMs += elapsedMs;
    let steps = 0;
    while (this.accMs >= this.tickMs && steps < this.maxCatchUpSteps) {
      this.accMs -= this.tickMs;
      steps++;
    }
    let droppedMs = 0;
    if (this.accMs >= this.tickMs) {
      droppedMs = this.accMs;
      this.droppedTotalMs += droppedMs;
      this.accMs = 0;
    }
    return { steps, droppedMs, driftMs: this.accMs };
  }
}
