export type CountdownWait = (durationMs: number) => Promise<void>;

const COUNTDOWN_STEPS = [
  { value: 3, durationMs: 1000 },
  { value: 2, durationMs: 1000 },
  { value: 1, durationMs: 1000 },
  { value: 0, durationMs: 250 },
] as const;

const wait: CountdownWait = (durationMs) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, durationMs));

/** Plays the same 3–2–1–GO presentation used by multiplayer. */
export async function runCountdownSequence(
  showStep: (value: number) => void,
  waitFor: CountdownWait = wait,
): Promise<void> {
  for (const step of COUNTDOWN_STEPS) {
    showStep(step.value);
    await waitFor(step.durationMs);
  }
}
