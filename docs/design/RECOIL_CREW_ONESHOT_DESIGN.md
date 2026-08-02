# RECOIL CREW
## Engine-Agnostic Complete Game Design

**Document version:** 2.0 — One-Shot Build Edition  
**Primary platform:** Desktop web browser  
**Distribution target:** A URL or static web client plus a deployable multiplayer server  
**Required players:** Two online players  
**Fallback:** Solo Practice  
**Round length:** 90 seconds  
**Core hook:** The Gunner’s cannon physically pushes the tank controlled by the Driver  
**Design priority:** One polished, immediately understandable cooperative experience—not content volume

---

# 1. Product Summary

**Recoil Crew** is a fast two-player online cooperative score-attack game in which both players occupy the same tank.

The **Driver**:

- Drives, steers, boosts, and drifts
- Freely looks around with a polished independent TPS camera
- Collects scrap
- Rams light enemies
- Dodges threats
- Braces the tank before powerful shots
- Turns recoil into movement

The **Gunner**:

- Uses a separate polished TPS aiming camera
- Rotates the turret independently
- Fires a machine gun and main cannon
- Creates chain reactions
- Selects high-value targets
- Charges the shared JACKPOT attack
- Physically disrupts or assists the Driver through recoil

The central pitch is:

> **The Driver controls where the tank goes. The Gunner controls where the tank gets thrown.**

The game should be understood within seconds, create a funny coordination failure within the first minute, and deliver its largest spectacle—the **JACKPOT Shell**—during the first 90-second round.

---

# 2. Design Goals

The finished game must feel:

- Immediate
- Polished
- Funny
- Cooperative
- Chaotic but readable
- Easy to start
- Difficult to coordinate perfectly
- Satisfying for both roles
- Visually strong enough to impress within the first three minutes

The game should not rely on:

- Story
- Progression
- Large content quantity
- Complex tutorials
- Realistic tank simulation
- Multiple maps
- Account creation
- Long sessions

The quality must come from:

- Excellent controls
- Modern TPS cameras
- Strong recoil physics
- Sound and visual feedback
- A clear 90-second rhythm
- A large cooperative climax
- Fast rematching

---

# 3. Non-Negotiable Requirements

## 3.1 Browser delivery

The game must:

- Launch from a normal URL
- Require no executable installation
- Work in current desktop Chrome and Edge
- Support mouse and keyboard
- Work over HTTPS in production
- Fit a normal game-hosting workflow such as itch.io, GitHub Pages plus a server, Cloudflare, Render, Railway, Fly.io, or another suitable host

## 3.2 Online co-op

Two players must connect from separate browsers.

Required flow:

```text
Player A creates a crew
→ receives a short join code
→ becomes Driver
→ Player B joins with the code
→ becomes Gunner
→ both enter the same tank
```

The game must not require:

- Port forwarding
- Router configuration
- Public IP knowledge
- A local executable
- A public lobby browser

## 3.3 Two independent TPS views

Each player receives a full-screen third-person view tailored to the role.

The Driver and Gunner cameras are **not synchronized**.

Each local player independently controls their own camera.

The partner’s role is shown in a small picture-in-picture feed in the bottom corner. This feed may be reconstructed locally from synchronized game state and does not need to show the partner’s exact free-look direction.

## 3.4 Immediate hook

During the first round:

- Active control begins within seconds
- First enemy can be shot within five seconds
- Main cannon recoil can be experienced within ten seconds
- Scrap collection is understood within 20 seconds
- JACKPOT progress is visible within 30 seconds
- First JACKPOT should occur around 50–70 seconds

## 3.5 Failure stays fun

Players may:

- Miss
- Crash
- Spin
- Become airborne
- Lose combo
- Wipe out
- Recover and continue

A mistake should usually create a funny setback, not long inactivity or early match termination.

---

# 4. Emotional Rhythm

The intended round rhythm is:

```text
Immediate comprehension
→ small success
→ accidental interference
→ blame or laughter
→ recovery
→ improving coordination
→ shared JACKPOT anticipation
→ huge release
→ final chaos
→ humorous score reveal
→ immediate rematch
```

The design succeeds when players naturally say:

- “Stop shooting while I’m turning.”
- “Shoot now!”
- “Brace!”
- “Why did you fire?”
- “Drive through the scrap.”
- “Aim at the truck.”
- “Use the recoil to reach the ramp.”
- “That was your fault.”
- “Again.”

---

# 5. Core Gameplay Loop

```text
Destroy enemies
→ enemies drop scrap
→ Driver collects scrap
→ both roles maintain Crew Combo
→ JACKPOT meter fills
→ Driver braces
→ Gunner charges
→ JACKPOT Shell fires
→ enemies and barrels chain-explode
→ scrap shower and score burst
→ repeat until time expires
```

Both roles must contribute throughout the entire round.

No role should remain passive for more than a few seconds.

---

# 6. Roles and Controls

## 6.1 Driver

Responsibilities:

- Drive the tank
- Choose engagement distance
- Collect scrap
- Avoid Rammer charges
- Use ramps and hazards
- Stabilize firing positions
- Brace for normal cannon fire and JACKPOT
- Recover from Gunner mistakes

Controls:

| Input | Action |
|---|---|
| W / Up | Accelerate |
| S / Down | Reverse or brake |
| A / Left | Steer left |
| D / Right | Steer right |
| Mouse | Independent TPS free-look |
| Left Shift | Boost and increase drift |
| Space | Brace |
| R | Recenter camera behind chassis |
| Escape | Release pointer / local menu |

Important:

- Driving remains chassis-relative.
- Looking backward does not reverse steering logic.
- Driver camera movement never rotates the turret.
- Driver camera state is local and not sent over the network.

## 6.2 Gunner

Responsibilities:

- Track targets
- Destroy enemies
- Use cannon for groups and armor
- Trigger explosive chains
- Destroy the Loot Truck
- Charge JACKPOT
- Coordinate recoil timing with the Driver

Controls:

| Input | Action |
|---|---|
| Mouse | Aim TPS camera and desired turret direction |
| Left mouse | Fire machine gun |
| Right mouse | Fire main cannon |
| Hold right mouse when JACKPOT is ready | Charge JACKPOT |
| R | Recenter camera |
| Escape | Release pointer / local menu |

Important:

- Camera movement is immediate and local.
- Turret prediction is immediate.
- The server validates actual turret movement and accepted shots.
- Network correction may move the turret model gently, but never the local camera.

## 6.3 Practice

Practice combines both roles locally:

- WASD drives
- Mouse aims
- Left mouse fires machine gun
- Right mouse fires cannon
- Shift boosts
- Space braces

Practice must remain available when online services fail.

A simple camera-swap option may switch between Driver and Gunner views.

---

# 7. Modern TPS Camera Standard

Both role cameras should feel like polished modern third-person shooter cameras.

Required qualities:

- Pointer-locked mouse input
- Immediate yaw and pitch
- Unlimited horizontal rotation
- Smooth pitch limits
- Over-the-shoulder composition
- Tank visible below and slightly beside the reticle
- Stable center-screen aim for Gunner
- Reliable wall and floor collision
- No clipping into the tank
- No camera movement caused by network reconciliation
- Small positional damping, not heavy rotational delay
- FOV around a modern arcade shooter range
- Smooth recenter
- Camera remains readable during recoil, drift, jumps, and collisions

Driver and Gunner use the same quality standard but maintain independent local camera state.

Recommended visual starting point:

- FOV around 68–72 degrees
- Moderate shoulder offset
- Camera distance around 5 metres
- Fast obstacle pull-in
- Smooth but quick obstacle release
- Minimal horizontal follow delay
- Slightly softer vertical follow

Optional subtle polish:

- Small speed FOV increase
- Small drift roll
- Positional cannon kick
- Landing impulse

These effects must never change gameplay aim.

---

# 8. Partner Picture-in-Picture

Each player sees the partner role in the bottom-right.

Driver sees:

```text
GUNNER FEED
```

Gunner sees:

```text
DRIVER FEED
```

Presentation:

- 16:9
- About 20% of screen width
- Role label
- Role color
- Connection indicator
- Current action label
- Slight monitor treatment
- JACKPOT pulse

Example labels:

- `GUNNER FEED — CANNON READY`
- `GUNNER FEED — CHARGING`
- `DRIVER FEED — BOOSTING`
- `DRIVER FEED — BRACING`

The feed should prioritize performance:

- Low resolution
- Reduced update rate
- Reduced effects
- No expensive post-processing
- May degrade independently from the main view

---

# 9. Tank Movement and Recoil

## 9.1 Movement feel

The tank is arcade-like:

- Heavy but responsive
- Fast enough for drifting
- Easy to understand
- Forgiving reverse steering
- Stable enough to recover from recoil
- Capable of jumping and short airtime

Suggested starting behavior:

- Forward speed around 18 m/s
- Reverse speed around 8 m/s
- Strong acceleration
- Responsive steering at low speed
- Slightly reduced steering at high speed
- Boost increases speed and lowers lateral grip
- Auto-right after roughly 1.2 seconds when disabled or overturned

Do not simulate realistic tracks, gearbox, individual wheels, or military vehicle handling.

## 9.2 Recoil

The main cannon applies a physical impulse opposite its firing direction.

Recoil can:

- Slow the tank
- Accelerate the tank
- Tighten or ruin a turn
- Cause a spin
- Push the tank off a hazard
- Launch the tank from a ramp
- Correct an airborne path
- Push the tank through scrap
- Cause accidental chain reactions

The recoil must be large enough to be obvious immediately but controlled enough that the Driver can learn to use it.

## 9.3 Brace

While bracing:

- Acceleration decreases
- Steering decreases
- Grip increases
- Visual stabilizers deploy
- Normal recoil decreases substantially
- JACKPOT recoil decreases substantially
- Recoil never becomes zero

Bracing is the Driver’s most important cooperation input.

---

# 10. Weapons

## 10.1 Machine Gun

Purpose:

- Continuous Gunner activity
- Small enemy control
- Combo maintenance
- Precise feedback

Behavior:

- Fast hitscan or equivalent fast projectile
- Unlimited ammo
- No manual reload
- Light spread
- Minimal tank recoil
- Strong hit feedback

Feedback:

- Muzzle flash
- Tracer
- Hit spark
- Hit marker after server confirmation
- Distinct hit sounds
- Light camera response

## 10.2 Main Cannon

Purpose:

- Multi-kills
- Armored targets
- Recoil comedy
- Environmental chain reactions

Suggested behavior:

- About 1.6-second cooldown
- Powerful direct hit
- Splash damage
- Visible projectile or convincing shell trail
- Unlimited ammo
- Strong physical recoil

Feedback sequence:

```text
Input
→ immediate local flash and sound
→ barrel recoil
→ camera response
→ physical tank recoil
→ projectile travel
→ impact
→ explosion
→ short emphasis on major destruction
→ score popup
```

## 10.3 JACKPOT Shell

JACKPOT is the signature spectacle.

At full meter:

Driver sees:

```text
JACKPOT READY
HOLD SPACE TO BRACE
```

Gunner sees:

```text
JACKPOT READY
HOLD RIGHT MOUSE TO CHARGE
```

Charge lasts roughly one second.

During charge:

- Cannon glows
- Audio rises
- HUD pulses
- Partner feed flashes
- Nearby metal vibrates
- Players remain vulnerable

On fire:

- Huge muzzle flash
- Powerful sound
- Strong tank recoil
- Wide projectile trail
- Large impact
- Chain detonation
- Scrap shower
- Score burst
- Brief visual slow-motion or emphasis
- Music sting

Braced result:

- More controllable recoil
- Small impact bonus
- Coordination bonus

Unbraced result:

- Extreme recoil
- Possible airtime
- No brace bonus
- Still entertaining and valid

The first round should strongly guarantee that the players see this attack.

---

# 11. Crew Combo and Scoring

Crew Combo ranges approximately from ×1 to ×5.

Either role can maintain it, but growing beyond ×2 requires both roles to contribute within a short recent window.

Driver contributions include:

- Collecting scrap
- Collecting at speed
- Drifting near enemies
- Ramming small enemies
- Dodging Rammer charges
- Using recoil to cross a ramp or hazard
- Bracing during a coordinated shot

Gunner contributions include:

- Hits
- Kills
- Multi-kills
- Explosive chains
- Destroying armored targets
- Shooting a charging Rammer
- Destroying the Loot Truck
- Firing JACKPOT

Crew Link bonuses reward one role creating an opportunity completed by the other.

Examples:

- Gunner creates scrap; Driver collects it at speed
- Driver dodges Rammer; Gunner hits exposed rear
- Driver braces; Gunner fires cannon
- Gunner recoil pushes tank through pickups
- Driver rams enemy; Gunner finishes it

Final score combines:

- Combat
- Driver actions
- Scrap
- JACKPOT
- Crew Links
- Combo
- Wipeout penalties

Grades:

- D: completed round
- C: basic participation
- B: one JACKPOT and stable play
- A: strong combo and Crew Links
- S: exceptional coordination or multiple JACKPOTS

Humorous result titles include:

- Recoil Accountants
- Friendly Fire Department
- Unlicensed Ballistics
- Scrap Goblins
- Airborne Division
- The Brakes Were Optional
- Perfectly Coordinated Accident
- One Brain, Two Browsers
- Turret-Induced Motion Sickness

---

# 12. Integrity, Wipeout, and Recovery

Tank starts with 100 integrity.

Damage sources:

- Rammer collisions
- Gun Tower projectiles
- Hazards
- Explosions
- Severe falls

At zero integrity:

1. Tank explodes dramatically
2. Action pauses briefly for emphasis
3. Combo resets
4. A score penalty applies
5. Tank respawns after about three seconds
6. Round timer continues

Suggested penalty:

- Lose 15% of current score
- Combo returns to ×1
- Preserve 50% of JACKPOT meter

Respawn:

- Safe central location
- Two seconds of protection
- Clear shield effect
- No score during protection
- Tank faces active threats

The round never ends early from a Wipeout.

---

# 13. Scrap

## Normal scrap

- Standard enemy drop
- Small glowing object
- Score and JACKPOT value
- Short lifetime
- Small collection magnet

## Heavy scrap

- Rammer and Gun Tower drop
- More value
- Larger model and sound
- Stronger local magnet

## JACKPOT scrap

- Loot Truck drop
- High value
- Gold or white beam
- Creates a visible collection route

The Driver must still approach pickups. Magnetism prevents frustrating near-misses but does not vacuum the entire arena.

---

# 14. Enemy Roster

The game uses three regular enemies and one timed event target.

## 14.1 Scrap Bug

Role:

- Immediate target
- Machine-gun fodder
- Cannon crowd
- Scrap supply

Visual:

- Small improvised rolling robot
- Primitive metal body
- Tire or box parts
- Bright red eye
- Low silhouette

Behavior:

- Moves toward tank
- Slightly circles
- Uses simple separation
- Dies quickly
- Drops normal scrap

## 14.2 Rammer

Role:

- Forces Driver movement
- Creates a telegraphed dodge
- Gives Gunner a timing target

Visual:

- Small hostile vehicle
- Heavy front armor
- Exposed rear
- Warning lights

States:

```text
Approach
→ lock direction
→ telegraph
→ charge
→ recovery
→ repeat
```

During recovery the rear is vulnerable.

## 14.3 Gun Tower

Role:

- Prevents stationary play
- Creates visible projectile threats
- Gives Gunner a fixed priority target

Visual:

- Military or industrial tower
- Rotating head
- Bright target beam

Behavior:

- Tracks tank
- Telegraphs
- Fires slow visible bursts
- Pauses between bursts
- Can be destroyed directly or through explosions

## 14.4 Loot Truck

Timed event around 40–45 seconds.

Visual:

- Large military or industrial vehicle
- Glowing scrap container
- Siren
- Gold objective marker

Behavior:

- Follows outer arena loop
- Does not attack
- Attempts to escape
- Drops major scrap reward when destroyed

If it escapes, the game provides an alternate way to reach JACKPOT.

---

# 15. Enemy Spawning

Target load:

- 12–18 active enemies
- Brief maximum around 20
- 20–30 scrap pickups
- Up to three Rammers
- Up to two Gun Towers
- One Loot Truck

Enemies should enter through readable world locations:

- Gates
- Ramps
- Scrap piles
- Behind cover
- Dormant tower activation

Avoid complex general-purpose pathfinding.

Use open layouts, direct steering, simple avoidance, charge vectors, and fixed routes.

---

# 16. Arena

Theme:

> **Stylized military salvage test yard**

Visual ingredients:

- Military props
- Factory structures
- Junk piles
- Containers
- Tires
- Barrels
- Test ramps
- Scrap-processing equipment
- Concrete and industrial barriers

The arena should be compact, readable, and dense with interaction.

Suggested size: roughly 80 × 80 game metres.

Zones:

## Center — Recoil Bowl

- Open combat
- Respawn
- Circular driving
- Scrap Bug activity

## North — Launch Ramp

- Large ramp
- Pickup line
- Overlooking Gun Tower
- Recoil-assisted jumps

## East — Explosive Depot

- Barrel clusters
- Chain reactions
- High-risk pickups

## South — Crusher Lane

- Narrow route
- Rammer ambush
- High-speed collection

## West — Scrap Ring

- Tires and containers
- Wide drifting route
- Loot Truck path

Use visible boundaries rather than invisible walls.

Required interactive props:

- Explosive barrels
- Breakable light barriers
- Small movable scrap or tires
- Ramps

---

# 17. Round Pacing

## 0–5 seconds — Immediate action

- Tank already in arena
- Two Scrap Bugs ahead
- First kill within two seconds
- First recoil immediately available
- Short role prompts

## 5–20 seconds — Learn loop

- Small Bug groups
- First pickup
- Combo appears
- Nearby barrel cluster
- Prompts disappear after use

## 20–40 seconds — First conflict

- Rammer appears
- Gun Tower activates
- Driver must evade
- Recoil affects positioning more strongly

## 40–55 seconds — Loot Truck

- Siren
- Gold marker
- Moving outer route
- High-value chase
- Music intensity rises

## 55–70 seconds — Guaranteed first JACKPOT

Hidden assistance ensures meter reaches the climax unless players are almost inactive.

Possible assistance:

- More truck scrap
- Temporary charge multiplier
- Dense wave
- Reduced remaining requirement

## 70–90 seconds — Final chaos

- More enemies
- More Rammers
- More useful explosive opportunities
- Second JACKPOT possible
- Music and visuals peak
- Large final five-second countdown

---

# 18. Rematch Modifiers

The first round uses standard rules.

Rematches may select one modifier:

- **Double Barrel:** two shells, more recoil, longer cooldown
- **Soap Tracks:** lower grip and more drift
- **Moon Yard:** lower gravity and longer airtime
- **Volatile Inventory:** more explosions
- **Scrap Magnet:** stronger pickup magnet but shorter pickup life
- **Overclocked:** faster machine gun and more enemies

Modifiers must reuse the same arena and assets.

---

# 19. UI and HUD

The interface should feel polished, energetic, and easy to understand.

Visual language:

- Dark industrial panels
- Clean geometric shapes
- Thin highlights
- Strong hierarchy
- Small animated accents
- Minimal text during gameplay
- High-contrast role colors

Role colors:

- Driver: cyan or teal
- Gunner: orange or yellow
- Enemies: red
- Scrap: green or gold
- JACKPOT: white-yellow

## Driver HUD

- Integrity
- Timer
- Score
- Combo
- JACKPOT
- Brace
- Speed
- Objective marker
- Partner PIP
- Connection status
- Contextual controls

## Gunner HUD

- Center crosshair
- Cannon cooldown
- Machine-gun hit feedback
- Integrity
- Timer
- Score
- Combo
- JACKPOT
- Charge state
- Objective marker
- Partner PIP
- Connection status
- Contextual controls

Priority:

```text
Aim or driving space
→ threat telegraphs
→ JACKPOT prompt
→ integrity
→ timer
→ combo
→ PIP
→ detailed score
```

Tutorials are contextual and disappear immediately after successful input.

Do not use a long tutorial level.

---

# 20. Menus and Session Flow

Main menu:

```text
RECOIL CREW
[CREATE CREW]
[JOIN CREW]
[PRACTICE]
[HOW TO PLAY]
```

Create screen:

```text
CREW CREATED
YOUR ROLE: DRIVER
JOIN CODE: AB12CD
[COPY CODE]
WAITING FOR GUNNER…
```

Join screen:

- Six-character code
- Uppercase automatically
- Paste supported
- Clear errors
- No indefinite loading

Ready screen:

```text
CREW LINKED
DRIVER: READY
GUNNER: READY
[READY]
```

Countdown:

```text
3
2
1
GO
```

Results:

- Score
- Best combo
- JACKPOT count
- Grade
- Humorous title
- Rematch
- Leave

Rematch keeps the same room.

All networking failure screens must offer Retry and Practice.

---

# 21. Visual Direction

Art direction:

- Low-poly
- Stylized military-industrial
- High readability
- Warm environment
- Bright effects
- Strong silhouettes
- Slightly toy-like rather than realistic warfare
- Exaggerated motion and impact
- Cohesive limited palette

The game may use generated primitive models initially, but they must be deliberately composed and visually polished.

Required visual hierarchy:

- Player tank is the strongest stable silhouette
- Enemies are readable by shape and color
- Scrap glows clearly
- Threat telegraphs are obvious
- JACKPOT is dramatically brighter than normal attacks
- Background never competes with targets

Lighting:

- Clear directional light
- Warm environment
- Strong contact shadows when affordable
- Controlled bloom
- Light fog or atmosphere only if performance allows

---

# 22. VFX and Audio

Every important input should produce layered feedback.

Required VFX:

- Machine-gun muzzle and tracers
- Cannon flash and smoke
- Cannon projectile trail
- Cannon impact
- Enemy destruction
- Scrap ejection and pickup
- Drift dust
- Boost streaks
- Brace deployment
- Rammer charge telegraph
- Gun Tower beam and projectiles
- Wipeout
- JACKPOT charge
- JACKPOT projectile
- JACKPOT impact and scrap shower

Required audio:

- Engine loop with speed response
- Boost
- Drift
- Collision
- Brace deploy
- Machine gun
- Cannon
- Projectile impact
- Explosions
- Scrap pickup tiers
- Enemy telegraphs
- Loot Truck siren
- UI navigation
- Combo increase and decay
- JACKPOT charge and release
- Results sting
- Music with escalating intensity

The cannon must be the strongest normal sound.

JACKPOT must clearly exceed it.

---

# 23. Multiplayer Behavior

The implementation stack is flexible, but the experience must provide:

- Two-player rooms
- Short join code
- Driver creator / Gunner joiner
- Authoritative gameplay state
- Immediate local camera response
- Immediate local Gunner aiming
- Immediate local weapon presentation
- Server-confirmed hits and scoring
- Smooth remote tank and turret state
- Input sequence protection
- Stale-input protection
- Clear disconnect state
- Gunner reconnect grace where practical
- No persistent desynchronization
- No duplicated cannon shots

Preferred authority:

- Server or authoritative host controls shared physics, enemies, damage, pickups, score, combo, JACKPOT, and timer.
- Clients control only their desired inputs and local presentation.

The system must work without inbound firewall configuration.

---

# 24. Performance and Responsiveness

Primary target:

- Stable 60 FPS on ordinary judging hardware
- Higher frame rates allowed
- Heavy effects should remain at least around 45 FPS
- Local camera runs every rendered frame
- Network rate never limits mouse look
- Visual quality reduces before control quality

Performance priorities:

1. Main local camera
2. Input
3. Shared physics
4. Networking
5. Combat clarity
6. UI
7. PIP
8. Decorative effects

Use pooling or reuse for frequently created objects.

PIP may reduce resolution and update rate automatically.

---

# 25. Swappable Asset Architecture

All art must be replaceable without rewriting gameplay.

Required rules:

- Gameplay logic references semantic asset IDs, not model child names.
- Tank chassis and turret are separate visual slots.
- Enemy visuals are selected by archetype.
- Effects are selected by event IDs.
- UI icons and panels are referenced through a theme or asset registry.
- Audio is referenced through named events.
- Collision shapes and gameplay origins belong to project-owned roots.
- Imported models sit beneath stable wrapper objects.
- Missing assets fall back to generated low-poly primitives.
- Replacing a model must not alter networking or gameplay.

Required asset categories:

```text
playerTank.chassis
playerTank.turret
playerTank.barrel
enemy.scrapBug
enemy.rammer
enemy.gunTower
enemy.lootTruck
pickup.normalScrap
pickup.heavyScrap
pickup.jackpotScrap
prop.explosiveBarrel
prop.barrier
prop.tire
prop.container
arena.ramp
arena.factory
vfx.machineGunMuzzle
vfx.cannonMuzzle
vfx.cannonImpact
vfx.enemyDeath
vfx.scrapPickup
vfx.jackpot
ui.driverTheme
ui.gunnerTheme
audio.*
```

If no external assets are available, generate attractive low-poly geometry from primitives and simple custom materials.

Do not block completion waiting for perfect assets.

---

# 26. Scope Cuts

Do not add unless the complete game is already stable:

- Dedicated public matchmaking
- Four-player support
- Host migration
- Voice or text chat
- Accounts
- Cosmetics
- Progression
- Skill trees
- Weapon inventory
- Multiple arenas
- Boss fight
- Story cinematics
- Replay system
- Spectator mode
- Achievements
- Leaderboards
- Mobile support
- Controller support
- Character exit from tank
- Crafting

---

# 27. Definition of Done

The game is complete when a judge can:

1. Open the game URL.
2. Create or join with a short code.
3. Enter active play quickly.
4. Understand the assigned role within 15 seconds.
5. Experience obvious cannon recoil immediately.
6. Kill enemies and collect scrap.
7. Maintain a shared combo.
8. Encounter Rammer and Gun Tower.
9. Chase the Loot Truck.
10. Fire JACKPOT in the first round.
11. Wipe out and recover without match termination.
12. Reach a results screen.
13. Rematch without rebuilding the room.

Quality requirements:

- Driver controls feel responsive.
- Gunner TPS aim feels modern and precise.
- Driver TPS free-look feels modern and independent.
- Recoil is funny and useful.
- Both roles remain occupied.
- UI looks intentionally designed.
- Low-poly art looks cohesive.
- Important effects are readable.
- Online state remains stable.
- Assets can be swapped through a clear registry.
- Chrome and Edge builds work.
- Practice works without networking.
