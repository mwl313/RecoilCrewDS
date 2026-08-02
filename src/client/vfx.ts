import * as THREE from 'three';

const MAX_PARTICLES = 900;

function particleMaterial(): THREE.PointsMaterial {
  const tex = document.createElement('canvas');
  tex.width = tex.height = 32;
  const ctx = tex.getContext('2d')!;
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  const map = new THREE.CanvasTexture(tex);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.PointsMaterial({
    size: 0.22,
    map,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });
}

interface Particle {
  alive: boolean;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  size: number;
  r: number; g: number; b: number;
  gravity: number;
  drag: number;
}

export class VfxSystem {
  private particles: Particle[] = [];
  private positions = new Float32Array(MAX_PARTICLES * 3);
  private colors = new Float32Array(MAX_PARTICLES * 3);
  private sizes = new Float32Array(MAX_PARTICLES);
  private alphas = new Float32Array(MAX_PARTICLES);
  private points: THREE.Points;
  private flashes: { sprite: THREE.Sprite; life: number; maxLife: number; size: number }[] = [];
  private flashPool: THREE.Sprite[] = [];
  private rings: { mesh: THREE.Mesh; life: number; maxLife: number; radius: number }[] = [];
  private ringPool: THREE.Mesh[] = [];
  private tracers: { line: THREE.Line; life: number; maxLife: number }[] = [];
  private tracerPool: THREE.Line[] = [];
  private cursor = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(geo, particleMaterial());
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 1, size: 0.2, r: 1, g: 1, b: 1, gravity: 0, drag: 1,
      });
    }
    const flashMat = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.25, 'rgba(255,220,140,0.8)');
      grad.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      return new THREE.SpriteMaterial({ map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    };
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Sprite(flashMat());
      s.visible = false;
      scene.add(s);
      this.flashPool.push(s);
    }
    const ringGeo = new THREE.RingGeometry(0.96, 1, 40);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(ringGeo, mat);
      m.visible = false;
      scene.add(m);
      this.ringPool.push(m);
    }
    for (let i = 0; i < 48; i++) {
      const mat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const geo2 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(geo2, mat);
      line.visible = false;
      scene.add(line);
      this.tracerPool.push(line);
    }
  }

  spawnBurst(
    x: number, y: number, z: number,
    color: number,
    count: number,
    speed: number,
    size: number,
    life: number,
    gravity = 0,
    spread = 1,
  ) {
    const r = ((color >> 16) & 255) / 255;
    const g = ((color >> 8) & 255) / 255;
    const b = (color & 255) / 255;
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.cursor];
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      p.alive = true;
      p.x = x;
      p.y = y;
      p.z = z;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const v = speed * (0.35 + Math.random() * 0.9);
      p.vx = Math.sin(ph) * Math.cos(th) * v * spread;
      p.vy = Math.cos(ph) * v * spread;
      p.vz = Math.sin(ph) * Math.sin(th) * v * spread;
      p.maxLife = life * (0.6 + Math.random() * 0.7);
      p.life = p.maxLife;
      p.size = size * (0.6 + Math.random() * 0.8);
      p.r = r;
      p.g = g;
      p.b = b;
      p.gravity = gravity;
      p.drag = 1.6 + Math.random();
    }
  }

  spawnFlash(x: number, y: number, z: number, color: number, size: number, life = 0.08) {
    let sprite = this.flashPool.find((s) => !s.visible);
    if (!sprite) return;
    sprite.visible = true;
    sprite.position.set(x, y, z);
    (sprite.material as THREE.SpriteMaterial).color.setHex(color);
    this.flashes.push({ sprite, life, maxLife: life, size });
  }

  spawnRing(x: number, y: number, z: number, color: number, radius: number, life = 0.4) {
    let mesh = this.ringPool.find((m) => !m.visible);
    if (!mesh) return;
    mesh.visible = true;
    mesh.position.set(x, y, z);
    (mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    mesh.scale.setScalar(0.15);
    this.rings.push({ mesh, life, maxLife: life, radius });
  }

  spawnTracer(x: number, y: number, z: number, tx: number, ty: number, tz: number, color = 0xffd27a, life = 0.09) {
    let line = this.tracerPool.find((l) => !l.visible);
    if (!line) return;
    line.visible = true;
    const pos = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    pos.setXYZ(0, x, y, z);
    pos.setXYZ(1, tx, ty, tz);
    pos.needsUpdate = true;
    (line.material as THREE.LineBasicMaterial).color.setHex(color);
    this.tracers.push({ line, life, maxLife: life });
  }

  explosion(x: number, y: number, z: number, color = 0xff8c3b, big = false) {
    this.spawnBurst(x, y, z, color, big ? 90 : 42, big ? 15 : 11, big ? 0.7 : 0.42, big ? 0.95 : 0.55, 12);
    this.spawnBurst(x, y, z, 0xffe0a0, big ? 40 : 16, big ? 8 : 6, 0.5, big ? 0.6 : 0.4, 3);
    this.spawnFlash(x, y + 0.4, z, 0xfff2c8, big ? 4.4 : 2.4, big ? 0.18 : 0.1);
    this.spawnRing(x, y + 0.2, z, 0xffb45e, big ? 9 : 4.5, big ? 0.6 : 0.38);
  }

  smoke(x: number, y: number, z: number, color = 0x4a4a4a, count = 4, life = 1.2) {
    this.spawnBurst(x, y, z, color, count, 1.6, 0.9, life, -1.2, 0.5);
  }

  update(dt: number) {
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      p.vx *= Math.max(0, 1 - p.drag * dt);
      p.vy *= Math.max(0, 1 - p.drag * dt);
      p.vz *= Math.max(0, 1 - p.drag * dt);
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }
    let idx = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      const j = i * 3;
      if (!p.alive) {
        this.positions[j] = 0;
        this.positions[j + 1] = -100;
        this.positions[j + 2] = 0;
        this.sizes[i] = 0;
        this.alphas[i] = 0;
        idx++;
        continue;
      }
      const f = p.life / p.maxLife;
      this.positions[j] = p.x;
      this.positions[j + 1] = p.y;
      this.positions[j + 2] = p.z;
      this.colors[j] = p.r;
      this.colors[j + 1] = p.g;
      this.colors[j + 2] = p.b;
      this.sizes[i] = p.size * (0.4 + 0.6 * f);
      this.alphas[i] = f;
      idx++;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.material as THREE.PointsMaterial).size = 0.18;

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      const frac = Math.max(0, f.life / f.maxLife);
      f.sprite.scale.setScalar(f.size * (1.6 - frac * 0.7));
      (f.sprite.material as THREE.SpriteMaterial).opacity = frac;
      if (f.life <= 0) {
        f.sprite.visible = false;
        this.flashes.splice(i, 1);
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const frac = Math.max(0, r.life / r.maxLife);
      const scale = r.radius * (1 - frac) * 1.7 + 0.2;
      r.mesh.scale.setScalar(scale);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = frac * 0.9;
      if (r.life <= 0) {
        r.mesh.visible = false;
        this.rings.splice(i, 1);
      }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      const frac = Math.max(0, t.life / t.maxLife);
      (t.line.material as THREE.LineBasicMaterial).opacity = frac;
      if (t.life <= 0) {
        t.line.visible = false;
        this.tracers.splice(i, 1);
      }
    }
  }
}
