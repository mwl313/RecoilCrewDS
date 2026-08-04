# Tank Rig and Weapon Socket Guide

Every shot (MG, cannon, JACKPOT), every muzzle flash, and the trajectory
crosshair resolve through one shared **tank rig** definition. The server
never invents its own offsets; the client never hardcodes pivots.

## Where the rig lives

`content/tanks/default.json` → `TankDefinition.rig`

```json
{
  "rig": {
    "chassisAssetId": "playerTank.chassis",
    "turretAssetId": "playerTank.turret",
    "barrelAssetId": "playerTank.barrel",
    "turretPivot": [0, 1.15, 0],
    "barrelPivot": [0, 0.62, 0],
    "muzzleLocal": [0, 0.75, 2.9],
    "aimPivotLocal": [0, 1.15, 0],
    "cameraAnchorLocal": [0, 1.35, 0],
    "forwardAxis": [0, 0, 1],
    "socketBindings": {
      "turretPivotNode": "turret",
      "barrelPivotNode": "barrel",
      "muzzleNode": "muzzle",
      "cameraAnchorNode": "cameraAnchor"
    }
  }
}
```

## Coordinate convention

```text
+Y up, +Z forward at yaw 0, +X right
forward = (sin yaw, 0, cos yaw)
barrel pitch: renderer rotates barrel by -pitch around X
```

The shared math (`src/shared/vehicle/tankRigGeometry.ts`) applies:

```text
chassis yaw → turret pivot → turret local yaw → barrel pivot → barrel pitch
→ muzzle local
```

## Semantic asset IDs

`chassisAssetId` / `turretAssetId` / `barrelAssetId` are semantic ids resolved
by `AssetService` (procedural fallbacks by default, GLB overrides via
`public/assets/manifest.json`). The server only reads the numeric geometry,
never mesh or node names.

## Numeric sockets vs named nodes

Resolution order for the client rig:

1. Named GLB node (when `socketBindings` is configured and the node exists).
2. Project asset socket metadata (for future imported models).
3. `TankDefinition.rig` numeric fallback.

The authoritative server always uses the numeric values. If a named node
resolves to a materially different position, development diagnostics report
the mismatch and the content values must be updated — the client must not
silently fork from the server.

## Adjusting the rig

### Turret pivot (height of the turret ring)

Raise/lower `turretPivot[1]`. The turret group is parented at this point on
the chassis.

### Barrel pivot (where the barrel hinges on the turret)

Change `barrelPivot`; the barrel group is parented here inside the turret.

### Muzzle (shot origin and muzzle flash)

Change `muzzleLocal` in barrel space. This single value drives:

```text
server hitscan origin      projectile spawn
shot event origin          recoil direction
local muzzle flash         trajectory crosshair ray origin
```

### Aim pivot (turret aiming reference)

`aimPivotLocal` is the chassis-local point the camera-to-turret solver aims
from. It should sit at the turret rotation center (typically equal to
`turretPivot`).

### Forward axis

`forwardAxis` defaults to `[0, 0, 1]`. Change it only if the model's barrel
points along another local axis.

## Verifying alignment

```text
npm run generate:content-pack   # refresh the browser pack after rig edits
npm test                        # schema + legacy/content parity + geometry tests
npm run test:demo               # golden regression (regenerate only if intentional)
```

`tests/gameplay04/tankRigGeometry.test.ts` proves the shared math equals the
Three.js hierarchy and the built client rig for arbitrary poses.

## Previewing the actual shot ray

The trajectory crosshair (`#crosshair`) is moved per frame to the projected
shot line. With the turret converged, it sits at the camera aim point; during
fast traverse it honestly trails the barrel. When the muzzle is blocked by
near cover it turns red and sits at the obstacle point.

## Adding a new tank model

1. Register the model assets (manifest GLBs or project assets).
2. Copy `content/tanks/default.json` to a new tank id and set the rig asset
   ids, pivots, and muzzle.
3. Point a mode's `tank` field at the new tank id.
4. Run `npm run generate:content-pack` and `npm test`.
