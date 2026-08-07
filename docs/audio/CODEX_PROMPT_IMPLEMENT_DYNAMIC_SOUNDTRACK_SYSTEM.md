# Codex Prompt — Implement Recoil Crew Dynamic Soundtrack System

Repository:

```text
https://github.com/mwl313/RecoilCrewDS
```

Target:

```text
current origin/main
```

Binding design:

```text
docs/audio/DYNAMIC_SOUNDTRACK_SYSTEM_DESIGN.md
```

Included active audio assets in this package:

```text
public/assets/audio/bgm/BGM1.mp3
public/assets/audio/bgm/BGM2.mp3
```

Do not use BGM3/BGM4 in this implementation. Their current source files are glitched and are intentionally not included.

## Mission

Replace the current procedural background-music behavior with a real long-form soundtrack system using BGM1/BGM2.

Required player experience:

```text
site load
→ after 300ms attempt title BGM
→ random starting song
→ muffled outside match
→ current song persists across menus/lobby
→ Match Start fades current song out
→ countdown is silent
→ gameplay begins
→ NEXT song starts from 0 with full-frequency fade-in
→ pause keeps same song but muffles it
→ resume unmuffles same song
→ victory/defeat/results keep same song but muffle it
→ rematch fades it out
→ silent countdown
→ next song begins
```

Playlist is cyclic and extensible.

---

# 1. Audit current main first

Run:

```bash
git fetch --all --prune
git switch main
git pull --ff-only origin main
git status --short
git rev-parse HEAD
```

Read at minimum:

```text
src/client/audio.ts
src/client/main.ts
src/client/hud.ts
src/client/presentation/
src/client/ui/
src/client/app/gameClient.ts
src/client/settings/
package.json
```

Inspect current:
- pause/results implementation;
- Multiplayer countdown flow;
- Single Player startup flow;
- reward ducking;
- any master/music volume settings;
- tests around audio and app flow.

Record starting SHA.

---

# 2. Use only BGM1/BGM2 now

Active pool:

```text
BGM1.mp3
BGM2.mp3
```

Do not reference:
```text
BGM3
BGM4
```

Do not add placeholders for their broken files to production assets.

But architecture must support any future N-track pool.

---

# 3. Create data-driven soundtrack manifest

Recommended:

```text
src/client/audio/soundtrackManifest.ts
```

Example:

```ts
export interface SoundtrackTrack {
  id: string;
  src: string;
  enabled: boolean;
}

export const SOUNDTRACK_TRACKS = [
  { id: 'bgm1', src: '/assets/audio/bgm/BGM1.mp3', enabled: true },
  { id: 'bgm2', src: '/assets/audio/bgm/BGM2.mp3', enabled: true },
] as const;
```

Controller filters enabled tracks:

```ts
const activeTracks = SOUNDTRACK_TRACKS.filter((track) => track.enabled);
```

All cycling/random-start logic must use:

```ts
activeTracks.length
```

Never use `% 2`, `if (track === BGM1)`, or any other two-track branch.

The same controller must work unchanged for 0, 1, 2, 3, 4, or N active tracks.

Future track addition should require only:
- add the audio asset;
- add/enable one manifest entry.

No controller rewrite.

---

# 4. Playlist policy

Choose one random starting index once per page/session.

Then sequentially cycle:

```text
index = (index + 1) % activeTracks.length
```

Do not reshuffle every song.

Do not choose random next track.

Tests must allow deterministic RNG injection.

---

# 5. Long-form audio implementation

Prefer `HTMLAudioElement` routed through Web Audio.

Do not decode the two MP3s fully into AudioBuffers unless profiling/architecture strongly justifies it.

Recommended graph:

```text
MediaElementSource
→ trackFadeGain
→ musicLowPass
→ musicContextGain
→ musicDuckGain
→ master
```

Use separate nodes so:
- fade automation;
- contextual muffling;
- reward ducking

never fight each other.

---

# 6. Disable procedural background music

Current `AudioManager` synthesizes a procedural music loop.

Once MP3 soundtrack is active:

```text
do not play procedural background music
```

Preserve:
- engine audio;
- weapon SFX;
- UI SFX;
- reward SFX;
- results SFX;
- other gameplay sound.

Do not let both music systems overlap.

---

# 7. Startup at 300ms with browser-safe fallback

At application load:

```text
preload selected random first track
setTimeout(..., 300)
attempt play
```

If browser allows:
- play from 0:00;
- fade in;
- title muffled context.

If `play()` rejects due autoplay policy:
- keep selected track/index;
- keep `currentTime = 0`;
- mark pending title start;
- on first legal user activation / existing `audio.unlock()` gesture, start it from 0:00 and fade in.

Do not advance while blocked.

Do not treat autoplay rejection as an error screen.

---

# 8. Context profiles

Implement semantic contexts.

Recommended target values:

## Title / menu / lobby / results

```text
low-pass: ~2200–2400 Hz
context gain: ~0.72
transition: ~350ms
```

## Pause

```text
low-pass: ~1600 Hz
context gain: ~0.60
transition: ~280ms
```

## Match

```text
low-pass: ~18000–20000 Hz / effectively open
context gain: 1.00
transition/resume: ~320ms
```

## Countdown

```text
track audible gain = 0 / no BGM
```

Tune after listening if necessary, but preserve the relative relationship.

---

# 9. Track fade constants

Initial targets:

```text
startup fade-in:       1000ms

natural fade-out:      1250ms
natural fade-in:       1250ms
natural gap:            150ms

match-start fade-out:   650ms
match fade-in:          900ms

results context:        600ms
pause context:          280ms
resume context:         320ms
menu context:           350ms
```

Use centralized constants.

No random hard cuts.

---

# 10. Natural song completion

Before end:
- fade track out;
- after completion/near completion advance sequentially;
- wait small ~150ms gap;
- next starts from 0;
- fade in.

Next track inherits current context.

Examples:

```text
menu natural end
→ next BGM muffled

match natural end
→ next BGM full

pause natural end
→ next BGM pause-muffled
```

Do not overlap songs by default.

---

# 11. Exact playlist-advance rule

Advance only when:

```text
1. current song naturally completes
OR
2. a new match actually begins after countdown
```

Do not advance on ordinary screen changes.

---

# 12. Menu/lobby persistence

These transitions keep same song and playback position:

```text
boot/title → main
main → settings
settings → main
main → how-to
main → create/join
create/join → lobby
lobby state changes
```

Only context filter/gain may change if needed.

---

# 13. Match Start transition

When a new match is committed:

```text
fade current track to zero over ~650ms
enter countdown context
```

Do not advance track immediately.

Set internal pending-next-match state.

If match startup fails/cancels:
- do not silently consume/skip a playlist entry.

When gameplay actually activates:
- advance exactly once;
- start next track at 0:00;
- set match profile;
- fade in ~900ms.

---

# 14. Multiplayer countdown

Use existing server countdown.

On first transition to countdown:
```text
soundtrack.enterCountdown()
```

Do not retrigger fade/advance for each `3`, `2`, `1` message.

On authoritative game activation:
```text
soundtrack.enterMatch({ advance: true })
```

---

# 15. Single Player countdown — REQUIRED NEW BEHAVIOR

Current Single Player starts gameplay directly.

Change it so Single Player uses the same visible countdown screen.

Preferred flow:

```text
Single Player clicked
→ preload/prepare assets and match
→ keep gameplay hidden/inactive
→ fade current BGM out
→ show countdown scene
→ 3
→ 2
→ 1
→ activate game
→ advance playlist exactly once
→ next BGM from 0
→ full-frequency fade-in
```

Do not show countdown before long asset loading if that causes:
```text
3,2,1
→ black/loading delay
```

Prepare first, countdown immediately before actual gameplay activation.

Reuse existing countdown UI instead of creating a second design.

---

# 16. Pause

On pause:

```text
same song
same src
same currentTime progression
```

Do not call `pause()` on the music element solely because gameplay pauses.

Transition filter/gain to pause profile.

The user should hear the music continue as if behind a wall.

---

# 17. Resume

Same track, no restart.

Smoothly open filter and restore match context gain.

---

# 18. Results / victory / defeat

Do NOT advance to a new track.

For all outcomes:
- preserve current match track;
- keep it playing;
- transition to results/menu muffled profile.

Existing result SFX/stinger may play over the transition.

Do not use a new full BGM as a short results jingle.

Victory vs defeat can remain differentiated by visuals/SFX, not playlist advancement.

---

# 19. Rematch / Single Player restart

Treat as a new match:

```text
current results/pause track
→ fade out
→ silent countdown
→ advance once
→ next track full
```

---

# 20. Return to main menu

From results or pause/main-menu action:

```text
keep current song
muffle to menu profile
```

Do not advance.

If it naturally ends later, normal sequential advance occurs.

---

# 21. Reward ducking

Audit `duckForReward()`.

Do not let it hard-reset music gain to a fixed value that conflicts with:
- menu context gain;
- pause context gain;
- track fade.

Use separate `musicDuckGain`.

Reward duck should restore to:
```text
duck gain = 1
```
while context/fade gains remain untouched.

---

# 22. Suggested source modules

Recommended:

```text
src/client/audio/
├── soundtrackController.ts
├── soundtrackManifest.ts
└── soundtrackTypes.ts
```

Keep SFX/master logic in existing `audio.ts` where sensible.

Avoid one giant class.

---

# 23. Controller state

Track at minimum:

```text
activeTracks
currentIndex
currentContext
pendingAutoplayStart
pendingMatchAdvance
transition generation/token
natural-end state
disposed flag
```

Use transition tokens/generation ids so stale async `play()`/fade callbacks cannot start an old track after a newer scene transition.

---

# 24. Audio lifecycle

One media element is sufficient unless implementation proves otherwise.

Set:
```text
preload = auto
loop = false
```

On track source switch:
1. fade track gain;
2. pause;
3. set src;
4. reset currentTime;
5. load/await playable;
6. play;
7. fade in.

Create media source node once for the element.

Avoid node leaks across rematches.

---

# 25. Testing

Add tests covering:

## Manifest/extensibility
- BGM1/BGM2 active.
- No BGM3/BGM4.
- Controller works with mocked 3/4/N track arrays with no code branch change.

## Random starting index
Inject deterministic random.

## Sequence wrap
```text
BGM2 → BGM1 → BGM2
```

## Startup
300ms attempt.

## Autoplay rejection
First user activation starts original selected track at 0.

## Menu/lobby
Same source/current playback continuity.

## Match start
Fade → countdown silence → advance once → next from 0.

## Multiplayer countdown
3/2/1 messages do not advance multiple times.

## Single Player countdown
Visible countdown before gameplay activation.

## Pause/resume
Same track/currentTime; only filter/gain context changes.

## Results
No advance; same track muffled.

## Rematch
Advance exactly once after countdown.

## Natural end
Sequential next with inherited context.

## Reward duck
Duck gain separated from context/fade.

## Zero/one/N tracks
Safe behavior.

## Disposal
No timers/audio nodes continue after teardown where teardown is intended.

---

# 26. Manual browser validation

Run the complete sequence:

```text
fresh site
→ wait 300ms
→ title BGM starts or waits legally for gesture
→ main menu same track muffled
→ lobby same track
→ start match
→ fade out
→ silent 3/2/1
→ next track full
→ pause same track muffled
→ resume same track full
→ results same track muffled
→ rematch
→ fade out
→ silent countdown
→ next track full
```

Repeat with both random starting possibilities.

Also leave menu open long enough for natural track completion.

---

# 27. Implementation report

Create:

```text
docs/audio/DYNAMIC_SOUNDTRACK_SYSTEM_IMPLEMENTATION_REPORT.md
```

Include:
- starting/ending SHA;
- active manifest;
- assets used;
- controller architecture;
- audio graph;
- autoplay fallback;
- Single Player countdown changes;
- transition constants;
- context cutoff/gain settings;
- proof results do not advance playlist;
- proof pause preserves playback position;
- proof pool supports arbitrary N tracks;
- tests/manual validation;
- any browser limitations.

---

# 28. Forbidden shortcuts

Do not:
- use BGM3/BGM4 now;
- hardcode two-track logic;
- shuffle/randomize every next song;
- restart tracks on ordinary menu transitions;
- pause music timeline on pause screen;
- play BGM during countdown;
- switch songs on results;
- overlap procedural generated BGM with MP3s;
- use one gain node for track fades + context volume + reward ducking;
- ignore autoplay rejection;
- block startup by fully decoding MP3s;
- create a second Single Player countdown design instead of reusing the existing one.

Definition of done is the complete checklist in the binding design document.
