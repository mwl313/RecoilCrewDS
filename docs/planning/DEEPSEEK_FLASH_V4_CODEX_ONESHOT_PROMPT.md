# ONE-SHOT BUILD PROMPT — RECOIL CREW
## Target model: DeepSeek Flash v4 in a Codex-style coding harness

Your task is to create a complete playable browser game named **Recoil Crew** from the supplied design document. Use anything any skill any tool at your disposal to create this project.

Do not stop after planning.

Do not return only an architecture proposal.

Do not ask the user to make ordinary implementation decisions.

Inspect the repository, choose the most suitable stack, implement the game, run it, test it, fix it, and leave the repository in a complete usable state.

Read first:

```text
RECOIL_CREW_ONESHOT_DESIGN.md
GAME_DESIGN.md
README.md
AGENTS.md
```

Some of these files may not exist. Read all that do exist.

Treat `RECOIL_CREW_ONESHOT_DESIGN.md` as the player-facing authority.

---

# 1. Mission

Build a polished two-player online cooperative browser game with:

- Driver and Gunner sharing one tank
- Online create/join flow
- Short room code
- Separate full-screen modern TPS cameras
- Independent Driver and Gunner camera state
- Partner PIP
- Arcade tank movement
- Boost, drift, brace, and auto-righting
- Machine gun
- Main cannon
- Physical cannon recoil affecting the whole tank
- Scrap pickups
- Shared Crew Combo
- JACKPOT meter and JACKPOT Shell
- Tank integrity
- Wipeout and respawn
- Scrap Bug
- Rammer
- Gun Tower
- Loot Truck event
- One complete military salvage arena
- 90-second round
- Results, grade, humorous title, and rematch
- Practice mode
- Polished low-poly presentation
- Polished HUD and menus
- Swappable assets
- Stable browser performance

The final product must launch from a browser URL.

---

# 2. Stack Selection

You may choose the engine and stack.

Choose the stack with the highest probability of delivering the complete game in this harness.

Evaluate:

- Current repository contents
- Tools installed in the environment
- Ability to run and test without manual editor work
- Browser build reliability
- Multiplayer deployment simplicity
- Physics quality
- TPS camera quality
- Asset pipeline
- Ability to finish all required mechanics

Reasonable candidates include:

- TypeScript + Vite + Three.js or Babylon.js + Rapier + a Node authoritative WebSocket server
- TypeScript + a browser game framework plus a 3D renderer and physics library
- Godot 4 Web plus a compatible authoritative server
- Unity Web only when the Unity Editor and required automation are genuinely usable inside the harness

Default preference for an empty or lightly initialized repository:

> Use a web-native TypeScript stack with a deployable authoritative Node server, unless another installed stack is clearly more reliable.

Do not choose a stack merely because it is theoretically powerful.

Choose the stack that you can actually build, test, and finish.

Record the decision briefly in:

```text
DECISIONS.md
```

Then continue immediately.

---

# 3. Working Rules

- Do not ask for confirmation.
- Make sensible decisions and continue.
- Keep the game runnable throughout development.
- Prefer a complete vertical slice over elaborate infrastructure.
- Prefer game feel and presentation over abstraction.
- Do not port unrelated legacy systems.
- Do not create a procedural dungeon or upgrade system.
- Do not wait for external art.
- Generate cohesive low-poly fallback art when necessary.
- Never couple gameplay to imported model child names.
- Test in at least two browser clients where possible.
- Fix errors before adding more systems.
- Do not claim success without running the project.
- Commit or checkpoint logically if Git is available.
- Do not delete useful existing work without inspecting it.
- Preserve user files and secrets.
- Do not require paid services.
- Create a `.env.example` for required server configuration.
- Never commit secrets.

---

# 4. Required First Actions

1. Inspect the repository.
2. Identify installed runtimes and tools.
3. Read the design authority.
4. Choose the stack.
5. Write a short internal execution plan in `BUILD_PLAN.md`.
6. Create or repair the project structure.
7. Start implementing immediately.
8. Keep `BUILD_STATUS.md` updated with completed and remaining work.

The plan is not the deliverable.

The playable game is the deliverable.

---

# 5. Architecture Outcome

Regardless of stack, create clear modules for:

```text
application and scene flow
multiplayer rooms and transport
authoritative match state
client prediction and interpolation
input
tank movement and recoil
weapons
enemies
pickups
score and combo
JACKPOT
round pacing
cameras
PIP
UI
audio and VFX
asset registry
configuration
tests
build and deployment
```

Keep tunable values in configuration rather than hiding them across gameplay code.

Do not over-engineer dependency injection, ECS, plugin systems, or generic frameworks.

---

# 6. Multiplayer Requirements

Implement a real two-browser multiplayer loop.

Required:

```text
Create Crew
→ display short code
→ Join Crew
→ Driver and Gunner assignment
→ ready state
→ countdown
→ synchronized match
→ results
→ rematch in same room
```

Authority requirements:

- Shared tank physics is authoritative.
- Enemy movement is authoritative.
- Damage is authoritative.
- Pickups are authoritative.
- Score, combo, JACKPOT, timer, Wipeout, and results are authoritative.
- Driver sends movement input unless Driver is the local authoritative host.
- Gunner sends desired turret aim and fire input.
- Gunner camera is never networked.
- Driver free-look camera is never networked.
- Local cameras update immediately.
- Local Gunner turret presentation responds immediately.
- Host/server validates fire rate and accepted shots.
- Local muzzle flash and sound may play immediately.
- Confirmed hits and score appear only after authoritative result.
- Stale Gunner input cannot leave a weapon firing.
- Duplicate cannon requests cannot fire twice.
- Smoothly interpolate remote shared state.
- Show clear connection and disconnect status.
- Offer Practice if online connection fails.

Prefer a dedicated authoritative Node WebSocket server for web-native stacks because it avoids browser host-tab throttling and makes connections symmetrical.

A host-authoritative relay topology is acceptable only when it is clearly more reliable in the selected stack.

Do not use direct peer-to-peer networking requiring inbound ports.

---

# 7. Modern Camera Requirements

## Driver

- Full-screen independent TPS free-look
- Mouse controls camera only
- WASD remains chassis-relative
- R recenters behind chassis
- Camera never controls turret
- Camera is local only
- Polished shoulder composition
- Collision-safe around walls, floor, and tank
- Slight speed FOV and drift feedback if stable

## Gunner

- Full-screen modern TPS aiming
- Pointer lock
- Immediate yaw and pitch
- Center crosshair
- Camera ray defines desired aim point
- Turret follows aim point
- Local predicted turret
- Authoritative turret validation
- Camera never follows network correction
- Collision-safe shoulder camera
- Cannon recoil feedback without corrupting aim

## Partner PIP

- Bottom-right
- Small 16:9 window
- Role label and status
- Locally reconstructed
- Reduced frame rate and quality
- Never blocks critical view
- Can degrade independently for performance

Do not settle for a simple rigid chase camera or a model-viewer orbit camera.

---

# 8. Gameplay Requirements

Implement every gameplay system described in the design document.

## Tank

- Arcade acceleration and reverse
- Steering
- Lateral grip
- Boost and drift
- Brace
- Grounding
- Limited air control
- Stability
- Auto-right
- Integrity
- Respawn protection
- Physical cannon recoil

## Weapons

- Machine gun
- Main cannon
- JACKPOT Shell
- Immediate presentation
- Authoritative results
- Strong recoil
- Splash and chain reactions
- Cooldowns
- Unlimited ammo
- No manual reload

## Enemies

- Scrap Bug
- Rammer
- Gun Tower
- Loot Truck

Use simple robust behavior rather than complex pathfinding.

## Pickups and score

- Normal, heavy, and JACKPOT scrap
- Magnetism
- Shared score
- Crew Combo
- Both-role contribution requirement above ×2
- Crew Link bonuses
- Wipeout penalty
- Grade
- Humorous title

## Round

- 90 seconds
- Required pacing windows
- Guaranteed first JACKPOT assistance
- Final five-second countdown
- Results
- Rematch modifier

---

# 9. Arena

Build one polished military salvage test yard.

Required regions:

- Recoil Bowl
- Launch Ramp
- Explosive Depot
- Crusher Lane
- Scrap Ring

Required props:

- Ramps
- Barriers
- Containers
- Tires
- Scrap piles
- Explosive barrels
- Industrial structures
- Visible boundaries

If no models exist, build deliberate low-poly meshes from primitives.

Do not leave an empty gray test plane as the final arena.

---

# 10. Visual Quality

Use a cohesive low-poly style:

- Warm industrial environment
- Toy-like military shapes
- Strong silhouettes
- Clear enemy colors
- Bright scrap
- Red threats
- Cyan Driver UI
- Orange Gunner UI
- White-yellow JACKPOT
- Controlled bloom or glow
- Strong effects
- Readable lighting
- Clean typography
- Animated UI accents

Create polished menus and HUD.

The UI must not look like default browser controls.

Use CSS, canvas UI, engine UI, or another suitable system, but make it intentionally designed.

Required screens:

- Loading / click to enter
- Main menu
- Create Crew
- Join Crew
- Ready
- Connection failure
- Practice
- Driver HUD
- Gunner HUD
- Results
- Rematch waiting

---

# 11. Asset Replacement

Implement a semantic asset registry.

Gameplay code must request assets by semantic ID.

Examples:

```text
playerTank.chassis
playerTank.turret
enemy.scrapBug
enemy.rammer
enemy.gunTower
enemy.lootTruck
pickup.normalScrap
prop.explosiveBarrel
vfx.cannonImpact
ui.driverTheme
audio.cannon
```

Imported or generated visuals must sit beneath project-owned gameplay roots.

Replacing a model must not require rewriting gameplay code.

Provide:

```text
ASSET_GUIDE.md
```

Explain:

- Where assets live
- How IDs map to files or factories
- How to replace a model
- Required orientation and scale
- How to replace materials, UI, VFX, and audio
- Fallback behavior

Use generated low-poly fallbacks for every required asset.

---

# 12. Audio and Effects

Do not ship silent or visually flat gameplay.

Create procedural or available-license placeholder audio when necessary, or provide generated Web Audio synthesis.

Required feedback:

- Engine
- Boost
- Drift
- Collisions
- Machine gun
- Cannon
- Enemy hit
- Enemy death
- Scrap pickup
- Rammer telegraph
- Gun Tower fire
- Loot Truck siren
- Brace
- Wipeout
- JACKPOT charge
- JACKPOT release
- UI
- Results
- Escalating music or layered ambience

Required visual effects:

- Muzzle flashes
- Tracers
- Smoke
- Dust
- Explosions
- Scrap trails
- Score bursts
- Charge glow
- Shockwave
- Chain explosions
- JACKPOT spectacle

Pool or reuse effects.

---

# 13. Performance

Target:

- Stable 60 FPS on a normal desktop browser
- Main controls remain immediate
- Heavy effects remain playable
- PIP quality reduces before main view quality
- No major memory growth after rematches
- No unbounded object creation

Implement:

- Object pooling or reuse
- Efficient enemy limits
- Efficient scrap limits
- Low-cost PIP
- Reasonable shadow and effect budgets
- Development performance overlay
- Graceful quality fallback

Do not sacrifice local camera response to save network or render cost.

---

# 14. Tests and Validation

Create useful automated tests for:

- Room creation and join-code handling
- Role assignment
- Input separation
- Authoritative recoil
- Fire cooldown
- Duplicate fire prevention
- Turret angle wrap
- Stale input clearing
- Enemy state transitions
- Pickup collection once
- Combo rules
- JACKPOT progression
- Wipeout and respawn
- Round timer
- Rematch reset
- Asset registry fallback
- Configuration validity

Also create:

```text
SMOKE_TEST.md
```

with manual steps for:

- Two local browser tabs
- Two separate networks
- Chrome
- Edge
- Practice
- Pointer lock
- Driver controls
- Gunner controls
- PIP
- First cannon recoil
- First pickup
- Loot Truck
- JACKPOT
- Wipeout
- Results
- Rematch
- Disconnect

Run all available automated tests before completion.

---

# 15. Build and Deployment

Provide working scripts for:

- Install
- Development client
- Development server
- Tests
- Production build
- Production server
- Static client serving where applicable

Provide:

```text
README.md
DEPLOYMENT.md
.env.example
```

The README must include exact commands.

The deployment guide must include at least one realistic low-cost deployment path.

The client build must work from an HTTPS origin.

Avoid hardcoded localhost URLs in production.

---

# 16. Priority Order

Implement in this order, but continue until the entire game is complete:

1. Browser client boots
2. Two-player room and join code
3. Shared authoritative tank
4. Driver movement
5. Gunner turret and cannon recoil
6. Modern Driver and Gunner cameras
7. Practice mode
8. Machine gun and basic enemy
9. Scrap, score, combo
10. Integrity, Wipeout, respawn
11. JACKPOT and 90-second round
12. Rammer, Gun Tower, Loot Truck
13. Full arena
14. PIP
15. UI and onboarding
16. Audio and VFX
17. Asset registry and replacement guide
18. Performance and reconnect polish
19. Tests and deployment
20. Final end-to-end verification

Do not stop after the first vertical slice.

---

# 17. Degradation Policy

When a perfect implementation is not possible, simplify in this order:

1. Reduce decorative props.
2. Reduce effect count.
3. Reduce PIP quality.
4. Reduce enemy quantity.
5. Use generated primitive models.
6. Use simpler enemy steering.
7. Use a simpler visual slow-motion effect.
8. Use one rematch modifier instead of all six.

Do not cut:

- Two-player online rooms
- Separate roles
- Independent TPS cameras
- Physical cannon recoil
- Scrap collection
- Combo
- JACKPOT
- 90-second round
- Wipeout recovery
- Results and rematch
- Practice
- Swappable asset structure

---

# 18. Completion Standard

Do not declare completion until:

- The project installs.
- The project builds.
- Tests run.
- The client launches.
- The server launches if required.
- Two browser clients can join one room.
- Driver and Gunner inputs remain separate.
- Cannon recoil changes the shared tank.
- Both TPS cameras are usable and independent.
- The core loop works.
- JACKPOT works.
- The full round ends.
- Results appear.
- Rematch works.
- Practice works.
- The arena is visually complete.
- The UI is polished.
- Asset replacement is documented.
- No critical runtime errors remain.

At completion, provide a concise final report containing:

1. Chosen stack and reason
2. How to install
3. How to run client and server
4. How to run tests
5. How to build
6. How to deploy
7. Completed features
8. Remaining limitations
9. Exact manual multiplayer test
10. Important files
11. Asset replacement procedure

Continue working until you have reached the strongest complete result possible in the current execution session.
