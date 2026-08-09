# Tactical Threat-Map Polish V1
## Advanced Elite/Boss markers and truthful aggregate-horde representation

**Branch:** `feature/tactical-threat-map`  
**Workstream:** 3 of 5  
**Difficulty:** Small–Medium  
**Explicit exclusions:** TAB nub redesign, chest beacon, enemy scale, attacks, speeds, spawn logic

---

# 1. Goal

The current tactical minimap has rudimentary Elite differentiation.

Improve it so the player can instantly distinguish:

```text
ordinary enemy
elite threat
boss threat
aggregate ordinary horde sector
relic chest
```

Use redundant visual encoding:
- shape;
- size;
- color;
- outline/ring.

Do not rely on color alone.

---

# 2. Preserve current tactical drawer

Current main already has the tactical drawer and attached TAB/MAP nub.

Preserve:
- current drawer structure;
- slide behavior;
- nub;
- pointer lock;
- Tab control;
- status panel.

This workstream only improves tactical threat information and required data plumbing.

---

# 3. Semantic classification

Use the shared semantic classifier.

Recommended:

```ts
type MiniMapThreatClass =
  | 'ordinary'
  | 'elite'
  | 'boss';
```

Rules:

```text
normalized boss → boss
normalized elite → elite
non-boss wave leader → elite
other → ordinary
```

Ownership priority is compatibility fallback only.

This must behave identically in Single Player and Multiplayer.

---

# 4. Marker art direction

## Ordinary

```text
shape:
circle

radius:
2.25–2.75px

fill:
muted hostile red #d55347

outline:
minimal dark edge
```

## Elite

```text
shape:
diamond

half-size:
6–7px

fill:
electric violet #b56cff

outline:
1.5–2px matte near-black

optional:
small inner notch
```

No amber; amber belongs to relic chests.

## Boss

```text
shape:
large angular diamond/hex threat glyph

half-size:
9–10px

fill:
bright crimson #ff304d

outline:
2px near-black

outer ring:
paper-white/pale
radius ~12–13px
```

The Boss must remain visibly larger than Elite.

A slow ring pulse is optional:
- restrained;
- reduced-motion disabled;
- marker readable without motion.

## Relic chest

Preserve the current amber marker.

It must not resemble Elite/Boss.

---

# 5. Aggregate ordinary horde sector

Far ordinary enemies may be represented as aggregate sectors.

The minimap must not pretend those enemies ceased to exist.

Draw an approximate cluster marker at sector center.

Recommended:

```text
shape:
three small hostile-red dots
inside a broken circle

size:
scales with sqrt(count), clamped

count:
show ×N only above a threshold such as 8
```

Example:

```text
[cluster] ×14
```

The cluster marker is approximate.

Do not invent individual positions.

---

# 6. Sector data plumbing

Pass the client's current aggregate-sector list into the tactical drawer/minimap update.

Use a backward-compatible API, e.g.:

```ts
tacticalDrawer.update({
  state,
  tank,
  role,
  sectors,
});
```

or an equivalent typed view model.

Avoid per-frame large array/object allocation.

When a sector materializes:
- cluster marker disappears;
- individual markers appear.

---

# 7. Persistent Elite/Boss visibility

Elite and Boss entities should remain individual persistent threats.

The minimap should draw them whenever:
- alive;
- within playable map coordinates;
- authoritative/present in client state.

Do not hide them merely because ordinary far-tier rendering changes.

If a future recovery system repositions a persistent threat off-camera, its minimap marker follows the same entity.

---

# 8. Orientation and map truth

Preserve:
- player marker as vehicle-facing triangle;
- full 400×400 playable square;
- no camera-yaw substitution;
- no fake infinite apron as playable map;
- stable world-to-map conversion.

---

# 9. Performance

Use direct Canvas 2D drawing.

Do not:
- create DOM enemy markers;
- add labels/health bars;
- add a second canvas per class;
- allocate style objects per frame.

Marker classification can return small immutable style records.

---

# 10. Accessibility

Color is not the only cue:
- ordinary circle;
- Elite diamond;
- Boss largest ringed angular glyph;
- sector cluster.

Reduced motion disables pulses.

Maintain contrast against minimap terrain.

---

# 11. Tests

- ordinary semantic class;
- Elite semantic class;
- Boss semantic class;
- wave-leader fallback;
- Single Player parity;
- Multiplayer parity;
- chest remains amber/distinct;
- sector cluster;
- sector materialization transition;
- player marker vehicle orientation;
- no tactical nub regression;
- reduced motion.

---

# 12. Definition of done

- [ ] Ordinary, Elite, Boss, sector, and chest markers are instantly distinct.
- [ ] Elite uses violet diamond treatment.
- [ ] Boss uses largest crimson marker with pale ring.
- [ ] Classification is semantic in both modes.
- [ ] Far ordinary sectors remain visible as approximate clusters.
- [ ] Player triangle still indicates vehicle orientation.
- [ ] Existing TAB/MAP nub and drawer behavior remain unchanged.
- [ ] No labels/health bars/DOM-marker bloat.
- [ ] No chest-beacon, scale, attack, speed, or spawn work is included.

Final invariant:

> The tactical map tells the truth about threat hierarchy and far ordinary pressure at a glance without turning into a second full game screen.
