import * as THREE from 'three';
import type { EnemyAnimationRole } from '../../shared/animation/animationRoles';
import type { EnemyAnimationProfileDefinition } from '../../shared/animation/animationProfileTypes';
import type { LoadedModelInstance } from './animatedModelInstanceFactory';
import { createAnimationClipResolver, type AnimationClipResolver } from './animationClipResolver';
import { createAnimationInstance, type EnemyAnimationInstance } from './enemyAnimationInstance';
import {
  isAttackRole,
  resolveEnemyAnimationState,
  type EnemyAnimationPresentationState,
} from './enemyAnimationStateResolver';
import { animationTelemetry } from './animationTelemetry';
import { disposeAnimationInstance } from './animationCleanup';

/** Deterministic per-enemy phase seed (id + match seed). */
export function animationPhaseSeed(enemyId: number, matchSeed = 0): number {
  let h = (Math.imul(enemyId + 1, 2654435761) ^ Math.imul(matchSeed + 1, 2246822519)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * Owns one animated presentation instance: builds actions, selects semantic
 * roles from authoritative state, cross-fades, scales locomotion playback,
 * locks death, and cleans up. It never mutates gameplay.
 */
export class EnemyAnimationController {
  readonly instance: EnemyAnimationInstance;
  private readonly resolver: AnimationClipResolver;
  private readonly stateMap: Partial<Record<EnemyAnimationRole, { loop: 'repeat' | 'once' | 'pingPong'; clampWhenFinished?: boolean; timeScale?: number; interruptPriority?: number }>>;

  constructor(
    readonly profile: EnemyAnimationProfileDefinition,
    readonly model: LoadedModelInstance,
    phaseSeed: number,
    resolver: AnimationClipResolver = createAnimationClipResolver(),
  ) {
    this.resolver = resolver;
    this.stateMap = profile.playback ?? {};
    this.instance = createAnimationInstance(model.root, phaseSeed);
    this.buildActions();
    animationTelemetry.liveMixers++;
  }

  static create(
    profile: EnemyAnimationProfileDefinition,
    model: LoadedModelInstance,
    phaseSeed: number,
  ): EnemyAnimationController {
    return new EnemyAnimationController(profile, model, phaseSeed);
  }

  /** Build a paused action for every role that resolves to a real clip. */
  private buildActions(): void {
    for (const clip of this.model.source.animations) {
      const action = this.instance.mixer.clipAction(clip);
      action.paused = true;
      action.enabled = false;
    }
    for (const role of Object.keys(this.profile.clips) as EnemyAnimationRole[]) {
      const resolved = this.resolver.resolve(this.profile, role, this.model.source.animations);
      if (!resolved) continue;
      const action = this.instance.mixer.clipAction(resolved.clip);
      if (!action) continue;
      this.instance.actions.set(role, action);
      this.applyPlayback(role, action);
    }
    animationTelemetry.animationActionCount += this.instance.actions.size;
  }

  private applyPlayback(role: EnemyAnimationRole, action: THREE.AnimationAction): void {
    const settings = this.stateMap[role];
    if (settings) {
      if (settings.loop === 'once') {
        action.setLoop(THREE.LoopOnce, 1);
        if (settings.clampWhenFinished !== false) action.clampWhenFinished = true;
      } else if (settings.loop === 'pingPong') {
        action.setLoop(THREE.LoopPingPong, Infinity);
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
      }
      if (settings.timeScale) action.timeScale = settings.timeScale;
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
    }
  }

  /** Update presentation from authoritative state (called on the render frame). */
  update(state: EnemyAnimationPresentationState, dt: number): void {
    const anim = this.instance;
    if (anim.dead) {
      this.updateMixer(dt);
      return;
    }
    const resolution = resolveEnemyAnimationState(this.profile, state);
    if (!resolution.role) {
      this.updateMixer(dt);
      return;
    }

    if (resolution.role === 'death') {
      this.playRole(resolution.role, { force: true, duration: this.profile.transitions.deathCrossFadeSeconds });
      anim.dead = true;
      this.updateMixer(dt);
      return;
    }

    const current = anim.currentRole;
    if (current && current === resolution.role && anim.currentAction?.isRunning()) {
      this.applyLocomotion(resolution.role, state.speed);
      this.updateMixer(dt);
      return;
    }

    // A one-shot that has finished returns to the resolved state (usually
    // idle/locomotion) on the next update.
    if (anim.currentAction && this.isFinishedOneShot(anim.currentAction)) {
      this.applyLocomotion(resolution.role, state.speed);
    }

    this.playRole(resolution.role, {
      duration: this.transitionDuration(current, resolution.role),
    });
    this.applyLocomotion(resolution.role, state.speed);
    this.updateMixer(dt);
  }

  private playRole(
    role: EnemyAnimationRole,
    opts: { force?: boolean; duration: number },
  ): void {
    const anim = this.instance;
    let targetRole = role;
    let action = anim.actions.get(role) ?? null;
    // Missing optional clips fall back through the profile chain.
    if (!action) {
      const resolved = this.resolver.resolve(this.profile, role, this.model.source.animations);
      if (resolved) {
        targetRole = resolved.role;
        action = anim.actions.get(resolved.role) ?? null;
      }
    }
    if (!action) return; // static pose fallback (no usable clip)
    const priority = this.stateMap[targetRole]?.interruptPriority ?? 0;
    if (!opts.force && anim.currentAction && priority < anim.currentPriority) return;
    anim.currentRole = targetRole;
    anim.currentAction = action;
    anim.currentPriority = priority;
    action.reset();
    action.enabled = true;
    action.paused = false;
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(1);
    if (this.stateMap[targetRole]?.loop !== 'once') {
      action.setLoop(THREE.LoopRepeat, Infinity);
    }
    if (anim.currentAction && anim.currentAction !== action) {
      anim.currentAction.fadeOut(opts.duration);
    }
    action.fadeIn(opts.duration);
    action.play();
  }

  private transitionDuration(current: EnemyAnimationRole | null, next: EnemyAnimationRole): number {
    const t = this.profile.transitions;
    if (next === 'death') return t.deathCrossFadeSeconds;
    if (isAttackRole(next)) return t.attackCrossFadeSeconds;
    if (next === 'hit' || next === 'stagger' || next === 'knockback') return t.hitCrossFadeSeconds;
    if (next === 'walk' || next === 'run' || next === 'hoverMove' || next === 'fastHover') {
      return t.locomotionCrossFadeSeconds;
    }
    if (current && (current === 'walk' || current === 'run')) return t.locomotionCrossFadeSeconds;
    return t.defaultCrossFadeSeconds;
  }

  private applyLocomotion(role: EnemyAnimationRole, speed: number): void {
    const action = this.instance.actions.get(role);
    if (!action) return;
    if (role !== 'walk' && role !== 'run' && role !== 'hoverMove' && role !== 'fastHover') return;
    const loc = this.profile.locomotion;
    const reference = role === 'run' || role === 'fastHover' ? loc.runSpeedReference : loc.walkSpeedReference;
    const scale = THREE.MathUtils.clamp(Math.abs(speed) / Math.max(0.001, reference), loc.playbackMin, loc.playbackMax);
    action.timeScale = scale;
    if (loc.randomStartPhase && action.time === 0 && this.instance.currentRole === role) {
      action.time = this.instance.phaseSeed * action.getClip().duration;
    }
  }

  private isFinishedOneShot(action: THREE.AnimationAction): boolean {
    if (action.loop !== THREE.LoopOnce) return false;
    return action.time >= action.getClip().duration - 0.001;
  }

  private updateMixer(dt: number): void {
    this.instance.lastUpdateTime += dt;
    this.instance.mixer.update(dt);
  }

  /** Manual mixer update with real elapsed time (mid-tier reduced rate). */
  updateMixerWithDelta(deltaSeconds: number): void {
    this.instance.lastUpdateTime += deltaSeconds;
    this.instance.mixer.update(deltaSeconds);
  }

  resolvedClipNames(): string[] {
    return this.resolver.resolvedNames(this.profile);
  }

  dispose(): void {
    disposeAnimationInstance(this.instance);
  }
}
