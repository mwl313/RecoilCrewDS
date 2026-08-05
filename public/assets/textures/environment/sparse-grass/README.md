# Sparse Grass Runtime Texture Pack

Converted from the user-provided `sparse_grass_4k.blend.zip`.

## Runtime files

- `sparse_grass_basecolor_2k.webp` — sRGB base color
- `sparse_grass_normal_gl_2k.png` — OpenGL normal map, linear data
- `sparse_grass_roughness_2k.png` — roughness, linear data
- `sparse_grass_mask_1k.png` — optional grass distribution mask
- `material.json` — recommended initial settings

The source displacement map is intentionally excluded from runtime use. Recoil Crew's
authoritative heightfield controls visible terrain shape and collision; material displacement
would make rendering diverge from physics.

## Three.js setup

```ts
const loader = new THREE.TextureLoader();

const color = loader.load(
  '/assets/textures/environment/sparse-grass/sparse_grass_basecolor_2k.webp',
);
color.colorSpace = THREE.SRGBColorSpace;

const normal = loader.load(
  '/assets/textures/environment/sparse-grass/sparse_grass_normal_gl_2k.png',
);

const roughness = loader.load(
  '/assets/textures/environment/sparse-grass/sparse_grass_roughness_2k.png',
);

for (const texture of [color, normal, roughness]) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
}

const material = new THREE.MeshStandardMaterial({
  map: color,
  normalMap: normal,
  roughnessMap: roughness,
  color: 0xffffff,
  roughness: 1,
  metalness: 0,
});
material.normalScale.set(0.5, 0.5);
```

Use world-space terrain UVs:

```ts
u = worldX / 10;
v = worldZ / 10;
```

Do not additionally apply `texture.repeat.set(3, 3)`, because that would multiply the
world-space tiling again.

## License record

The supplied ZIP did not contain a license or source README. Before committing this pack,
add the original download-page URL and license record to the repository. Keep that record
beside the texture assets.
