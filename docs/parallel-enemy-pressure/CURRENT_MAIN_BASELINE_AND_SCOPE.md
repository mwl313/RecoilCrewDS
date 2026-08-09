# Current-Main Baseline and Scope Decisions

This package was prepared after the recent `main` pushes. Every Codex agent must fetch `origin/main` itself and treat that exact runtime SHA as authoritative.

Known baseline assumptions to verify, not blindly duplicate:

- The recent max-integrity reward/tactical-drawer work is present or partially present.
- The attached TAB/MAP nub is a baseline component and must be preserved.
- Elite minimap markers exist in a rudimentary form and need a deliberate visual/semantic pass.
- Chest-beacon work is not part of this package.
- Ordinary monster target heights are approximately 1.02m / 1.53m / 1.70m before tier scale.
- Elite tier scale is 3 and boss tier scale is 5.
- Six featured identities exist: Alien, Cactoro, Fish, Ninja, Demon, and Yeti.
- Current elites do not all have mixed melee/ranged kits.
- All bosses have mixed ordered-cycle kits, but the runtime can stall on an unavailable melee pattern instead of using a valid ranged pattern.
- Current one-anchor pack planning does not create convincing surrounding pressure.
- Current world-number presentation is enemy-damage-centric; player repair and XP feedback need first-class semantics.

No branch should reintroduce work that current `main` already completed. Audit first, preserve correct behavior, and implement only the missing/different contract.
