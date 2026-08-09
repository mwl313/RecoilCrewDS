# Reward Truth & Player World Feedback V1
## Honest rarity, green integrity gains, cyan XP gains, and stronger damage response

**Branch:** `feature/reward-world-feedback`  
**Workstream:** 4 of 5  
**Difficulty:** Medium–Large  
**Explicit exclusions:** enemy attacks/speeds, monster scale, horde spawning, minimap art, chat, chest beacon

---

# 1. Goal

Make positive and negative combat-state changes immediately legible around the shared tank.

Add:

```text
green +integrity world numbers
cyan +XP world numbers
stronger unified damage-taking feedback
truthful relic rarity resolution/reveal
rarity-honest roulette presentation
```

Verify and preserve the recent:
- max-integrity gained-capacity repair;
- integrity fraction;
- tactical drawer.

Do not duplicate correctly merged work.

---

# 2. Generalized world feedback layer

The current enemy world-UI layer already provides:
- Canvas 2D projection;
- pooled rising numbers;
- reduced-motion support;
- enemy damage;
- health bars.

Generalize it into a world-combat feedback layer rather than creating separate canvases for every number type.

Suggested concepts:

```ts
type WorldPopupKind =
  | 'enemyDamage'
  | 'integrityGain'
  | 'xpGain';
```

Each popup owns:
- kind;
- internal amount;
- source/reason;
- world anchor;
- born/merge time;
- presentation lane.

---

# 3. Green integrity-gain number

Whenever current integrity actually increases, show:

```text
+200
```

above the tank.

Use the existing ×10 combat-display scale.

## Actual amount only

Example:

```text
requested internal repair 15
only 6 missing
actual repair 6
display +60
```

Do not show the unclamped requested amount.

## Sources

Route all actual gains through one authoritative helper:

```text
max-integrity reward capacity repair
cannon-kill repair
wave-clear repair
direct repair
revive restoration
future repair effects
```

## Visual

```text
color:
success green ~#79dc88

font:
same heavy Barlow Condensed family

size:
25–29px

start scale:
~1.35

rise:
38–44px

lifetime:
750–850ms

outline:
dark structural stroke

accent:
brief restrained green glow
```

Max-integrity gain may use a stronger initial punch but still one number.

---

# 4. Central integrity gain helper

Recommended:

```ts
applyTankIntegrityGain(ctx, requestedAmount, reason): {
  requested: number;
  actual: number;
}
```

It:
1. records current integrity;
2. clamps to resolved max;
3. calculates actual delta;
4. mutates authority;
5. emits `tankIntegrityGain` only when actual > 0.

The recent max-integrity repair helper should call or expose this seam.

Do not heal inside relic stat reprojection.

Do not revive a dead tank except through the explicit revive effect.

---

# 5. Cyan XP-gain number

Whenever team XP is actually accepted, show:

```text
+6 XP
```

above the tank.

Do not multiply XP by 10.

Use final effective XP after mode/relic multipliers.

Color must match live XP shards:

```text
#8fe8ff
```

Move that color into a shared presentation token so 3D items and Canvas text cannot drift.

## Visual

```text
font size:
20–23px

start scale:
~1.20

rise:
28–34px

lifetime:
600–750ms

outline:
dark

glow:
brief cyan accent
```

XP is visually lighter than integrity and damage.

---

# 6. XP event authority

Emit from the central authoritative XP grant after `result.gained` is known.

Suggested:

```ts
pushEvent(ctx, 'xpGained', tank.x, tank.y + anchor, tank.z, {
  value: result.gained,
  kind: source,
});
```

Covers:
- shards;
- Elite;
- wave leader;
- Boss;
- duplicate relic;
- direct grant.

Both Multiplayer clients see the same shared-team XP popup.

---

# 7. Coalescing

## Integrity

Same repair source within:

```text
100–140ms
```

may merge.

Do not merge:
- max-integrity reward;
- unrelated wave repair;
- revive

into one ambiguous number unless they are one authoritative transaction.

## XP

XP events within:

```text
100–150ms
```

merge into one:

```text
+2 +2 +4 +2
→ +10 XP
```

This prevents pickup bursts from flooding the screen.

---

# 8. Popup lanes

When integrity and XP occur together, avoid exact overlap.

Suggested screen-space offsets around projected tank anchor:

```text
integrity:
left / slightly higher

XP:
right / slightly lower
```

Enemy damage remains over enemies.

---

# 9. Reward-overlay queueing

Max-integrity reward often resolves while the reward overlay is active.

Do not draw a gameplay popup behind the roulette.

Queue for up to:

```text
1.0–1.5s
```

When gameplay resumes:

```text
bar expands/fills
+200 rises above tank
```

Discard stale queued presentation after terminal transition.

---

# 10. Relic rarity truth

Current fallback can roll one rarity, select an eligible relic from another rarity, and continue presenting the originally requested rarity.

Fix:

```text
requested rarity
→ candidate search
→ deterministic fallback
→ selected relic
→ resolved rarity = selected relic.rarity
```

Use resolved actual rarity for:
- offer;
- reveal;
- result;
- telemetry;
- inventory styling;
- audio/FX.

Keep requested rarity only as development telemetry:

```text
requestedRarity
resolvedRarity
fallbackUsed
```

Never tell the player a Common relic is Legendary.

---

# 11. Upgrade rarity

Do not rebalance the existing upgrade rarity table in this workstream.

The first level-up's special rule is intentional.

Add tests that distinguish:
- first-experience rule;
- normal table;
- relic fallback truth.

---

# 12. Roulette placeholder honesty

The spinning reel is presentation, not a literal probability simulator.

Preferred solution:

```text
neutral upgrade/relic symbols while spinning
rarity appears only on lock
```

Alternative:
- generate placeholder rarity frequency from actual table.

Do not display Legendary at a decorative frequency that implies false odds.

Final locked result remains flashy and rarity-specific.

---

# 13. Unified tank damage event

Create one central presentation event after actual modified integrity loss is known:

```ts
tankDamageTaken {
  actualDamage,
  source,
  source position,
  impact kind,
  attacker tier
}
```

Do not infer final damage independently on the client.

No event for zero-damage/shielded hits unless a separate shield-block cue is intended.

---

# 14. Damage feedback tiers

Classify presentation from actual damage relative to resolved max integrity.

Suggested:

```text
LIGHT
MEDIUM
HEAVY
BOSS
```

Feedback may include:
- directional edge flash;
- camera translation/roll impulse;
- integrity bar punch;
- integrity number punch;
- short contrast/desaturation impulse;
- procedural armor-impact audio.

Avoid:
- long blindness;
- uncontrolled shake;
- gameplay hit-stop in Multiplayer.

---

# 15. Directional feedback

Use source world position relative to camera/tank.

Examples:

```text
left hit:
left edge emphasis

rear hit:
rear/side indication

unknown source:
symmetric vignette
```

Do not mislead when source is absent.

---

# 16. Rapid-hit coalescing

Horde hits can arrive in bursts.

Coalesce presentation over:

```text
60–100ms
```

Preserve total damage impact while capping:
- camera shake;
- flash opacity;
- audio voice spam.

Authority still applies every hit.

---

# 17. Accessibility

Respect:
- reduced motion;
- reduced flash if current settings exist;
- system reduced motion as fallback.

Reduced mode:
- smaller/no camera roll;
- shorter/subtler vignette;
- world numbers remain readable.

---

# 18. Baseline integrity verification

Audit current main.

Required final behavior:

```text
1,000 / 1,000

500 / 1,000
gain +200 max
→ 700 / 1,200
→ green +200
```

Low-integrity state should use percentage, not fixed internal 35.

If current main already satisfies fraction/repair/threshold:
- preserve;
- add integration tests;
- do not rewrite.

---

# 19. Event types

Possible additions:

```text
tankIntegrityGain
xpGained
tankDamageTaken
```

Version protocol safely if the project protocol requires it.

Keep events compact and authoritative.

Reset queues/pools on:
- rematch;
- reconnect;
- results;
- return menu.

---

# 20. Tests

## Integrity

- clamped actual gain;
- max-integrity transaction;
- wave/cannon repair;
- revive;
- no zero popup;
- ×10 display;
- overlay queue.

## XP

- effective gained value;
- no ×10;
- cyan token;
- burst coalescing;
- both clients.

## Rarity

- actual selected rarity drives reveal;
- fallback telemetry;
- first upgrade rule unchanged;
- neutral reel placeholders.

## Damage

- actual post-modifier damage;
- direction;
- coalescing;
- zero/shield;
- reduced motion.

---

# 21. Definition of done

- [ ] Actual integrity gains emit one authoritative semantic event.
- [ ] Green `+N` uses ×10 display units.
- [ ] XP emits final effective `+N XP`.
- [ ] XP color matches shard `#8fe8ff`.
- [ ] Rapid repair/XP bursts coalesce.
- [ ] Popups queue safely through reward overlays.
- [ ] Relic reveal rarity always matches actual relic.
- [ ] Roulette placeholders do not imply false odds.
- [ ] Upgrade rarity rules remain unchanged.
- [ ] Tank damage has unified stronger but bounded feedback.
- [ ] Recent integrity fraction/capacity repair remains correct.
- [ ] No enemy attack/scale/spawn/minimap/chat/chest-beacon work is included.

Final invariant:

> Every number and rarity shown to the player reflects an actual authoritative change, and the shared tank clearly communicates both positive growth and dangerous incoming damage.
