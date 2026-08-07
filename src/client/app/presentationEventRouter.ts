import type { AssetService } from '../assets';
import type { AudioManager } from '../audio';
import {
  classifyLanding,
  resolveEnemyAudioProfile,
  resolveEnemyDeathRecipe,
  resolveEnemyFireRecipe,
  resolveLegacyEnemyCue,
} from '../audio/procedural/enemyAudioResolver';
import { stableEventSeed } from '../audio/procedural/proceduralSoundMath';
import type { ProceduralSoundRecipe } from '../audio/procedural/proceduralSoundTypes';
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

/** Routes authoritative simulation events into semantic VFX and sound recipes. */
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
      this.handlePlayerShot(ev);
      return;
    }
    if (ev.type === 'mgHit') {
      const spec = this.assets.vfx('vfx.machineGunMuzzle');
      this.vfx.spawnBurst(ev.x!, ev.y!, ev.z!, 0xffd27a, 6, spec.size, 0.18, 0.2, 6);
      this.audio.play('enemyHit');
      return;
    }
    if (ev.type === 'hit' && ev.kind === 'tower') {
      this.audio.playLocal('enemyProjectileImpact', {
        seed: this.seed(ev),
        damage: ev.value,
        tier: 'specialist',
        variant: 'legacyTower',
      });
      this.camera.addImpulse(this.assets.cameraImpulse('cameraImpulse.towerHit').shake);
      return;
    }
    if (ev.type === 'enemyProjectileImpact') {
      this.handleEnemyProjectileImpact(ev);
      return;
    }
    if (ev.type === 'enemyMeleeImpact') {
      this.audio.playLocal('enemyMeleeImpact', {
        seed: this.seed(ev),
        damage: ev.value,
        tier: resolveEnemyAudioProfile(ev).tier,
        variant: ev.kind === 'rammer' ? 'rammer' : ev.kind,
      });
      this.camera.addImpulse(Math.min(0.65, 0.12 + (ev.value ?? 4) * 0.025));
      return;
    }
    if (ev.type === 'kill') {
      this.handleEnemyDeath(ev);
      return;
    }
    if (ev.type === 'playerCannonImpact') {
      this.handleCannonImpact(ev);
      return;
    }
    if (ev.type === 'enemyExplosion') {
      // Compatibility for legacy/demo and in-flight snapshots from older servers.
      if (ev.kind === 'cannon') this.handleCannonImpact(ev);
      else this.playWorld('enemyProjectileImpact', ev, { damage: ev.value, variant: 'world' });
      const spec = this.assets.vfx('vfx.cannonImpact');
      this.vfx.explosion(ev.x!, ev.y!, ev.z!, spec.color, (ev.value ?? 0) > 5);
      return;
    }
    if (ev.type === 'barrelExplode') {
      this.handleBarrelExplosion(ev, false);
      return;
    }
    if (ev.type === 'chainExplode') {
      this.handleBarrelExplosion(ev, true);
      return;
    }
    if (ev.type === 'pickup') {
      const kind = ev.kind === 'heavy' ? 'heavy' : 'normal';
      const spec = this.assets.vfx('vfx.scrapPickup');
      const color = kind === 'heavy' ? 0x7de05a : 0x4ddb6e;
      this.vfx.spawnBurst(ev.x!, ev.y!, ev.z!, color, 16, spec.size, 0.3, 0.4, 5);
      this.vfx.spawnRing(ev.x!, ev.y!, ev.z!, color, 2.2, 0.3);
      this.audio.play('scrapPickup', { kind });
      return;
    }
    if (ev.type === 'wipeout') {
      this.vfx.explosion(ev.x!, ev.y!, ev.z!, 0xff5533, true);
      this.vfx.smoke(ev.x!, ev.y!, ev.z!, 0x333333, 12, 2);
      this.audio.playLocal('wipeout', { seed: this.seed(ev) });
      this.camera.addImpulse(this.assets.cameraImpulse('cameraImpulse.wipeout').shake);
      return;
    }
    if (ev.type === 'respawn') {
      this.vfx.spawnRing(ev.x!, ev.y!, ev.z!, 0x5eeaff, 4, 0.5);
      this.audio.play('ui');
      return;
    }
    if (ev.type === 'enemyTelegraph') {
      this.playWorld('enemyTelegraph', ev, resolveEnemyAudioProfile(ev));
      return;
    }
    if (ev.type === 'enemyFire') {
      const profile = resolveEnemyAudioProfile(ev);
      this.playWorld(resolveEnemyFireRecipe(profile.tier), ev, profile);
      return;
    }
    if (ev.type === 'bossTelegraph') {
      this.playWorld('bossTelegraph', ev, resolveEnemyAudioProfile(ev));
      return;
    }
    if (ev.type === 'bossFire') {
      this.playWorld('bossFire', ev, resolveEnemyAudioProfile(ev));
      return;
    }
    if (ev.type === 'rammerTelegraph' || ev.type === 'towerFire') {
      this.handleLegacyEnemyCue(ev);
      return;
    }
    if (ev.type === 'truckSpawn') {
      this.playWorld('truckSiren', ev);
      return;
    }
    if (ev.type === 'truckEscape') {
      this.audio.playLocal('truckCollision', { seed: this.seed(ev) });
      return;
    }
    if (ev.type === 'crash') {
      const recipe = ev.kind === 'truck'
        ? 'truckCollision'
        : ev.kind === 'monster' || ev.kind === 'boss'
          ? 'monsterCollision'
          : 'wallCollision';
      this.audio.playLocal(recipe, { seed: this.seed(ev), damage: ev.value });
      this.camera.addImpulse(this.assets.cameraImpulse('cameraImpulse.crash').shake);
      return;
    }
    if (ev.type === 'tankLanding') {
      this.audio.playLocal(classifyLanding(ev.value ?? 0), { seed: this.seed(ev), intensity: Math.min(1.3, 0.7 + (ev.value ?? 0) / 18) });
      return;
    }
    if (ev.type === 'jump') {
      this.vfx.spawnJumpDust(ev.x!, ev.y!, ev.z!);
      this.audio.playLocal('jump', { seed: this.seed(ev) });
      return;
    }
    if (ev.type === 'dash') {
      this.vfx.spawnDashBurst(ev.x!, ev.y!, ev.z!, ev.yaw ?? 0);
      this.audio.playLocal('dash', { seed: this.seed(ev) });
    }
    // assist/link/score/comboChange are HUD-only.
  }

  private handlePlayerShot(ev: SimEvent): void {
    const alreadyPresented = ev.actionSeq !== undefined && ev.actionSeq > 0 && this.actionGuard?.isPresented(ev.actionSeq) === true;
    if (alreadyPresented) {
      this.actionGuard!.confirm(ev.actionSeq!);
      return;
    }
    if (ev.kind === 'mg' && ev.x !== undefined && ev.tx !== undefined) {
      this.vfx.spawnTracer(ev.x, ev.y!, ev.z!, ev.x + ev.tx * 34, ev.y! + ev.ty! * 34, ev.z! + ev.tz! * 34, 0xffe08a, 0.07);
      this.audio.playLocal('playerMg', { seed: this.seed(ev) });
      return;
    }
    if (ev.kind === 'cannon') {
      const muzzle = this.assets.vfx('vfx.cannonMuzzle');
      const ratio = Math.max(0, Math.min(1, ev.chargeRatio ?? 0));
      const scale = 3.2 + ratio * 4;
      this.vfx.spawnFlash(ev.x!, ev.y!, ev.z!, ratio >= 1 ? 0xfff2b0 : muzzle.color, muzzle.size * scale, muzzle.life + ratio * 0.2);
      this.vfx.spawnBurst(ev.x!, ev.y!, ev.z!, ratio >= 1 ? 0xfff2b0 : muzzle.color, muzzle.count, muzzle.size * (0.35 + ratio * 0.5), 0.35, 0.3, 8);
      this.audio.playLocal('playerCannon', { seed: this.seed(ev), chargeRatio: ratio });
      this.camera.addImpulse(this.assets.cameraImpulse('cameraImpulse.cannon').shake * (1 + ratio));
    }
  }

  private handleEnemyProjectileImpact(ev: SimEvent): void {
    const profile = resolveEnemyAudioProfile(ev);
    if (ev.kind === 'world') {
      const spec = this.assets.vfx('vfx.cannonImpact');
      this.vfx.explosion(ev.x!, ev.y!, ev.z!, spec.color, false);
      this.playWorld('enemyProjectileImpact', ev, { ...profile, damage: ev.value, variant: 'world', priority: 46 });
      return;
    }
    this.audio.playLocal('enemyProjectileImpact', {
      seed: this.seed(ev),
      damage: ev.value,
      tier: profile.tier,
      sizeClass: profile.sizeClass,
      variant: ev.kind,
    });
    this.camera.addImpulse(Math.min(0.8, 0.14 + (ev.value ?? 6) * 0.03));
  }

  private handleEnemyDeath(ev: SimEvent): void {
    const profile = resolveEnemyAudioProfile(ev);
    const spec = this.assets.vfx('vfx.enemyDeath');
    this.vfx.explosion(ev.x!, ev.y!, ev.z!, spec.color, profile.tier === 'elite' || profile.tier === 'boss');
    this.vfx.smoke(ev.x!, ev.y!, ev.z!);
    this.playWorld(resolveEnemyDeathRecipe(profile.tier), ev, profile);
  }

  private handleCannonImpact(ev: SimEvent): void {
    const big = (ev.value ?? 3) > 5 || (ev.chargeRatio ?? 0) >= 0.75;
    const spec = this.assets.vfx('vfx.cannonImpact');
    this.vfx.explosion(ev.x!, ev.y!, ev.z!, spec.color, big);
    this.vfx.smoke(ev.x!, ev.y!, ev.z!, 0x555555, 5, 1.4);
    this.playWorld('cannonImpact', ev, {
      chargeRatio: ev.chargeRatio,
      splashRadius: ev.value,
      visualScale: ev.value,
      priority: big ? 84 : 78,
    });
  }

  private handleBarrelExplosion(ev: SimEvent, chain: boolean): void {
    const big = !chain && (ev.value ?? 3) > 5;
    const spec = this.assets.vfx('vfx.cannonImpact');
    this.vfx.explosion(ev.x!, ev.y!, ev.z!, chain ? 0xffa040 : spec.color, big);
    if (!chain) this.vfx.smoke(ev.x!, ev.y!, ev.z!, 0x555555, 5, 1.4);
    this.playWorld(chain ? 'barrelChainExplosion' : 'barrelExplosion', ev, {
      intensity: big ? 1.2 : 1,
      priority: big ? 74 : undefined,
    });
    if (!chain) this.camera.addImpulse(this.assets.cameraImpulse(big ? 'cameraImpulse.barrelBig' : 'cameraImpulse.barrelSmall').shake);
  }

  private handleLegacyEnemyCue(ev: SimEvent): void {
    const recipe = resolveLegacyEnemyCue(ev);
    if (recipe) this.playWorld(recipe, ev, resolveEnemyAudioProfile(ev));
    if (ev.type === 'towerFire' && ev.x !== undefined && ev.tx !== undefined) {
      this.vfx.spawnTracer(ev.x, ev.y!, ev.z!, ev.tx, ev.ty!, ev.tz!, 0xff5a4a, 0.5);
    }
  }

  private playWorld(recipe: ProceduralSoundRecipe, ev: SimEvent, options: Record<string, unknown> = {}): void {
    if (ev.x === undefined || ev.y === undefined || ev.z === undefined) {
      this.audio.playLocal(recipe, { ...options, seed: this.seed(ev) });
      return;
    }
    this.audio.playWorld(recipe, {
      ...options,
      x: ev.x,
      y: ev.y,
      z: ev.z,
      seed: this.seed(ev),
    });
  }

  private seed(ev: SimEvent): number {
    return stableEventSeed(ev.id ?? 0, ev.eventSequence ?? ev.actionSeq ?? 0, ev.t);
  }
}
