# Recoil Crew — Parallel Enemy & Pressure Workstreams
## Branch, worktree, overlap, generation, qualification, and merge guide

**Repository:** `mwl313/RecoilCrewDS`  
**Baseline:** always branch from the same freshly fetched `origin/main` SHA  
**Known recent baseline:** current main already contains the recent integrity/tactical work and a rudimentary elite-marker implementation  
**Explicitly out of scope:** chest-beacon work, in-match chat, localization/settings, unrelated camera changes

---

# 1. Why this package is split

The agreed changes touch different systems:

1. Physical enemy readability and scale.
2. Elite/boss combat behavior and attack geometry.
3. Tactical minimap threat presentation.
4. Reward truthfulness and player-facing world feedback.
5. Survivor-style ordinary-horde pressure and persistent encounter pressure.

Running all five in one branch would create an oversized review surface. Running all five agents in one checkout would be unsafe.

Use five independent feature branches and five independent worktrees. The Director retains final review and merge authority.

---

# 2. Branches

| Workstream | Branch | Suggested worktree |
|---|---|---|
| Enemy readability and physical scale | `feature/enemy-readability-scale` | `../RecoilCrewDS-enemy-readability` |
| Elite/boss combat and attack geometry | `feature/elite-boss-combat` | `../RecoilCrewDS-elite-boss-combat` |
| Tactical threat-map polish | `feature/tactical-threat-map` | `../RecoilCrewDS-tactical-map` |
| Reward truth and player world feedback | `feature/reward-world-feedback` | `../RecoilCrewDS-reward-feedback` |
| Survivor-style pressure director | `feature/survivor-pressure-director` | `../RecoilCrewDS-pressure-director` |

Do not run two Codex agents in the same checkout.

---

# 3. Create all branches from one exact base

From the canonical repository:

```bash
git fetch origin --prune
BASE_SHA="$(git rev-parse origin/main)"
echo "$BASE_SHA"
git status --short
```

The working tree must be clean.

Create worktrees:

```bash
git worktree add ../RecoilCrewDS-enemy-readability \
  -b feature/enemy-readability-scale "$BASE_SHA"

git worktree add ../RecoilCrewDS-elite-boss-combat \
  -b feature/elite-boss-combat "$BASE_SHA"

git worktree add ../RecoilCrewDS-tactical-map \
  -b feature/tactical-threat-map "$BASE_SHA"

git worktree add ../RecoilCrewDS-reward-feedback \
  -b feature/reward-world-feedback "$BASE_SHA"

git worktree add ../RecoilCrewDS-pressure-director \
  -b feature/survivor-pressure-director "$BASE_SHA"
```

Each agent must record the same starting SHA in its implementation report.

---

# 4. Binding scope boundaries

## Workstream 1 owns

```text
monster physical-readability scale policy
resolved dimensions
collision/clearance/engagement/shadow/socket derivation
world-space enemy presence markers/rings
readability-specific renderer tests
```

It must not change:
- elite/boss attacks;
- enemy speed values;
- spawn-director population rules;
- tactical minimap drawing;
- progression rewards.

## Workstream 2 owns

```text
elite and boss mixed attack repertoire
valid-pattern selection
elite ×2 and boss ×3 authored speed changes
3D projectile aim
swept projectile/tank/world hit ordering
melee vertical overlap
high-speed elite/boss movement qualification
```

It must not change:
- physical model scale policy;
- minimap art;
- progression rarity;
- horde spawning/recycling policy.

## Workstream 3 owns

```text
tactical minimap threat classification
advanced ordinary/elite/boss marker design
aggregate-sector cluster markers
tactical-drawer data plumbing needed for those markers
```

It must preserve the existing attached TAB/MAP nub and must not touch chest beacons.

## Workstream 4 owns

```text
actual relic rarity versus displayed rarity
roulette rarity truthfulness
green integrity-gain world numbers
cyan XP-gain world numbers
unified tank-damage presentation feedback
verification of current integrity fraction/gained-capacity repair
```

It must not rebalance upgrade rarity tables.

## Workstream 5 owns

```text
nearby-pressure targets
moving ordinary aggregate sectors
far ordinary recycling
multi-anchor surrounding spawns
staggered atomic subgroups
reinforcement pack rotation
persistent elite/boss recovery
reward-suppressed maintenance summons
anti-kite pressure
```

It must not modify elite/boss attack definitions or movement speed values.

---

# 5. Explicit decisions shared by every branch

## Chest beacon

Do not add, redesign, remove, or otherwise alter the chest beacon in these workstreams. The user no longer needs beacon work from this package.

## Ordinary HP abstraction

Ordinary enemies may be aggregated, recycled, and rematerialized without preserving individual HP. They must not generate rewards or death presentation during abstraction/recycling.

Elite and boss entities must preserve:
- identity;
- HP;
- status/debuff state;
- encounter ownership;
- attack sequence;
- minimap presence.

## Single Player / Multiplayer parity

Unless a document explicitly says otherwise, enemy:
- scale;
- attacks;
- speeds;
- pressure;
- markers;
- rewards;
- presentation semantics

must be equivalent in Single Player and Multiplayer.

## Generated content

Source JSON, schemas, and generators are authoritative.

Do not manually combine generated files.

An agent may regenerate content to build/test its branch. At integration time:

1. resolve source JSON/schema/code conflicts first;
2. discard conflicting generated-file versions;
3. run the repository’s canonical generation command once;
4. review the regenerated diff;
5. rerun the full test matrix.

---

# 6. Expected overlap matrix

| Pair | Expected overlap | Resolution |
|---|---|---|
| Readability ↔ Combat | Generated monster-dimension/content indexes; combat reads normalization APIs | Merge readability first; rebase combat; preserve readability’s dimension authority |
| Readability ↔ Tactical map | Little/no source overlap | Keep world presence markers separate from minimap markers |
| Readability ↔ Pressure | Spawn-clearance behavior changes indirectly after size increase | Merge readability first; pressure branch must requalify anchors after rebase |
| Combat ↔ Reward feedback | Possible `src/shared/types.ts` and event routing | Reward branch owns new feedback event types; combat branch should avoid unrelated event-union edits |
| Combat ↔ Pressure | Enemy ownership/state may be read by both | Combat owns attack/movement behavior; pressure owns spawning/recovery only |
| Tactical map ↔ Pressure | Aggregate-sector data and tactical update signature | Merge tactical first; pressure must preserve sector marker input contract |
| Reward feedback ↔ Pressure | Progression reward routing for summon suppression | Merge reward first; pressure rebases and adds suppression through a narrow central reward-policy seam |
| All content branches | Generated content pack | Regenerate once on integration branch |

---

# 7. Recommended merge order

Create an integration branch from the newest reviewed `main`:

```bash
git fetch origin --prune
git switch -c integration/enemy-pressure-polish origin/main
```

Recommended order:

```text
1. feature/tactical-threat-map
2. feature/enemy-readability-scale
3. feature/reward-world-feedback
4. feature/elite-boss-combat
5. feature/survivor-pressure-director
```

Rationale:
- Tactical map is the smallest and least invasive.
- Physical scale establishes geometry authority before combat qualification.
- Reward feedback establishes presentation events before later integration.
- Combat is high-risk but locally bounded.
- Pressure director is the broadest and should rebase onto every prior contract.

Before merging a larger branch:

```bash
cd <that branch worktree>
git fetch origin --prune
git rebase integration/enemy-pressure-polish
```

Resolve conflicts in the feature worktree, test there, then merge:

```bash
cd <integration worktree>
git merge --no-ff feature/<branch>
```

Do not merge unfinished work merely to eliminate conflicts.

---

# 8. Merge conflict priorities

When resolving conflict, preserve these authorities:

```text
enemy dimensions:
Workstream 1

elite/boss attack and high-speed movement:
Workstream 2

minimap marker grammar and sector glyphs:
Workstream 3

player feedback events and rarity truth:
Workstream 4

population ownership, recycling, spawn scheduling:
Workstream 5
```

A later branch may extend an earlier contract but must not silently replace it.

---

# 9. Qualification gates

Every branch runs its focused tests plus:

```bash
npx tsc --noEmit
npm run build
npm test
```

Use actual repository scripts after inspecting `package.json`.

The integration branch additionally runs:

```text
content generation/validation
progression suites
monster/enemy suites
horde suites
netcode suites
client build
server build
Single Player browser flow
two-client Driver/Gunner flow
dense Phase 3 / Wave 2 / Boss soak
```

The final browser soak must cover:
- ordinary enemies at the new scale;
- elite and boss speed multipliers;
- mixed elite/boss attacks at far and close range;
- minimap ordinary/elite/boss/sector distinction;
- green integrity and cyan XP numbers;
- tank-damage feedback;
- multi-direction spawns;
- leader maintenance summons;
- reconnect/rematch reset.

---

# 10. Review rules

Each branch must produce its own implementation report under the same workstream folder.

Each report includes:
- starting SHA;
- ending SHA;
- files changed;
- data/schema changes;
- exact tuning values;
- tests and command output;
- browser observations;
- performance measurements where relevant;
- known limitations;
- confirmation that excluded work was not added.

Final merge authority remains with the Director.
