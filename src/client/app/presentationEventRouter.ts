import type { AssetService } from '../assets';
import type { AudioManager } from '../audio';
import type { VfxSystem } from '../vfx';
import type { CameraManager } from './cameraManager';
import type { SimEvent } from '../../shared/types';

export interface ActionPresentationGuard {
  /** True when this actionSeq was already presented locally. */
  isPresented(actionSeq: number): boolean;
  /** Authoritative confirmation: remove the pending local presentation. */
  confirm(actionSeq: number): void;
  /** Rejection: fade/remove the pending local presentation. */
  reject(actionSeq: number): void;
}

/**
 * Routes authoritative wire events into semantic presentation: VFX/audio ids
 * resolve through the presentation catalog, camera impulses through the
 * cameraImpulse definitions. All procedural numbers come from the registered
 * fallback specs (identical Demo visuals).
 */
export class PresentationEventRouter {
  constructor(
    private readonly assets: AssetService,
    private readonly vfx: VfxSystem,
    private readonly audio: AudioManager,
    private readonly camera: CameraManager,
    private readonly actionGuard: ActionPresentationGuard | null = null,
  ) {}

  handleEvent(ev: SimEvent): void {
    if (ev.type === 'shot') {
      const alreadyPresented = ev.actionSeq !== undefined && ev.actionSeq > 0 && this.actionGuard?.isPresented(ev.actionSeq) === true;
      if (alreadyPresented) {
        this.actionGuard!.confirm(ev.actionSeq!);
        return; // duplicate suppression: local presentation already played
      }
      if (ev.kind === 'mg' && ev.x !== undefined && ev.tx !== undefined) {
        this.vfx.spawnTracer(ev.x, ev.y!, ev.z!, ev.x + ev.tx * 34, ev.y! + ev.ty! * 34, ev.z! + ev.tz! * 34, 0xffe08a, 0.07);
        this.audio.play('machineGun');
      } else if (ev.kind === 'cannon') {
        const muzzle = this.assets.vfx('vfx.cannonMuzzle');
        const ratio = Math.max(0, Math.min(1, ev.chargeRatio ?? 0));
        const scale = 3.2 + ratio * 4;
        this.vfx.spawnFlash(ev.x!, ev.y!, ev.z!, ratio >= 1 ? 0xfff2b0 : muzzle.color, muzzle.size * scale, muzzle.life + ratio * 0.2);
        this.vfx.spawnBurst(ev.x!, ev.y!, ev.z!, ratio >= 1 ? 0xfff2b0 : muzzle.color, muzzle.count, muzzle.size * (0.35 + ratio * 0.5), 0.35, 0.3, 8);
        this.audio.play('cannon');
        this.camera.addImpulse(this.assets.cameraImpulse('cameraImpulse.cannon').shake * (1 + ratio));
      }
    } else if (ev.type === 'mgHit') {
      const spec = this.assets.vfx('vfx.machineGunMuzzle');
      this.vfx.spawnBurst(ev.x!, ev.y!, ev.z!, 0xffd27a, 6, spec.size, 0.18, 0.2, 6);
      this.audio.play('enemyHit');
    } else if (ev.type === 'hit' && ev.kind === 'tower') {
      this.audio.play('collision');
      this.camera.addImpulse(this.assets.cameraImpulse('cameraImpulse.towerHit').shake);
    } else if (ev.type === 'kill') {
      const spec = this.assets.vfx('vfx.enemyDeath');
      this.vfx.explosion(ev.x!, ev.y!, ev.z!, spec.color, false);
      this.vfx.smoke(ev.x!, ev.y!, ev.z!);
      this.audio.play('enemyDeath');
      if (ev.kind === 'lootTruck') this.audio.play('cannon');
    } else if (ev.type === 'enemyExplosion' || ev.type === 'barrelExplode') {
      const big = (ev.value ?? 3) > 5;
      const spec = this.assets.vfx('vfx.cannonImpact');
      this.vfx.explosion(ev.x!, ev.y!, ev.z!, spec.color, big);
      this.vfx.smoke(ev.x!, ev.y!, ev.z!, 0x555555, 5, 1.4);
      this.audio.play('enemyDeath');
      this.camera.addImpulse(this.assets.cameraImpulse(big ? 'cameraImpulse.barrelBig' : 'cameraImpulse.barrelSmall').shake);
    } else if (ev.type === 'chainExplode') {
      this.vfx.explosion(ev.x!, ev.y!, ev.z!, 0xffa040, false);
    } else if (ev.type === 'pickup') {
      const kind = ev.kind === 'heavy' ? 'heavy' : 'normal';
      const spec = this.assets.vfx('vfx.scrapPickup');
      const color = kind === 'heavy' ? 0x7de05a : 0x4ddb6e;
      this.vfx.spawnBurst(ev.x!, ev.y!, ev.z!, color, 16, spec.size, 0.3, 0.4, 5);
      this.vfx.spawnRing(ev.x!, ev.y!, ev.z!, color, 2.2, 0.3);
      this.audio.play('scrapPickup', { kind });
    } else if (ev.type === 'wipeout') {
      const spec = this.assets.vfx('vfx.enemyDeath');
      this.vfx.explosion(ev.x!, ev.y!, ev.z!, 0xff5533, true);
      this.vfx.smoke(ev.x!, ev.y!, ev.z!, 0x333333, 12, 2);
      this.audio.play('wipeout');
      this.camera.addImpulse(this.assets.cameraImpulse('cameraImpulse.wipeout').shake);
    } else if (ev.type === 'respawn') {
      this.vfx.spawnRing(ev.x!, ev.y!, ev.z!, 0x5eeaff, 4, 0.5);
      this.audio.play('ui');
    } else if (ev.type === 'rammerTelegraph') {
      this.audio.play('rammerTelegraph');
    } else if (ev.type === 'towerFire') {
      this.audio.play('towerFire');
      if (ev.x !== undefined && ev.tx !== undefined) {
        this.vfx.spawnTracer(ev.x, ev.y!, ev.z!, ev.tx, ev.ty!, ev.tz!, 0xff5a4a, 0.5);
      }
    } else if (ev.type === 'truckSpawn') {
      this.audio.play('truckSiren');
    } else if (ev.type === 'truckEscape') {
      this.audio.play('collision');
    } else if (ev.type === 'crash') {
      this.audio.play('collision');
      this.camera.addImpulse(this.assets.cameraImpulse('cameraImpulse.crash').shake);
    } else if (ev.type === 'jump') {
      this.vfx.spawnJumpDust(ev.x!, ev.y!, ev.z!);
      this.audio.play('jump');
    } else if (ev.type === 'dash') {
      this.vfx.spawnDashBurst(ev.x!, ev.y!, ev.z!, ev.yaw ?? 0);
      this.audio.play('dash');
    }
    // assist/link/score/comboChange are HUD-only.
  }
}
