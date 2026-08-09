# Elite & Boss Combat Overhaul
## Full mixed repertoires, valid-pattern selection, ×2/×3 speed, and correct 3D attack geometry

**Branch:** `feature/elite-boss-combat`  
**Workstream:** 2 of 5  
**Difficulty:** Large / high-risk  
**Explicit exclusions:** monster visual scale, minimap art, horde spawning, progression rarity, chest beacon

---

# 1. Agreed behavior

Every featured Elite and Boss identity should have:

```text
one melee pattern
one ranged pattern
the same identity-specific repertoire
the same mixed-pattern behavior family
```

Bosses remain stronger because of:
- HP;
- tier scale;
- damage tuning;
- boss encounter rules;
- summons/pressure;
- presentation.

Elites should not lose half of an identity's moveset merely because they are elites.

“Same moveset” does not require copying boss damage values verbatim. Preserve the elite power tier while giving it the full repertoire.

---

# 2. Featured identities

Current featured identities:

```text
Alien
Cactoro
Fish
Ninja
Demon
Yeti
```

Each has one Elite and one Boss definition.

---

# 3. Binding speed multipliers

The user explicitly requested:

```text
Elite speed = current authored speed × 2
Boss speed  = current authored speed × 3
```

Use exact authored results.

## Elites

| Elite | Current | New |
|---|---:|---:|
| Alien | 3.6 | **7.2** |
| Cactoro | 2.6 | **5.2** |
| Fish | 3.8 | **7.6** |
| Ninja | 4.6 | **9.2** |
| Demon | 3.2 | **6.4** |
| Yeti | 2.6 | **5.2** |

## Bosses

| Boss | Current | New |
|---|---:|---:|
| Alien | 3.4 | **10.2** |
| Cactoro | 2.8 | **8.4** |
| Fish | 3.8 | **11.4** |
| Ninja | 4.8 | **14.4** |
| Demon | 3.2 | **9.6** |
| Yeti | 2.8 | **8.4** |

Do not silently cap these values back to old speeds.

Instead harden movement/collision/animation for the new range.

---

# 4. Current Elite attack baseline

```text
Alien    melee only
Cactoro  ranged only
Fish     melee only
Ninja    melee only
Demon    melee only
Yeti     ranged only
```

New:

```text
all six Elites:
mixed melee + ranged
```

---

# 5. Current Boss attack baseline

All six Bosses are already authored as:

```text
attack.type = mixed
selection.mode = orderedCycle
patterns = [melee, ranged]
```

The runtime currently chooses:

```ts
patterns[attackSequence % patterns.length]
```

When the selected melee pattern is out of range, it slows movement and returns instead of using a valid ranged pattern.

This is a behavior bug.

---

# 6. Generic mixed-attack behavior

Refactor the current boss-only behavior into a tier-neutral mixed-pattern primitive.

Recommended semantic id:

```text
attack.mixedCue
```

Keep `attack.bossCue` as a temporary compatibility alias if necessary.

The shared behavior supports:
- Elite;
- Boss;
- future mixed attackers.

It must emit tier-correct events:
- Elite uses enemy/elite telegraph and fire semantics.
- Boss uses boss telegraph and fire semantics.

Do not make Elite attacks play boss-only audio or boss-only UI.

---

# 7. Valid-pattern selection

Use ordered preference among currently valid attacks.

Pseudo:

```ts
const preferredIndex = sequence % patterns.length;
const preferred = patterns[preferredIndex];

if (isUsable(preferred, context)) {
  selected = preferred;
} else {
  selected = scanForwardForUsablePattern(patterns, preferredIndex, context);
}

if (!selected) {
  pursueAtFullAuthoredSpeed();
  return;
}
```

Rules:

## Far

```text
melee invalid
ranged valid
→ ranged fires while the enemy continues pressure
```

## Close

```text
melee and ranged valid
→ ordered cycle chooses
```

## Beyond all ranges

```text
no pattern valid
→ chase at full authored speed
→ do not start a fake attack cycle
```

Delete the behavior where an unavailable melee turn causes:

```text
runtime.speed *= 0.6
```

There is no reason for a fast threat to become slower because its next preferred attack is unavailable.

---

# 8. Sequence semantics

Preserve deterministic ordering.

After any completed attack:
```text
attackSequence += 1
```

Fallback selection does not permanently rewrite authored pattern order.

At long range, repeated ranged fallback is allowed because melee remains invalid.

Once close, the normal mixed cycle resumes naturally.

Do not reset sequence on temporary range changes.

---

# 9. Elite repertoire construction

For each Elite:
- use the corresponding Boss's melee/ranged pattern identity;
- use the same projectile family and semantic visual color;
- preserve Elite-tier damage budget rather than copying Boss damage blindly;
- retain clear telegraph timing;
- ensure both patterns are meaningful.

Recommended content process:

```text
existing Elite attack
→ becomes its primary mixed pattern without losing effective damage

missing identity pattern
→ added with Elite-tier damage/cadence
→ same move concept/projectile family as corresponding Boss
```

For former melee Elites:
```text
preserve current effective melee DPS
add ranged identity attack
```

For former ranged Elites:
```text
preserve current ranged damage/cadence
add melee identity attack
```

Added pattern expected damage should remain in the same Elite threat band as the existing pattern. Same repertoire does not mean Boss-level raw damage.

Document exact values in the implementation report.

---

# 10. Identity mapping

| Identity | Melee | Ranged |
|---|---|---|
| Alien | punch | spit |
| Cactoro | slam | needle/spit projectile family |
| Fish | bite | bubble/bone-shot family |
| Ninja | slash | shuriken/bone-shot family |
| Demon | punch/heavy strike | fireball |
| Yeti | heavy strike | ice bolt |

Elite and Boss share these conceptual pairs.

---

# 11. Pursuit behavior

Mixed Elite/Boss behavior:

```text
far:
advance at authored speed
use ranged when valid

mid:
advance and use ranged
do not maintain a timid fodder-style preferred ring

close:
hold only when executing a close pattern
cycle melee/ranged
```

Ranged-only fodder can continue maintaining its authored ring.

Mixed featured threats should actively pressure the tank.

---

# 12. High-speed movement hardening

New top speed:

```text
Ninja Boss = 14.4 m/s
```

At the server simulation rate, test displacement per tick and collision behavior.

Requirements:
- no thin-wall tunneling;
- no cliff skipping;
- no oscillation around the tank;
- no crossing through the tank;
- no unstable density steering;
- no giant visual foot sliding.

Use movement substeps for Elite/Boss if needed.

Recommended rule:

```text
maximum authoritative movement substep distance:
~0.45–0.65m
```

Do not globally substep every fodder enemy unless profiling supports it.

---

# 13. Animation at higher speed

Authoritative displacement must use full new speed.

Visual animation may use a bounded playback mapping to avoid absurd leg cadence, but must not make the monster appear to slide.

Recommended:
- speed-aware playback;
- capped mixer multiplier;
- far-tier motion cadence updated;
- preserve semantic attack animation priority.

Do not cap gameplay speed through animation code.

---

# 14. 3D ranged aim

Current enemy projectile aim is effectively horizontal.

New ranged attack aim:

```text
muzzle socket world position
→ tank hurt-volume center
→ normalized 3D direction
```

Use:

```text
dx
dy
dz
```

not `dy = 0`.

Capture target center from a shared tank hurt-volume definition.

---

# 15. Tank hurt volume

Create one authoritative presentation/gameplay helper for enemy attack collision.

Recommended shape:

```text
vertical capsule
or
rounded vertical cylinder/ellipsoid
```

It must move with the tank's authoritative X/Y/Z.

Do not use an infinite vertical X/Z circle.

Expose:
- center;
- radius;
- vertical half-height or segment endpoints.

---

# 16. Swept enemy projectile collision

Use the projectile segment from previous position to proposed next position.

Test intersection against:
- tank hurt capsule;
- world/terrain/obstacle collision.

Resolve the earliest time of impact.

Required:

```text
wall before tank
→ wall wins

tank before wall
→ tank wins

projectile crosses tank between ticks
→ tank hit

projectile directly below airborne tank
→ no hit
```

Do not simply check the final X/Z shell position.

---

# 17. Melee vertical overlap

Melee damage requires:

```text
horizontal engagement condition
AND
vertical hurt-volume overlap
```

Use resolved enemy collision height from the shared dimensions authority.

Examples:

```text
enemy below elevated platform
→ no melee hit

tank jumps above enemy
→ no melee hit unless hurt volumes overlap

large boss and low jump
→ overlap can still be valid
```

---

# 18. World collision ordering

Audit terrain/obstacle tests.

Enemy projectile resolution should be:

```text
previous position
→ proposed position
→ earliest world impact
→ earliest tank impact
→ choose smaller TOI
```

Do not apply tank damage before discovering that a wall was earlier on the segment.

---

# 19. Networking and presentation

Server remains authoritative.

Clients receive:
- shell trajectory;
- impact event;
- tier/profile metadata.

Do not add client-authoritative enemy hits.

Preserve the existing cannon projectile-sync work.

---

# 20. Tests

## Mixed pattern

For every identity:
- Elite has melee+ranged.
- Boss has melee+ranged.
- correct projectile family.
- correct event semantics by tier.

## Range behavior

```text
far but in ranged range:
ranged fires

close:
ordered mixed cycle

outside all ranges:
full-speed pursuit
no 0.6 slowdown
```

## Speed

Verify exact values:
```text
Elite ×2
Boss ×3
```

No hidden cap.

## High-speed movement

- wall;
- corner;
- narrow alley;
- cliff;
- tank pass;
- 30Hz simulation.

## 3D attack geometry

- elevated tank;
- uphill/downhill;
- roof;
- jump;
- wall-before-tank;
- tunneling segment;
- vertical melee overlap.

## SP/MP

Same authority and behavior.

---

# 21. Definition of done

- [ ] All six Elites have mixed melee+ranged repertoires.
- [ ] Elites and Bosses use a shared mixed-pattern behavior.
- [ ] Tier-correct audio/presentation events remain distinct.
- [ ] Valid ranged fallback works when melee is unavailable.
- [ ] No invalid-melee 0.6× slowdown remains.
- [ ] Exact Elite ×2 speeds are authored.
- [ ] Exact Boss ×3 speeds are authored.
- [ ] High-speed movement does not tunnel or destabilize.
- [ ] Enemy ranged aim is fully 3D.
- [ ] Swept tank/world collision chooses earliest impact.
- [ ] Melee requires vertical overlap.
- [ ] Server authority and current projectile presentation remain intact.
- [ ] No visual-scale, minimap, progression, pressure-director, chat, or chest-beacon work is included.

Final invariant:

> An Elite or Boss can use the full identity-specific melee/ranged repertoire at the correct distance and can actually catch a fleeing tank, while every hit still obeys truthful three-dimensional geometry.
