# Codex Prompt — Implement Lobby V2
## Main Menu nickname settings, lobby chat, Driver/Gunner seat selection, Ready validation, and reconnect-safe identity

**Repository:** `mwl313/RecoilCrewDS`  
**Implementation base:** latest current default branch  
**Binding design:**

```text
docs/multiplayer09/LOBBY_V2_AND_EXTENDED_MULTIPLAYER_DESIGN.md
```

**Prompt path:**

```text
docs/multiplayer09/CODEX_PROMPT_IMPLEMENT_LOBBY_V2.md
```

---

# 0. Critical scope boundary

Implement **Lobby V2 only**.

Do not implement Extended Multiplayer.

The design document contains a long-term architecture for arbitrary combinations of solo tanks and split-control tanks. That material is reference-only and explicitly deferred.

This task must retain:

```text
2 connected match players
1 authoritative tank
1 Driver
1 Gunner
existing Shared Tank MatchRuntime
```

Do not implement or begin:

- More than two active match players
- Multiple authoritative player tanks
- `TankActor` simulation
- `TankId` migration of gameplay systems
- Combined Driver/Gunner controls over the network
- Twin Tanks
- Mixed tank crews
- Friendly allied cannon impulse
- Per-tank builds
- Independent non-pausing progression
- Multi-source player flow fields
- Multi-tank enemy targeting
- Multi-tank snapshots
- Multi-tank prediction
- Public matchmaking
- Matchmaking queues
- Spectators
- Voice chat
- Persistent accounts

Future-compatible lobby types are allowed only when they do not alter current match behavior.

---

# 1. Mission

Replace the crude fixed pre-match experience with a polished, authoritative Lobby V2.

The implementation must provide:

- Main Menu Settings button
- Persistent local nickname
- Curated default nickname pool
- Default format `<BaseNickname><NN>`
- Exactly two zero-padded decimal digits
- Nickname Randomize, Save, and Cancel
- Main Menu `PLAYING AS` display
- Nickname sent on Create and Join
- Server nickname validation
- Generic lobby player identity
- Stable `playerId`
- Host identity
- Visible player list
- Local `YOU` indicator
- Driver/Gunner seat selection
- Authoritative seat conflict handling
- Ready and Unready
- Ready invalidation
- Countdown start and cancellation
- Room-local chat
- Chat rate limiting
- Reconnect with identity and seat restoration
- Host migration after grace expiry
- Revisioned full lobby snapshots
- Existing Shared Tank start adapter
- Existing match, combat, progression, animation, and netcode regression safety

---

# 2. Read and audit first

Read:

```text
docs/multiplayer09/LOBBY_V2_AND_EXTENDED_MULTIPLAYER_DESIGN.md
```

Inspect at minimum:

```text
src/server/room.ts
src/server/index.ts
src/server/

src/shared/net/protocol.ts
src/shared/types.ts
src/shared/session/
src/shared/content/schemas/mode.ts

src/client/main.ts
src/client/net.ts
src/client/hud.ts
src/client/styles.css

src/client/presentation/flowTypes.ts
src/client/presentation/sceneFlowPresenter.ts
src/client/presentation/actionRegistry.ts
src/client/presentation/sceneRuntime.ts
src/client/presentation/uiComponents.ts
src/client/presentation/

content/scenes/mainMenu.json
content/scenes/createCrew.json
content/scenes/joinCrew.json
content/scenes/readyLobby.json
content/scenes/countdown.json
content/scene-flows/
content/themes/

scripts/generate-presentation-content.ts
src/shared/presentation/schemas.ts
src/generated/presentationContent.generated.ts

tests/
e2e/
package.json
```

Determine exact current:

- Room shape
- Client/session/reconnect identity
- Create and Join protocol
- Driver/Gunner assignment
- Ready messages
- Lobby broadcasts
- Countdown
- Disconnect grace
- Rematch
- Main Menu scene
- Existing scene-flow filename
- Action allowlist
- UI input component support
- How scene contexts update cached scenes
- Existing localStorage use, if any
- Existing two-browser E2E harness
- Current branch and baseline test status

Do not assume filenames from this prompt when the current checkout differs.

---

# 3. Required initial documents

Create before implementation:

```text
docs/multiplayer09/LOBBY09_CODE_AUDIT.md
docs/multiplayer09/LOBBY09_IMPLEMENTATION_PLAN.md
docs/multiplayer09/LOBBY09_BASELINE_REPORT.md
docs/multiplayer09/LOBBY09_PROTOCOL_CONTRACT.md
docs/multiplayer09/LOBBY09_NICKNAME_CONTRACT.md
```

Then continue coding.

Do not stop after documentation.

---

# 4. Baseline gates

Inspect `package.json`, then run every applicable existing gate.

At minimum:

```bash
npx tsc --noEmit

npm run generate:presentation-content
npm run generate:content-pack
npm run generate:map-profiles

npm run build
npm test

npm run test:demo
npm run test:coreloop
npm run test:horde
npm run test:presentation
npm run test:animation
npm run test:progression
npm run test:netcode
npm run test:maplab
```

Run existing E2E suites where supported.

Record real command output.

Do not update golden files to conceal unrelated regressions.

---

# 5. Milestone 1 — Shared nickname foundation

Create focused modules.

Recommended:

```text
src/shared/lobby/
├── lobbyTypes.ts
├── lobbyProtocol.ts
├── lobbyValidation.ts
├── lobbyEligibility.ts
├── nicknamePool.ts
└── nicknameValidation.ts

src/client/settings/
├── playerSettingsStore.ts
├── playerSettingsController.ts
└── playerSettingsViewModel.ts
```

Adapt to repository conventions.

## 5.1 Curated nickname pool

Centralize this pool:

```text
TurboToad
ScrapFox
IronMoth
DustBunny
RocketMole
SteelOtter
CannonCrow
DriftBadger
RumbleBee
TreadGecko
BoltBoar
CopperCat
GearGator
WeldWolf
RecoilRaven
DashDingo
JumpJackal
ShellShark
MagnetMouse
ArmorApe
HavocHare
BlastBat
CraterCrab
RivetRat
TorqueTiger
SprocketSeal
BunkerBear
ChromeCobra
DieselDuck
EmberEel
FlakFalcon
GritGoat
HammerHawk
JunkJaguar
KineticKoala
LuckyLynx
MortarMantis
NitroNewt
OverdriveOwl
PistonPanda
QuakeQuail
RampRhino
RicochetRook
RustRabbit
ShrapnelSheep
SiegeSlug
SparkSkunk
TracerTurtle
TurbineYak
VectorViper
VoltageVulture
WardenWombat
WreckWeasel
ZippyZebra
```

Do not duplicate it in client and server files.

## 5.2 Default nickname generator

Required API:

```ts
export function generateDefaultNickname(
  randomInt?: (exclusiveMax: number) => number,
): string;
```

Required output:

```text
<Base><NN>
```

Examples:

```text
TurboToad07
IronMoth42
ZippyZebra00
```

Rules:

- Base is from the pool.
- Number is `0–99`.
- Number is always two digits.
- No automatic spaces.
- Tests inject deterministic random values.
- Production may use `crypto.getRandomValues`, with non-security fallback.

## 5.3 Shared validation

One shared validator used by client and server.

Rules:

```text
1–20 visible Unicode code points
trim outer whitespace
normalize repeated internal whitespace
reject line breaks
reject control characters
reject empty-after-normalization
```

Return normalized value or structured reason.

Do not use nickname as authorization or reconnect identity.

Recommended commit:

```text
lobby09: add nickname generation and validation
```

---

# 6. Milestone 2 — Local player settings

Storage key:

```text
recoilCrew.playerSettings.v1
```

Stored data:

```ts
interface ClientPlayerSettingsV1 {
  version: 1;
  nickname: string;
}
```

Required behavior:

```text
No value
→ generate default
→ save once
→ reuse across reload

Corrupt value
→ recover with generated default

Invalid nickname
→ recover with generated default

Storage unavailable
→ use in-memory settings
→ game still works
```

Settings editing:

```text
Open Settings
→ load saved nickname into draft

Randomize
→ update draft only

Save
→ validate
→ persist
→ update Main Menu PLAYING AS
→ return to Main Menu

Cancel
→ discard draft
→ preserve saved nickname
→ return to Main Menu
```

Do not save on every keystroke.

Recommended commit:

```text
lobby09: add persistent player settings
```

---

# 7. Milestone 3 — Content-driven Settings scene

The current UI uses generated presentation content.

Implement Settings through that system.

Add:

```text
content/scenes/settings.json
```

Update the actual scene-flow JSON.

Add flow state:

```ts
"settings"
```

Update:

```text
src/client/presentation/flowTypes.ts
```

Handlers:

```ts
onOpenSettings(): void;
onSaveSettings(nickname: string): void;
onRandomizeNickname(): void;
onCancelSettings(): void;
```

Actions:

```text
app.openSettings
app.saveSettings
app.randomizeNickname
app.cancelSettings
```

Update the shared presentation action allowlist/schema.

## Main Menu additions

Update:

```text
content/scenes/mainMenu.json
```

Add:

```text
SETTINGS button
PLAYING AS: <nickname>
```

Main Menu context:

```ts
{
  currentNickname: string;
}
```

## Settings scene

Required elements:

```text
PLAYER NICKNAME label
nickname text input
RANDOMIZE button
SAVE button
CANCEL/BACK button
validation/error text
small explanation that nickname appears in the lobby
```

Use existing scene UI components where possible.

When current components cannot support a text input cleanly, add one reusable generic input component rather than a nickname-specific hardcoded DOM path.

Regenerate presentation content.

Recommended commit:

```text
lobby09: add nickname settings scene
```

---

# 8. Milestone 4 — Generic lobby state

Replace the pre-game UI's dependence on fixed ready booleans with a generic lobby state.

Server-safe internal player:

```ts
interface LobbyPlayerInternal {
  playerId: string;
  sessionId: string;
  displayName: string;
  connected: boolean;
  reconnectDeadlineWallMs: number | null;
  seat: "driver" | "gunner" | null;
  ready: boolean;
  joinedSequence: number;
}
```

Client player:

```ts
interface LobbyPlayerView {
  playerId: string;
  displayName: string;
  connected: boolean;
  reconnecting: boolean;
  seat: "driver" | "gunner" | null;
  ready: boolean;
}
```

Lobby state:

```ts
interface ClientLobbyState {
  revision: number;
  roomCode: string;
  phase: "lobby" | "countdown";
  hostPlayerId: string;
  players: LobbyPlayerView[];
  settings: {
    gameplayType: "sharedTank";
    modeId: string;
  };
  countdownEndsAtWallMs: number | null;
  startEligibility: {
    eligible: boolean;
    reason:
      | "eligible"
      | "waiting_for_player"
      | "invalid_seats"
      | "player_not_ready"
      | "player_disconnected"
      | "content_unavailable";
  };
}
```

Requirements:

- Exactly two active match players remain supported.
- `gameplayType` accepts only `sharedTank`.
- No multi-tank setting is accepted.
- Full state is revisioned.
- Full lobby state is sent after every accepted mutation.
- Private `sessionId` is not exposed in player lists.
- Existing reconnect still works.

Recommended commit:

```text
lobby09: add revisioned lobby player state
```

---

# 9. Milestone 5 — Create and Join with nickname

Client:

```text
Create
→ load saved nickname
→ send create + displayName

Join
→ load saved nickname
→ send join + code + displayName
```

Server:

- Validate and normalize display name.
- Reject invalid names with user-facing reason.
- Allocate stable `playerId`.
- Attach display name to room player.
- Return `playerId` and `sessionId`.
- Do not use display name as the map key.
- Duplicate names are allowed.

Reconnect:

- Resolve by `sessionId`.
- Restore existing `playerId`.
- Restore server-side display name.
- Do not replace active-room name from local settings during reconnect.

Recommended protocol:

```ts
{ t: "create"; displayName: string }
{ t: "join"; code: string; displayName: string }
```

Recommended commit:

```text
lobby09: attach nickname to room identity
```

---

# 10. Milestone 6 — Unified lobby client screen

Refactor application flow from separate `create` and `ready` ownership toward one lobby view.

Target app flow:

```ts
type AppFlow =
  | "boot"
  | "main"
  | "settings"
  | "join"
  | "lobby"
  | "countdown"
  | "game"
  | "results"
  | "error";
```

A small Join-code entry screen may remain.

After successful Create or Join, both players use the same Lobby V2 screen.

The lobby displays:

- Room code
- Copy button
- Player cards
- Nicknames
- Host badge
- `YOU` badge
- Connected/reconnecting
- Driver/Gunner seat
- Ready state
- Chat
- Eligibility explanation
- Ready/Unready
- Leave

## YOU indicator

Determine local player using:

```ts
player.playerId === localPlayerId
```

Never use:

- Nickname equality
- Seat
- Host
- Array position

Show both visible text and visual treatment.

Recommended commit:

```text
lobby09: add unified lobby view and local identity
```

---

# 11. Milestone 7 — Driver/Gunner seat selection

Current first-release composition:

```text
1 Driver
1 Gunner
```

Server-owned requests:

```ts
{
  t: "lobbySelectSeat";
  seat: "driver" | "gunner" | null;
  lobbyRevision: number;
}
```

Validation:

- Player belongs to room.
- Room phase is Lobby.
- Seat value is recognized.
- Seat is not occupied by another active player.
- Request is not dangerously stale.
- Exactly two-player capacity remains enforced.

Switching uses seat release; do not build seat-swap negotiation.

Every accepted seat change clears all Ready states.

No automatic permanent Driver assignment on Create.

A suggested seat is acceptable, but players must be able to choose before Ready.

Recommended commit:

```text
lobby09: add authoritative crew seat selection
```

---

# 12. Milestone 8 — Ready and countdown reform

Client request:

```ts
{
  t: "lobbyReadySet";
  ready: boolean;
  lobbyRevision: number;
}
```

Ready `true` requires:

```text
connected
seat selected
valid one-Driver/one-Gunner composition
room phase lobby
```

Start requires:

```text
two connected players
one Driver
one Gunner
both Ready
valid content
```

Countdown:

- Server owns wall-clock deadline.
- Broadcast full lobby state.
- Existing countdown message may remain as presentation compatibility.

Cancel countdown when:

- Accepted Unready
- Disconnect
- Leave
- Seat invalidation
- Gameplay-affecting setting change
- Content validation failure

Changing seat clears both players' Ready.

Recommended commit:

```text
lobby09: harden ready and countdown state
```

---

# 13. Milestone 9 — Lobby chat

Client request:

```ts
{
  t: "lobbyChatSend";
  text: string;
}
```

Server output:

```ts
interface LobbyChatMessage {
  messageId: number;
  playerId: string;
  displayName: string;
  text: string;
  sentAtWallMs: number;
}
```

Rules:

```text
Room-local
Lobby/countdown only
200 Unicode code points maximum
30 retained messages
trim and normalize
reject empty
reject control characters
rate limit
plain text only
```

Suggested rate limit:

```text
burst 4
refill 1 per 2 seconds
```

Render with `textContent`.

The client never provides sender identity or authoritative timestamp.

Include bounded history on Join/Reconnect.

Recommended commit:

```text
lobby09: add safe room-local lobby chat
```

---

# 14. Milestone 10 — Reconnect and host migration

Lobby disconnect:

- Mark disconnected/reconnecting.
- Reserve seat during grace.
- Set Ready false.
- Cancel countdown.
- Preserve nickname.
- Preserve Host during grace.

Reconnect:

- Restore same player ID.
- Restore nickname.
- Restore seat.
- Keep Ready false.
- Send full lobby state and chat history.

Grace expiry:

- Remove player.
- Free seat.
- Clear Ready.
- Migrate Host to connected player with lowest `joinedSequence`.

Do not alter active-match reconnect semantics beyond shared identity plumbing required by this lobby.

Recommended commit:

```text
lobby09: restore lobby identity across reconnect
```

---

# 15. Shared Tank start adapter

At valid countdown completion, resolve current generic Lobby players into existing match slots.

```ts
interface SharedTankStartAssignment {
  driver: Client;
  gunner: Client;
}
```

Resolver:

```text
player with Driver seat
→ existing Driver slot

player with Gunner seat
→ existing Gunner slot
```

Do not modify MatchRuntime to support multiple tanks.

Do not change:

```text
MatchState.tank
MatchState.turret
one Driver input path
one Gunner input path
```

The match starts exactly as before after the adapter completes.

Recommended commit:

```text
lobby09: bridge Lobby V2 to shared tank match
```

---

# 16. Main Menu and lobby UX requirements

## Main Menu

Show:

```text
RECOIL CREW
PLAYING AS: TurboToad07

CREATE CREW
JOIN CREW
SINGLE PLAYER
SETTINGS
HOW TO PLAY
```

## Settings

Show:

```text
PLAYER NICKNAME
<input>

RANDOMIZE
SAVE
CANCEL
```

## Lobby player card

Local:

```text
[HOST] TurboToad07 [YOU]
DRIVER
READY
```

Remote:

```text
ScrapFox42
GUNNER
NOT READY
```

## Start explanation

Show exact current blocker:

```text
Waiting for another player
Choose different crew roles
Choose a role
ScrapFox42 is not Ready
ScrapFox42 is reconnecting
Crew Ready
```

Do not expose internal IDs as primary labels.

---

# 17. Protocol compatibility

Increment protocol version deliberately when wire shapes change.

During migration, either:

- Update all client/server/tests atomically, or
- Support a short internal compatibility adapter if tests require it.

Do not leave two competing lobby sources of truth.

The new full `lobbyState` becomes authoritative.

Legacy `driverReady/gunnerReady` messages may be removed after all callers migrate, or derived temporarily from lobby state.

Document the final decision.

---

# 18. Tests

Create focused test suites.

Recommended:

```text
tests/lobby09/nicknamePool.test.ts
tests/lobby09/playerSettingsStore.test.ts
tests/lobby09/nicknameValidation.test.ts
tests/lobby09/lobbyState.test.ts
tests/lobby09/lobbyEligibility.test.ts
tests/lobby09/lobbySeats.test.ts
tests/lobby09/lobbyReady.test.ts
tests/lobby09/lobbyChat.test.ts
tests/lobby09/lobbyReconnect.test.ts
tests/lobby09/sharedTankStartAdapter.test.ts
tests/lobby09/lobbyProtocol.test.ts
tests/lobby09/lobbyPresentation.test.ts
```

## Nickname contracts

- Generated base is from pool.
- Suffix is exactly two digits.
- `0` becomes `00`.
- `7` becomes `07`.
- `99` remains `99`.
- First launch persists.
- Reload reuses.
- Randomize changes draft only.
- Cancel restores.
- Save normalizes.
- Corrupt JSON recovers.
- Storage failure is nonfatal.
- Unicode limits work.
- Server rejects invalid.
- Duplicate names accepted.

## Lobby contracts

- Create creates Host.
- Join creates second player.
- Client sees own `playerId`.
- YOU appears only on own card.
- Same nickname does not confuse YOU.
- Seat conflict rejected.
- Seat release works.
- Seat change clears Ready.
- Ready requires seat.
- Both Ready starts countdown.
- Unready cancels countdown.
- Disconnect cancels countdown.
- Reconnect restores seat and nickname.
- Reconnect does not restore Ready.
- Host migrates after grace.
- Full state revision increases.
- Chat stays inside room.
- Chat rate limit works.
- Chat history bound works.
- Chat renders safely.
- Start adapter maps chosen seats correctly.
- No unsupported multi-tank values accepted.

---

# 19. E2E

Add two-browser E2E scenarios.

Recommended:

```text
e2e/lobby-nickname-settings.spec.ts
e2e/lobby-seat-ready.spec.ts
e2e/lobby-chat.spec.ts
e2e/lobby-reconnect.spec.ts
```

Scenarios:

## Settings

```text
Open Settings
Randomize
Cancel
Confirm old name remains
Open again
Set custom name
Save
Reload
Confirm PLAYING AS persists
```

## Create and Join

```text
Browser A nickname TurboToad07
Browser B nickname ScrapFox42
A creates
B joins
Both see both names
A sees YOU only on A card
B sees YOU only on B card
```

## Duplicate names

```text
Both choose TurboToad07
Join same room
Each still identifies self through YOU
```

## Seats and Ready

```text
Both request Driver
One rejected
A Driver
B Gunner
A Ready
B Ready
Countdown
B Unready
Countdown cancels
Ready again
Existing Shared Tank match starts
```

## Chat

```text
Exchange messages
HTML-like message renders as text
Rate limit rejection
Reconnect restores bounded history
```

## Reconnect

```text
Disconnect B during lobby
A sees reconnecting
Countdown cancelled
B rejoins
Nickname and Gunner seat restored
Ready remains false
```

---

# 20. Package scripts

Add scripts only when files exist.

Recommended:

```json
{
  "scripts": {
    "test:lobby": "vitest run tests/lobby09",
    "test:lobby:e2e": "playwright test e2e/lobby-nickname-settings.spec.ts e2e/lobby-seat-ready.spec.ts e2e/lobby-chat.spec.ts e2e/lobby-reconnect.spec.ts"
  }
}
```

Use actual repository conventions.

---

# 21. Required documentation

Create:

```text
docs/multiplayer09/LOBBY09_IMPLEMENTATION_REPORT.md
docs/multiplayer09/LOBBY09_NICKNAME_AND_SETTINGS_GUIDE.md
docs/multiplayer09/LOBBY09_PROTOCOL_GUIDE.md
docs/multiplayer09/LOBBY09_RECONNECT_GUIDE.md
docs/multiplayer09/LOBBY09_MANUAL_TEST_GUIDE.md
```

Update relevant:

```text
README.md
docs/README.md
docs/guides/ARCHITECTURE.md
docs/guides/NETWORK_RULES.md
docs/guides/SMOKE_TEST.md
docs/planning/BUILD_STATUS.md
```

The implementation report must explicitly state that Extended Multiplayer was not implemented.

---

# 22. Regression invariants

Preserve:

## Match architecture

```text
one shared tank
one Driver
one Gunner
```

## Combat

- Charge Shot unchanged
- Dash unchanged
- ROADKILL unchanged
- Cannon unchanged
- Friendly player-tank cannon physics not added

## Progression

- Shared progression behavior unchanged
- Selection pause unchanged
- Role-specific offers unchanged
- Progression hardening unchanged

## Coreloop and Horde

- Stage behavior unchanged
- Enemy targeting remains single-tank
- No multi-source flow field

## Animation

- Animation 07 unchanged

## Single Player

- Combined local controls unchanged
- Start and restart unchanged

## Networking

- Existing match input, action, snapshot, reconnect, and rematch remain functional

---

# 23. Required final gates

Run all applicable commands.

At minimum:

```bash
npx tsc --noEmit

npm run generate:presentation-content
npm run generate:content-pack
npm run generate:map-profiles

npm run build
npm test

npm run test:lobby
npm run test:lobby:e2e

npm run test:demo
npm run test:coreloop
npm run test:horde
npm run test:presentation
npm run test:animation
npm run test:progression
npm run test:netcode
npm run test:maplab

npm run test:e2e
```

Report actual output.

Do not hide failures.

---

# 24. Manual verification

Verify with two real browser windows.

## Identity

- New browser gets generated BaseNN nickname.
- Name persists after reload.
- Settings Save/Cancel/Randomize work.
- Main Menu shows active nickname.
- Each client sees YOU only on itself.

## Lobby

- Create and Join.
- Seat selection.
- Seat conflict.
- Ready/Unready.
- Countdown cancellation.
- Chat.
- Reconnect.
- Host migration where testable.
- Leave and recreate.

## Match

- Selected Driver moves shared tank.
- Selected Gunner aims and fires.
- Charge Shot works exactly as before.
- Progression works exactly as before.
- Results and rematch work.

---

# 25. Recommended commit sequence

```text
lobby09: add audit and baseline
lobby09: add nickname generation and validation
lobby09: add persistent player settings
lobby09: add nickname settings scene
lobby09: add revisioned lobby player state
lobby09: attach nickname to room identity
lobby09: add unified lobby view and local identity
lobby09: add authoritative crew seat selection
lobby09: harden ready and countdown state
lobby09: add safe room-local lobby chat
lobby09: restore lobby identity across reconnect
lobby09: bridge Lobby V2 to shared tank match
lobby09: add lobby tests and reports
```

Do not create one giant commit.

---

# 26. Completion gate

Complete only when all are true:

1. Main Menu has Settings.
2. Main Menu shows PLAYING AS.
3. First launch generates a curated base plus two digits.
4. Suffix is always zero-padded.
5. Nickname persists across reload.
6. Randomize previews but does not automatically save.
7. Save validates and persists.
8. Cancel preserves previous nickname.
9. Storage corruption recovers.
10. Storage failure is nonfatal.
11. Create sends nickname.
12. Join sends nickname.
13. Server validates nickname.
14. Nickname is never authoritative identity.
15. Duplicate nicknames work.
16. Stable player IDs exist.
17. Creator is Host.
18. Lobby lists both players.
19. Local card shows YOU based on player ID.
20. Player can select Driver or Gunner.
21. Server rejects occupied seat.
22. Exactly one Driver and one Gunner are required.
23. Ready can be toggled.
24. Seat changes clear Ready.
25. Both valid Ready players start countdown.
26. Unready cancels countdown.
27. Disconnect cancels countdown.
28. Reconnect restores nickname and seat.
29. Reconnect does not restore Ready.
30. Host migration works after grace expiry.
31. Lobby chat works.
32. Chat is bounded.
33. Chat is rate-limited.
34. Chat is safely rendered.
35. Full lobby state is revisioned.
36. Current Shared Tank match starts through an adapter.
37. Existing Driver input works.
38. Existing Gunner input works.
39. Existing Single Player works.
40. Existing combat works.
41. Existing progression works.
42. Existing horde/core loop works.
43. Existing animation works.
44. Existing rematch works.
45. Two-browser tests pass.
46. Extended Multiplayer is not implemented.
47. No second player tank exists.
48. No friendly allied cannon physics exists.
49. No independent live progression exists.
50. Implementation report contains real command results.

Final invariant:

> Lobby V2 adds persistent nickname settings, clear local identity, chat, explicit Driver/Gunner seat selection, authoritative readiness, and reconnect-safe lobby state while continuing to launch the existing two-player, one-tank Shared Tank game. Extended Multiplayer remains documentation only.
