# Reward Truth & Player World Feedback V1 — Implementation Report

## Build identity

- Branch: `feature/reward-world-feedback`
- Audited baseline SHA: `2e80f3916e06deccfa915e56f3087acf51ead218`
- Protocol: 19 (reward/integrity/damage semantic event contract)
- Binding design: `REWARD_TRUTH_AND_PLAYER_WORLD_FEEDBACK_DESIGN.md`

The checkout already contained unrelated deployment/network work and later received concurrent enemy/tactical changes. Those changes were preserved and were not included in this workstream's implementation decisions.

## Authority and event contracts

| Event | Authoritative fields | Presentation invariant |
| --- | --- | --- |
| `tankIntegrityGain` | `value` actual clamped internal gain, `kind` reason, tank anchor, `deferUntilPlaying` | Emitted only when current integrity really increases. Green text uses the shared combat display ×10 boundary. |
| `xpGained` | `value` final `TeamExperienceSystem.addXp().gained`, `kind` XP source, tank anchor, `deferUntilPlaying` | Cyan `+N XP`; XP is never multiplied by 10. Both network clients receive the same team-authority event. |
| `tankDamageTaken` | `value` actual post-modifier integrity loss, source, tank position, source `tx/ty/tz`, `impactKind`, attacker `tier`, resolved `maxIntegrity` | No event for shielded, zero, or otherwise rejected damage. Client feedback never re-derives gameplay damage. |

`applyTankIntegrityGain()` is now the single authority seam for current-integrity increases. It clamps to the resolved maximum, returns `{ requested, actual }`, blocks implicit revival, and emits exactly one semantic event for a positive delta. Max-capacity rewards use a context-aware wrapper around the existing transaction helper. Vampire Rounds, Safe Haven, and Phoenix Core route through the same seam. Relic stat reprojection itself remains non-healing.

## World feedback layer

The existing `enemy-world-ui` Canvas remains the only world-number canvas. It now owns semantic pooled popups for `enemyDamage`, `integrityGain`, and `xpGain`, while preserving damaged-only enemy health bars.

| Kind | Style | Coalescing/lane |
| --- | --- | --- |
| Integrity | `#79dc88`, 27 px heavy Barlow Condensed, 1.35 start scale, 42 px rise, 820 ms, restrained green glow | Same reason within 120 ms; left/higher tank lane. |
| XP | shared `#8fe8ff`, 22 px, 1.20 start scale, 31 px rise, 690 ms, light cyan glow | Any XP within 140 ms; right/lower tank lane. |
| Enemy damage | Existing magnitude-driven red style and ×10 damage display | Same-enemy MG hits within 60 ms. |

Positive events received during an upgrade/relic overlay queue for at most 1,300 ms and release only when `matchFlow` returns to `playing`. Terminal flow, rematch/reset, and disposal clear the queue and pool.

The XP color now comes from `XP_PRESENTATION_COLOR`; both the instanced XP shards and Canvas text use that token.

## Integrity baseline verification

The pre-existing pure max-integrity repair transaction was correct: it repaired newly-created capacity once, clamped decreases, remained inert on reprojection, and did not revive dead tanks. It is preserved and now delegates authority presentation through the centralized gain seam.

Verified behavior:

```text
1,000 / 1,000
500 / 1,000
gain +200 maximum integrity
→ 700 / 1,200
→ green +200
```

The HUD now renders a current/max fraction and derives its low-integrity warning from `current / resolvedMax < 35%`, replacing the stale fixed internal threshold. Single Player reads the live resolved maximum; Multiplayer continues to use the replicated movement-rules maximum.

The tactical drawer and chest world renderer/lifecycle were not reworked. Existing progression and chest suites remain green.

## Rarity truth and roulette honesty

Relic selection now resolves in this order:

```text
requested rarity → eligible candidate search → deterministic fallback
→ selected relic → resolved rarity = relic.rarity
```

The actual relic rarity drives the offer candidate, roll result, reveal, inventory styling source, progression event, and rarity distribution telemetry. Development telemetry retains `requestedRarity`, `resolvedRarity`, and `fallbackUsed` without exposing requested rarity to players.

Owned unique relics remain excluded while any eligible relic exists. If a unique-only pool is fully exhausted, the content-authored duplicate replacement is honored and its XP routes through the central `grantXp()` path. This produces the same effective `xpGained` event as every other source.

Upgrade rarity tables and the first-experience rule were unchanged. Spinning upgrade/relic cells now use only neutral symbols and labels; rarity color/text appears at lock from the actual result.

## Unified tank-damage feedback

`DamageSystem.applyTank()` computes real integrity loss after modifiers and lethal clamping, then emits one `tankDamageTaken` event. Known projectile, melee, collision, and explosive callers attach compact source position/tier metadata without changing attack damage, cadence, speed, or behavior.

The client coalesces hits over 80 ms, preserving total damage while issuing one bounded camera/audio/HUD response. Tiers use actual damage divided by resolved maximum (`LIGHT`, `MEDIUM`, `HEAVY`), with authoritative Boss sources promoted to `BOSS`. Known source positions select left/right edge emphasis; missing or coincident sources use a symmetric vignette. Camera translation/roll, flash opacity, audio intensity, and HUD punch are capped.

## Accessibility

- System `prefers-reduced-motion` remains the fallback for world numbers and reward presentation.
- Reduced motion scales damage camera translation/roll to 32% and shortens the edge cue.
- `reducedFlash` or reduced motion applies the restrained damage vignette path.
- World numbers remain present and readable in reduced mode; they are not removed with motion.
- Every overlay/canvas is `aria-hidden`; authoritative HUD text continues to expose the integrity fraction.

## Verification

| Command/suite | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS (client + server; existing chunk-size warning only) |
| `npm run test:progression` | PASS — 33 files, 209 tests |
| gameplay readability files | PASS — 3 files, 13 tests |
| `npm run test:netcode` | PASS — 7 files, 44 tests |
| focused reward/audio matrix | PASS — clamping, reasons, XP, coalescing, queue, rarity fallback, reels, damage, direction, shield, reduced-mode seams |
| `npm run test:progression:visual` | PASS — 3/3 temporal browser tests |
| `e2e/reward-world-feedback.spec.ts` | PASS — screenshot evidence for XP, integrity, and heavy damage |
| `npm run test:progression:e2e` | 9/10 PASS. Single Player, first-chest, relic, responsive, two-client world-chest, and reconnect flows pass. The remaining test expects removed lobby element `#screen-ready` before reaching progression. |
| `npm test -- --reporter=dot` | 9 failures, all outside this workstream: two require the absent local Monster Pack ZIP; three are stale predictor pending-queue expectations; one is the asset-manifest empty-list baseline; one is the Demo golden; one is the unrelated Double Barrel charge test; and one is the room-rules 5 s timeout. Reward-world-feedback and updated audio-contract tests are green when run directly. |

The complete first-upgrade rule test and normal rarity-table tests remain unchanged and green, distinct from the new relic fallback-truth test.

## Browser evidence

- [Cyan effective XP world number](screenshots/xp-gain-world-number.png)
- [Green actual integrity world number and fraction HUD](screenshots/integrity-gain-world-number.png)
- [Bounded heavy tank-damage vignette and HUD response](screenshots/tank-damage-heavy-feedback.png)

Existing temporal evidence videos were also regenerated under `docs/progression08/evidence/` for normal upgrade, relic, and reduced-motion reward flows.

## Explicit exclusions

No enemy attack values/cadence, enemy speed tuning, monster scale, minimap behavior/art, spawn director logic, chat, or chest beacon behavior was changed by this workstream. Tank-damage call sites only attach source metadata required by the semantic feedback event. Upgrade rarity probabilities were not rebalanced.
