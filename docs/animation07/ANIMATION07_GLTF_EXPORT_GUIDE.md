# Animation07 — GLTF Export Guide

## Runtime expectations

- Export GLB with animations embedded (`gltf.animations`).
- Clip names must be unique and match the semantic clip names in the
  animation profile JSON.
- Locomotion clips are in place: animation moves limbs and local body parts;
  gameplay moves the enemy root. Permanent root translation is forbidden.
- Model faces +Z; base near Y = 0; scale plausible (0.3–20 m diagonal).
- No cameras or lights inside the GLB.

## Recommended budgets

- Common near: ≤ 64 bones, ≤ 4 materials.
- Boss: ≤ 160 bones, ≤ 4 materials.
- Far model: rigid (no SkinnedMesh).
- Max 4 vertex influences per vertex (manual export check).

## Validation

Run `npm run validate:enemy-animations`. It checks loads, clip-name
uniqueness, role resolution, root-motion tolerance (0.35 m), skinned/rigid
form, bone/material budgets, bounds, and cameras/lights. The following are
manual export checks: exact vertex influence count, texture dimensions, and
unsupported compression (KHR extensions).

## Naming convention

```text
Witch_Idle, Witch_Walk, Witch_FastHover, Witch_Attack_Primary,
Witch_Cast_Start/Loop/Release, Witch_Hit, Witch_Stagger, Witch_Knockback,
Witch_Entrance, Witch_Recovery, Witch_Phase_Transition, Witch_Death
```

Spider and Beast follow the same family prefix convention.
