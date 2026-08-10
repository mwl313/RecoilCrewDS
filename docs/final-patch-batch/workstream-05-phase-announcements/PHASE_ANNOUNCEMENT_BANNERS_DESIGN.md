# Final Workstream 5 — Optional Phase Announcement Banners
## Plants-vs.-Zombies-inspired impact translated into Recoil Crew's industrial visual language

**Branch:** `feature/final-phase-announcements`  
**Priority:** Optional / time-boxed  
**Difficulty:** Small–Medium  
**Dependency:** Localization workstream merged first

---

# 1. Goal

At the start of each gameplay phase, briefly show a bold centered announcement.

Required English:

```text
Farming:
SLAY MONSTERS TO PREPARE FOR THE WAVE

Elite:
ELITE MONSTER WAVE INCOMING

Boss:
THE FINAL WAVE IS INCOMING
```

Recommended Korean:

```text
Farming:
몬스터를 처치해 웨이브에 대비하라!

Elite:
엘리트 몬스터 웨이브 접근 중!

Boss:
최종 웨이브 접근 중!
```

Use final localization-team wording if revised.

---

# 2. Reference interpretation

User-provided screenshots demonstrate:
- very large center text;
- immediate readability;
- dramatic scale;
- short interruption;
- strong audio punctuation.

Do not copy:
- exact font;
- exact red treatment;
- exact animations;
- original game assets;
- original sound.

Use Recoil Crew's:
- angular construction brackets;
- Barlow Condensed / Korean localized display font;
- matte black shadow/outline;
- amber/crimson accents;
- mechanical slam timing.

---

# 3. Trigger semantics

Use authoritative phase sequence.

Show once for:

```text
farming1
wave1
farming2
wave2
farming3
bossWave
```

Mapping:

```text
farming1/2/3 → farming announcement
wave1/2      → Elite announcement
bossWave     → final announcement
```

Use `phaseSequence` or a monotonic event ID to prevent duplicates.

Do not replay old announcements after reconnecting mid-phase.

Do show after a genuine rematch/new match.

---

# 4. Timing

Suggested total:

```text
1.45–1.75s
```

Sequence:

```text
0–180ms:
slam/zoom in from 1.35 to 1.0

180–1050ms:
hold

1050–1550ms:
fade/slide out
```

No gameplay pause.

No pointer/input interception.

---

# 5. Visual composition

Center screen.

Suggested:

```text
large two-line-capable heading
dark 5–8px outline/shadow
crimson or warning-red primary
pale inner highlight
thin amber construction slashes/brackets
brief radial/linear impact streak
```

Do not use a full opaque panel.

Keep enough visibility to continue driving.

Boss announcement strongest; farming lighter.

Korean must fit without excessive tracking or synthetic italic.

---

# 6. Responsive sizing

Use:

```css
font-size: clamp(29.4px, 5.04vw, 75.6px)
```

or a measured equivalent.

At narrow widths:
- allow two lines;
- keep center;
- avoid clipping;
- preserve safe margins.

---

# 7. Original impact sound

Add a procedural recipe:

```text
phaseAnnouncementImpact
```

Use:
- low THUMP;
- short CRACK;
- brief RUMBLE/AIR tail;
- optional METAL accent.

This may evoke a popular low-impact “boom” style, but must be an original synthesis—not the copyrighted “vine boom” sample.

Intensity:

```text
farming  0.75
Elite    1.0
Boss     1.25
```

---

# 8. Music and camera

Optional short soundtrack duck:

```text
depth:
~15–25%

attack:
~20ms

release:
~350–500ms
```

Do not restart or change song.

Camera/UI impulse:

```text
farming:
small

Elite:
medium

Boss:
strong but capped
```

Reduced motion attenuates zoom/shake.

---

# 9. Existing HUD coordination

Temporarily suppress or visually subordinate duplicate wave-warning text while the large banner is active.

Do not show:

```text
large phase banner
+
same text in another warning strip
```

at exactly the same time.

Encounter bars remain.

---

# 10. Localization

Use keys created by Workstream 1:

```text
phase.farming
phase.elite
phase.final
```

No hardcoded English in presenter logic.

---

# 11. Tests

- each phase mapping;
- once per phase sequence;
- no reconnect replay;
- rematch reset;
- English/Korean;
- responsive;
- reduced motion;
- no pointer interception;
- BGM duck restore;
- sound recipe;
- no duplicate HUD warning.

---

# 12. Definition of done

- [ ] Farming, Elite, and Boss announcements exist.
- [ ] Presentation is bold and centered.
- [ ] Visual design is Recoil Crew-specific, not a direct copy.
- [ ] Korean text fits.
- [ ] Original procedural impact sound exists.
- [ ] Music ducks briefly and restores.
- [ ] Announcement never pauses gameplay.
- [ ] No reconnect duplicate.
- [ ] Reduced-motion works.
- [ ] No unrelated mechanics/boundary/MG/Ground Pound work is included.

Final invariant:

> Each phase begins with one unmistakable audiovisual punctuation mark—large enough to feel like an event, brief enough to preserve control, and designed as Recoil Crew rather than a copy of its reference.
