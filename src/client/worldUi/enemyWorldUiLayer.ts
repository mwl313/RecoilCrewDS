import * as THREE from 'three';
import type { EnemyState, SimEvent } from '../../shared/types';
import type { MatchFlowState } from '../../shared/progression/progressionTypes';
import { resolveMonsterDimensionsForDefId } from '../../shared/monsters/monsterNormalization';
import {
  combatDamagePresentationStyle,
  formatCombatDamage,
  formatIntegrityGain,
  formatXpGain,
  INTEGRITY_GAIN_PRESENTATION_COLOR,
  XP_PRESENTATION_COLOR,
} from '../../shared/presentation/combatDisplayUnits';

export function resolveEnemyWorldUiAnchorHeight(enemy: EnemyState): number {
  if (enemy.defId) {
    try {
      return resolveMonsterDimensionsForDefId(enemy.defId).finalHeight + 0.28;
    } catch {
      // Legacy/fallback enemies use the conservative generic height.
    }
  }
  return 1.78;
}

export type WorldPopupKind = 'enemyDamage' | 'integrityGain' | 'xpGain';

export interface WorldPopup {
  kind: WorldPopupKind;
  enemyId?: number;
  source: string;
  amount: number;
  x: number;
  y: number;
  bornAt: number;
  lastHitAt: number;
}

/** Backward-compatible name retained for focused readability tests. */
export type DamagePopup = WorldPopup;

export function shouldShowEnemyHealthBar(enemy: EnemyState): boolean {
  return enemy.alive && enemy.hp > 0 && enemy.maxHp > 0 && enemy.hp < enemy.maxHp;
}

export function enemyHealthFillRatio(enemy: Pick<EnemyState, 'hp' | 'maxHp'>): number {
  return Math.max(0, Math.min(1, enemy.hp / Math.max(.001, enemy.maxHp)));
}

export function isWorldUiProjectionVisible(cameraZ: number, ndcX: number, ndcY: number, ndcZ: number): boolean {
  return cameraZ < -.01 && ndcZ < 1 && ndcX >= -1 && ndcX <= 1 && ndcY >= -1 && ndcY <= 1;
}

function popupLifetime(item: WorldPopup, reducedMotion: boolean): number {
  if (reducedMotion) return item.kind === 'xpGain' ? 280 : 320;
  if (item.kind === 'integrityGain') return 820;
  if (item.kind === 'xpGain') return 690;
  return combatDamagePresentationStyle(item.amount).lifetimeMs;
}

/** Bounded pooled state with semantic, source-aware coalescing. */
export class WorldPopupPool {
  readonly items: WorldPopup[] = [];

  add(input: Omit<WorldPopup, 'kind' | 'bornAt' | 'lastHitAt'> & { kind?: WorldPopupKind }, now: number): WorldPopup {
    const kind = input.kind ?? 'enemyDamage';
    const mergeWindow = kind === 'xpGain' ? 140 : kind === 'integrityGain' ? 120 : 60;
    const merge = [...this.items].reverse().find((item) => {
      if (item.kind !== kind || now - item.lastHitAt > mergeWindow) return false;
      if (kind === 'enemyDamage') {
        return input.source === 'mg' && item.source === 'mg' && item.enemyId === input.enemyId;
      }
      if (kind === 'integrityGain') return item.source === input.source;
      return true;
    });
    if (merge) {
      merge.amount += input.amount;
      merge.x = input.x;
      merge.y = input.y;
      merge.lastHitAt = now;
      merge.bornAt = Math.min(now - 22, merge.bornAt + 16);
      return merge;
    }
    const popup: WorldPopup = { ...input, kind, bornAt: now, lastHitAt: now };
    this.items.push(popup);
    if (this.items.length > 128) this.items.shift();
    return popup;
  }

  expire(now: number, reducedMotion = false): void {
    let write = 0;
    for (const item of this.items) {
      if (now - item.bornAt <= popupLifetime(item, reducedMotion)) this.items[write++] = item;
    }
    this.items.length = write;
  }

  clear(): void {
    this.items.length = 0;
  }
}

export class DamagePopupPool extends WorldPopupPool {}

interface QueuedPopup {
  event: SimEvent;
  queuedAt: number;
}

export class WorldPopupOverlayQueue {
  readonly items: QueuedPopup[] = [];

  enqueue(event: SimEvent, now: number): void {
    this.items.push({ event: { ...event }, queuedAt: now });
    if (this.items.length > 32) this.items.shift();
  }

  takeFresh(now: number, maximumAgeMs = 1_300): SimEvent[] {
    return this.items.splice(0)
      .filter((item) => now - item.queuedAt <= maximumAgeMs)
      .map((item) => item.event);
  }

  clear(): void {
    this.items.length = 0;
  }
}

/** One pooled Canvas 2D layer for enemy bars and every world-number kind. */
export class EnemyWorldUiLayer {
  readonly canvas: HTMLCanvasElement;
  readonly popups = new WorldPopupPool();
  readonly overlayQueue = new WorldPopupOverlayQueue();
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
    this.canvas.className = 'enemy-world-ui world-combat-feedback';
    this.canvas.setAttribute('aria-hidden', 'true');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is required for world combat feedback');
    this.ctx = ctx;
    container.appendChild(this.canvas);
    this.resize();
  }

  get queuedCount(): number {
    return this.overlayQueue.items.length;
  }

  handleEvent(
    event: SimEvent,
    camera: THREE.PerspectiveCamera,
    enemies: readonly EnemyState[],
    matchFlow: MatchFlowState = 'playing',
    now = performance.now(),
  ): void {
    const positive = event.type === 'tankIntegrityGain' || event.type === 'xpGained';
    if (!positive) {
      if (event.type !== 'hit' || event.id === undefined || !Number.isFinite(event.value) || (event.value ?? 0) <= 0) return;
      const enemy = enemies.find((candidate) => candidate.id === event.id);
      const anchor = enemy ? this.anchor(enemy) : { x: event.x ?? 0, y: (event.y ?? 0) + 0.8, z: event.z ?? 0 };
      this.addProjected(event, 'enemyDamage', anchor, camera, now);
      return;
    }
    if (!Number.isFinite(event.value) || (event.value ?? 0) <= 0) return;
    if (matchFlow === 'clear' || matchFlow === 'gameOver') return;
    if (event.deferUntilPlaying || matchFlow !== 'playing') {
      this.overlayQueue.enqueue(event, now);
      return;
    }
    this.addTankPopup(event, camera, now);
  }

  update(
    enemies: readonly EnemyState[],
    camera: THREE.PerspectiveCamera,
    tank: { x: number; y?: number; z: number } | null,
    now = performance.now(),
    matchFlow: MatchFlowState = 'playing',
  ): void {
    this.resize();
    if (matchFlow === 'clear' || matchFlow === 'gameOver') this.overlayQueue.clear();
    if (matchFlow === 'playing') this.flushQueued(camera, now);
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.drawHealthBars(enemies, camera, tank);
    this.drawPopups(now);
  }

  reset(): void {
    this.overlayQueue.clear();
    this.popups.clear();
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  dispose(): void {
    this.reset();
    if (this.canvas.parentElement === this.container) this.container.removeChild(this.canvas);
  }

  private flushQueued(camera: THREE.PerspectiveCamera, now: number): void {
    for (const event of this.overlayQueue.takeFresh(now)) this.addTankPopup(event, camera, now);
  }

  private addTankPopup(event: SimEvent, camera: THREE.PerspectiveCamera, now: number): void {
    const kind: WorldPopupKind = event.type === 'tankIntegrityGain' ? 'integrityGain' : 'xpGain';
    this.addProjected(event, kind, {
      x: event.x ?? 0,
      y: event.y ?? 2.1,
      z: event.z ?? 0,
    }, camera, now);
  }

  private addProjected(
    event: SimEvent,
    kind: WorldPopupKind,
    anchor: { x: number; y: number; z: number },
    camera: THREE.PerspectiveCamera,
    now: number,
  ): void {
    const projected = this.project(anchor.x, anchor.y, anchor.z, camera);
    if (!projected.visible) return;
    const laneX = kind === 'integrityGain' ? -34 : kind === 'xpGain' ? 34 : 0;
    const laneY = kind === 'integrityGain' ? -8 : kind === 'xpGain' ? 10 : 0;
    this.popups.add({
      kind,
      enemyId: event.id,
      source: event.source ?? event.kind ?? '',
      amount: event.value ?? 0,
      x: projected.x + laneX,
      y: projected.y + laneY,
    }, now);
  }

  private drawHealthBars(
    enemies: readonly EnemyState[],
    camera: THREE.PerspectiveCamera,
    tank: { x: number; z: number } | null,
  ): void {
    const candidates = enemies
      .filter(shouldShowEnemyHealthBar)
      .map((enemy) => ({ enemy, distance: tank ? Math.hypot(enemy.x - tank.x, enemy.z - tank.z) : 0 }))
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

  private drawPopups(now: number): void {
    this.popups.expire(now, this.reducedMotion);
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.lineJoin = 'miter';
    for (const popup of this.popups.items) {
      const damageStyle = combatDamagePresentationStyle(popup.amount);
      const integrity = popup.kind === 'integrityGain';
      const xp = popup.kind === 'xpGain';
      const lifetimeMs = popupLifetime(popup, this.reducedMotion);
      const age = Math.max(0, now - popup.bornAt);
      const t = Math.min(1, age / lifetimeMs);
      const intro = Math.min(1, age / (this.reducedMotion ? 24 : 70));
      const opacity = t < 0.76 ? intro : Math.max(0, (1 - t) / 0.24);
      const baseFontPx = integrity ? 27 : xp ? 22 : damageStyle.fontPx;
      const startScale = integrity ? 1.35 : xp ? 1.2 : damageStyle.startScale;
      const risePx = integrity ? 42 : xp ? 31 : damageStyle.risePx;
      const impactMs = this.reducedMotion ? 24 : 90;
      const scale = age < impactMs ? startScale - intro * (startScale - 1) : 1;
      const rise = (this.reducedMotion ? 6 : risePx) * easeOutCubic(t);
      this.ctx.globalAlpha = opacity;
      this.ctx.font = `italic 900 ${baseFontPx * scale}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      const accent = integrity || xp || damageStyle.impactAccent;
      this.ctx.lineWidth = accent && age < 100 ? 4.5 : 3;
      this.ctx.strokeStyle = 'rgba(5,7,8,.94)';
      this.ctx.shadowColor = age < 100
        ? integrity ? 'rgba(121,220,136,.62)' : xp ? 'rgba(143,232,255,.58)' : 'rgba(255,81,69,.72)'
        : 'transparent';
      this.ctx.shadowBlur = accent && age < 100 ? 12 : 0;
      const text = integrity ? formatIntegrityGain(popup.amount) : xp ? formatXpGain(popup.amount) : formatCombatDamage(popup.amount);
      this.ctx.strokeText(text, popup.x, popup.y - rise);
      this.ctx.fillStyle = integrity ? INTEGRITY_GAIN_PRESENTATION_COLOR : xp ? XP_PRESENTATION_COLOR : '#ff5145';
      this.ctx.fillText(text, popup.x, popup.y - rise);
    }
    this.ctx.globalAlpha = 1;
    this.ctx.shadowBlur = 0;
  }

  private anchor(enemy: EnemyState): { x: number; y: number; z: number } {
    return { x: enemy.x, y: enemy.y + resolveEnemyWorldUiAnchorHeight(enemy), z: enemy.z };
  }

  private project(x: number, y: number, z: number, camera: THREE.PerspectiveCamera, margin = 0): { x: number; y: number; visible: boolean } {
    this.cameraPoint.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    this.point.set(x, y, z).project(camera);
    const px = (this.point.x * 0.5 + 0.5) * this.width;
    const py = (-this.point.y * 0.5 + 0.5) * this.height;
    const visible = margin === 0
      ? isWorldUiProjectionVisible(this.cameraPoint.z, this.point.x, this.point.y, this.point.z)
      : this.cameraPoint.z < -.01 && this.point.z < 1 && px >= -margin && px <= this.width + margin && py >= -margin && py <= this.height + margin;
    return { x: px, y: py, visible };
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
