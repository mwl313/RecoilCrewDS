export type GunnerSlot = 'primary' | 'secondary' | 'ability';

/**
 * Per-slot weapon runtime state. Cooldowns/charge live in the canonical
 * MatchState.turret; this holds the edge latches and burst bookkeeping that
 * have no canonical home (legacy Match privates).
 */
export class WeaponRuntimeState {
  /** Edge latch: true while the action is held (semi/charge edge detection). */
  edgeDown = false;
  burstsRemaining = 0;
  burstT = 0;

  constructor(
    readonly slot: GunnerSlot,
    readonly weaponId: string,
  ) {}

  clear(): void {
    this.edgeDown = false;
    this.burstsRemaining = 0;
    this.burstT = 0;
  }
}
