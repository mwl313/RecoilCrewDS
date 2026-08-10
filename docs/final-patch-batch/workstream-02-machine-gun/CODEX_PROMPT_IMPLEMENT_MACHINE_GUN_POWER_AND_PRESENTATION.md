# Codex Prompt — Machine Gun Power, Fire Rate & Presentation Overhaul

Repository:

```text
https://github.com/mwl313/RecoilCrewDS
```

Branch:

```text
feature/final-machine-gun-pass
```

Binding design:

```text
docs/final-patch-batch/workstream-02-machine-gun/MACHINE_GUN_POWER_AND_PRESENTATION_DESIGN.md
```

Rebase onto the localization/settings integration before final merge.

## Mission

Implement this final Machine Gun decision:

```text
Base MG:
damage  2 → 3
spread  0.018 → 0.012
recoil  0.15 → 0.18
rate    remains 11 rounds/sec
range   remains 45m
```

Final active MG upgrade categories:

```text
MACHINE GUN POWER
MACHINE GUN RANGE
MACHINE GUN FIRE RATE
```

Remove:

```text
MG PRECISION
```

Do not add or modify a Cannon upgrade category.

Do not add Machine Gun velocity, bullet speed, or projectile travel.

Use the binding high-impact rarity bands and strengthen MG muzzle/tracer/hit/audio presentation.

---

# 1. Audit current branch

Run:

```bash
git fetch origin --prune
git status --short
git rev-parse HEAD
git rev-parse origin/main
```

Record starting SHA.

Inspect at minimum:

```text
content/weapons/machineGun.json
content/upgrade-categories/weapon.mgDamage.json
content/upgrade-categories/weapon.mgRange.json
content/upgrade-categories/weapon.mgSpread.json
content/upgrade-categories/
content/manifest.json
content/loadouts/

src/shared/weapons/weaponSystem.ts
src/shared/weapons/weaponBehaviors.ts
src/shared/stats/
src/shared/progression/
src/shared/types.ts

src/client/app/gameClient.ts
src/client/app/presentationEventRouter.ts
src/client/vfx.ts
src/client/audio/procedural/proceduralSoundRecipes.ts
src/client/audio/procedural/proceduralSoundTypes.ts
src/client/audio.ts

tests/weapons
tests/progression08
tests/netcode
tests/audio
```

Find the canonical fire-rate stat and determine whether the runtime stores:

```text
rounds per second
or
shot interval
```

Do not implement the multiplier backwards.

---

# 2. Apply exact base values

```text
mgDamage  = 3
mgSpread  = 0.012
mgRecoil  = 0.18
mgRate    = 11/s
mgRange   = 45m
```

Preserve current authority and hitscan behavior.

---

# 3. Final upgrade pool

Remove `MG PRECISION` from the production offer pool.

Add a data-driven Fire Rate category using the current canonical rate stat.

The final active MG categories must be exactly:

```text
Power
Range
Fire Rate
```

Do not create a substitute Cannon category.

Do not add a fourth MG category.

---

# 4. Exact rarity ranges

## Power

```text
Common      +30–40%
Rare        +55–70%
Epic        +90–110%
Legendary   +150–180%
```

## Range

```text
Common      +25–35%
Rare        +45–60%
Epic        +75–90%
Legendary   +120–150%
```

## Fire Rate

```text
Common      +20–25%
Rare        +35–45%
Epic        +55–70%
Legendary   +85–100%
```

One card rolls one value inside its rarity band.

Use multiplier semantics.

---

# 5. Safety caps

Required final resolved caps:

```text
MG damage:
<=5.0× base

MG range:
<=3.0× base

MG fire rate:
<=2.25× base
<=24.75 rounds/sec from the current 11/s base
```

Document how current relic/mode modifiers compose with these limits.

---

# 6. Fire-rate semantics

Required:

```ts
resolvedRate = baseRate * multiplier;
interval = 1 / resolvedRate;
```

If the code stores interval:

```ts
resolvedInterval = baseInterval / multiplier;
```

Test:

```text
11/s +100% = 22/s
```

It must never become `5.5/s`.

Fire Rate changes authoritative shot cadence and matching presentation cadence.

It does not change tracer speed because the MG is hitscan.

---

# 7. Preserve hitscan

Do not add:

```text
weapon.mgBulletSpeed
MG velocity upgrade
networked MG shells
client hit authority
```

Damage is resolved immediately from the authoritative ray.

The tracer is cosmetic and uses the actual hit endpoint/resolved range.

---

# 8. Presentation architecture

Prefer an isolated module:

```text
src/client/weapons/machineGunPresentation.ts
```

Use pooled:

- muzzle flashes;
- sparks;
- thick core/glow tracers;
- hit effects.

Do not turn `vfx.ts` into a Machine-Gun-specific monolith.

Do not use unsupported line width as the primary tracer solution.

---

# 9. Audio

Strengthen procedural `playerMg`.

Add bounded `playerMgImpact` where useful.

Qualify at both:

```text
11 rounds/sec
24.75 rounds/sec
```

Preserve the localization/settings workstream's BGM/SFX user-gain chain.

---

# 10. Prediction and networking

- First local shot remains immediate.
- Authoritative confirmation suppresses duplicate presentation.
- Subsequent rounds present from authority.
- Fire-rate growth must not create event backlog.
- Presentation throttling must never drop authoritative gameplay shots.
- No client damage.

---

# 11. Localization

Add/update:

```text
MACHINE GUN POWER
기관총 화력

MACHINE GUN RANGE
기관총 사거리

MACHINE GUN FIRE RATE
기관총 연사력
```

Use the localization branch's final key schema.

Do not add localization for a new Cannon upgrade.

---

# 12. Tests

Required:

- exact base data;
- Precision category absent;
- Fire Rate category present;
- final MG pool exactly three;
- no new Cannon category;
- exact rarity bands;
- hitscan authority;
- no bullet-speed stat/projectile;
- correct rate/interval math;
- damage/range/rate caps;
- first predicted shot exactly once;
- every accepted shot receives presentation;
- tracer endpoint uses actual hit/range;
- pools and audio bounded at 24.75/s;
- Single Player/Multiplayer parity;
- Driver-client observation under maximum Gunner rate.

Run:

```bash
npx tsc --noEmit
npm run build
npm test
```

plus focused weapon/progression/audio/netcode/browser suites.

Regenerate content through the repository's canonical command.

Do not edit generated files manually.

---

# 13. Manual qualification

Test:

```text
base weapon
one Common card of each category
one Legendary card of each category
Power + Fire Rate combination
repeated cards near caps
Phase 3 horde
Elite
Boss
Single Player
Multiplayer Driver
Multiplayer Gunner
```

Confirm each card is immediately noticeable.

---

# 14. Implementation report

Create:

```text
docs/final-patch-batch/workstream-02-machine-gun/MACHINE_GUN_IMPLEMENTATION_REPORT.md
```

Include:

- starting/ending SHA;
- canonical fire-rate stat and formula;
- base balance table;
- final three-category pool;
- exact rarity bands;
- cap implementation;
- hitscan verification;
- VFX architecture;
- audio recipe;
- maximum-rate sustained-fire metrics;
- tests;
- screenshots/video notes;
- confirmation that no Cannon or velocity upgrade was added.
