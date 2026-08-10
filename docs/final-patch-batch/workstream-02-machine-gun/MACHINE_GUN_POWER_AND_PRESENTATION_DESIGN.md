# Final Workstream 2 — Machine Gun Power & Presentation Overhaul
## Stronger base weapon, three high-impact MG upgrades, and heavier audiovisual feedback

**Branch:** `feature/final-machine-gun-pass`  
**Difficulty:** Medium  
**Primary risks:** excessive sustained DPS, high-rate event/VFX pressure, local/authoritative double presentation  
**Binding scope:** Machine Gun only; do not add or modify a Cannon upgrade category

---

# 1. Final product decision

The active Machine Gun upgrade pool must contain exactly:

```text
MACHINE GUN POWER
MACHINE GUN RANGE
MACHINE GUN FIRE RATE
```

Remove:

```text
MG PRECISION
```

Do not replace it with a Cannon upgrade.

Do not add:
- Cannon Velocity;
- recoil/knockback Cannon upgrades;
- Machine Gun bullet velocity;
- a networked Machine Gun projectile;
- any fourth Machine Gun category.

The Machine Gun remains authoritative hitscan.

---

# 2. Goals

The Machine Gun should feel:

- forceful;
- reliable;
- continuous;
- visibly stronger after a single upgrade;
- capable of clearing ordinary horde enemies;
- still distinct from the Cannon's splash, recoil movement, and burst impact.

Implement:

1. The previously selected base damage/reliability buff.
2. Remove the weak Precision category from production offers.
3. Add a real Fire Rate category in its place.
4. Increase the magnitude of Power, Range, and Fire Rate upgrades substantially.
5. Strengthen muzzle flash, tracer, impact, audio, and restrained camera feedback.
6. Harden sustained-fire presentation for the new maximum fire rate.

---

# 3. Current baseline to verify

The recent baseline was approximately:

```text
damage:       2
rate:         11 rounds/sec
range:        45m
spread:       0.018
recoil:       0.15
```

The prior selected base-weapon pass remains:

```text
weapon.mgDamage        2 → 3
weapon.mgSpread        0.018 → 0.012
weapon.mgRecoilImpulse 0.15 → 0.18
```

Keep base values initially at:

```text
rate:  11 rounds/sec
range: 45m
```

Why:

- Base damage `3` addresses the weapon's weak starting state.
- Tighter baseline spread replaces the removed Precision progression path.
- The new Fire Rate upgrade provides cadence growth during the run.
- Range remains a progression axis rather than receiving a hidden base increase.

Do not add armor penetration, chaining, splash, stun, or projectile travel in this final pass.

---

# 4. Hitscan authority

The Machine Gun is authoritative hitscan.

For every accepted round:

```text
authoritative muzzle origin
→ apply resolved spread
→ ray/segment query to resolved range
→ resolve the first valid enemy/world hit immediately
→ apply damage in the same simulation step
→ send compact presentation data
→ draw a short-lived cosmetic tracer
```

There is no gameplay Machine Gun bullet traveling through the world.

Therefore:

```text
Power      changes immediate ray damage
Range      changes maximum ray length
Fire Rate  changes how often authoritative rays are accepted
Spread     changes ray direction variance
```

The tracer:
- does not have gameplay velocity;
- must not delay damage;
- must not determine collision;
- must not become a networked shell.

Forbidden:

```text
weapon.mgBulletSpeed
machine-gun velocity upgrade
networked MG projectile entities
client-authoritative MG hit timing
```

---

# 5. Final upgrade magnitude table

The old approximately `+12–60%` bands are too incremental for this game's exaggerated progression.

Use these binding first-pass bands:

| Rarity | MACHINE GUN POWER | MACHINE GUN RANGE | MACHINE GUN FIRE RATE |
|---|---:|---:|---:|
| Common | **+30–40%** | **+25–35%** | **+20–25%** |
| Rare | **+55–70%** | **+45–60%** | **+35–45%** |
| Epic | **+90–110%** | **+75–90%** | **+55–70%** |
| Legendary | **+150–180%** | **+120–150%** | **+85–100%** |

Each card rolls one percentage within its rarity band.

The values are multiplicative:

```text
+40% → multiplier 1.40
+100% → multiplier 2.00
+180% → multiplier 2.80
```

Do not apply the combat-display ×10 scale to these percentages.

---

# 6. MACHINE GUN POWER

Canonical stat:

```text
weapon.mgDamage
multiply
```

Player-facing name:

```text
MACHINE GUN POWER
```

Korean:

```text
기관총 화력
```

Effect copy:

```text
MG DAMAGE +{amount}%
기관총 피해량 +{amount}%
```

## Single-card examples from the new base damage of 3

```text
Common +30–40%
3.90–4.20 internal damage
displayed hit roughly 39–42

Rare +55–70%
4.65–5.10 internal
displayed hit roughly 47–51

Epic +90–110%
5.70–6.30 internal
displayed hit roughly 57–63

Legendary +150–180%
7.50–8.40 internal
displayed hit roughly 75–84
```

Use normal combat-display rounding policy.

Recommended final resolved safety cap:

```text
maximum MG damage = 5.0× base damage
```

With base damage `3`:

```text
maximum resolved damage = 15 internal
maximum displayed ordinary hit = 150
```

The cap prevents repeated multiplicative rolls from becoming numerically unbounded while still supporting an extreme late-run weapon.

---

# 7. MACHINE GUN RANGE

Canonical stat:

```text
weapon.mgRange
multiply
```

Player-facing name:

```text
MACHINE GUN RANGE
```

Korean:

```text
기관총 사거리
```

Effect copy:

```text
MG RANGE +{amount}%
기관총 사거리 +{amount}%
```

## Single-card examples from 45m

```text
Common +25–35%
56.25–60.75m

Rare +45–60%
65.25–72m

Epic +75–90%
78.75–85.5m

Legendary +120–150%
99–112.5m
```

Recommended final resolved safety cap:

```text
maximum MG range = 3.0× base range
```

With base range `45m`:

```text
maximum resolved range = 135m
```

The tracer endpoint and hit query must use the same resolved range.

Do not keep a hardcoded cosmetic tracer length.

---

# 8. MACHINE GUN FIRE RATE

Replace the removed Precision category with:

```text
MACHINE GUN FIRE RATE
```

Korean:

```text
기관총 연사력
```

Effect copy:

```text
MG FIRE RATE +{amount}%
기관총 연사력 +{amount}%
```

Use the current canonical rounds-per-second stat if it already exists:

```text
weapon.mgRate
```

If current `main` uses another established ID, preserve that ID rather than creating a duplicate stat.

Required semantic:

```ts
resolvedRoundsPerSecond =
  baseRoundsPerSecond * fireRateMultiplier;

shotInterval =
  1 / resolvedRoundsPerSecond;
```

If the current implementation stores interval rather than rate, apply the multiplier inversely:

```ts
resolvedInterval =
  baseInterval / fireRateMultiplier;
```

A positive Fire Rate upgrade must never make the gun slower.

## Single-card examples from 11 rounds/sec

```text
Common +20–25%
13.2–13.75 rounds/sec

Rare +35–45%
14.85–15.95 rounds/sec

Epic +55–70%
17.05–18.70 rounds/sec

Legendary +85–100%
20.35–22 rounds/sec
```

Recommended final resolved safety cap:

```text
maximum MG fire rate = 2.25× base
```

With base rate `11`:

```text
maximum resolved rate = 24.75 rounds/sec
minimum interval ≈ 0.0404s
```

This is a gameplay cadence upgrade, not a tracer-speed upgrade.

It must affect:

- authoritative shot acceptance;
- ammo/heat logic if one later exists;
- authoritative shot-event cadence;
- local sustained-fire presentation cadence;
- procedural fire audio cadence;
- recoil micro-feedback cadence.

It must not affect:

- tracer travel time;
- MG range;
- damage;
- spread;
- Cannon behavior.

---

# 9. Remove MG Precision cleanly

Remove the active production category:

```text
MG PRECISION
upgrade.weapon.mgSpread
```

The underlying spread stat can remain for:

- base tuning;
- backward-compatible snapshots/content;
- future modes or relics.

The category must not appear in:

- active manifests;
- role/category pools;
- offer generation;
- localization catalogs as an active upgrade;
- tactical level-up summary through new offers.

Existing saved/test content that references the old category should fail safely or migrate according to current project conventions.

---

# 10. No added Cannon upgrade

This branch must not add or modify a Cannon upgrade category.

Preserve all existing Cannon categories exactly unless a mechanical compile migration is unavoidable.

Do not introduce:

- shell velocity progression;
- recoil progression;
- knockback progression;
- another Cannon damage/radius/cooldown category;
- a hybrid MG/Cannon category.

The replacement for Precision is **MG Fire Rate**, not a Cannon effect.

---

# 11. Per-shot presentation

Every accepted MG round should have readable presentation.

The first predicted local shot remains immediate.

Authoritative repeated shots produce:

- muzzle flash;
- tracer;
- fire transient;
- optional micro camera feedback.

Preserve action-sequence duplicate suppression for the locally presented first shot.

At high upgraded rates, presentation must remain synchronized to accepted authoritative rounds without allocating unbounded objects.

---

# 12. Muzzle flash

Per shot:

```text
warm white/yellow core
size ~1.0–1.2
life ~45–60ms
3–5 small sparks
```

Do not spawn a Cannon-sized flash.

During sustained fire:

- use a bounded pool;
- reuse lights/materials where possible;
- do not allocate a new long-lived object per round;
- avoid a lingering smoke wall.

Optional:

```text
tiny smoke puff every 4–6 shots
```

only if performance and readability remain good at the maximum 24.75 rounds/sec.

---

# 13. Tracer overhaul

Do not depend on unsupported browser line width.

Use pooled geometry such as:

- camera-facing rectangular streak;
- narrow cylinder/box aligned to the hitscan ray;
- bright core plus soft glow.

Suggested:

```text
core width:   ~0.025–0.04m
glow width:   ~0.08–0.12m
life:         55–80ms
core:         warm near-white
glow:         #ffd27a
```

The endpoint uses:

```text
actual hit endpoint
or
resolved MG range
```

There is no projectile velocity.

At high fire rate, several tracers may coexist, but pool size and lifetime must remain bounded.

---

# 14. Hit effect

On enemy/barrel hit:

```text
8–12 warm sparks
brief white/yellow impact flash
small dark smoke fleck
short procedural metal/body tick
```

Use a low-priority bounded `playerMgImpact` recipe.

Do not play a large explosion or strong screen shake per hit.

Enemy damage-number coalescing remains.

---

# 15. Fire sound

Strengthen `playerMg` while keeping it short enough for up to 24.75 rounds/sec.

Suggested layers:

```text
CRACK:
gain ~0.30–0.34

BODY:
gain ~0.16–0.20

METAL:
gain ~0.05–0.065

duration:
~0.075–0.095s
```

Maintain:

- deterministic micro-variation;
- player-weapon priority;
- no clipping;
- no generic external sample library;
- category voice limiting;
- no missing cadence at ordinary rates.

At the highest rate, the audio system may use controlled transient reuse/coalescing, but must not sound like random dropped shots.

Target:

```text
TAK-TAK-TAK
```

with mechanical body, not a thin click or sci-fi pew.

---

# 16. Camera feedback

Use very small coalesced recoil feedback:

```text
per-shot request:
~0.02–0.035

short-window cap:
~0.10–0.14
```

Do not call the full Cannon impulse per MG round.

At upgraded fire rates, the short-window cap prevents continuous camera instability.

Reduced-motion mode attenuates or disables it.

The actual tank recoil remains authoritative.

---

# 17. Event contract

The authoritative MG shot event should provide enough presentation data for:

- muzzle origin;
- direction;
- resolved tracer length/hit endpoint;
- action sequence.

MG hit should provide:

- hit position;
- target ID if available;
- actual damage if useful for impact intensity.

Keep protocol additions compact.

Fire Rate changes event cadence, not event meaning.

---

# 18. Offer and role integration

The final active MG categories are:

```text
MACHINE GUN POWER
MACHINE GUN RANGE
MACHINE GUN FIRE RATE
```

Ensure:

- the former Precision slot is replaced by Fire Rate;
- all three can roll at every normal rarity;
- first-offer rarity rules remain unchanged;
- role eligibility remains consistent with the current progression design;
- Single Player gets the same pool;
- Multiplayer Gunner receives the intended MG offer pool;
- no Cannon category is added as a substitute.

---

# 19. Balance qualification

Compare:

- base MG time-to-kill;
- one Common/Rare/Epic/Legendary Power card;
- one Range card at each rarity;
- one Fire Rate card at each rarity;
- combinations of Power + Fire Rate;
- repeated cards near safety caps;
- Elite/Boss contribution;
- Cannon/Charge role;
- relic synergies;
- Phase 3 horde clear rate.

Expected identity:

```text
MG:
dependable, escalating sustained single-target/line-of-sight weapon

Cannon:
splash, burst, recoil traversal, crowd displacement
```

The MG may become extremely powerful with several rare upgrades, but it should not gain Cannon splash or recoil movement.

---

# 20. Performance qualification

Test both:

```text
base 11 rounds/sec
maximum 24.75 rounds/sec
```

Required:

- tracer pool does not exhaust;
- muzzle pool remains bounded;
- audio voices remain bounded;
- no per-shot DOM;
- no garbage spikes;
- no duplicate predicted first shot;
- no authoritative shot loss due to presentation throttling;
- Driver client does not regress when Gunner reaches maximum rate;
- network buffers do not grow continuously.

Run at least 60 seconds sustained fire in:

- Single Player;
- Multiplayer Gunner;
- Multiplayer Driver observing the same shots;
- dense Phase 3 / Wave 2.

---

# 21. Tests

Required automated coverage:

## Base balance

```text
damage = 3
spread = 0.012
recoil = 0.18
base rate = 11
base range = 45
```

## Offer pool

```text
Power present
Range present
Fire Rate present
Precision absent
no new Cannon category
```

## Rarity bands

Exact ranges from the binding table.

## Hitscan

- immediate authoritative ray damage;
- no MG projectile entity;
- no bullet-speed stat;
- tracer lifetime cannot delay damage.

## Fire Rate math

```text
11/s +100% = 22/s
not 5.5/s
```

Cap:

```text
<=24.75/s
```

## Power/Range caps

```text
damage <=5× base
range <=3× base
```

## Presentation

- predicted first shot once;
- every accepted round gets presentation;
- actual tracer endpoint;
- pool bounds at maximum rate;
- audio voice bounds;
- reduced-motion behavior.

## Parity

Single Player and Multiplayer use the same resolved stats and category values.

---

# 22. Localization keys

Add or update:

```text
upgrade.weapon.mgDamage.name
MACHINE GUN POWER
기관총 화력

upgrade.weapon.mgRange.name
MACHINE GUN RANGE
기관총 사거리

upgrade.weapon.mgRate.name
MACHINE GUN FIRE RATE
기관총 연사력
```

Use the localization workstream's exact key schema if it differs.

Remove active player-facing Precision copy from the production pool.

Do not add Cannon-upgrade localization from this branch.

---

# 23. Definition of done

- [ ] Base MG damage is 3.
- [ ] Base spread is 0.012.
- [ ] Base recoil impulse is 0.18.
- [ ] Base rate remains 11 rounds/sec.
- [ ] Base range remains 45m.
- [ ] MG Precision is not offered.
- [ ] MG Fire Rate replaces Precision.
- [ ] Active MG categories are exactly Power, Range, and Fire Rate.
- [ ] No new Cannon upgrade is added.
- [ ] No MG velocity stat or projectile is introduced.
- [ ] Power bands are +30–40 / +55–70 / +90–110 / +150–180%.
- [ ] Range bands are +25–35 / +45–60 / +75–90 / +120–150%.
- [ ] Fire Rate bands are +20–25 / +35–45 / +55–70 / +85–100%.
- [ ] Damage, range, and fire-rate safety caps are tested.
- [ ] Fire Rate correctly increases rounds/sec.
- [ ] Every accepted shot has readable muzzle/tracer/audio.
- [ ] Hit effect/audio is noticeably stronger.
- [ ] Local/authoritative duplicate suppression remains correct.
- [ ] Maximum-rate sustained-fire performance passes.
- [ ] Localization/user audio-gain architecture is preserved.
- [ ] No Ground Pound/boundary/announcement/chat/chest-beacon work is included.

Final invariant:

> The Machine Gun has exactly three progression axes—Power, Range, and Fire Rate—and every one produces a large, immediately perceptible improvement without introducing bullet travel, a hidden velocity stat, or another Cannon upgrade.
