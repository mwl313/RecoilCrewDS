import * as THREE from 'three';
import type { ArenaSessionResult } from '../../shared/mapgen/arenaSession';
import type { GameClient } from './gameClient';

/**
 * Development-only map generation overlay: metadata panel + THREE markers
 * for height, features, corridors, zones, spawns/gates, ramps/landings,
 * recovery, colliders, and barrel clusters. Toggle with F3; enabled via
 * `?debug=1` (or test mode). Rendering never mutates authoritative data.
 */
export class DebugOverlay {
  private readonly panel: HTMLElement;
  private readonly markers = new THREE.Group();
  private session: ArenaSessionResult | null;
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.code === 'F3') {
      e.preventDefault();
      this.toggle();
    }
  };
  private visible = true;

  constructor(
    private readonly game: GameClient,
    session: ArenaSessionResult,
  ) {
    this.session = session;
    this.panel = document.createElement('div');
    this.panel.id = 'mapgen-debug';
    this.panel.style.cssText =
      'position:fixed;left:10px;top:10px;z-index:50;background:rgba(8,14,18,0.88);color:#9ff3ff;' +
      'font:12px monospace;padding:10px 12px;border:1px solid rgba(127,212,255,0.4);border-radius:6px;' +
      'white-space:pre;max-height:70vh;overflow:auto;pointer-events:none;';
    document.body.appendChild(this.panel);
    window.addEventListener('keydown', this.onKey);
    this.game.world.scene.add(this.markers);
    this.rebuild();
  }

  setSession(session: ArenaSessionResult): void {
    this.session = session;
    this.rebuild();
  }

  toggle(): void {
    this.visible = !this.visible;
    this.panel.style.display = this.visible ? 'block' : 'none';
    this.markers.visible = this.visible;
  }

  private rebuild(): void {
    while (this.markers.children.length > 0) {
      const child = this.markers.children.pop()!;
      child.removeFromParent();
    }
    const session = this.session;
    if (!session) return;
    const meta = session.metadata;
    const arena = session.arena;
    const layout = arena.layout;
    const warnings = [...arena.validation.warnings, ...(layout ? validationWarnings(session) : [])];
    this.panel.textContent = [
      `MAPGEN DEBUG`,
      `profile: ${meta.mapProfileId}`,
      `seed: ${meta.arenaBaseSeed}`,
      `candidate: ${meta.arenaCandidateSeed}`,
      `attempt: ${meta.arenaAttempt}`,
      `version: ${meta.arenaGeneratorVersion}`,
      `checksum: ${meta.arenaChecksum}`,
      `fallback: ${meta.arenaFallbackUsed}`,
      `generation: ${session.generationMs.toFixed(1)}ms`,
      `height: ${arena.heightfield.minHeight().toFixed(2)}..${arena.heightfield.maxHeight().toFixed(2)}`,
      `slope: ${arena.heightfield.maxSlope().toFixed(3)}`,
      warnings.length > 0 ? `warnings:\n${warnings.slice(0, 8).join('\n')}` : 'warnings: none',
    ].join('\n');
    if (!layout) return;

    // Height heatmap (25 m sample cloud).
    const hf = arena.heightfield;
    const points: THREE.Vector3[] = [];
    const colors: number[] = [];
    const lo = hf.minHeight();
    const hi = hf.maxHeight();
    const range = Math.max(0.01, hi - lo);
    const worldX = (x: number) => x - arena.widthMeters / 2;
    const worldZ = (z: number) => z - arena.depthMeters / 2;
    for (let zi = 0; zi < hf.samplesZ; zi += 4) {
      for (let xi = 0; xi < hf.samplesX; xi += 4) {
        const h = hf.getSample(xi, zi);
        points.push(new THREE.Vector3(worldX(xi * hf.cellSize), h + 0.15, worldZ(zi * hf.cellSize)));
        const t = (h - lo) / range;
        colors.push(0.2 + t * 0.8, 0.5 - t * 0.3, 0.8 - t * 0.6);
      }
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const cloud = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 2.2, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    this.markers.add(cloud);

    // Corridors.
    const linePoints: THREE.Vector3[] = [];
    for (const c of layout.graph.corridors) {
      linePoints.push(new THREE.Vector3(worldX(c.ax), hf.heightAt(c.ax, c.az) + 0.2, worldZ(c.az)));
      linePoints.push(new THREE.Vector3(worldX(c.bx), hf.heightAt(c.bx, c.bz) + 0.2, worldZ(c.bz)));
    }
    if (linePoints.length > 0) {
      const lines = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(linePoints),
        new THREE.LineBasicMaterial({ color: 0x35d7e8, transparent: true, opacity: 0.8 }),
      );
      this.markers.add(lines);
    }

    // Macro features.
    for (const f of arena.macroFeatures) {
      this.markers.add(this.sphere(worldX(f.x), hf.heightAt(f.x, f.z) + 0.4, worldZ(f.z), f.radius, 0xffd94d, 0.35));
    }
    // Zones.
    for (const z of layout.zones.regions) {
      this.markers.add(this.ring(worldX(z.x), hf.heightAt(z.x, z.z) + 0.1, worldZ(z.z), z.radius, zoneColor(z.tag)));
    }
    // Spawns / gates.
    for (const s of layout.spawns) this.markers.add(this.sphere(worldX(s.x), hf.heightAt(s.x, s.z) + 0.6, worldZ(s.z), 1.2, 0x5eeaff, 0.9));
    for (const g of layout.gates) this.markers.add(this.sphere(worldX(g.x), hf.heightAt(g.x, g.z) + 0.6, worldZ(g.z), 1.6, 0xff5a4a, 0.9));
    // Ramps + landings.
    for (const r of layout.ramps) {
      this.markers.add(this.sphere(worldX(r.x), r.baseY + 1, worldZ(r.z), 2, 0xffb347, 0.8));
      this.markers.add(this.sphere(worldX(r.landingX), hf.heightAt(r.landingX, r.landingZ) + 0.3, worldZ(r.landingZ), 2.5, 0x7de05a, 0.6));
    }
    // Recovery.
    for (const r of layout.recovery) this.markers.add(this.ring(worldX(r.x), hf.heightAt(r.x, r.z) + 0.1, worldZ(r.z), r.radius, 0x4ddb6e));
    // Colliders (wireframe boxes).
    for (const o of session.world.obstacles) {
      this.markers.add(this.wireBox(o.x, o.z, o.w, o.d, o.h));
    }
    // Barrel clusters (links between chain members).
    const barrels = layout.objects.filter((o) => o.kind === 'barrel');
    for (let i = 0; i < barrels.length; i++) {
      for (let j = i + 1; j < barrels.length; j++) {
        const d = Math.hypot(barrels[i].x - barrels[j].x, barrels[i].z - barrels[j].z);
        if (d <= 10) {
          const pts = [
            new THREE.Vector3(worldX(barrels[i].x), 0.6, worldZ(barrels[i].z)),
            new THREE.Vector3(worldX(barrels[j].x), 0.6, worldZ(barrels[j].z)),
          ];
          this.markers.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({ color: 0xff9d45 }),
          ));
        }
      }
    }
  }

  private sphere(x: number, y: number, z: number, radius: number, color: number, opacity: number): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 10, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
    );
    mesh.position.set(x, y, z);
    return mesh;
  }

  private ring(x: number, y: number, z: number, radius: number, color: number): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(0.2, radius - 0.5), radius + 0.5, 28),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    return mesh;
  }

  private wireBox(x: number, z: number, w: number, d: number, h: number): THREE.LineSegments {
    const box = new THREE.Box3(new THREE.Vector3(x - w / 2, 0, z - d / 2), new THREE.Vector3(x + w / 2, h, z + d / 2));
    return new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)),
      new THREE.LineBasicMaterial({ color: 0xff5533, transparent: true, opacity: 0.7 }),
    ).translateX(x).translateY(h / 2).translateZ(z);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.game.world.scene.remove(this.markers);
    this.panel.remove();
  }
}

function zoneColor(tag: string): number {
  switch (tag) {
    case 'basin': return 0x4aa3ff;
    case 'highland': return 0xd8b06a;
    case 'valley': return 0x6fd89a;
    case 'transit': return 0x9ff3ff;
    case 'openCombat': return 0xc9a86a;
    case 'rampPark': return 0xffb347;
    case 'resource': return 0xffd94d;
    case 'spawnSafe': return 0x5eeaff;
    case 'enemyGate': return 0xff5a4a;
    case 'recovery': return 0x4ddb6e;
    default: return 0xaaaaaa;
  }
}

function validationWarnings(session: ArenaSessionResult): string[] {
  const arena = session.arena;
  const out: string[] = [];
  if (arena.validation.warnings.length > 0) out.push(...arena.validation.warnings);
  if (arena.layout) {
    if (arena.layout.gates.length < 6) out.push(`gates: ${arena.layout.gates.length}`);
    if (arena.layout.spawns.length < 3) out.push(`spawns: ${arena.layout.spawns.length}`);
    if (arena.layout.recovery.length < 2) out.push(`recovery: ${arena.layout.recovery.length}`);
  }
  return out;
}
