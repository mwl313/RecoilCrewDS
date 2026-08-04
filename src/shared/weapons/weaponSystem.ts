import { angleDiff, clamp, lerp, wrapAngle } from '../math';
import { pushEvent, type SystemContext } from '../sim/systems/systemContext';
import type { GunnerInput } from '../types';
import { createBuiltinWeaponBehaviors } from './weaponBehaviors';
import { weaponStat } from './weaponDefinition';
import type { LoadoutRuntime } from './loadoutRuntime';
import { WeaponBehaviorRegistry } from './weaponBehaviorRegistry';

/**
 * Authoritative weapon system: tracks the turret, enforces per-slot
 * cooldowns (server-owned), converts legacy mg/cannon/charge inputs to
 * generic primary/secondary/ability actions, and dispatches to reusable
 * weapon behaviors. Exact legacy step order is preserved.
 */
export class WeaponSystem {
  readonly behaviors: WeaponBehaviorRegistry;
  private mgStart = false;
  private mgStop = false;
  private secondaryPressed = false;
  private secondaryReleased = false;

  constructor(
    private readonly ctx: SystemContext,
    readonly loadout: LoadoutRuntime,
  ) {
    this.behaviors = createBuiltinWeaponBehaviors();
  }

  /** Reset edge latches and burst bookkeeping (stale/clear input path). */
  clearActions(): void {
    this.loadout.clear();
    this.mgStart = false;
    this.mgStop = false;
    this.secondaryPressed = false;
    this.secondaryReleased = false;
    const tur = this.ctx.state.turret;
    tur.cannonHeld = false;
    tur.cannonHoldT = 0;
    tur.cannonChargeRatio = 0;
    tur.cannonChargeFull = false;
  }

  /** Latch discrete action edges so quick presses survive between ticks. */
  applyEdges(edges: { mgStart?: boolean; mgStop?: boolean; secondaryPressed?: boolean; secondaryReleased?: boolean }): void {
    if (edges.mgStart) this.mgStart = true;
    if (edges.mgStop) this.mgStop = true;
    if (edges.secondaryPressed) this.secondaryPressed = true;
    if (edges.secondaryReleased) this.secondaryReleased = true;
  }

  update(dt: number, input: GunnerInput): void {
    const s = this.ctx.state;
    const t = s.tank;
    const tur = s.turret;
    const w = this.ctx.rules.config.weapons;
    if (t.deadT > 0) {
      // Death cancels any active charge hold without firing.
      tur.cannonHeld = false;
      tur.cannonHoldT = 0;
      tur.cannonChargeRatio = 0;
      tur.cannonChargeFull = false;
      this.secondaryPressed = false;
      this.secondaryReleased = false;
      this.loadout.primary.state.edgeDown = input.primary;
      this.loadout.secondary.state.edgeDown = input.secondary;
      return;
    }

    // Turret movement is validated/limited by the server at all times.
    const responseMode = this.ctx.rules.loadout.turret.responseMode ?? 'instant';
    const aimValid = Number.isFinite(input.aimYaw) && Number.isFinite(input.aimPitch);
    if (responseMode === 'instant' && aimValid) {
      // Combat 05: instant response applies the accepted aim directly.
      tur.yaw = wrapAngle(input.aimYaw);
      tur.pitch = clamp(input.aimPitch, w.turretMinPitch, w.turretMaxPitch);
    } else if (aimValid) {
      tur.yaw = tur.yaw + clamp(angleDiff(tur.yaw, input.aimYaw), -w.turretTurnRate * dt, w.turretTurnRate * dt);
      tur.yaw = wrapAngle(tur.yaw);
      const pitchFollowRate = this.ctx.rules.loadout.turret.pitchFollowRate ?? 8;
      tur.pitch = clamp(lerp(tur.pitch, input.aimPitch, clamp(dt * pitchFollowRate, 0, 1)), w.turretMinPitch, w.turretMaxPitch);
    }
    tur.cannonCooldown = Math.max(0, tur.cannonCooldown - dt);
    tur.mgCooldown = Math.max(0, tur.mgCooldown - dt);
    tur.cannonFlash = Math.max(0, tur.cannonFlash - dt);
    // Cannon hold timer (relic-gated charge state machine).
    if (tur.cannonHeld) {
      tur.cannonHoldT += dt;
      this.refreshChargeRatio();
    }

    this.updatePrimary(dt, input.primary);
    this.updateSecondary(dt, input.secondary);
  }

  private updatePrimary(dt: number, held: boolean): void {
    const s = this.ctx.state;
    const t = s.tank;
    const tur = s.turret;
    const slot = this.loadout.primary;
    const w = this.ctx.rules.config.weapons;
    if (this.mgStart) {
      held = true;
      this.mgStart = false;
    }
    if (this.mgStop) {
      held = false;
      this.mgStop = false;
    }
    if (held && !slot.state.edgeDown) pushEvent(this.ctx, 'shot', t.x, t.y + 1.5, t.z, { kind: 'mgStart' });
    if (held && tur.mgCooldown <= 0) {
      tur.mgCooldown = 1 / (w.mgRate * this.ctx.rules.matchConfig.mgRate);
      this.behaviors.require(slot.definition.behaviorId).fire(this.ctx, slot.definition, slot.state);
      tur.mgFiring = true;
    } else if (!held) {
      tur.mgFiring = false;
    }
    slot.state.edgeDown = held;
    void dt;
  }

  private updateSecondary(dt: number, held: boolean): void {
    const tur = this.ctx.state.turret;
    const slot = this.loadout.secondary;
    const charged = this.ctx.capabilities.has('cannon.charge');

    if (this.secondaryReleased) {
      this.secondaryReleased = false;
      if (!tur.cannonHeld) return; // release without a valid press: safe no-op
      this.refreshChargeRatio();
      const ratio = tur.cannonChargeRatio;
      tur.cannonHeld = false;
      tur.cannonHoldT = 0;
      tur.cannonChargeRatio = 0;
      tur.cannonChargeFull = false;
      this.fireSecondary(ratio);
      slot.state.edgeDown = false;
      return;
    }

    if (this.secondaryPressed) {
      this.secondaryPressed = false;
      if (tur.cannonCooldown > 0) return;
      if (charged) {
        // Begin hold; fire happens on release.
        tur.cannonHeld = true;
        tur.cannonHoldT = 0;
        tur.cannonChargeRatio = 0;
        tur.cannonChargeFull = false;
        slot.state.edgeDown = true;
        return;
      }
      this.fireSecondary(0);
      return;
    }

    // Periodic-input fallback (tests/fixtures that do not use actions).
    if (charged) {
      if (held && !tur.cannonHeld && tur.cannonCooldown <= 0) {
        tur.cannonHeld = true;
        tur.cannonHoldT = 0;
      } else if (!held && tur.cannonHeld) {
        this.refreshChargeRatio();
        const ratio = tur.cannonChargeRatio;
        tur.cannonHeld = false;
        tur.cannonHoldT = 0;
        tur.cannonChargeRatio = 0;
        tur.cannonChargeFull = false;
        this.fireSecondary(ratio);
      }
    } else if (held && !slot.state.edgeDown && tur.cannonCooldown <= 0) {
      this.fireSecondary(0);
    }
    if (slot.state.burstsRemaining > 0) {
      slot.state.burstT += dt;
      if (slot.state.burstT >= weaponStat(slot.definition, 'weapon.burstSpacing', 0.12)) {
        slot.state.burstT = 0;
        slot.state.burstsRemaining--;
        const actionSeq = this.ctx.pendingActionSeq;
        this.behaviors.require(slot.definition.behaviorId).fire(this.ctx, slot.definition, slot.state, {
          actionSeq,
          chargeRatio: slot.state.burstChargeRatio,
        });
        this.ctx.pendingActionSeq = undefined;
      }
    }
    slot.state.edgeDown = held;
  }

  /** Fire the secondary cannon once with an immutable charge ratio. */
  private fireSecondary(chargeRatio: number): void {
    const tur = this.ctx.state.turret;
    const slot = this.loadout.secondary;
    if (tur.cannonCooldown > 0) return;
    tur.cannonCooldown = this.ctx.rules.matchConfig.cannonCooldown;
    slot.state.burstsRemaining = this.ctx.rules.matchConfig.cannonBurst - 1;
    slot.state.burstT = 0;
    slot.state.burstChargeRatio = chargeRatio;
    this.behaviors.require(slot.definition.behaviorId).fire(this.ctx, slot.definition, slot.state, {
      actionSeq: this.ctx.pendingActionSeq,
      chargeRatio,
    });
    this.ctx.pendingActionSeq = undefined;
  }

  private refreshChargeRatio(): void {
    const tur = this.ctx.state.turret;
    const def = this.loadout.secondary.definition;
    const charge = def.charge;
    const tapMax = charge?.tapMaxSeconds ?? 0.16;
    const full = charge?.fullChargeSeconds ?? 1.0;
    const ratio = clamp((tur.cannonHoldT - tapMax) / Math.max(0.001, full - tapMax), 0, 1);
    tur.cannonChargeRatio = ratio;
    tur.cannonChargeFull = ratio >= 1;
  }

}
