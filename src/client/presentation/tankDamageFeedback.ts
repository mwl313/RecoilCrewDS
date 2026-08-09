import * as THREE from 'three';
import type { SimEvent } from '../../shared/types';

export type TankDamageFeedbackTier = 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'BOSS';

export interface TankDamageSample {
  actualDamage: number;
  maxIntegrity: number;
  source: string;
  impactKind: SimEvent['impactKind'];
  attackerTier?: SimEvent['tier'];
  tankX: number;
  tankZ: number;
  sourceX?: number;
  sourceZ?: number;
}

export interface CoalescedTankDamage extends TankDamageSample {
  hitCount: number;
}

export function classifyTankDamageFeedback(
  actualDamage: number,
  maxIntegrity: number,
  attackerTier?: SimEvent['tier'],
): TankDamageFeedbackTier {
  if (attackerTier === 'boss') return 'BOSS';
  const ratio = Math.max(0, actualDamage) / Math.max(1, maxIntegrity);
  if (ratio < .045) return 'LIGHT';
  if (ratio < .11) return 'MEDIUM';
  return 'HEAVY';
}

/** -1 left, +1 right, 0 unknown/center. */
export function tankDamageScreenDirection(
  sample: Pick<TankDamageSample, 'tankX' | 'tankZ' | 'sourceX' | 'sourceZ'>,
  camera: THREE.Camera,
): number {
  if (sample.sourceX === undefined || sample.sourceZ === undefined) return 0;
  const dx = sample.sourceX - sample.tankX;
  const dz = sample.sourceZ - sample.tankZ;
  const length = Math.hypot(dx, dz);
  if (length < .001) return 0;
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  return Math.max(-1, Math.min(1, (dx * right.x + dz * right.z) / length));
}

export class TankDamageCoalescer {
  private pending: (CoalescedTankDamage & { firstAt: number }) | null = null;

  constructor(readonly windowMs = 80) {}

  add(sample: TankDamageSample, now: number): CoalescedTankDamage | null {
    const flushed = this.pending && now - this.pending.firstAt > this.windowMs
      ? this.take()
      : null;
    if (!this.pending) {
      this.pending = { ...sample, hitCount: 1, firstAt: now };
    } else {
      this.pending.actualDamage += sample.actualDamage;
      this.pending.hitCount++;
      if (sample.attackerTier === 'boss') this.pending.attackerTier = 'boss';
      if (sample.sourceX !== undefined) {
        this.pending.sourceX = sample.sourceX;
        this.pending.sourceZ = sample.sourceZ;
      }
      this.pending.source = sample.source;
      this.pending.impactKind = sample.impactKind;
    }
    return flushed;
  }

  drain(now: number): CoalescedTankDamage | null {
    return this.pending && now - this.pending.firstAt >= this.windowMs ? this.take() : null;
  }

  reset(): void {
    this.pending = null;
  }

  private take(): CoalescedTankDamage | null {
    if (!this.pending) return null;
    const { firstAt: _firstAt, ...result } = this.pending;
    this.pending = null;
    return result;
  }
}

/** Fixed DOM overlay plus integrity HUD punches; no additional canvas. */
export class TankDamageFeedbackLayer {
  readonly element: HTMLDivElement;
  readonly reducedMotion: boolean;
  readonly reducedFlash: boolean;

  constructor(private readonly container: HTMLElement) {
    this.reducedMotion = typeof globalThis.matchMedia === 'function'
      && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.reducedFlash = this.reducedMotion
      || new URLSearchParams(globalThis.location?.search ?? '').has('reducedFlash');
    this.element = document.createElement('div');
    this.element.className = 'tank-damage-feedback';
    this.element.setAttribute('aria-hidden', 'true');
    container.appendChild(this.element);
  }

  present(tier: TankDamageFeedbackTier, direction: number): void {
    const side = direction < -.2 ? 'left' : direction > .2 ? 'right' : 'center';
    this.element.dataset['tier'] = tier.toLowerCase();
    this.element.dataset['side'] = side;
    this.element.classList.toggle('tank-damage-feedback--reduced', this.reducedFlash);
    restart(this.element, 'tank-damage-feedback--active');
    for (const id of ['integrity-wrap', 'integrity-value']) {
      const node = document.getElementById(id);
      if (node) restart(node, 'tank-damage-punch');
    }
  }

  reset(): void {
    this.element.classList.remove('tank-damage-feedback--active');
    delete this.element.dataset['tier'];
    delete this.element.dataset['side'];
  }

  dispose(): void {
    this.reset();
    if (this.element.parentElement === this.container) this.container.removeChild(this.element);
  }
}

function restart(node: HTMLElement, className: string): void {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}
