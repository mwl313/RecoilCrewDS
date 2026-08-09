# Survivor-Style Pressure Director V1
## Moving ordinary pressure, surrounding spawns, persistent threats, and anti-kite maintenance cohorts

**Branch:** `feature/survivor-pressure-director`  
**Workstream:** 5 of 5  
**Difficulty:** Large–XL  
**Merge position:** last  
**Explicit exclusions:** attack definitions, speed multipliers, physical monster scale, minimap art implementation, rarity/UI feedback, chest beacon

---

# 1. Product goal

Recoil Crew should continuously ask:

```text
How much ordinary pressure should surround the tank?
Which directions are underfilled?
Which persistent threats must remain engaged?
```

It should not require every ordinary monster to remain an individually preserved entity forever.

Borrow the pressure principles of survivor-like games:
- desired live/nearby population;
- rapid replacement after clear;
- directional approach patterns;
- hard caps;
- disposable ordinary enemies;
- persistent Elite/Boss threats.

Do not copy another game's exact numbers or assets.

---

# 2. Entity layers

## Ordinary pressure

Includes:
- close fodder;
- ranged fodder;
- ordinary specialist;
- ordinary wave escort;
- leader-summoned maintenance minion.

Ordinary identity/HP does not need to survive aggregation/recycling.

Must preserve:
- approximate count;
- family/composition;
- threat;
- ownership class;
- broad location/direction.

## Persistent threat

Includes:
- Elite leader;
- Boss;
- future named miniboss.

Must preserve:
- ID;
- HP/maxHP;
- status/debuffs;
- attack sequence;
- encounter ownership;
- reward guards;
- minimap presence.

Never aggregate/recycle these as ordinary pressure.

---

# 3. Global and nearby targets

Retain current global phase population targets for first pass.

Add nearby ordinary-pressure targets within approximately 70m:

```text
Phase 1   14–20
Phase 2   22–32
Phase 3   32–46
Wave 1    35–48
Wave 2    42–56
Boss      45–60 including maintenance summons
```

These are soft feel targets.

Director computes:

```ts
globalDeficit = globalTarget - globalOrdinary;
nearbyDeficit = nearbyTarget - nearbyOrdinary;
```

Rules:

```text
global deficit:
spawn new population

nearby deficit but global full:
move sectors and/or recycle far ordinary pressure

both satisfied:
stop routine spawning
```

---

# 4. Aggregate sector movement

Current aggregate sectors must not freeze where they were created.

Advance ordinary sectors at a coarse deterministic rate:

```text
1.5–2 Hz
```

Use:
- flow-field direction;
- direct-to-tank blend;
- coarse obstacle/cliff validation.

Suggested sector speeds:

```text
close pressure   2.6–3.2 m/s
ranged pressure  2.2–2.8 m/s
specialist       family-derived
```

No individual AI.

No individual HP.

If stuck:
- re-route;
- then relocate to a valid far anchor while preserving count/type/threat.

No reward/death event.

---

# 5. Ordinary recycling

When:

```text
nearby deficit persists > ~2s
global ordinary population is already near target
ordinary units/sectors are > ~140–165m away
not visible/on-camera
```

recycle limited pressure:

```text
up to ~4–8 ordinary units per second
```

Recycling:
- emits no kill;
- emits no death;
- grants no XP;
- grants no score;
- rolls no chest;
- does not change kill stats;
- never affects Elite/Boss;
- never visibly removes an on-screen enemy.

Recreate equivalent broad composition at valid pressure anchors.

---

# 6. Eight angular pressure sectors

Divide around the tank:

```text
N NE E SE S SW W NW
```

Track:
- nearby live ordinary count;
- approaching sector count;
- recent spawn weight;
- last use;
- camera exposure;
- valid anchors;
- route quality.

Prefer underfilled and less-recently-used directions.

---

# 7. Multi-anchor pack planning

Current one-pack/one-anchor presentation is insufficient.

Reserve the complete pack atomically, then split spatially.

## Six close fodder

```text
3 + 3
or
2 + 2 + 2
```

with 90–150° separation.

## Seven mixed

Example:

```text
3 close from left/front-left
2 close from rear/right
2 ranged from farther third anchor
```

## Eight wave cohort

```text
3 + 3 + 2
or
4 + 4 pincer
```

Preserve pack composition and accounting.

---

# 8. Staggered subgroup queue

Spawn subgroups with deterministic short delays:

```text
A 0ms
B 120–220ms
C 240–380ms
```

Reserve:
- threat;
- entity count;
- ownership;
- pack instance

before subgroup A.

If a later anchor becomes invalid:
1. replan off-camera;
2. if impossible, refund only that subgroup cleanly.

No lost/duplicated population.

---

# 9. Anchor constraints

Routine pressure annulus:

```text
absolute minimum:
current visible-near-field (~23m)

preferred ordinary:
42–62m

ranged support:
50–70m

avoid routine:
85m+
```

Use:
- terrain reachability;
- safe zones;
- cliff checks;
- camera exposure;
- capacity.

Do not spawn visibly beside the tank.

---

# 10. Reinforcement pack rotation

Current wave logic must not always use only `reinforcementPackIds[0]`.

Use deterministic:
- cyclic selection;
- weighted selection;
- or composition-deficit selection.

Every configured reinforcement pack must be reachable under its intended conditions.

---

# 11. Kill-speed modulation

Track smoothed ordinary clear rate over 3–5 seconds.

Modulate ordinary replacement income:

```text
slow clear    0.85×
normal        1.00×
very fast     up to 1.25–1.35×
```

Do not increase hard caps.

Do not proportionally increase dangerous specialists.

Strong builds should not face an empty map for long, but success should still feel powerful.

---

# 12. Authored swarm events

Once multi-anchor infrastructure exists, add a few data-driven pressure events:

```text
cross-street surge
rear encirclement
ranged line
boss pressure pulse
```

They change approach geometry temporarily rather than permanently raising population.

Use clear cooldowns and caps.

---

# 13. Persistent Elite/Boss exclusion

Before ordinary demotion/recycling:

```ts
const class = normalizedEnemyClass(enemy);
if (class === 'elite' || class === 'boss') return false;
```

Also exclude:
- named/featured leader;
- active special encounter entity.

Do not rely only on ownership flag.

---

# 14. Persistent threat recovery

If Elite/Boss:

```text
>110–130m away
and
fails to reduce distance for ~4–6s
```

Recovery order:

```text
1. route refresh
2. increased pursuit priority
3. alternate flow path
4. off-camera same-entity re-entry
```

Re-entry:
- same ID;
- same HP;
- same debuffs;
- same attack sequence;
- same reward guards;
- same ownership;
- no intro replay;
- no reward reset.

Choose:
```text
50–70m valid off-camera anchor
```

Do not teleport visibly or point-blank.

---

# 15. Maintenance summons

Finite reinforcement alone does not prevent indefinite kiting/farming.

## Elite

```text
desired live summons:
8–12

hard cap:
14–16

batch:
3–5

minimum interval:
6–9s
```

## Boss

```text
desired:
14–18

hard cap:
22–24

batch:
5–7

minimum interval:
5–7s
```

Spawn only below desired floor and within global/technical caps.

---

# 16. Summon ownership and reward policy

Add explicit ownership metadata, e.g.:

```ts
summonedByLeaderId
maintenanceSummon
rewardSuppressed
```

Central reward routing must enforce:

```text
no chest chance
no score
no kill farming
no ordinary XP
no Elite/Boss reward
```

Recommended V1 XP:

```text
0
```

They remain combat pressure, not progression farms.

Purge on leader death without death/reward hooks.

---

# 17. Summon placement

Do not spawn maintenance minions only next to the abandoned leader.

Choose around player pressure:

```text
40–65m from tank
off-camera
underfilled angular sectors
weighted toward escape/interception routes
reachable
```

Summons retain leader ownership for cleanup.

---

# 18. Anti-kite leader pressure

When tank is far from persistent leader:

```text
leader pursuit priority increases
maintenance interval may shorten modestly
interception anchors receive higher weight
```

Do not:
- reset HP;
- teleport every few seconds;
- disable legitimate movement strategy;
- make the boss permanently touch the tank.

---

# 19. Minimap contract

This branch produces accurate sector positions/counts for Workstream 3's cluster markers.

Do not implement marker art here.

Maintain a clean typed sector list.

---

# 20. Performance

Required:
- no per-enemy logic for aggregated sectors;
- bounded pending subgroup queue;
- bounded recycling rate;
- bounded summons;
- existing hard cap remains;
- existing LOD/instancing/replication retained.

Test two clients.

---

# 21. Telemetry

Add:

```text
global ordinary
nearby ordinary 45m/70m
sector count
sector movement progress
recycled units/sec
recycle reason
pressure deficits
angular sector counts
last anchors/directions
pending subgroups
summon counts
persistent recovery stage
reward-suppressed kills
```

---

# 22. Tests

## Ordinary abstraction

- ordinary can aggregate/recycle;
- no reward;
- composition/count preserved broadly;
- no HP preservation requirement.

## Persistent

- Elite/Boss never aggregate/recycle;
- re-entry preserves state.

## Multi-anchor

- atomic reservation;
- angular separation;
- stagger;
- replan/refund.

## Maintenance

- floor/cap;
- interval;
- reward suppression;
- purge on leader death.

## Pack rotation

- every configured pack selectable.

## Performance/reset

- rematch/reconnect;
- no stale queues/sectors/summons.

---

# 23. Definition of done

- [ ] Nearby pressure targets influence director decisions.
- [ ] Aggregate ordinary sectors move toward the tank.
- [ ] Far ordinary recycling is invisible and reward-free.
- [ ] Elites/Bosses never enter ordinary abstraction.
- [ ] Packs split across separated anchors.
- [ ] Subgroups are atomically reserved and deterministically staggered.
- [ ] Reinforcement pack list is actually used.
- [ ] Clear-speed replacement is bounded.
- [ ] Persistent threats recover without HP/identity loss.
- [ ] Elite/Boss maintenance summons exist and are reward-suppressed.
- [ ] Summons pressure player escape routes.
- [ ] Existing hard cap/LOD/replication remain stable.
- [ ] No attacks/speeds/scale/minimap art/rarity/chat/chest-beacon work is included.

Final invariant:

> Ordinary monsters are disposable pressure that continuously fills underpopulated directions, while Elite and Boss enemies remain persistent, stateful encounters that cannot be escaped or exploited into an empty farming loop.
