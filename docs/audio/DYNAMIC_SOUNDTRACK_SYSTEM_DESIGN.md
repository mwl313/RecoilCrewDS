# Recoil Crew — Dynamic Soundtrack System Design
## Sequential BGM pool, random starting track, contextual muffling, countdown silence, and scene-aware transitions

**Status:** Binding audio/presentation specification  
**Repository:** `mwl313/RecoilCrewDS`  
**Target:** current `origin/main` at implementation time  
**Scope:** long-form soundtrack playback and scene integration  
**Included active tracks:** `BGM1.mp3`, `BGM2.mp3`  
**Excluded for now:** `BGM3.mp3`, `BGM4.mp3` (known-glitched source files; not included in this package)

---

# 0. Product intent

Recoil Crew has a small soundtrack pool and should make it feel intentional rather than repetitive.

The soundtrack system should create one continuous musical identity across:

```text
title
menu
lobby
match
pause
results
rematch
```

without restarting or switching tracks on every UI transition.

Core emotional rule:

> Outside active combat, the same soundtrack feels distant and muffled.  
> Inside active combat, the filter opens and the soundtrack becomes full and energetic.  
> The countdown is silent, creating anticipation before the next track enters.

The soundtrack should feel like one coherent system, not separate "menu music" and "battle music."

---

# 1. Active soundtrack pool

For this milestone, the active pool contains exactly:

```text
BGM1
BGM2
```

Package paths:

```text
/public/assets/audio/bgm/BGM1.mp3
/public/assets/audio/bgm/BGM2.mp3
```

Observed source durations:

```text
BGM1 ≈ 139.68s  (~2:20)
BGM2 ≈ 183.58s  (~3:04)
```

`BGM3` and `BGM4` are currently glitched and are intentionally excluded.

Do not reference or copy them into the active game.

---

# 2. Pool must be extensible

Do not hardcode controller logic around "two tracks."

Create a data-driven manifest such as:

```ts
export interface SoundtrackTrack {
  id: string;
  src: string;
  enabled: boolean;
}

export const SOUNDTRACK_TRACKS: readonly SoundtrackTrack[] = [
  {
    id: 'bgm1',
    src: '/assets/audio/bgm/BGM1.mp3',
    enabled: true,
  },
  {
    id: 'bgm2',
    src: '/assets/audio/bgm/BGM2.mp3',
    enabled: true,
  },
];
```

Controller behavior must operate on:

```text
activeTracks = SOUNDTRACK_TRACKS.filter(track => track.enabled)
```

All cycling uses:

```text
activeTracks.length
```

not `% 2`.

Future expansion should require only:

```text
1. add new audio asset
2. add one manifest entry
```

No controller rewrite.

A future repaired `BGM3`/`BGM4` can simply be added/enabled.

---

# 3. Playlist ordering

The playlist has a fixed cyclic order.

With current active pool:

```text
BGM1 → BGM2 → BGM1 → BGM2 → ...
```

At page/session startup, choose the starting index randomly once.

Examples:

```text
random start BGM1:
BGM1 → BGM2 → BGM1...

random start BGM2:
BGM2 → BGM1 → BGM2...
```

Do not reshuffle after every track.

Do not randomly choose each next song.

This ensures:
- variety per site load;
- predictable full-pool rotation;
- no accidental repeated song before the other active tracks have played.

For a future pool of N tracks:

```text
random initial index
then deterministic +1 modulo N
```

---

# 4. Soundtrack contexts

Use a semantic music context, not ad hoc screen calls.

Recommended:

```ts
export type SoundtrackContext =
  | 'title'
  | 'menu'
  | 'lobby'
  | 'countdown'
  | 'match'
  | 'pause'
  | 'results';
```

Settings / How To / Join / Create inherit `menu`.

Multiplayer pre-match lobby uses `lobby`.

Single Player and Multiplayer use the same `countdown`, `match`, `pause`, and `results` music semantics.

---

# 5. State behavior table

| Context | Track identity | Playback | Filter | Relative context volume |
|---|---|---:|---:|---:|
| Title / boot | current | playing | muffled | ~0.72 |
| Main menu | same current | playing | muffled | ~0.72 |
| Settings / How To / Join / Create | same current | playing | muffled | ~0.72 |
| Multiplayer lobby | same current | playing | muffled | ~0.72 |
| Countdown | none audible | silent | n/a | 0 |
| Active match | next/current match track | playing | open/full | 1.00 |
| Pause | same match track, continues | playing | more muffled | ~0.60 |
| Results / Victory / Defeat | same track, continues | playing | muffled | ~0.68–0.72 |
| Return to menu | same results/current track | playing | muffled | ~0.72 |

"Relative context volume" is relative to the configured music bus level, not master gain.

---

# 6. Startup timing

Desired behavior:

```text
site loads
→ wait 0.3 seconds
→ title soundtrack attempts to start
→ fade in from silence
```

Binding target:

```text
START_ATTEMPT_DELAY_MS = 300
```

However browsers may block audible autoplay before a user gesture.

Therefore:

## 6.1 Autoplay-permitted path

If `play()` succeeds at 300ms:

```text
start randomly selected first track at 0:00
fade in
title context = muffled
```

## 6.2 Autoplay-blocked path

If browser rejects autoplay:

```text
preload current track
remember pending title start
wait for first legal user activation
```

On the first user gesture that already unlocks game audio:

```text
resume/unlock AudioContext
start selected track at 0:00
fade in from silence
```

Do not:
- silently advance the track while blocked;
- start at 0:43 because wall time passed;
- treat autoplay rejection as fatal;
- spam console errors.

The user's first legal audible playback should begin at the start of the selected song.

---

# 7. Audio architecture

Do not decode all soundtrack files into `AudioBuffer` at once.

For long-form music, use an `HTMLAudioElement` routed through Web Audio.

Recommended graph:

```text
HTMLAudioElement
      ↓
MediaElementAudioSourceNode
      ↓
trackFadeGain
      ↓
musicLowPass
      ↓
musicContextGain
      ↓
musicDuckGain
      ↓
master
```

Responsibilities:

## `trackFadeGain`
Only:
- track start fade-in;
- track end fade-out;
- match-start fade-out;
- source switching.

## `musicLowPass`
Only contextual muffling:
- title/menu/lobby/results;
- pause;
- open during match.

## `musicContextGain`
Context loudness:
- outside match quieter;
- pause quieter;
- match full.

## `musicDuckGain`
Short temporary ducking:
- reward reveal;
- Legendary relic;
- any existing `duckForReward()` behavior.

Separating these nodes prevents volume automation systems from fighting each other.

---

# 8. Existing procedural music

Current `AudioManager` generates music procedurally through `startMusic()` / `scheduleMusic()`.

Once the real soundtrack controller is active:

```text
procedural background music must be disabled/removed from normal gameplay
```

Do not let:
- generated kick/bass/pad music
and
- BGM MP3s

play simultaneously.

Existing SFX synthesis remains.

Existing `setMusicIntensity()` may:
- become obsolete for background music;
- be retained as a compatibility no-op if necessary;
- or be repurposed only if a later explicit feature needs it.

Do not break SFX.

---

# 9. Track fade timing

All soundtrack starts/ends should avoid hard cuts.

Recommended constants:

```text
TITLE_START_FADE_IN_MS       = 1000
TRACK_NATURAL_FADE_OUT_MS    = 1250
TRACK_NATURAL_FADE_IN_MS     = 1250
TRACK_CHANGE_GAP_MS          = 150

MATCH_START_FADE_OUT_MS      = 650
MATCH_MUSIC_FADE_IN_MS       = 900

RESULTS_CONTEXT_MS           = 600
PAUSE_CONTEXT_MS             = 280
RESUME_CONTEXT_MS            = 320
MENU_CONTEXT_MS              = 350
```

These values may be tuned ±20–25% after listening, but preserve the character:
- scene transitions relatively quick;
- natural song boundaries softer/longer;
- pause/resume filter transition fast but smooth.

---

# 10. Natural track ending

When a soundtrack is naturally approaching its end:

```text
fade current track out over ~1.25s
→ ~150ms near-silence
→ advance cyclic playlist
→ new track starts at 0:00
→ fade in over ~1.25s
```

Do not overlap unrelated songs by default.

Avoid crossfading musical material from two tracks unless later art direction specifically approves it.

The new track inherits the current context:

```text
menu → next track starts muffled
match → next track starts full
pause → next track starts pause-muffled
results → next track starts results-muffled
```

Natural completion is one of the two reasons the playlist advances.

---

# 11. When the playlist advances

Binding rule:

> Advance to the next soundtrack only when:
> 1. the current song naturally completes, or
> 2. a new match begins after countdown.

Do not advance merely because the screen changes.

Do not advance on:
- title → main;
- menu → settings;
- settings → menu;
- main → lobby;
- match → pause;
- pause → match;
- match → results;
- results → main menu.

---

# 12. Match-start transition

When a match start is committed:

```text
current menu/lobby/results track
→ fade completely out over ~650ms
→ stop/reset audible playback
→ countdown remains silent
```

Do not advance playlist at fade-out time.

Record:

```text
pendingMatchTrackAdvance = true
```

Only when the match actually activates:

```text
advance index by one
load/play that track from 0:00
open filter
fade in over ~900ms
```

This avoids advancing if:
- match startup fails;
- lobby cancels;
- connection drops before start.

---

# 13. Countdown silence

The countdown has no BGM.

This applies to:

```text
Multiplayer
Single Player
Rematch
Single Player restart
```

The countdown should emphasize:
- UI countdown sound;
- ambience if any;
- anticipation.

Do not leave a muffled track underneath it.

---

# 14. Multiplayer countdown

Current Multiplayer already receives server countdown events.

On the first countdown transition:

```text
soundtrack.enterCountdown()
```

Do not restart the fade on every numeric tick.

Example:

```text
countdown 3:
fade already complete / silent

countdown 2:
remain silent

countdown 1:
remain silent
```

When authoritative match start arrives and gameplay is truly ready:

```text
soundtrack.enterMatch({ advance: true })
```

---

# 15. Single Player countdown

Single Player currently enters gameplay directly and must be changed to use the same visible countdown experience.

Implement a local countdown using the existing countdown scene/component.

Preferred sequence:

```text
Single Player clicked
→ begin/finish required asset preload
→ construct/prepare match without exposing active gameplay
→ fade current track out
→ show countdown
→ 3
→ 2
→ 1
→ activate gameplay
→ advance soundtrack
→ next song starts from 0:00
→ fade in full-frequency
```

Important:

Do not:
```text
finish countdown
→ then wait several seconds for assets
```

Preload enough first so the countdown leads directly into gameplay.

During countdown:
- input disabled;
- pointer lock not required yet;
- no BGM.

Use the same visible countdown style as Multiplayer.

---

# 16. Pause behavior

Opening Pause during an active match:

```text
do NOT pause song
do NOT restart song
do NOT switch song
```

The song continues from its current timeline position.

Transition:

```text
match filter open
→ low-pass down
match context gain
→ pause context gain
```

Recommended pause settings:

```text
low-pass cutoff target ≈ 1.6 kHz
context gain ≈ 0.60
transition ≈ 280ms
```

The result should sound:
- distant;
- muffled;
- still clearly the same track.

Do not make it so low/quiet that it feels broken.

---

# 17. Resume behavior

On Resume:

```text
same song
same currentTime
same track index
```

Transition:

```text
low-pass cutoff → effectively open (~18–20 kHz)
context gain → 1.00
over ~320ms
```

No restart and no new song.

---

# 18. Menu/title/lobby muffling

Outside active match and outside countdown, use a gentler muffled profile.

Recommended:

```text
low-pass cutoff target ≈ 2.2–2.4 kHz
context gain ≈ 0.72
transition ~350ms
```

This applies to:
- title;
- main;
- settings;
- how-to;
- create/join;
- lobby;
- results;
- return to menu.

Pause is more muffled than ordinary menu/results.

---

# 19. Match playback

During active gameplay:

```text
filter cutoff ≈ 18–20 kHz / effectively open
context gain = 1.00
```

Do not apply the menu muffling.

Existing reward/music ducking remains allowed.

---

# 20. Results / victory / defeat

Do **not** switch to the next BGM just because the run ends.

On:
- victory;
- defeat;
- generic run complete;

use the same soundtrack behavior:

```text
current gameplay song
→ smooth transition to results muffled profile
→ same track continues from same currentTime
```

Recommended:

```text
results low-pass ≈ 2.2–2.4 kHz
context gain ≈ 0.68–0.72
transition ≈ 600ms
```

Outcome-specific emotional differentiation should come from:
- existing results SFX;
- victory/defeat stingers if added later;
- results visuals.

Not from wasting a new full soundtrack on a screen the player may leave after a few seconds.

---

# 21. Rematch

From results:

```text
same muffled results track
→ Rematch committed
→ fade it completely out
→ silent countdown
→ next playlist track
→ full match fade-in
```

This is the same transition model as a new match.

---

# 22. Return to main menu after results

If player returns to Main Menu:

```text
do not switch song
```

The same current track continues in the menu muffled profile.

If it naturally ends while the user remains in the menu:
- advance naturally;
- next song starts muffled.

---

# 23. Restart Single Player from pause

Treat as a new match:

```text
current paused track
→ fade completely out
→ prepare new match
→ local silent countdown
→ advance playlist
→ next track starts full
```

Do not simply unpause the old song for a restarted run.

---

# 24. Error / disconnect behavior

If gameplay is interrupted by a terminal connection error:

Preferred:

```text
current song transitions to menu/results-like muffled profile
```

Do not:
- abruptly cut;
- advance playlist;
- start a new song solely for error.

If app teardown destroys audio, preserve graceful fade where practical.

---

# 25. Reward ducking compatibility

Existing reward reveals can temporarily duck soundtrack.

The controller architecture must allow:

```text
match full-frequency
+ temporary reward duck
```

without:
- changing current track;
- losing context gain;
- breaking menu/pause filter state.

For a Legendary reward:

```text
musicDuckGain
→ temporary reduction
→ restores to 1
```

while `musicContextGain` remains whatever context requires.

Do not hardcode reward duck restoration to a global fixed music gain.

---

# 26. Audio element lifecycle

Use one long-form soundtrack deck unless implementation proves two are necessary.

Recommended:

```text
HTMLAudioElement
preload = 'auto'
loop = false
```

On track change:
1. fade `trackFadeGain` to zero;
2. pause current element;
3. update `src`;
4. set `currentTime = 0`;
5. await readiness enough for playback;
6. play;
7. fade `trackFadeGain` upward.

Do not create a new `MediaElementAudioSourceNode` for the same element repeatedly.

Create the media source once per element.

---

# 27. Natural fade scheduling

Do not rely only on the `ended` event if a fade-out is required before the end.

Track:
- `duration`;
- `currentTime`.

Begin natural fade when approximately:

```text
remaining <= TRACK_NATURAL_FADE_OUT_MS
```

A lightweight controller tick of ~100ms is sufficient.

Do not run soundtrack logic every game RAF unless convenient and effectively free.

After fade reaches zero and the element ends/near-ends:
- advance;
- switch;
- fade next.

---

# 28. Randomization and tests

Production:
- randomize starting index once per page load/session.

Testing:
- allow deterministic RNG injection or explicit starting index.

Do not make automated tests flaky because playlist start is random.

Recommended constructor option:

```ts
new SoundtrackController({
  tracks,
  random: Math.random,
});
```

Tests can provide:
```ts
random: () => 0
```

---

# 29. Zero / one track safety

Controller must handle future configuration safely.

## Zero active tracks

```text
no crash
no music
SFX remain functional
```

## One active track

Random start is that track.

On natural end or new match:
```text
same single track begins again from 0:00
```

## N tracks

Normal cyclic behavior.

---

# 30. Asset-loading behavior

Do not block the entire site's first paint on full BGM download.

Use browser media streaming/preload semantics.

At minimum:
- first selected track begins preloading immediately;
- next track can be preloaded opportunistically after current playback is stable.

Do not decode all active tracks into memory.

---

# 31. Settings compatibility

If existing or future settings have:
- master volume;
- music volume;
- mute;

the soundtrack must route through the proper music/master bus.

Do not bypass user audio settings.

If no dedicated music-volume setting exists yet, do not invent a settings UI in this milestone unless trivial and explicitly desired.

---

# 32. Current `AudioManager` integration

Current `AudioManager` owns:
- SFX synthesis;
- master gain;
- current procedural music;
- reward ducking.

Recommended direction:

```text
AudioManager
├── SFX
├── master
├── soundtrack bus/filter/gains
└── SoundtrackController
```

or:

```text
AudioManager exposes soundtrack bus nodes
SoundtrackController owns HTMLAudioElement + playlist state
```

Either is acceptable.

Prefer separation of responsibilities over turning `AudioManager` into one very large state machine.

---

# 33. Suggested source layout

Recommended:

```text
src/client/audio/
├── soundtrackController.ts
├── soundtrackManifest.ts
└── soundtrackTypes.ts
```

Existing:

```text
src/client/audio.ts
```

may remain the SFX/master facade.

If repository conventions favor another directory, follow them.

---

# 34. Test matrix

Required unit/integration tests:

## Pool
```text
active pool contains BGM1/BGM2
BGM3/BGM4 absent
N-track manifest works without controller code change
```

## Random start
```text
random start 0 -> BGM1
random start high -> BGM2
```

## Sequence
```text
start BGM2
next -> BGM1
next -> BGM2
```

## Natural ending
```text
fade out
advance
fade next in
inherit current context
```

## Menu transitions
```text
title -> main -> settings -> main -> lobby
same track / same playback position
```

## Match start
```text
current fades out
countdown silent
match activates
next track begins at 0
```

## Multiplayer countdown
```text
multiple countdown number events do not repeatedly advance/fade
```

## Single Player countdown
```text
single-player start uses visible silent countdown
next track starts only when gameplay activates
```

## Pause
```text
same src
currentTime continues
filter/context gain changes
```

## Resume
```text
same src
no restart
filter opens
```

## Results
```text
same current track
no playlist advance
muffled profile
```

## Rematch
```text
fade
silent countdown
advance once
next starts
```

## Return menu
```text
results -> main
same track continues muffled
```

## Autoplay blocked
```text
300ms play attempt rejects
pending start remains
first activation starts selected track at 0
```

## Reward duck
```text
temporary duck restores relative to current soundtrack context
```

## Zero/one/N tracks
Safe behavior.

---

# 35. Browser qualification

Test at least:
- Chrome;
- automated Chromium where possible.

Manual sequence:

```text
fresh page
→ wait >300ms
→ verify autoplay behavior
→ interact if browser blocks
→ title/menu same song muffled
→ enter lobby same song
→ start match
→ fade to silence
→ 3/2/1 silence
→ next BGM full
→ pause same BGM muffled
→ resume same BGM full
→ victory/defeat same BGM muffled
→ rematch fade
→ countdown silence
→ next BGM full
```

Repeat with random startup landing on both BGM1 and BGM2.

---

# 36. Performance

Long-form soundtrack should not meaningfully affect gameplay performance.

Do not:
- decode multiple full MP3s into memory;
- recreate nodes every scene;
- run expensive per-frame audio graph changes.

Use scheduled gain/filter automation.

---

# 37. Forbidden implementations

Do not:
- include BGM3 or BGM4 in active pool right now;
- hardcode modulo 2 controller behavior;
- randomize every next track;
- restart song on menu/settings/lobby transition;
- restart song on pause/resume;
- switch song on results;
- play BGM during countdown;
- play procedural generated music underneath MP3 BGM;
- hard-cut tracks on ordinary transitions;
- crossfade two unrelated songs by default;
- pause the soundtrack timeline merely because pause screen is open;
- break existing reward ducking;
- ignore browser autoplay rules;
- block page startup waiting for full MP3 decode.

---

# 38. Definition of done

- [ ] Only BGM1/BGM2 are active and packaged.
- [ ] BGM3/BGM4 are absent from active assets/config.
- [ ] Manifest/controller supports arbitrary future track count.
- [ ] Random starting track chosen once.
- [ ] Playlist then proceeds sequentially/cyclically.
- [ ] Title attempts playback 300ms after load.
- [ ] Autoplay-block fallback works on first user activation.
- [ ] Every track fades in.
- [ ] Every deliberate/natural track end fades out.
- [ ] Menu/title/lobby/results use muffled profile.
- [ ] Pause uses stronger muffled profile while song keeps playing.
- [ ] Match uses full-frequency profile.
- [ ] Match start fades current track completely out.
- [ ] Countdown is silent.
- [ ] Single Player gets the same countdown screen/semantics.
- [ ] New match advances exactly once to next soundtrack.
- [ ] Results do not advance playlist.
- [ ] Rematch uses fade → silence → next track.
- [ ] Return to menu keeps same results/current track.
- [ ] Natural track end advances and inherits current context.
- [ ] Existing reward ducking still works.
- [ ] Existing SFX still work.
- [ ] Procedural background music no longer overlaps.
- [ ] No audio-node leaks after repeated matches/scene transitions.

Final experience invariant:

> Recoil Crew's soundtrack feels continuous across the whole session: distant outside battle, silent during the countdown, fully alive in combat, and never needlessly restarted or wasted on short UI transitions.
