import type { ProgressionSelectionState } from './progressionTypes';
import type { ProgressionRng } from './progressionRng';
import type { ProgressionTelemetry } from './progressionTelemetry';

export type SelectionRole = 'driver' | 'gunner' | 'single';

/**
 * Authoritative selection validation. Idempotent per role; deterministic
 * auto-pick uses a dedicated RNG stream.
 */
export class UpgradeSelectionController {
  constructor(
    private readonly rng: ProgressionRng,
    private readonly telemetry: ProgressionTelemetry,
    private readonly roleSeparated: boolean,
  ) {}

  submit(
    selection: ProgressionSelectionState,
    role: SelectionRole,
    offerId: string,
    cardIndex: number,
  ): { accepted: boolean; reason?: string } {
    if (selection.resolved) return { accepted: false, reason: 'resolved' };
    if (selection.offerId !== offerId) return { accepted: false, reason: 'offer_mismatch' };
    const offer = this.offerFor(selection, role);
    if (!offer) return { accepted: false, reason: 'no_offer_for_role' };
    if (cardIndex < 0 || cardIndex >= offer.length) return { accepted: false, reason: 'invalid_index' };
    const existing = this.selectionFor(selection, role);
    if (existing !== undefined) return { accepted: false, reason: 'already_selected' };
    this.setSelection(selection, role, cardIndex);
    return { accepted: true };
  }

  /** Deterministic timeout auto-pick for every unselected role. */
  autoPick(selection: ProgressionSelectionState, nowMs: number): SelectionRole[] {
    if (selection.resolved) return [];
    if (selection.expiresAtWallMs === undefined || nowMs < selection.expiresAtWallMs) return [];
    const auto: SelectionRole[] = [];
    const rand = this.rng.stream('progression.timeoutAutopick');
    const roles: SelectionRole[] = this.roleSeparated ? ['driver', 'gunner'] : ['single'];
    for (const role of roles) {
      if (this.selectionFor(selection, role) !== undefined) continue;
      const offer = this.offerFor(selection, role);
      if (!offer || offer.length === 0) continue;
      const index = Math.floor(rand() * offer.length);
      this.setSelection(selection, role, index);
      auto.push(role);
    }
    if (auto.length > 0) this.telemetry.selectionTimeouts++;
    return auto;
  }

  isComplete(selection: ProgressionSelectionState): boolean {
    const roles: SelectionRole[] = this.roleSeparated ? ['driver', 'gunner'] : ['single'];
    return roles.every((role) => {
      const offer = this.offerFor(selection, role);
      return offer !== undefined && this.selectionFor(selection, role) !== undefined;
    });
  }

  selectedCard(selection: ProgressionSelectionState, role: SelectionRole) {
    const offer = this.offerFor(selection, role);
    const index = this.selectionFor(selection, role);
    return index === undefined || !offer ? null : offer[index];
  }

  private offerFor(selection: ProgressionSelectionState, role: SelectionRole) {
    return this.roleSeparated
      ? role === 'driver'
        ? selection.driverOffer
        : selection.gunnerOffer
      : selection.singlePlayerOffer;
  }

  private selectionFor(selection: ProgressionSelectionState, role: SelectionRole): number | undefined {
    return this.roleSeparated
      ? role === 'driver'
        ? selection.driverSelection
        : selection.gunnerSelection
      : selection.singlePlayerSelection;
  }

  private setSelection(selection: ProgressionSelectionState, role: SelectionRole, index: number): void {
    if (this.roleSeparated) {
      if (role === 'driver') selection.driverSelection = index;
      else selection.gunnerSelection = index;
    } else {
      selection.singlePlayerSelection = index;
    }
  }
}
