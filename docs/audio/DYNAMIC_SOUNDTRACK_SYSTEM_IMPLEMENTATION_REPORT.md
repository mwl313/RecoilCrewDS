# Dynamic Soundtrack System Implementation Report

## Repository state

- Implementation branch: `codex/dynamic-soundtrack`
- Starting `origin/main` SHA: `3ac8eeffc14edd5aad354b4eeb07624c57f10c10`
- Ending target `origin/main` SHA: `d307a0c7fd9e29e08e3207c093fdbecc69f8281b` (implementation is intentionally uncommitted on top)
- Binding design: `docs/audio/DYNAMIC_SOUNDTRACK_SYSTEM_DESIGN.md`

## Active manifest and assets

The data-driven manifest is `src/client/audio/soundtrackManifest.ts`. Its enabled pool is:

| ID | Public source | Validated duration | Size |
| --- | --- | ---: | ---: |
| `bgm1` | `/assets/audio/bgm/BGM1.mp3` | 139.6535 s | 3,591,510 bytes |
| `bgm2` | `/assets/audio/bgm/BGM2.mp3` | 183.5335 s | 4,862,808 bytes |

No production source or asset references BGM3/BGM4. `ffprobe` successfully read both supplied MP3 containers.

The controller filters `enabled` entries once, selects one random starting index once per page session, and advances only with `(currentIndex + 1) % activeTracks.length`. The implementation contains no two-track branch, so zero, one, three, four, and arbitrary N-track pools use the same code.

## Architecture

The implementation is split by responsibility:

- `soundtrackTypes.ts`: contexts, track/media/automation contracts, debug state.
- `soundtrackManifest.ts`: active content pool only.
- `soundtrackController.ts`: playlist identity, random start, sequential cycling, autoplay fallback, transition generations, countdown/match semantics, natural-end scheduling, and disposal.
- `soundtrackWebAudio.ts`: deferred graph binding and Web Audio parameter automation.
- `audio.ts`: SFX/master facade, lazy AudioContext creation, media-source graph construction, and reward-duck delegation.

One reusable `HTMLAudioElement` is configured with `preload = 'auto'` and `loop = false`; tracks stream through browser media playback rather than full-file AudioBuffer decoding. One `MediaElementAudioSourceNode` is created for that element when the audio graph initializes.

Audio graph:

```text
HTMLAudioElement
→ MediaElementAudioSourceNode
→ trackFadeGain (scaled by the existing 0.34 music-bus level)
→ musicLowPass
→ musicContextGain
→ musicDuckGain
→ master
→ compressor
→ destination
```

The old procedural kick/hat/bass/pad scheduler was removed. `setMusicIntensity()` remains only as a compatibility no-op for existing gameplay callers; SFX, engine, weapon, UI, reward, and results sounds remain intact.

Transition-generation checks prevent stale asynchronous `play()` completions or timers from applying obsolete scene changes. Disposal clears startup, poll, and transition timers, removes the media listener, and pauses the deck.

## Startup and autoplay fallback

The selected random track begins preloading immediately. At 300 ms the controller attempts title playback from 0:00 with a 1,000 ms fade. A rejected autoplay attempt preserves the selected index/source, resets time to zero, and records a pending start without surfacing an error.

`AudioManager.unlock()` resumes the AudioContext inside the existing boot gesture and retries the same selected media after the context reaches its resumed state. The retry does not advance the playlist. Live Chromium validation observed BGM2 blocked at 0:00 on title, then the same BGM2 starting at 0:00 after CLICK TO ENTER.

## Contexts and timings

| Context | Low-pass | Context gain | Transition |
| --- | ---: | ---: | ---: |
| Title/menu/lobby | 2,300 Hz | 0.72 | 350 ms |
| Pause | 1,600 Hz | 0.60 | 280 ms |
| Match/resume | 20,000 Hz | 1.00 | 320 ms |
| Results | 2,300 Hz | 0.70 | 600 ms |
| Countdown | silent target | 0 | 650 ms match-start fade |

Central transition constants:

- title start fade-in: 1,000 ms
- natural fade-out/fade-in: 1,250 ms / 1,250 ms
- natural gap: 150 ms
- match-start fade-out: 650 ms
- match fade-in: 900 ms
- natural-end poll: 100 ms

Reward reveals automate only `musicDuckGain`: attack to `1 - depth`, hold, then return to unity. Context gain, filter state, and track-fade automation are left untouched.

## Application-flow integration

- Title, main, settings, How To, create/join, and return-to-main use the persistent menu context.
- Lobby state selects lobby context; a lobby phase of `countdown` enters countdown once, while a cancelled countdown returns to the same lobby track and playback position.
- Repeated Multiplayer 3/2/1 messages are idempotent. Authoritative game activation consumes `pendingMatchAdvance` once, selects the next cyclic track, resets it to 0:00, and applies the match fade-in.
- Single Player now completes arena/model/monster preparation, awaits the 650 ms music fade to confirmed silence, and only then reveals the existing shared countdown screen. It runs the existing 3–2–1–GO sequence, activates gameplay, and advances once.
- Pause changes only filter/context gain; it never pauses the media element.
- Resume opens the same current track without resetting source or time.
- Victory, defeat, and generic results retain the active match track and move it to the results profile.
- Play Again/Single Player restart and Multiplayer rematch use the same countdown-pending-next-match rule.
- Return to main and terminal errors keep the current track and use the menu profile.
- Reconnect into an already-running match opens the match profile without consuming a playlist entry.

## Automated verification

Passing checks:

- `tsc --noEmit`
- `npm run build`
- 14 soundtrack controller/Web Audio tests, including manifest exclusions, deterministic random start, autoplay rejection, sequence wrap, zero/one/N pools, countdown cancellation, natural end, pause/results continuity, independent reward ducking, idempotent startup, and disposal
- presentation, gameplay04, and lobby09 suites: 144 tests passed before the final lifecycle additions; focused soundtrack checks remained green afterward
- `e2e/lobby-seat-ready.spec.ts` two-client case: lobby continuity, countdown pending state, and exactly one match advance passed
- `e2e/singlePlayer.spec.ts`: the initial full 90-second run passed results continuity and Play Again advance. On the rebased current-main rerun, every soundtrack assertion passed again; only the suite's final generic console-cleanliness assertion failed because two unrelated resources returned anonymous 404 messages.

The complete `npm test` run has 10 unrelated baseline failures. They cover existing predictor pending-count expectations, a relic projection expectation, a stale protocol-version assertion, a Double Barrel fixture, the Demo golden fixture, a tank-asset manifest expectation, and two Monster Pack importer cases whose external source ZIP is absent. No failure is in the soundtrack, audio, countdown, presentation-flow, or modified E2E files.

Both production soundtrack URLs were requested directly from the rebased production server and returned `200 audio/mpeg`; the two console 404s in the second Single Player E2E run were therefore not BGM1/BGM2 failures.

## Live Chromium qualification

The in-app Chromium browser was used because a separate Chrome extension session was unavailable.

Observed successfully:

- both BGM1 and BGM2 occurred as random page-session starts;
- the 300 ms autoplay attempt was blocked safely, with the original selection retained at 0:00;
- CLICK TO ENTER unlocked and started that same selection;
- main → settings preserved BGM2 while time advanced from 6.49 s to 7.29 s;
- Single Player displayed 3 only after the gameplay canvas/assets were prepared;
- countdown retained the current index with `pendingMatchAdvance = true`;
- gameplay advanced BGM2 → BGM1 once and began at 0:00;
- pause retained BGM1 and its timeline advanced from 29.528 s to 30.229 s;
- results retained the same BGM1;
- Play Again advanced BGM1 → BGM2 once after countdown;
- pause → main retained BGM2 and continued its timeline;
- a real BGM1 menu playback naturally completed and rolled to BGM2, which was playing at 5.992 s in the inherited menu context.

The browser automation can inspect controller/media state but cannot objectively measure perceived filter timbre or loudness. Cutoff, gain, and ramp targets are therefore proven by automation tests and graph state, while final artistic loudness remains a listening-tune item on target hardware.
