# Recoil Crew — Tank Model Roster and TPS Integration Design

**Branch:** `tankmodel-relic-addition`  
**Status:** Provisional design only; implementation is intentionally deferred  
**Revision gate:** Re-audit and revise after the in-progress TPS camera work lands

## 1. Executive summary

Recoil Crew will gain a five-tank visual roster:

1. The existing procedural prototype tank.
2. Quaternius Tank.
3. Quaternius Tank2.
4. Quaternius Tank3.
5. Quaternius Tank4.

Tank3 will replace the procedural prototype as the temporary default player
tank during the first implementation pass. The prototype will not be deleted;
it will become one of the five selectable tanks when tank selection is added.

The first roster release is presentation-only. All five tanks share the same
movement, health, collision footprint, weapons, recoil, and other gameplay
rules. A tank choice must not provide a competitive advantage until a separate
balance design explicitly authorizes gameplay differences.

The models have broadly compatible chassis dimensions, but their turret rings,
gun hinges, muzzle positions, and heights are not normalized to a shared set of
sockets. These differences belong in each tank's data-driven rig definition.
The TPS camera and aiming systems must remain one shared implementation that
consumes the selected tank's rig; they must not contain tank-name conditionals.

No tank-model implementation should begin from this document until the current
TPS camera task is complete and the revision gate in section 12 has been run.

## 2. Goals

- Make Tank3 the temporary default visual tank.
- Preserve the current procedural prototype as a future selectable tank.
- Define a path to a five-tank player-facing roster.
- Normalize asset scale, orientation, hierarchy, and naming without erasing
  genuine model-specific pivot differences.
- Keep authoritative firing, local presentation, trajectory reticles, and TPS
  aiming aligned for every tank.
- Keep one shared Driver/Gunner camera implementation.
- Support Single Player and networked Driver/Gunner sessions with the same rig
  contract.
- Make tank selection server-validated and deterministic when selection is
  implemented.
- Preserve the existing procedural model as a reliable fallback.

## 3. Non-goals

- Implementing or importing tank assets on this branch before the TPS review.
- Adding tank selection UI in the first Tank3-default pass.
- Giving tanks different physics, health, weapons, collision, or statistics.
- Mid-match tank switching.
- Tank unlocks, currency, rarity, progression, or relic-system integration.
- Replacing the shared authoritative weapon-mount geometry.
- Adding suspension, wheel colliders, or rigid-body track simulation.
- Requiring animated tracks for the initial roster.

The branch name contains `relic`, but this design does not couple tank choice to
the existing gameplay relic system.

## 4. Current architecture and constraints

The current tank definition combines gameplay values with a data-driven visual
rig. The rig identifies three semantic model assets:

```text
chassisAssetId
turretAssetId
barrelAssetId
```

It also contains the geometry needed by rendering, aiming, firing, VFX, recoil,
and the trajectory reticle:

```text
turretPivot
barrelPivot
muzzleLocal
aimPivotLocal
cameraAnchorLocal
forwardAxis
```

The current client constructs this hierarchy:

```text
chassis
└── turret        positioned at turretPivot; rotates in yaw
    └── barrel    positioned at barrelPivot; rotates in pitch
```

The server uses the numeric geometry. Mesh bounds, mesh origins, and named GLB
nodes are not authoritative.

Although the tank schema includes optional named socket bindings, the current
`AssetInstanceFactory.buildTankRig()` directly loads three independent assets
and places them using numeric pivots. The implementation plan must therefore
export separate chassis, turret, and barrel GLBs unless the post-TPS revision
explicitly changes and tests the asset-binding architecture.

The current TPS implementation stores `cameraAnchorLocal` on `TankRig`, but the
audited camera path still follows tank position with a fixed `anchorHeight`.
This is a known integration point, not a reason to fork the camera by tank.

## 5. Source-pack audit

The source pack is CC0 and visually compatible with the game's low-poly style.
Each FBX contains a separate body, turret, and gun, plus left/right track meshes
and a track armature. The pack also includes short forward, backward, turn-left,
and turn-right animations. The current tank renderer does not create a tank
animation mixer, so those clips are optional and may remain unused initially.

Approximate geometry cost from the audited FBX files:

| Source model | Approximate faces | Initial role | Source note |
| --- | ---: | --- | --- |
| Tank | 2,921 | Roster alternative | Use FBX; its `.blend` omits the separate turret and most actions |
| Tank2 | 3,463 | Roster alternative | Clean separate turret and gun |
| Tank3 | 3,149 | Temporary default | Clean source and shortest gun; best fit for extreme pitch |
| Tank4 | 5,474 | Heavy-looking alternative | Long gun creates the highest clipping/occlusion risk |
| Prototype | Procedural | Fallback and future roster option | Already registered as three semantic assets |

The four imported tanks share a similar hull and track envelope, but their
weapon mounts are intentionally different. Approximate values below illustrate
the variation after a common scale/orientation pass; they are not final content
values:

| Model | Approx. turret pivot | Approx. barrel pivot in turret space | Approx. forward barrel reach |
| --- | --- | --- | ---: |
| Tank | `(0.01, 0.93, -0.39)` | `(0.01, 0.05, 0.53)` | 2.32 |
| Tank2 | `(0.01, 0.95, -0.09)` | `(0.01, 0.03, 0.79)` | 1.88 |
| Tank3 | `(0.00, 1.15, 0.00)` | `(0.00, 0.16, 0.53)` | 1.30 |
| Tank4 | `(0.02, 1.24, -0.37)` | `(0.00, 0.08, 0.03)` | 2.53 |

Final values must be measured from the exported GLBs in project coordinates
and verified against shared weapon-mount geometry before content is committed.

## 6. Asset normalization contract

Normalization means a common import contract, not identical pivots.

Every authored tank must satisfy:

```text
+Y = up
+Z = chassis and barrel forward at yaw 0
+X = right
uniform applied scale
chassis ground contact at local Y = 0
chassis centered laterally around local X = 0
turret mesh origin at its yaw axis
barrel mesh origin at its pitch hinge
```

The imported pack is approximately compatible with a `0.25` uniform scale,
which produces a visual hull close to the existing 3.8-by-2.3 gameplay
footprint. That number is only a starting point. Each model must be grounded,
measured, and visually compared with the shared collision debug view.

Each source tank should be exported as:

```text
<tank-id>.chassis.glb
<tank-id>.turret.glb
<tank-id>.barrel.glb
```

The chassis GLB may contain the body, tracks, wheels, armature, and optional
clips. The turret and barrel GLBs must not duplicate chassis geometry. Transform
application must preserve a zeroed runtime hierarchy and correct local axes.

Suggested future semantic IDs:

```text
playerTank.prototype.chassis
playerTank.prototype.turret
playerTank.prototype.barrel

playerTank.tank1.chassis
playerTank.tank1.turret
playerTank.tank1.barrel
...
playerTank.tank4.barrel
```

Exact naming will be confirmed during the post-TPS revision so it does not
conflict with asset-catalog changes made by the camera work.

## 7. Tank content and roster design

### 7.1 Interim Tank3 default

The first implementation changes the visual rig used by the existing default
tank to Tank3 while preserving all current gameplay numbers. This minimizes
scope and lets the complete game exercise the new model before selection UI is
introduced.

The procedural prototype assets remain registered and tested as fallbacks.
They must not be removed when Tank3 becomes the default.

### 7.2 Five-tank roster

The later roster phase introduces stable tank IDs for all five choices. Until a
separate balance milestone, every roster entry resolves to the same gameplay
values and collision footprint and differs only in visual rig data.

The preferred long-term separation is:

```text
shared gameplay tank profile
        +
selected presentation rig/profile
        =
resolved per-match tank definition
```

If the content system does not support composition when implementation begins,
the initial roster may use five explicitly validated tank definitions with
identical gameplay values. Schema inheritance should not be added solely to
avoid a small amount of content duplication.

### 7.3 Selection ownership

Recoil Crew has one shared vehicle operated by Driver and Gunner. Tank choice is
therefore a crew/match choice, not an independent cosmetic on each role.

The first selection design should use these rules:

- One selected tank ID per crew/match.
- Selection occurs before the match starts.
- The server validates the selected ID against the allowed roster.
- Both clients receive the resolved tank ID and rig.
- No mid-match switching.
- Rematch retains the prior choice unless the crew returns to selection.
- Single Player uses the same roster and validation path.
- Tank3 is the default when no valid selection is supplied.

Selection UI, conflict resolution between Driver and Gunner, and persistence
are deferred to the roster implementation design revision.

## 8. TPS camera integration

### 8.1 Invariant

There is one TPS camera algorithm. Tank differences are data.

Forbidden implementation patterns include:

```ts
if (tankId === 'tank4') camera.position.y += 0.4;
switch (tankName) { /* per-model aim corrections */ }
```

### 8.2 Follow anchor

The camera follow target must derive from the current chassis presentation
transform and the selected tank's local camera anchor:

```text
cameraFollowWorld = chassisPresentationMatrix * cameraAnchorLocal
```

This replaces a universal height-only assumption. It supports tanks whose
turret rings are forward, rearward, or higher without changing the camera
algorithm.

Tank-follow smoothing and camera obstruction correction remain independent.
The local anchor affects the target pivot; it must not be folded into collision
pull-in state or treated as a stale world-space height.

Driver and Gunner retain independent look state and tuning. Both follow the
same selected tank anchor unless later visual QA proves that role-specific
local anchors are necessary.

### 8.3 Shared boom tuning

The five tanks should initially share:

- Field of view.
- Camera distance.
- Shoulder offset.
- Minimum collision distance.
- Camera collision radius.
- Follow smoothing and vertical leash.

Because the source hulls have similar dimensions, per-tank boom tuning is not
justified yet. A future optional camera profile may be added only if the five-
tank visual matrix demonstrates an unsolved obstruction or framing problem.

### 8.4 Extreme pitch

The Gunner and Single Player camera/weapon path supports near-vertical aiming
for cannon-recoil traversal. Conventional tank meshes cannot visually support
the full range without some barrel/hull intersection.

The initial policy is:

- Preserve gameplay pitch limits and authoritative recoil behavior.
- Prefer Tank3 as the default because its shorter gun minimizes clipping.
- Do not introduce per-tank gameplay pitch limits as a cosmetic repair.
- Measure and document clipping at extreme pitch.
- If needed, modify only the authored mount, breech, or barrel silhouette.

## 9. Aiming, muzzle, and reticle integration

The camera produces a desired world aim point. The selected tank rig then
converts that point into turret yaw and barrel pitch from `aimPivotLocal`.

All firing and presentation must continue to use the same resolved rig:

```text
camera center ray
    → desired world aim point
    → solve from aimPivotLocal
    → rotate turret and barrel
    → resolve muzzleLocal world pose
    → authoritative shot, local VFX, recoil, and trajectory reticle
```

Required invariants:

- `turretPivot` is chassis-local.
- `barrelPivot` is turret-local.
- `muzzleLocal` is barrel-local.
- `aimPivotLocal` is chassis-local.
- `cameraAnchorLocal` is chassis-local.
- Chassis yaw is added exactly once.
- The visual muzzle and authoritative muzzle agree within tolerance.
- Neither camera shoulder offset nor camera collision changes the physical
  muzzle.
- Near-cover blocking and terrain-safe muzzle correction continue to use the
  resolved selected rig.

## 10. Network and authority

The server remains authoritative for selected content, turret state, firing,
projectiles, damage, and movement. A client may request a tank ID during the
future selection phase but cannot submit arbitrary rig geometry or asset paths.

The server resolves an allowed tank definition and replicates its stable tank
ID and rig rules block. Driver prediction, Gunner presentation, Single Player,
and trajectory rendering all consume the same resolved definition.

Tank3-default implementation must not change protocol semantics merely to swap
the visual model. The later selection phase should version rules only when the
resolved tank changes at an allowed lifecycle boundary.

## 11. Planned implementation phases

### Phase 0 — Post-TPS design revision

- Merge or rebase the completed TPS camera work.
- Re-audit camera follow, aiming, collision, reticle, and rig delivery.
- Update this document and obtain implementation approval.

### Phase 1 — Asset conversion proof

- Convert Tank3 to normalized chassis/turret/barrel GLBs.
- Measure its final pivots, muzzle, aim pivot, and camera anchor.
- Register semantic assets without removing prototype fallbacks.
- Validate materials, shadows, dimensions, and loading.

### Phase 2 — Tank3 as default

- Point the default tank rig at Tank3.
- Preserve all gameplay values and the existing collision footprint.
- Verify Single Player and two-client multiplayer.
- Keep the procedural prototype available as a fallback.

### Phase 3 — Remaining roster assets

- Convert Tank, Tank2, and Tank4.
- Add the procedural prototype as an explicit roster entry.
- Create and validate five presentation rigs with shared gameplay values.
- Run the complete five-tank visual and geometry matrix.

### Phase 4 — Player selection

- Add server-validated pre-match tank selection.
- Add Single Player and multiplayer UI.
- Replicate the selected stable tank ID.
- Define rematch and reconnect behavior.
- Add persistence only if separately approved.

### Phase 5 — Optional polish

- Evaluate track animation cost and benefit.
- Consider per-tank camera profiles only with measured evidence.
- Improve extreme-pitch mount silhouettes where necessary.
- Add audio or VFX differences only as presentation, unless separately
  balanced and authorized.

## 12. Mandatory revision gate after TPS work

Before asset implementation, revisit this document against the completed TPS
camera branch and answer all of the following:

1. Does the camera follow a world point derived from the current chassis
   presentation transform and `cameraAnchorLocal`?
2. Is the fixed `anchorHeight` removed, retained only as a fallback, or still
   incorrectly authoritative?
3. Can a newly installed/replicated tank rig update both Driver and Gunner
   camera anchors without resetting their independent look state?
4. Does the aim solver still use the selected rig's `aimPivotLocal`?
5. Do the trajectory reticle, local muzzle flash, authoritative projectile,
   and recoil direction use the same `muzzleLocal` transform chain?
6. Are follow smoothing and camera collision state still independent?
7. Does the camera use current chassis elevation during ridges, valleys,
   jumps, dash, and recoil movement?
8. Did the TPS work change coordinate conventions, pitch signs, transform
   ownership, asset hierarchy, or replicated rig delivery?
9. Do current tests cover a non-default rig with deliberately different
   camera, turret, barrel, and muzzle offsets?
10. Does any camera or aim code branch on a tank asset ID or model name?

Record the reviewed TPS commit and revise sections 4, 8, 9, 10, and 13 before
approving implementation.

## 13. Verification strategy

### 13.1 Automated tests

- Content schema accepts all five tank definitions.
- Every semantic chassis/turret/barrel asset resolves.
- Prototype fallback assets remain resolvable.
- Shared geometry matches the built Three.js hierarchy for every tank.
- Each tank's visual and authoritative muzzle agree at arbitrary chassis and
  turret poses.
- Camera anchor world position matches chassis transform × local anchor.
- Swapping selected rigs updates camera/aim geometry without resetting role
  look state.
- Tank selection rejects unknown or disallowed IDs.
- Tank choice does not change gameplay values in the presentation-only phase.
- Reconnect and rematch restore the authoritative selected tank.

### 13.2 Visual matrix

Run every tank through:

```text
Single Player
online Driver
online Gunner
flat terrain
ridge ascent/descent
valley follow
wall and near-cover camera collision
full turret yaw
horizontal, upward, and downward aim
machine-gun and cannon fire
trajectory reticle
jump, dash, cannon recoil, and landing
shield and damage presentation
```

Capture at least one side view and one gameplay-camera view per tank. Record
barrel clipping, muzzle mismatch, camera obstruction, ground penetration, and
silhouette/readability issues.

### 13.3 Performance checks

- Compare GLB size, object count, material count, and draw calls.
- Confirm five registered prototypes do not cause unintended eager memory use.
- Measure any animation-mixer addition before enabling track animations.
- Preserve current client frame-time targets in two-client testing.

## 14. Acceptance criteria

### Tank3-default milestone

- Tank3 is the default visual tank in Single Player and multiplayer.
- Gameplay values and collision behavior are unchanged.
- Turret yaw, barrel pitch, muzzle flash, projectile origin, recoil direction,
  and trajectory reticle remain aligned.
- Driver and Gunner cameras follow the authored Tank3 camera anchor.
- The procedural prototype remains available as a tested fallback.
- No tank-specific branch exists in camera or aim code.

### Five-tank roster milestone

- All five tanks resolve from stable content IDs.
- All five share identical gameplay rules in the presentation-only release.
- One server-validated selection is used by the shared crew vehicle.
- Both clients display the same selected tank and rig.
- Every tank passes the automated geometry suite and visual matrix.
- Reconnect/rematch behavior is deterministic.
- Extreme-pitch clipping is documented and acceptable or repaired through
  asset authoring without reducing gameplay capability.

## 15. Deferred decisions

The post-TPS revision must decide:

- Final stable tank and semantic asset IDs.
- Whether tank presentation should be separated from gameplay tank content or
  represented by five explicit tank definitions.
- Who controls multiplayer crew selection and how disagreements are resolved.
- Whether selection persists between sessions.
- Whether the current named socket-binding schema will be implemented or the
  three-GLB numeric-pivot contract remains authoritative.
- Whether Tank4 needs different presentation-only camera framing.
- Whether track animations justify a tank animation controller.

Until those decisions are reviewed, this document authorizes planning only and
does not authorize tank asset conversion or runtime implementation.
