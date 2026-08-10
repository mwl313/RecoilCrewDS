# Final Workstream 1 — Copy, Korean Localization, and Settings V2
## Clear player-facing language, bilingual runtime UI, Korean typography, and independent BGM/SFX controls

**Branch:** `feature/final-localization-settings-copy`  
**Difficulty:** Large  
**Primary risks:** incomplete translation coverage, stale cached UI text, audio slider fighting soundtrack context automation

---

# 1. Goals

Implement:

1. A complete player-facing English copy cleanup.
2. Korean localization.
3. A properly bundled/licensed Korean UI font.
4. Settings V2:
   - Language
   - BGM volume
   - SFX volume
5. Runtime language switching without page reload.

Do not add:
- fullscreen;
- in-match chat;
- new gameplay mechanics;
- machine-gun balance;
- Ground Pound formulas;
- phase-banner presentation.

Create the localization keys needed by the optional announcement workstream, but do not implement the banner here.

---

# 2. Copy-cleanup principles

Clean English before translating it.

Player-facing copy should be:
- concise;
- active;
- mechanically truthful;
- consistent;
- free of implementation terminology;
- free of debug-style parentheticals.

Forbidden player-facing language includes:

```text
High Detail
.hero
.common
clamp 0
two stacks: 0
statFlat
incomingDamageReduction
weapon.mgDamage
selected.phase.closeFodder
```

---

# 3. Relic copy rules

Relic presentation should use:

```text
NAME
Primary effect.
Condition or stack behavior, only when needed.
```

Prefer:
- `repair` for tank integrity;
- explicit values;
- structured text derived from effect parameters.

Examples:

Current-style:

```text
Cannon self-damage -50% (two stacks: 0).
```

Clean:

```text
Reduce cannon self-damage by 50% per stack.
At two stacks, cannon self-damage is completely negated.
```

Current:

```text
Dash hits refund 30% of dash cooldown (clamp 0).
```

Clean:

```text
Dash hits immediately restore 30% of the Dash cooldown.
```

Current:

```text
Max integrity +20.
```

Clean display copy:

```text
Increase maximum integrity by 200.
The gained capacity is repaired immediately.
```

All absolute integrity values continue using the ×10 display-unit system.

Do not duplicate mechanics into static strings when a structured presenter can generate them.

---

# 4. Upgrade copy rules

Each card should expose:

```text
THEMATIC NAME
STRUCTURED EFFECT
```

Examples:

```text
MACHINE GUN POWER
MACHINE GUN DAMAGE +24%

MACHINE GUN FIRE RATE
MG FIRE RATE +25%

ARMOR PLATING
MAX INTEGRITY +200
```

Never derive visible names by humanizing internal IDs.

The effect line must come from stat presentation metadata and localized units.

---


Machine Gun Power:
```text
기관총 화력
```

Machine Gun Range:
```text
기관총 사거리
```

Machine Gun Fire Rate:
```text
기관총 연사력
```

---

# 5. Monster naming rules

Remove technical asset suffixes:

```text
Alien High Detail Elite
→ Alien

Demon High Detail Boss
→ Demon
```

Encounter UI already communicates `ELITE` or `BOSS`.

Canonical English identity names remain:
- Alien
- Cactoro
- Fish
- Ninja
- Demon
- Yeti

Ordinary invented species names require an explicit localization glossary; do not algorithmically transliterate at runtime.

Do not show `.boss`, `.elite`, `High Detail`, `Evolved` unless “Evolved” is an intentional player-facing species variant.

---

# 6. Localization architecture

Recommended modules:

```text
src/client/localization/localizationService.ts
src/client/localization/localizationTypes.ts
src/client/localization/interpolate.ts

content/locales/en/ui.json
content/locales/en/hud.json
content/locales/en/relics.json
content/locales/en/upgrades.json
content/locales/en/enemies.json
content/locales/en/errors.json
content/locales/en/phase.json

content/locales/ko/ui.json
content/locales/ko/hud.json
content/locales/ko/relics.json
content/locales/ko/upgrades.json
content/locales/ko/enemies.json
content/locales/ko/errors.json
content/locales/ko/phase.json
```

Equivalent generated TypeScript catalogs are acceptable if they remain source-generated from human-editable content.

API:

```ts
type Locale = 'en' | 'ko';

interface LocalizationService {
  locale(): Locale;
  setLocale(locale: Locale): void;
  t(key: string, params?: Record<string, string | number>): string;
  subscribe(listener: () => void): () => void;
}
```

Fallback:

```text
requested locale
→ English
→ authored content fallback
→ development warning
```

Never show a raw missing key to players.

---

# 7. Stable key conventions

Examples:

```text
ui.settings.title
ui.settings.language
ui.settings.bgm
ui.settings.sfx

hud.integrity
hud.level
hud.wave

relic.relic_friendly_shield.name
relic.relic_friendly_shield.description

upgrade.upgrade_weapon_mgDamage.name
upgrade.upgrade_weapon_mgRange.name

enemy.enemy_quaternius_alien_high_detail.name

phase.farming
phase.elite
phase.final
```

A deterministic ID-to-key helper is acceptable.

---

# 8. Content-driven UI integration

Extend scene/UI node presentation with:

```text
textKey
placeholderKey
titleKey
ariaLabelKey
```

Existing English `text` may remain as editor/fallback copy.

Bindings that produce phrases must use localized format keys, not hardcoded English concatenation.

Examples:

```text
MONSTER LV {level}
CREW LV {level}
WAVE {number}
```

---

# 9. Dynamic gameplay text

Audit TypeScript-produced strings, including:

- HUD state;
- countdown;
- wave/boss warnings;
- progression overlay;
- relic reveal;
- results;
- lobby;
- reconnect/errors;
- tactical drawer;
- Settings;
- pause/how-to;
- server error presentation.

Network state remains language-neutral.

Resolve localized copy from:
- entity/relic/upgrade IDs;
- semantic event IDs;
- error codes.

Two Multiplayer clients may use different locales.

---

# 10. Translation coverage

Translate:

- title/main menu;
- create/join/lobby;
- ready/seat/reconnect;
- settings;
- how-to;
- countdown;
- pause;
- results/rematch;
- HUD labels and warnings;
- tactical drawer;
- upgrade roulette;
- relic roulette;
- rarity labels;
- all upgrade names/effects;
- all relic names/descriptions;
- ordinary/Elite/Boss names;
- objectives/modifiers;
- user-facing errors;
- optional phase-announcement strings.

Do not translate:

- `RECOIL CREW`;
- `RC-07`;
- player nicknames;
- room codes;
- player chat;
- `WASD`, `SHIFT`, `TAB`, `LMB`, `RMB`;
- URLs/version strings;
- internal/debug overlays in V1.

---

# 11. Korean glossary

Use consistently:

| English | Korean |
|---|---|
| Driver | 운전수 |
| Gunner | 포수 |
| Crew | 승무원 |
| Integrity | 내구도 |
| Maximum Integrity | 최대 내구도 |
| Repair | 수리 |
| Cannon | 주포 |
| Machine Gun | 기관총 |
| Charge Shot | 차지 샷 |
| Dash | 대시 |
| Upgrade | 강화 |
| Relic | 유물 |
| Level Up | 레벨 업 |
| Common | 일반 |
| Rare | 희귀 |
| Epic | 영웅 |
| Legendary | 전설 |
| Elite | 정예 |
| Boss | 보스 |
| Wave | 웨이브 |
| Ready | 준비 완료 |
| Pause | 일시정지 |
| Resume | 계속하기 |
| Victory | 승리 |
| Defeat | 패배 |
| Music | 배경 음악 |
| Sound Effects | 효과음 |

Featured identities:

```text
Alien    에일리언
Cactoro  캑토로
Fish     피시
Ninja    닌자
Demon    데몬
Yeti     예티
```

Review invented ordinary names manually.

---

# 12. Korean typography

Preferred:

```text
Korean UI:
Pretendard Variable

Fallback:
Noto Sans KR
system sans-serif

English display/numbers/logo:
Barlow / Barlow Condensed
```

The implementation must:
- add a properly licensed webfont through dependencies/assets;
- include license/attribution;
- preload only necessary font resources;
- not block first paint indefinitely.

Locale CSS:

```css
html[lang='ko'] {
  --ui-body: 'Pretendard', 'Noto Sans KR', sans-serif;
  --ui-localized-display: 'Pretendard', 'Noto Sans KR', sans-serif;
}
```

Korean layout:
- `word-break: keep-all`;
- restrained letter spacing around `0–0.02em`;
- line-height around `1.2–1.3`;
- no forced synthetic italic on long Korean headings;
- avoid English all-caps tracking values.

Preserve visual identity through weight, color, panel geometry, and composition.

---

# 13. Settings V2 schema

Migrate:

```ts
interface ClientPlayerSettingsV1 {
  version: 1;
  nickname: string;
}
```

to:

```ts
interface ClientPlayerSettingsV2 {
  version: 2;
  nickname: string;
  locale: 'en' | 'ko';
  bgmVolume: number; // 0–100
  sfxVolume: number; // 0–100
}
```

Recommended storage:

```text
recoilCrew.playerSettings.v2
```

Migration:
- preserve valid V1 nickname;
- default locale from `navigator.language.startsWith('ko')`;
- default BGM/SFX to `100`;
- persist V2;
- retain safe in-memory fallback if storage fails.

---

# 14. Settings interaction

Layout:

```text
PLAYER
nickname

LANGUAGE
[ ENGLISH ] [ 한국어 ]

AUDIO
BGM            slider  100%
SOUND EFFECTS  slider  100%

[ SAVE ] [ CANCEL ]
```

Language:
- previews immediately;
- Save persists;
- Cancel restores previous locale.

Audio:
- previews immediately;
- Save persists;
- Cancel restores previous values.

No fullscreen control in this workstream.

---

# 15. UI controls

Add accessible:

```text
segmentedControl
range
```

Prefer native:
- buttons/radio semantics for language;
- `<input type="range">` underneath custom styling.

Keyboard and screen-reader behavior must remain correct.

---

# 16. Audio user-gain architecture

Current soundtrack context automation must remain separate from user volume.

Required graph:

```text
soundtrack source
→ track fade
→ context filter
→ context gain
→ reward duck
→ MUSIC USER GAIN
→ master
```

SFX:

```text
category buses
→ authored SFX mix gain
→ SFX USER GAIN
→ master
```

Do not bind the BGM slider directly to `contextGain`.

API:

```ts
setBgmVolume(value0to100): void
setSfxVolume(value0to100): void
```

Perceptual curve:

```ts
gain = (value / 100) ** 2
```

Ramp over roughly 20–40ms.

At BGM 0:
- soundtrack continues playing silently;
- restoring volume resumes at the current song position.

---

# 17. Runtime refresh

Changing locale must update:
- cached scene runtimes;
- active HUD;
- tactical drawer;
- progression overlay;
- results;
- current Settings panel.

No page reload.

Components may subscribe, or presentation runtimes may be safely rebuilt while preserving flow state.

---

# 18. Localization validation

Add a script/test that checks:

- every English key has Korean;
- no duplicate keys;
- no raw internal IDs in player-facing catalogs;
- interpolation parameters match across languages;
- no untranslated technical suffix in monster names;
- no invalid static integrity values.

Development warns on missing fallback.

---

# 19. Layout qualification

Test English and Korean at:

```text
1920×1080
1280×720
800×720
560×720
```

Check:
- no clipping;
- no overlapping buttons;
- reward-card fit;
- boss names;
- tactical labels;
- results;
- settings sliders;
- Korean line breaking.

---

# 20. Definition of done

- [ ] English relic/upgrade/monster copy is clear and nontechnical.
- [ ] Korean catalogs cover all selected player-facing text.
- [ ] Korean font is legally integrated and licensed.
- [ ] Brand/key/room/nickname exceptions remain untranslated.
- [ ] Server/network remains locale-neutral.
- [ ] Runtime language change needs no reload.
- [ ] Settings V1 nickname migrates to V2.
- [ ] Language, BGM, and SFX controls exist.
- [ ] BGM slider does not fight context filtering/ducking.
- [ ] SFX slider does not affect BGM.
- [ ] Save and Cancel semantics are correct.
- [ ] Korean UI passes responsive qualification.
- [ ] No fullscreen/chat/gameplay/boundary/announcement implementation is included.

Final invariant:

> Every player-facing phrase is intentional, the Korean version feels designed rather than machine-substituted, and audio preferences change user gain without disrupting Recoil Crew's authored soundtrack and combat mix.
