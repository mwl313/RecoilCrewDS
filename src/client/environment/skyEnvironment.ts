import * as THREE from 'three';

export const AUTHORED_SKY_SLOT = '/assets/environment/sky/recoil-day-01.webp';

export class SkyEnvironment {
  private fallback: THREE.CanvasTexture | null = null;
  private authored: THREE.Texture | null = null;
  source: 'procedural' | 'authored' = 'procedural';

  constructor(private readonly scene: THREE.Scene) {
    this.fallback = buildProceduralDaySky();
    this.scene.background = this.fallback;
    void fetch(AUTHORED_SKY_SLOT)
      .then((response) => response.ok ? response.blob() : null)
      .then((blob) => blob ? createImageBitmap(blob) : null)
      .then((bitmap) => {
        if (!bitmap) return;
        const texture = new THREE.Texture(bitmap);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.wrapS = THREE.RepeatWrapping;
        texture.needsUpdate = true;
        this.authored = texture;
        this.scene.background = texture;
        this.source = 'authored';
      })
      .catch(() => {
        // The authored slot is intentionally optional. The immediate canvas
        // sky remains a bright, coherent fallback instead of exposing black.
      });
  }

  dispose(): void {
    if (this.scene.background === this.fallback || this.scene.background === this.authored) {
      this.scene.background = null;
    }
    this.fallback?.dispose();
    this.authored?.dispose();
    this.fallback = null;
    this.authored = null;
  }
}

function buildProceduralDaySky(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#3986bf');
    gradient.addColorStop(.42, '#75b9df');
    gradient.addColorStop(.69, '#c8dbe0');
    gradient.addColorStop(.79, '#efd1a0');
    gradient.addColorStop(1, '#8fa49d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = .18;
    ctx.fillStyle = '#fffaf0';
    for (let i = 0; i < 14; i++) {
      const x = (i * 167 + 71) % canvas.width;
      const y = 180 + (i % 4) * 22;
      ctx.beginPath();
      ctx.ellipse(x, y, 58 + (i % 3) * 18, 9 + (i % 2) * 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.wrapS = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}
