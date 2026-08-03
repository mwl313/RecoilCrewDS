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
  private cannonPressed = false;

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
    this.cannonPressed = false;
  }

  /** Latch discrete action edges so quick presses survive between ticks. */
  applyEdges(edges: { mgStart?: boolean; mgStop?: boolean; cannonPressed?: boolean }): void {
    if (edges.mgStart) this.mgStart = true;
    if (edges.mgStop) this.mgStop = true;
    if (edges.cannonPressed) this.cannonPressed = true;
  }

  update(dt: number, input: GunnerInput): void {
    const s = this.ctx.state;
    const t = s.tank;
    const tur = s.turret;
    const w = this.ctx.rules.config.weapons;
    if (t.deadT > 0) {
      this.loadout.primary.state.edgeDown = input.primary;
      this.loadout.secondary.state.edgeDown = input.secondary;
      this.loadout.ability.state.edgeDown = input.ability;
      return;
    }

    // Turret movement is validated/limited by the server at all times.
    tur.yaw = tur.yaw + clamp(angleDiff(tur.yaw, input.aimYaw), -w.turretTurnRate * dt, w.turretTurnRate * dt);
    tur.yaw = wrapAngle(tur.yaw);
    const pitchFollowRate = this.ctx.rules.loadout.turret.pitchFollowRate ?? 8;
    tur.pitch = clamp(lerp(tur.pitch, input.aimPitch, clamp(dt * pitchFollowRate, 0, 1)), w.turretMinPitch, w.turretMaxPitch);
    tur.cannonCooldown = Math.max(0, tur.cannonCooldown - dt);
    tur.mgCooldown = Math.max(0, tur.mgCooldown - dt);
    tur.cannonFlash = Math.max(0, tur.cannonFlash - dt);
    tur.jackpotCooldown = Math.max(0, tur.jackpotCooldown - dt);

    this.updatePrimary(dt, input.primary);
    this.updateSecondary(dt, input.secondary);
    this.updateAbility(dt, input.ability);
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
    if (this.cannonPressed) {
      held = true;
      this.cannonPressed = false;
    }
    if (held && !slot.state.edgeDown && tur.cannonCooldown <= 0) {
      tur.cannonCooldown = this.ctx.rules.matchConfig.cannonCooldown;
      slot.state.burstsRemaining = this.ctx.rules.matchConfig.cannonBurst - 1;
      slot.state.burstT = 0;
      this.behaviors.require(slot.definition.behaviorId).fire(this.ctx, slot.definition, slot.state);
    }
    if (slot.state.burstsRemaining > 0) {
      slot.state.burstT += dt;
      if (slot.state.burstT >= weaponStat(slot.definition, 'weapon.burstSpacing', 0.12)) {
        slot.state.burstT = 0;
        slot.state.burstsRemaining--;
        this.behaviors.require(slot.definition.behaviorId).fire(this.ctx, slot.definition, slot.state);
      }
    }
    slot.state.edgeDown = held;
  }

  private updateAbility(dt: number, held: boolean): void {
    const s = this.ctx.state;
    const tur = s.turret;
    const slot = this.loadout.ability;
    if (held && tur.jackpotReady) {
      tur.chargeT += dt;
      const chargeSeconds = slot.definition.chargeSeconds ?? 1;
      if (tur.chargeT >= chargeSeconds) {
        this.behaviors.require(slot.definition.behaviorId).fire(this.ctx, slot.definition, slot.state);
        tur.chargeT = 0;
        s.stats.jackpotMeter = 0;
        tur.jackpotReady = false;
      }
    } else if (!held && tur.chargeT > 0) {
      tur.chargeT = Math.max(0, tur.chargeT - dt * 2);
    }
    slot.state.edgeDown = held;
  }
}
