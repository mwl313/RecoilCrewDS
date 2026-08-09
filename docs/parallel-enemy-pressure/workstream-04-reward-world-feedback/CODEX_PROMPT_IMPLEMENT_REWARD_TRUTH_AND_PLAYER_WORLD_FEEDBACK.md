# Codex Prompt — Reward Truth & Player World Feedback V1

Repository:

```text
https://github.com/mwl313/RecoilCrewDS
```

Branch:

```text
feature/reward-world-feedback
```

Binding design:

```text
docs/parallel-enemy-pressure/workstream-04-reward-world-feedback/REWARD_TRUTH_AND_PLAYER_WORLD_FEEDBACK_DESIGN.md
```

## Mission

Implement:

```text
green +integrity world numbers
cyan +XP world numbers
actual relic rarity truth
honest roulette placeholders
unified stronger tank-damage feedback
```

Audit and preserve current max-integrity capacity repair, integrity fraction, tactical drawer, and chest systems.

Do not touch enemy attacks/speed, scale, minimap, spawn director, chat, or chest beacons.

---

## 1. Audit

Read:

```text
src/client/worldUi/enemyWorldUiLayer.ts
src/client/app/presentationEventRouter.ts
src/client/app/gameClient.ts
src/client/hudViewModel.ts
src/shared/types.ts
src/shared/damage/damageSystem.ts
src/shared/progression/progressionSystem.ts
src/shared/progression/teamExperienceSystem.ts
src/shared/progression/relicEffectRegistry.ts
src/shared/progression/treasureChestSystem.ts
src/shared/presentation/combatDisplayUnits.ts
src/client/pickups/xpShardRenderer.ts
src/client/progression/reward*
content/*rarity*
tests/progression08
tests/gameplayReadability
```

Record SHA and identify what recent integrity work is already correct.

---

## 2. Generalize world feedback

Evolve the existing pooled Canvas layer.

Do not create multiple competing canvases.

Add semantic popup kinds and tank anchor projection.

---

## 3. Centralize integrity gain

Route actual repairs through one helper that returns actual clamped gain and emits `tankIntegrityGain`.

Integrate:
- max-integrity reward repair;
- cannon-kill repair;
- wave-clear repair;
- revive;
- future direct repair.

No healing inside relic projection.

---

## 4. XP event

Emit `xpGained` from authoritative `grantXp()` using final `result.gained`.

Use `#8fe8ff`, shared with XP shard presentation.

Do not ×10 XP.

---

## 5. Coalescing and overlay queue

Implement timing and lane behavior from design.

Reset cleanly.

---

## 6. Rarity fix

Ensure final relic/result/reveal rarity equals `relic.rarity`.

Track requested/resolved fallback only in debug/telemetry.

Keep upgrade rarity tables unchanged.

Make reel placeholders neutral or probability-honest.

---

## 7. Tank damage feedback

Emit one final post-modifier `tankDamageTaken` event.

Integrate camera/HUD/audio with bounded source-sensitive tiers.

Coalesce rapid hits.

Respect reduced motion/flash.

---

## 8. Tests

Implement full matrix from design.

Run:

```bash
npx tsc --noEmit
npm run build
npm test
```

plus progression/readability/netcode/browser suites.

Manual:
- max integrity;
- overheal clamp;
- Vampire Rounds;
- Safe Haven;
- XP pickup burst;
- duplicate relic XP;
- relic fallback;
- light/heavy/Boss damage;
- Single Player;
- both Multiplayer clients.

---

## 9. Report

Create:

```text
docs/parallel-enemy-pressure/workstream-04-reward-world-feedback/REWARD_WORLD_FEEDBACK_IMPLEMENTATION_REPORT.md
```

Include SHA, event contracts, popup styles, rarity fix, current integrity baseline verification, tests, screenshots, accessibility, and exclusions.
