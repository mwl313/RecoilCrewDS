import type { ArenaWorld } from '../../shared/sim/arenaWorld';
import type { EnemyState, TankState } from '../../shared/types';
import type { TreasureChestState } from '../../shared/progression/progressionTypes';
import { isWaveLeader, normalizedEnemyClass } from '../../shared/enemies/enemyClassification';

export interface MiniMapFrame {
  tank: Pick<TankState, 'x' | 'z' | 'yaw'>;
  enemies: readonly EnemyState[];
  chests: readonly TreasureChestState[];
}

interface MapBounds { minX: number; maxX: number; minZ: number; maxZ: number }

export type MiniMapEnemyThreatClass = 'ordinary' | 'elite' | 'boss';

export interface MiniMapEnemyMarkerStyle {
  shape: 'circle' | 'diamond';
  halfSize: number;
  fill: string;
  stroke: string | null;
  lineWidth: number;
  ringRadius: number | null;
  ringStroke: string | null;
}

const ENEMY_MARKER_STYLES: Readonly<Record<MiniMapEnemyThreatClass, Readonly<MiniMapEnemyMarkerStyle>>> = {
  ordinary: {
    shape: 'circle', halfSize: 2.5, fill: '#d55347', stroke: null,
    lineWidth: 0, ringRadius: null, ringStroke: null,
  },
  elite: {
    shape: 'diamond', halfSize: 6, fill: '#b56cff', stroke: '#220b2e',
    lineWidth: 1.75, ringRadius: null, ringStroke: null,
  },
  boss: {
    shape: 'diamond', halfSize: 9, fill: '#ff304d', stroke: '#28060d',
    lineWidth: 2, ringRadius: 12, ringStroke: 'rgba(241,238,227,.95)',
  },
};

/** Semantic encounter class wins; ownership priority is legacy-only fallback. */
export function miniMapEnemyThreatClass(enemy: EnemyState): MiniMapEnemyThreatClass {
  const semanticClass = normalizedEnemyClass(enemy);
  if (semanticClass === 'boss') return 'boss';
  if (semanticClass === 'elite' || isWaveLeader(enemy)) return 'elite';
  if (enemy.monster?.rewardClass || enemy.ownership?.populationClass) return 'ordinary';
  const priority = enemy.ownership?.priority ?? 0;
  return priority >= 2 ? 'boss' : priority >= 1 ? 'elite' : 'ordinary';
}

export function miniMapEnemyMarkerStyle(enemy: EnemyState): Readonly<MiniMapEnemyMarkerStyle> {
  return ENEMY_MARKER_STYLES[miniMapEnemyThreatClass(enemy)];
}

export function chassisYawToMiniMapRotation(yaw: number): number {
  return Math.PI - yaw;
}

export function worldToMiniMap(x: number, z: number, bounds: MapBounds, size: number): { x: number; y: number } {
  return {
    x: ((x - bounds.minX) / Math.max(1, bounds.maxX - bounds.minX)) * size,
    y: ((z - bounds.minZ) / Math.max(1, bounds.maxZ - bounds.minZ)) * size,
  };
}

export class MiniMapRenderer {
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly staticCanvas = document.createElement('canvas');
  private readonly staticCtx: CanvasRenderingContext2D | null;
  private world: ArenaWorld;
  private cssSize = 300;
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement, world: ArenaWorld) {
    this.ctx = canvas.getContext('2d');
    this.staticCtx = this.staticCanvas.getContext('2d');
    this.world = world;
    this.resize();
  }

  rebuild(world: ArenaWorld): void {
    this.world = world;
    this.paintStatic();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const nextSize = Math.max(160, Math.round(rect.width || 300));
    const nextDpr = Math.min(2, window.devicePixelRatio || 1);
    if (nextSize === this.cssSize && nextDpr === this.dpr && this.canvas.width > 0) return;
    this.cssSize = nextSize;
    this.dpr = nextDpr;
    const pixels = Math.round(nextSize * nextDpr);
    this.canvas.width = pixels;
    this.canvas.height = pixels;
    this.staticCanvas.width = pixels;
    this.staticCanvas.height = pixels;
    this.paintStatic();
  }

  render(frame: MiniMapFrame): void {
    if (!this.ctx) return;
    this.resize();
    const ctx = this.ctx;
    const size = this.cssSize;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(this.staticCanvas, 0, 0, size, size);
    const bounds = arenaBounds(this.world);

    for (const chest of frame.chests) {
      if (chest.lifecycle === 'despawning') continue;
      const p = worldToMiniMap(chest.x, chest.z, bounds, size);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ffb31a';
      ctx.strokeStyle = '#211602';
      ctx.lineWidth = 2;
      ctx.fillRect(-3.5, -3.5, 7, 7);
      ctx.strokeRect(-3.5, -3.5, 7, 7);
      ctx.restore();
    }

    for (const enemy of frame.enemies) {
      if (!enemy.alive) continue;
      const p = worldToMiniMap(enemy.x, enemy.z, bounds, size);
      const marker = miniMapEnemyMarkerStyle(enemy);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = marker.fill;
      if (marker.stroke) ctx.strokeStyle = marker.stroke;
      ctx.lineWidth = marker.lineWidth;
      if (marker.shape === 'diamond') {
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-marker.halfSize, -marker.halfSize, marker.halfSize * 2, marker.halfSize * 2);
        if (marker.stroke) {
          ctx.strokeRect(-marker.halfSize, -marker.halfSize, marker.halfSize * 2, marker.halfSize * 2);
        }
        if (marker.ringRadius && marker.ringStroke) {
          ctx.rotate(-Math.PI / 4);
          ctx.beginPath();
          ctx.arc(0, 0, marker.ringRadius, 0, Math.PI * 2);
          ctx.strokeStyle = marker.ringStroke;
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, marker.halfSize, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    const tank = worldToMiniMap(frame.tank.x, frame.tank.z, bounds, size);
    ctx.save();
    ctx.translate(tank.x, tank.y);
    ctx.rotate(chassisYawToMiniMapRotation(frame.tank.yaw));
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6.5, 7);
    ctx.lineTo(0, 4.5);
    ctx.lineTo(-6.5, 7);
    ctx.closePath();
    ctx.fillStyle = '#f2f0df';
    ctx.strokeStyle = '#101416';
    ctx.lineWidth = 2.5;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private paintStatic(): void {
    if (!this.staticCtx) return;
    const ctx = this.staticCtx;
    const size = this.cssSize;
    const bounds = arenaBounds(this.world);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#101719';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(154,177,178,.15)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const p = Math.round(size * i / 4) + .5;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
    }

    const urban = this.world.arena?.urbanLayout;
    if (urban) {
      ctx.strokeStyle = '#3b4a4b';
      ctx.lineWidth = Math.max(3, size / 58);
      ctx.lineCap = 'square';
      for (const road of urban.roads) {
        const p = worldToMiniMap(road.x, road.z, bounds, size);
        const length = 8 * road.scale / Math.max(1, bounds.maxX - bounds.minX) * size;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(-road.yaw);
        ctx.beginPath(); ctx.moveTo(-length / 2, 0); ctx.lineTo(length / 2, 0); ctx.stroke(); ctx.restore();
      }
    }

    ctx.fillStyle = '#263033';
    ctx.strokeStyle = '#4b5c5d';
    ctx.lineWidth = 1;
    for (const obstacle of this.world.obstacles) {
      const p = worldToMiniMap(obstacle.x, obstacle.z, bounds, size);
      const w = obstacle.w / Math.max(1, bounds.maxX - bounds.minX) * size;
      const h = obstacle.d / Math.max(1, bounds.maxZ - bounds.minZ) * size;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(-(obstacle.yaw ?? 0));
      ctx.fillRect(-w / 2, -h / 2, w, h);
      if (obstacle.type === 'barrier') ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }

    ctx.strokeStyle = '#91a6a7';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
    ctx.fillStyle = '#d8ded5';
    ctx.font = '800 10px Barlow Condensed, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', size / 2, 13);
  }
}

function arenaBounds(world: ArenaWorld): MapBounds {
  return world.bounds ?? { minX: -world.half, maxX: world.half, minZ: -world.half, maxZ: world.half };
}
