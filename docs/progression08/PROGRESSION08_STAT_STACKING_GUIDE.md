# Progression08 — Stat Stacking Guide

Final formula:

```text
final = (base + flat adds + relic flat adds)
        × Π(level-up multipliers)
        × (1 + Σ relic percent bonuses)
        × conditional multipliers
        → min/max clamp
```

Rules:

- Each level-up card is an independent `multiply` modifier (`stack`);
  duplicate cards multiply (1.15 × 1.15).
- Same-relic percent bonuses add internally: HE PAYLOAD ×2 =
  +30% +30% → 1.60, never 1.69.
- Relic flat bonuses add before multipliers: HEARTY TANK ×2 (+40) then a
  +20% armor card → (100 + 40) × 1.2 = 168.
- Conditional multipliers (MOMENTUM SHIELD, IRON WILL, LAST RESORT, GLASS
  CANNON, AERIAL MASTER, APEX PREDATOR) apply after the base layers.
- Clamps apply last; zero-cooldown only through explicit capabilities.

The runtime uses the existing `StatResolver`; `breakdown(stat)` exposes
base/adds/multiplies/final for the debug overlay.
