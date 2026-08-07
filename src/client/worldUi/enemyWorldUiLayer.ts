import * as THREE from 'three';
import type { EnemyState, SimEvent } from '../../shared/types';
import { resolveMonsterDimensionsForDefId } from '../../shared/monsters/monsterNormalization';
import {
  combatDamagePresentationStyle,
  formatCombatDamage,
} from '../../shared/presentation/combatDisplayUnits';

export interface DamagePopup {
  enemyId: number;
  source: string;
  amount: number;
  x: number;
  y: number;
  bornAt: number;
  lastHitAt: number;
}

export function shouldShowEnemyHealthBar(enemy: EnemyState): boolean {
  return enemy.alive && enemy.hp > 0 && enemy.maxHp > 0 && enemy.hp < enemy.maxHp;
}

export function enemyHealthFillRatio(enemy: Pick<EnemyState, 'hp' | 'maxHp'>): number {
  return Math.max(0, Math.min(1, enemy.hp / Math.max(.001, enemy.maxHp)));
}

export function isWorldUiProjectionVisible(cameraZ: number, ndcX: number, ndcY: number, ndcZ: number): boolean {
  return cameraZ < -.01 && ndcZ < 1 && ndcX >= -1 && ndcX <= 1 && ndcY >= -1 && ndcY <= 1;
}

/** Bounded screen-space particle state with same-enemy MG coalescing. */
export class DamagePopupPool {
  readonly items: DamagePopup[] = [];

  add(input: Omit<DamagePopup, 'bornAt' | 'lastHitAt'>, now: number): DamagePopup {
    if (input.source === 'mg') {
      const merge = [...this.items].reverse().find((item) =>
        item.enemyId === input.enemyId && item.source === 'mg' && now - item.lastHitAt <= 60,
      );
      if (merge) {
        merge.amount += input.amount;
        merge.lastHitAt = now;
        merge.bornAt = Math.min(now - 22, merge.bornAt + 16);
        return merge;
      }
    }
    const popup: DamagePopup = { ...input, bornAt: now, lastHitAt: now };
    this.items.push(popup);
    if (this.items.length > 128) this.items.shift();
    return popup;
  }

  expire(now: number, reducedMotion = false): void {
    let write = 0;
    for (const item of this.items) {
      const lifetimeMs = reducedMotion ? 300 : combatDamagePresentationStyle(item.amount).lifetimeMs;
      if (now - item.bornAt <= lifetimeMs) this.items[write++] = item;
    }
    this.items.length = write;
  }

  clear(): void {
    this.items.length = 0;
  }
}

/** One pooled Canvas 2D layer for damaged-only bars and damage particles. */
export class EnemyWorldUiLayer {
  readonly canvas: HTMLCanvasElement;
  readonly popups = new DamagePopupPool();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly point = new THREE.Vector3();
  private readonly cameraPoint = new THREE.Vector3();
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private readonly reducedMotion = typeof globalThis.matchMedia === 'function'
    && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private readonly container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'enemy-world-ui';
    this.canvas.className = 'enemy-world-ui';
    this.canvas.setAttribute('aria-hidden', 'true');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is required for enemy world UI');
    this.ctx = ctx;
    container.appendChild(this.canvas);
    this.resize();
  }

  handleEvent(event: SimEvent, camera: THREE.PerspectiveCamera, enemies: readonly EnemyState[]): void {
    if (event.type !== 'hit' || event.id === undefined || !Number.isFinite(event.value) || (event.value ?? 0) <= 0) return;
    const enemy = enemies.find((candidate) => candidate.id === event.id);
    const anchor = enemy
      ? this.anchor(enemy)
      : { x: event.x ?? 0, y: (event.y ?? 0) + 0.8, z: event.z ?? 0 };
    const projected = this.project(anchor.x, anchor.y, anchor.z, camera);
    if (!projected.visible) return;
    this.popups.add({
      enemyId: event.id,
      source: event.source ?? '',
      amount: event.value ?? 0,
      x: projected.x,
      y: projected.y,
    }, performance.now());
  }

  update(
    enemies: readonly EnemyState[],
    camera: THREE.PerspectiveCamera,
    tank: { x: number; z: number } | null,
    now = performance.now(),
  ): void {
    this.resize();
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.drawHealthBars(enemies, camera, tank);
    this.drawDamagePopups(now);
  }

  reset(): void {
    this.popups.clear();
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  dispose(): void {
    this.reset();
    if (this.canvas.parentElement === this.container) this.container.removeChild(this.canvas);
  }

  private drawHealthBars(
    enemies: readonly EnemyState[],
    camera: THREE.PerspectiveCamera,
    tank: { x: number; z: number } | null,
  ): void {
    const candidates = enemies
      .filter(shouldShowEnemyHealthBar)
      .map((enemy) => ({
        enemy,
        distance: tank ? Math.hypot(enemy.x - tank.x, enemy.z - tank.z) : 0,
      }))
      .filter((entry) => entry.distance <= 100)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 96);

    for (const { enemy, distance } of candidates) {
      const anchor = this.anchor(enemy);
      const projected = this.project(anchor.x, anchor.y, anchor.z, camera, 12);
      if (!projected.visible) continue;
      const scale = distance <= 35 ? 1 : distance <= 70 ? 0.9 : 0.78;
      const width = 48 * scale;
      const height = Math.max(4, 5 * scale);
      const left = Math.round(projected.x - width / 2);
      const top = Math.round(projected.y - height / 2);
      const ratio = enemyHealthFillRatio(enemy);
      this.ctx.fillStyle = 'rgba(7,9,10,.86)';
      this.ctx.fillRect(left - 1, top - 1, width + 2, height + 2);
      this.ctx.fillStyle = '#f14232';
      this.ctx.fillRect(left, top, Math.max(1, width * ratio), height);
      this.ctx.fillStyle = 'rgba(255,255,255,.26)';
      this.ctx.fillRect(left, top, width * ratio, 1);
    }
  }

  private drawDamagePopups(now: number): void {
    this.popups.expire(now, this.reducedMotion);
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.lineJoin = 'miter';
    for (const popup of this.popups.items) {
      const presentation = combatDamagePresentationStyle(popup.amount);
      const age = Math.max(0, now - popup.bornAt);
      const lifetimeMs = this.reducedMotion ? 300 : presentation.lifetimeMs;
      const t = Math.min(1, age / lifetimeMs);
      const intro = Math.min(1, age / (this.reducedMotion ? 24 : 70));
      const opacity = t < 0.76 ? intro : Math.max(0, (1 - t) / 0.24);
      const impactMs = this.reducedMotion ? 24 : 90;
      const scale = age < impactMs
        ? presentation.startScale - intro * (presentation.startScale - 1)
        : 1;
      const rise = (this.reducedMotion ? 6 : presentation.risePx) * easeOutCubic(t);
      const fontPx = presentation.fontPx * scale;
      this.ctx.globalAlpha = opacity;
      this.ctx.font = `italic 900 ${fontPx}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      this.ctx.lineWidth = presentation.impactAccent && age < 100 ? 4.5 : 3;
      this.ctx.strokeStyle = 'rgba(5,7,8,.94)';
      this.ctx.shadowColor = presentation.impactAccent && age < 100 ? 'rgba(255,81,69,.72)' : 'transparent';
      this.ctx.shadowBlur = presentation.impactAccent && age < 100 ? 12 : 0;
      const text = formatCombatDamage(popup.amount);
      this.ctx.strokeText(text, popup.x, popup.y - rise);
      this.ctx.fillStyle = '#ff5145';
      this.ctx.fillText(text, popup.x, popup.y - rise);
    }
    this.ctx.globalAlpha = 1;
    this.ctx.shadowBlur = 0;
  }

  private anchor(enemy: EnemyState): { x: number; y: number; z: number } {
    let height = 1.5;
    if (enemy.defId) {
      try {
        height = resolveMonsterDimensionsForDefId(enemy.defId).finalHeight;
      } catch {
        // Legacy/fallback enemies use the conservative generic height.
      }
    }
    return { x: enemy.x, y: enemy.y + height + 0.28, z: enemy.z };
  }

  private project(
    x: number,
    y: number,
    z: number,
    camera: THREE.PerspectiveCamera,
    margin = 0,
  ): { x: number; y: number; visible: boolean } {
    this.cameraPoint.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    this.point.set(x, y, z).project(camera);
    const px = (this.point.x * 0.5 + 0.5) * this.width;
    const py = (-this.point.y * 0.5 + 0.5) * this.height;
    const visible = margin === 0
      ? isWorldUiProjectionVisible(this.cameraPoint.z, this.point.x, this.point.y, this.point.z)
      : this.cameraPoint.z < -.01 && this.point.z < 1 && px >= -margin && px <= this.width + margin && py >= -margin && py <= this.height + margin;
    return {
      x: px,
      y: py,
      visible,
    };
  }

  private resize(): void {
    const width = this.container.clientWidth || window.innerWidth || 1;
    const height = this.container.clientHeight || window.innerHeight || 1;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    if (width === this.width && height === this.height && pixelRatio === this.pixelRatio) return;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    this.canvas.width = Math.max(1, Math.round(width * pixelRatio));
    this.canvas.height = Math.max(1, Math.round(height * pixelRatio));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }
}

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}
