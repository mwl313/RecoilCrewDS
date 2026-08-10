# Final Workstream 3 — Landing & Ground Pound Overhaul
## Fall-distance tracking, capped camera/audio impact, proportional damage/radius, and authoritative ground shockwaves

**Branch:** `feature/final-landing-ground-pound`  
**Difficulty:** Medium–Large  
**Primary risks:** double feedback, incorrect fall-distance measurement, excessive area damage  
**Binding rule:** no fall damage

---

# 1. Goals

Implement:

1. Landing sound and screen shake only after a meaningful fall.
2. Fall-distance-aware landing intensity.
3. Ground Pound damage proportional to fall distance.
4. Ground Pound radius proportional to fall distance, with a hard cap.
5. Radius larger than the tank's immediate body.
6. Visible ground shockwave matching the authoritative radius.
7. Strong procedural impact sound.

---

# 2. Authoritative fall distance

Current landing logic captures downward speed but not actual fall distance.

Track:

```text
airborne peak world Y
landing ground/body Y
```

On landing:

```ts
fallDistance = max(0, airbornePeakY - landingY);
impactSpeed = max(0, -preLandingVy);
```

Fall distance is authoritative and match-scoped.

It naturally includes:
- jumps;
- ramps;
- cliff drops;
- cannon launches;
- knockback launches.

Do not derive fall distance on the client.

---

# 3. Tracker lifecycle

Suggested runtime fields:

```text
wasGrounded
airbornePeakY
airborneStartedY
```

Behavior:

```text
grounded → airborne:
initialize peak

while airborne:
peak = max(peak, tank.y)

airborne → grounded:
calculate metrics
reset tracker
```

Handle:
- respawn;
- rematch;
- teleport/reconnect initialization;
- progression pause;
- low-ceiling contacts.

Do not treat a spawn snap as a fall.

---

# 4. Landing event contract

Preserve compatibility `value` as impact speed if needed.

Add explicit:

```ts
fallDistance?: number;
impactSpeed?: number;
```

`RelicTriggerEvent.landed` should receive:

```ts
{
  type: 'landed';
  fallDistance: number;
  impactSpeed: number;
  x: number;
  y: number;
  z: number;
}
```

---

# 5. Landing feedback thresholds

Suggested:

```text
fallDistance < 2.5m:
no dedicated shake
no heavy landing sound
ordinary suspension motion only

2.5–5.5m:
LIGHT landing

5.5–10m:
HEAVY landing

10m+:
MASSIVE presentation tier
still no fall damage
```

Use impact speed as a secondary intensity input, not the sole classifier.

---

# 6. Landing camera impulse

Suggested capped function:

```ts
const normalized = clamp((fallDistance - 2.5) / 10, 0, 1);
const impulse = lerp(0.12, 0.65, normalized);
```

Heavy Ground Pound may add a small extra pulse, but do not double-apply two full impulses.

Reduced-motion:
- substantially attenuate translation/roll;
- keep audio and shockwave readable.

---

# 7. Landing sound

Current light/heavy recipes may remain as base.

Add or refine:

```text
landingLight
landingHeavy
landingMassive / groundPoundImpact
```

Massive impact:
- low THUMP;
- short CRACK;
- METAL body;
- low AIR/RUMBLE tail.

Scale without clipping.

No external SFX library.

---

# 8. Ground Pound activation

Ground Pound triggers only when the relic is owned and:

```text
fallDistance >= 1.5m
```

A tiny curb/grounding correction should not damage enemies.

---

# 9. Binding Ground Pound formula

Let:

```ts
effectiveFall = max(0, fallDistance - 1.5);
```

## Damage

```ts
baseDamage = 10 * stacks;
fallBonus = effectiveFall * 5;
damage = baseDamage + fallBonus;
```

Round to a stable precision if required.

Examples, one stack:

```text
3m fall:
10 + 7.5 = 17.5

6m fall:
10 + 22.5 = 32.5

11.5m fall:
10 + 50 = 60

20m fall:
10 + 92.5 = 102.5
```

Damage has no fall-distance cap. Additional stacks increase reliable base damage
without multiplying the fall bonus; only the shockwave radius is range-capped.

## Radius

```ts
radius = min(12, 5 + effectiveFall * 0.65);
```

Examples:

```text
3m fall:
~5.98m

6m fall:
~7.93m

12m fall:
~11.83m

larger:
capped at 12m
```

This is intentionally larger than the current 3m and larger than the tank body.

## Knockback

```ts
knockback = min(12, 4 + effectiveFall * 0.75);
```

Keep vertical knockback controlled.

---

# 10. Damage geometry

Use authoritative radius from the formula.

Query nearby enemies through the spatial index, then use:

```text
distance <= radius + enemy collision radius
```

Do not use visual shockwave scale as authority.

Ground Pound damages ordinary, Elite, and Boss according to existing damage rules.

No self-damage and no fall damage.

---

# 11. Shockwave event

Emit a semantic event:

```ts
groundPoundImpact {
  x/y/z;
  radius;
  damage;
  fallDistance;
  impactSpeed;
  stacks;
}
```

The client uses it for:
- ring radius;
- dust/debris intensity;
- sound;
- camera pulse.

Server owns damage and knockback.

---

# 12. Shockwave visual

Create a pooled ground effect:

```text
bright inner ring
larger dust ring
radial debris burst
brief center flash
```

The final ring expansion must visibly match authoritative radius.

Suggested colors:
- pale warm core;
- amber construction edge;
- terrain-colored dust.

Respect terrain Y and depth.

Do not render through buildings.

---

# 13. Avoid duplicate feedback

A Ground Pound landing should produce one coherent presentation:

```text
landing event
+ Ground Pound semantic data
→ one combined heavy landing/Ground Pound response
```

Do not play:
- landingHeavy;
- groundPoundImpact;
- two full camera impulses

independently at full intensity.

Use a presentation coordinator.

---

# 14. Relic text

Final clean English:

```text
GROUND POUND

Land after falling at least 1.5 m to create a shockwave.
Greater falls deal more damage and increase the radius, up to 12 m.
Each stack adds 100 base damage in display units.
```

The localization branch may choose a shorter card form.

Korean direction:

```text
그라운드 파운드

1.5m 이상 낙하한 뒤 착지하면 충격파를 일으킵니다.
더 높이 떨어질수록 피해와 범위가 증가하며, 범위는 최대 12m입니다.
```

Use effect-aware values rather than stale fixed text.

---

# 15. Tests

## Tracking

- normal jump;
- cannon launch;
- cliff drop;
- same-height landing;
- lower-ground landing;
- respawn;
- rematch.

## Threshold

- 2.49m no shake;
- 2.5m light;
- 5.5m heavy;
- 10m massive.

## Formula

Test exact:
- damage;
- radius;
- cap;
- stack behavior;
- knockback cap.

## Authority

- no client damage;
- no fall damage;
- SP/MP same;
- shockwave radius matches damage radius.

## Presentation

- one combined sound/impulse;
- reduced motion;
- pool cleanup.

---

# 16. Definition of done

- [ ] Authoritative fall distance exists.
- [ ] Landing feedback begins only at meaningful fall distance.
- [ ] Shake/sound scales and caps.
- [ ] Ground Pound uses fall distance.
- [ ] Base radius is 5m.
- [ ] Radius scales and caps at 12m.
- [ ] Damage continues scaling with fall distance without a cap.
- [ ] Shockwave VFX matches authoritative radius.
- [ ] Sound is weighty and procedural.
- [ ] No duplicate full-strength landing/Ground Pound feedback.
- [ ] No fall damage.
- [ ] Localization/audio user gains are preserved.
- [ ] No MG/boundary/announcement/chat/chest-beacon work is included.

Final invariant:

> A meaningful fall produces a proportional, readable physical landing, and Ground Pound turns height into an authoritative shockwave whose damage, radius, sound, and visuals all tell the same truth.
