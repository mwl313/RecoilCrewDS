# RECOIL CREW — Final Goal Report

**Date:** 2026-08-02
**Thread goal status:** ✅ complete
**Repository root:** `/Users/leah/Desktop/Recoil Crew`

---

## 1. Executive Summary

The goal was to produce the strongest complete, playable build of **Recoil
Crew** — a two-player online cooperative browser game — from the authority
document `RECOIL_CREW_ONESHOT_DESIGN.md`, including real two-browser
multiplayer, a complete 90-second gameplay loop, tests, documentation,
swappable assets, and deployment instructions.

All mandatory systems were implemented, run, fixed, and verified end to end.
The final build passes:

- 47/47 unit and integration tests
- Clean TypeScript compilation
- Clean production build (client + server)
- A real-time headless two-client 90-second round with results and rematch
- A Playwright two-browser (real Chrome) full round with results and rematch
- A Playwright practice-mode full round

The game is served by a single Node process (HTTP + WebSocket on one port)
and is currently live at `http://localhost:8080`.

---

## 2. Objective and Definition of Done

The objective, as recorded in the active thread goal:

> Produce the strongest complete playable Recoil Crew build possible in this
> execution: inspect the repository, choose the most reliable browser-game
> stack, implement every mandatory system in RECOIL_CREW_ONESHOT_DESIGN.md,
> run and fix the project, verify two-browser multiplayer and the complete
> 90-second gameplay loop, and leave a polished build with tests,
> documentation, swappable assets, and deployment instructions.

Definition-of-done evidence required by the design prompt:

| Requirement | Evidence |
| --- | --- |
| Project installs | `npm install` succeeds (72 packages) |
| Project builds | `npm run build` → `dist/` + `dist-server/` |
| Tests run | `npm test` → 47/47 passed |
| Client launches | HTTP 200 on `/`; WebGL canvas renders in Chrome |
| Server launches | `npm run server` listens on `:8080` |
| Two browsers join one room | Playwright e2e, two Chrome contexts |
| Driver/Gunner inputs separate | Unit + e2e verification |
| Cannon recoil changes shared tank | Unit test + e2e velocity-delta check |
| Both TPS cameras independent | Implemented + exercised in e2e |
| Core loop works | Full round in two-browser e2e and headless loop |
| JACKPOT works | Fired in e2e and headless loop |
| Full round ends, results appear | Verified on both clients |
| Rematch works | Same-room rematch with modifier verified |
| Practice works | Practice e2e full round verified |
| Arena visually complete | Low-poly industrial arena implemented |
| UI polished | DOM HUD/menus/results with role themes |
| Asset replacement documented | `ASSET_GUIDE.md` + manifest system |
| No critical runtime errors | e2e console-error assertion empty |

---

## 3. Stack Decision

**Chosen stack:** TypeScript + Vite + Three.js client, custom authoritative
Node.js simulation, `ws` WebSocket server.

**Why this stack (also recorded in `DECISIONS.md`):**

- No game engine was installed in the environment; a web-native TypeScript
  stack builds, runs, and tests entirely from the command line.
- A dedicated authoritative Node server makes both browser clients symmetric,
  avoids browser host-tab throttling, and requires no inbound ports on player
  machines.
- Three.js provided the TPS camera system, low-poly rendering, bloom, and
  asset pipeline without a native build step.
- The arcade tank game fits a small custom physics simulation (ground
  heightfield, circle-vs-box collision, impulse recoil) that is deterministic,
  fast at 30 Hz on the server, and easy to test in Node.
- Playwright + installed Chrome enabled real two-browser verification.

**Environment used:**

| Item | Version |
| --- | --- |
| Node.js | v24.16.0 |
| npm | 11.13.0 |
| Chrome | Installed (used via Playwright `channel: 'chrome'`) |
| Playwright | 1.62.1 |
| three | ^0.178.0 |
| ws | ^8.18.0 |
| vite | ^7.3.6 |
| vitest | ^3.2.7 |
| esbuild | ^0.25.0 |

---

## 4. Architecture

```text
src/shared/   engine-agnostic authoritative simulation + config + arena
src/server/   WebSocket room server + static hosting
src/client/   Three.js renderer, cameras, HUD, audio, VFX, networking
tests/        vitest unit + integration tests
e2e/          Playwright two-browser tests
scripts/      headless full-round verification
public/       optional custom assets + manifest
```

### Shared simulation (`src/shared/`)

- `math.ts` — vector/angle/box math helpers
- `config.ts` — all tunables + six rematch modifiers
- `arena.ts` — zones, obstacles, ramps, barrels, spawn gates, truck route
- `types.ts` — shared state/input/event types
- `assetRegistry.ts` — semantic asset IDs + fallback registry
- `sim/match.ts` — authoritative match: tank, recoil, weapons, enemies,
  pickups, combo, JACKPOT, wipeout, pacing, modifiers
- `sim/results.ts` — grades, humorous titles

### Server (`src/server/`)

- `room.ts` — room lifecycle: create/join/rejoin, roles, ready/countdown,
  per-role validated inputs, sequence protection, stale-input clearing,
  snapshots, events, results, rematch, disconnect grace
- `index.ts` — HTTP static serving, WebSocket server, heartbeat, env config

### Client (`src/client/`)

- `main.ts` — flow wiring, screens, test hooks (`?test=1`)
- `net.ts` — WebSocket client with queue/reconnect
- `game.ts` — renderer, snapshot interpolation, entity rigs, PIP, quality
  adaptation
- `cameras.ts` — Driver free-look and Gunner aim TPS cameras with collision
- `input.ts` — pointer-lock keyboard/mouse input
- `hud.ts` — menus, HUD, results, rematch UI
- `audio.ts` — procedural Web Audio engine, SFX, music
- `vfx.ts` — pooled particles, flashes, rings, tracers
- `assets.ts` — semantic asset registry + generated low-poly models
- `arenaView.ts` — arena meshes + camera colliders
- `styles.css` — industrial UI theme

---

## 5. Implemented Systems (Design-Doc Coverage)

| Design requirement | Implementation |
| --- | --- |
| Browser delivery | Vite build, static + WS on one port, Chrome/Edge |
| Online co-op | Short join codes, creator=Driver, joiner=Gunner |
| Two independent TPS cameras | Free-look Driver cam; over-shoulder Gunner aim cam |
| Partner PIP | Bottom-right low-rate reconstructed feed with action label |
| Immediate hook | 2 Scrap Bugs pre-spawned; first kill < 5 s |
| Failure stays fun | Wipeout → 3 s respawn, shield, no round termination |
| Tank movement | Arcade accel/steer/grip, boost/drift, brace, auto-right, ramps |
| Cannon recoil | Impulse opposite barrel, spin, airborne launch, brace reduces |
| Machine gun | Hitscan, tracers, spread, unlimited ammo |
| Main cannon | Shell projectile, splash, 1.6 s cooldown, strong recoil |
| JACKPOT Shell | 1 s charge, huge blast, chain detonation, slow-mo, cooldown |
| Crew Combo | ×1–×5; above ×2 requires both roles' recent contribution |
| Crew Links | Brace-shot, scrap-loop, ram-finish bonuses |
| Scrap | Normal/heavy/JACKPOT, magnetism, at-speed bonus |
| Scrap Bug | Hunter with circle, separation, ram-able |
| Rammer | Approach → lock → telegraph → charge → recovery, rear weak |
| Gun Tower | Track → telegraph → burst fire → pause |
| Loot Truck | ~42 s outer-loop event, jackpot scrap shower, escape path |
| Round pacing | 0–5 s action, 20–40 s conflict, 40–55 s truck, 55–70 s guaranteed JACKPOT, 70–90 s chaos |
| Wipeout/recovery | 100 integrity, penalty −15 %, combo reset, 50 % meter kept |
| Results | Grade D–S, humorous titles, stats |
| Rematch modifiers | Double Barrel, Soap Tracks, Moon Yard, Volatile Inventory, Scrap Magnet, Overclocked |
| Arena | Recoil Bowl, Launch Ramp, Explosive Depot, Crusher Lane, Scrap Ring |
| UI/HUD | Role themes, integrity/timer/score/combo/JACKPOT/speed/prompts/crosshair |
| VFX | Muzzle flashes, tracers, explosions, smoke, shockwaves, scrap bursts |
| Audio | Engine, boost, drift, collision, MG, cannon, hits, deaths, pickups, telegraphs, siren, brace, wipeout, charge, release, UI, results, music |
| Asset swap | Semantic registry + `manifest.json` + fallbacks |
| Performance | Pooling, PIP degradation, FPS-based quality fallback |
| Practice | Local authoritative match, camera swap, pause menu, results |

---

## 6. Verification Evidence (Fresh Runs)

All verification was re-run against the final worktree on 2026-08-02.

### 6.1 Static and unit checks

```text
npx tsc --noEmit        → clean
npm test                → 5 files, 47/47 passed
npm run build           → dist/ + dist-server/ built cleanly
```

Unit/integration coverage includes:

- Room creation, join-code format/normalization, role assignment
- Full room lifecycle: ready → countdown → match → results → rematch
- Per-role input separation and sequence protection
- Authoritative recoil magnitude and brace reduction
- Cannon cooldown and duplicate-fire prevention
- Turret angle wrap and turn-rate limiting
- Stale-input clearing (per role) and regression test for the
  idle-Driver-clears-Gunner bug
- Enemy state transitions (Rammer, Gun Tower, Scrap Bug, Loot Truck)
- Pickup collection exactly once
- Combo rules (×2 cap without both roles, decay, ×5 ceiling)
- JACKPOT progression, guaranteed assistance, charge/fire/reset, cooldown
- Wipeout penalty, respawn shield, round timer, rematch reset
- Asset registry fallback for every required semantic ID
- Configuration validity for every modifier

### 6.2 Headless full-round loop (`npm run test:loop`)

```text
room V2X53H created; driver=driver
gunner joined
match started
round complete in 91.6s — score 3300, grade D, "The Brakes Were Optional",
  JACKPOT x2, combo x2
rematch ok (moonYard, fresh score 0, same room)
snapshots received by driver: 1353
[verify] PASS
```

### 6.3 Two-browser e2e (`npm run test:e2e`)

```text
✓ full-game.spec.ts — two browsers play a complete round, fire JACKPOT,
  see results, and rematch (1.7m)
✓ practice.spec.ts — practice mode runs a full local round with keyboard +
  mouse controls (1.5m)
2 passed (3.2m)
```

The e2e asserts, in real Chrome: crew creation, join code, countdown, match
start on both clients, canvas presence, Driver movement, kills and scrap
spawning, cannon-recoil velocity delta from real shots, Loot Truck spawn,
first-round JACKPOT, results on both clients, same-room rematch with a
modifier, and zero critical console errors.

### 6.4 Significant bugs found and fixed through verification

| Bug | Fix |
| --- | --- |
| Stale-input clearing wiped both roles, so an idle Driver canceled the Gunner's cannon | Per-role `clearDriverInput()` / `clearGunnerInput()` |
| Game constructor callback ran before the `game` variable was assigned | Callbacks attached after construction |
| Practice flag was reset by `teardownGame()` inside `startPractice()` | Flag set after teardown |
| Client frame timestamp never updated → practice sim ran ~3× wall speed and FPS read wrong | `lastFpsT = now` per frame |
| Headless pointer-lock failure auto-paused the game | Pause only from real lock transitions; ☰/Esc still open menu |
| Missing `#hud` id broke HUD visibility | Container id added |
| 404 console noise from optional manifest fetch | Empty `manifest.json` shipped |
| JACKPOT could spam-fire repeatedly during final chaos | 12 s JACKPOT cooldown (2–3 climaxes per round) |
| Recoil e2e was flaky under enemy pressure | Passive detector watching real auto-Gunner shots |

---

## 7. Model Usage

This goal was executed by the **Codex agent** in this coding harness
(GPT-5-based model, per the agent system configuration), working in **Default
collaboration mode**.

Notes on the model naming:

- The repository's one-shot prompt document
  (`DEEPSEEK_FLASH_V4_CODEX_ONESHOT_PROMPT.md`) names **DeepSeek Flash v4**
  as its intended target model in its header. That document is the task
  specification; the actual execution in this session ran on the Codex agent
  (GPT-5 based).
- **No model overrides were used.** No subagents were spawned with alternate
  models or reasoning-effort overrides.
- **Reasoning effort:** inherited default; no explicit override was applied.
- The final build's correctness rests on the verification evidence in
  Section 6, not on any model-identity claim.

---

## 8. Skill Usage

**Skills used: none.**

The environment exposed five skills:

| Skill | Relevance to this goal |
| --- | --- |
| `imagegen` | Not used — art was generated as code-native low-poly Three.js geometry, which the skill itself excludes ("do not use when the task is better handled by… code-native assets") |
| `openai-docs` | Not used — no OpenAI product/API questions or docs needed |
| `plugin-creator` | Not used — no Codex plugin was being built |
| `skill-creator` | Not used — no new skill was being authored |
| `skill-installer` | Not used — no skill installation was requested |

Because no available skill covered full-stack browser game development, all
work was performed directly by the agent using its standard coding tools.

---

## 9. Agents and Subagents

**Subagents spawned: 0.**

The multi-agent guidance in this environment disabled proactive delegation;
no user instruction, `AGENTS.md`, or skill required parallel agents, so the
entire goal was executed by the single root agent:

| Agent | Role | Work |
| --- | --- | --- |
| Root agent (Codex) | Primary agent | All planning, implementation, testing, debugging, documentation, verification |

The environment exposes 4 concurrency slots; only 1 was used. No agent
messages, forks, or follow-up tasks were created.

---

## 10. Tool Usage

| Tool | Purpose | Volume/notes |
| --- | --- | --- |
| `exec_command` | Shell: installs, builds, tests, servers, probes, ws clients, curl checks | ~80+ invocations |
| `apply_patch` | All repository file edits (add/update/delete) | 50+ patches |
| `update_plan` | Maintained the visible build plan | Used at start and checkpoints |
| `write_stdin` | Polled long-running server/test sessions | Server PTY sessions |
| `vitest` | 47 unit/integration tests | 5 test files |
| `playwright` | Two-browser and practice e2e | 2 specs, real Chrome |
| `ws` client scripts | Headless two-client full-round verification | `scripts/verify-full-round.mjs` |
| `get_goal` / `update_goal` | Goal accounting and completion | Final status: complete |

Notably **not** used: `spawn_agent`, `followup_task`, `send_message`,
`search`/`open_page` (no web research needed), and image generation tools.

---

## 11. Token and Time Usage

Final accounting from the goal system at completion:

| Metric | Value |
| --- | --- |
| Tokens used | **606,308** |
| Token budget | None set |
| Time used | **5,303 seconds (~1 hour 28 minutes)** |
| Goal status | complete |

The goal had no explicit token budget, so no budget-utilization percentage is
reported.

---

## 12. Deliverables

### Documentation

- `README.md` — overview, quick start, controls, commands, layout
- `DEPLOYMENT.md` — Render/Railway/Fly/Docker + static-host path, env vars
- `ASSET_GUIDE.md` — semantic IDs, GLB conventions, manifest format
- `SMOKE_TEST.md` — manual checklist (two tabs, two networks, practice, etc.)
- `BUILD_PLAN.md` / `BUILD_STATUS.md` — plan and verification status
- `DECISIONS.md` — stack rationale
- `FINAL_REPORT.md` — this report
- `.env.example` — server configuration template
- `Dockerfile` — containerized deployment

### Code

- `src/shared/` — authoritative simulation (11 files)
- `src/server/` — rooms + transport (2 files)
- `src/client/` — renderer, UI, audio, VFX, networking (13 files)
- `tests/` — 5 vitest suites (47 tests)
- `e2e/` — 2 Playwright specs
- `scripts/verify-full-round.mjs` — headless full-round verification
- `public/assets/` — empty manifest + example manifest + guide

### Asset replacement

Custom models/VFX/UI can be added via `public/assets/manifest.json` without
touching gameplay code. Every required semantic ID has a generated low-poly
fallback. See `ASSET_GUIDE.md`.

---

## 13. Deployment Summary

The production artifact is a single Node process:

```bash
npm install
npm run build
npm run server
```

Opens at `http://localhost:8080`. For public hosting, the included
`Dockerfile` builds and runs the same service; Render/Railway/Fly provide
HTTPS, and the client automatically uses `wss://` on the same origin.

---

## 14. Limitations and Scope Cuts

Consistent with the design document's scope-cut list, the following were
intentionally not added: public matchmaking lobby, accounts, leaderboards,
voice/text chat, cosmetics, progression, mobile/controller support,
spectator mode, replays, host migration, and multiple arenas.

Remaining technical limitations:

- Audio is procedural Web Audio synthesis; custom audio files require a small
  extension to `AudioManager` (named-event registry is in place).
- The asset manifest currently hot-swaps models, VFX specs, and UI theme
  colors; full audio-file replacement is documented as an extension point.
- Reconnect grace is session-based (10 s) and is exercised via the retry
  flow, not a full automated reconnect test.

---

## 15. How to Reproduce the Verification

```bash
npm install
npm test                 # 47 unit/integration tests
npm run build            # production bundles
npm run server           # http://localhost:8080
npm run test:loop        # headless 90-second round + rematch (needs server)
npm run test:e2e         # two Chrome browsers, full round + practice
```

Manual play: open `http://localhost:8080` in two browsers, create/join with
the six-character code, and follow `SMOKE_TEST.md`.
