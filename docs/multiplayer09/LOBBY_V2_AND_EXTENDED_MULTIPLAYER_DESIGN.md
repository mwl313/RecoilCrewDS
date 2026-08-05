# Recoil Crew — Lobby V2 and Extended Multiplayer Design
## First-release lobby reform with a deferred arbitrary crew-and-tank composition architecture

**Document version:** 1.1  
**Date:** 2026-08-05  
**Repository:** `mwl313/RecoilCrewDS`  
**Recommended repository path:** `docs/multiplayer09/LOBBY_V2_AND_EXTENDED_MULTIPLAYER_DESIGN.md`  
**Status:**  
- **Lobby V2:** Approved for the current release build  
- **Extended Multiplayer:** Design only; explicitly deferred  
- **Multi-Tank Simulation:** Not approved for current implementation  

---

# 0. Executive decision

Recoil Crew will pursue two related but separately scoped multiplayer tracks.

## Track A — Lobby V2 for the current build

Implement now:

```text
Main Menu
→ Settings
→ choose or randomize persistent nickname
→ room creation and join
→ visible player list
→ local player marked with YOU indicator
→ Driver/Gunner seat selection
→ room-local text chat
→ authoritative Ready buttons
→ seat or gameplay-setting changes clear Ready
→ countdown
→ existing Shared Tank match
```

The first-release lobby remains limited to the currently supported match structure:

```text
2 players
1 shared tank
1 Driver
1 Gunner
```

The lobby architecture should be generic enough to represent players, seats, room settings, and assignments without hardcoding the user interface around `room.driver` and `room.gunner`.

However, the current release must not expose buttons for unavailable multi-tank configurations.

## Track B — Extended Multiplayer for a later release

Preserve the following long-term design:

```text
More than two players
Any combination of:
- one-player tanks
- two-player split-control tanks

The lobby defines:
- how many tanks exist
- which players share a tank
- who is Driver
- who is Gunner
- which players control a complete tank alone
```

Example with three players:

```text
Option A
Player 1 → Solo Tank A
Player 2 → Solo Tank B
Player 3 → Solo Tank C

Option B
Player 1 → Driver of Shared Tank A
Player 2 → Gunner of Shared Tank A
Player 3 → Solo Tank B
```

This extended design is feasible but requires a major authoritative simulation refactor. It is deliberately kept on the back burner until the first release is complete.

---

# 1. Design goals

## 1.1 Lobby V2 goals

The current lobby should feel like a real cooperative staging area rather than a crude room-code waiting screen.

It must allow players to:

- Open Settings from the Main Menu
- See and edit their persistent nickname
- Randomize a curated default nickname
- See which lobby player card is their own
- See who is in the room
- Set or receive a display name
- Chat before the match
- Select Driver or Gunner
- See seat conflicts clearly
- See who is connected
- See who is Ready
- Unready themselves
- Understand why the match cannot start
- Reconnect without losing identity or seat
- Start only when the server confirms a valid crew

The lobby must remain lightweight and suitable for browser play.

## 1.2 Extended Multiplayer goals

The deferred architecture should eventually allow:

- More than two connected players
- Multiple player-controlled tanks
- One or two players assigned to each tank
- Mixed lobby compositions
- Solo combined-control tanks
- Split Driver/Gunner tanks
- Friendly cannon impulse between allied tanks
- Shared PvE enemies and stage
- Per-tank or per-player progression
- Independent, non-pausing upgrade selection
- Reconnect to the correct tank and seat
- Content-driven player and tank limits

## 1.3 Scope-control goal

The lobby implementation must not accidentally begin the multi-tank simulation refactor.

The current milestone may introduce generic lobby data types and assignment concepts, but the match-start adapter must still produce exactly:

```text
one Driver client
one Gunner client
one shared MatchRuntime tank
```

---

# 2. Current repository assessment

The current server already provides useful foundations:

```text
Room phases:
- lobby
- countdown
- running
- results

Existing behavior:
- private room code
- create
- join
- reconnect by session ID
- Driver Ready
- Gunner Ready
- countdown
- rematch vote
- peer connected state
```

The current limitation is that room ownership and crew identity are represented through fixed fields:

```ts
room.driver
room.gunner

room.ready.driver
room.ready.gunner
```

Room creation automatically assigns the creator as Driver.

The second player automatically becomes Gunner.

Input routing is also fixed:

```text
Driver socket
→ Driver movement input

Gunner socket
→ Gunner aim and weapon actions
```

The authoritative match state currently contains one:

```text
tank
turret
build
team progression state
```

Therefore:

- Lobby V2 can be implemented without replacing the current match.
- Extended Multiplayer cannot be implemented by spawning extra visual tanks.
- A later multi-tank milestone must generalize the authoritative simulation.

---

# 3. Feasibility and difficulty

| Feature | Feasibility | Estimated difficulty |
|---|---|---:|
| Player list and display names | High | 2/10 |
| Lobby chat | High | 3/10 |
| Ready/unready system improvement | High | 2/10 |
| Driver/Gunner seat selection | High | 4/10 |
| Host-controlled room settings | High | 4/10 |
| Reconnect with lobby identity | High | 4/10 |
| Future-compatible assignment model | High | 5/10 |
| Two independently controlled tanks | High | 8/10 |
| Arbitrary mixed one/two-player tank crews | High | 9/10 |
| Friendly allied cannon impulse | High after multi-tank foundation | 6/10 |
| Independent live upgrades | High after per-tank progression | 7/10 |
| More than two players at production quality | Feasible | 9/10 |

The first-release Lobby V2 is a controlled and appropriate milestone.

The extended system is a separate game-scale engineering project.

---

# 4. Terminology

## Player

One connected or reconnectable human participant.

```ts
type PlayerId = string;
```

## Tank actor

One authoritative player-controlled tank entity in the match.

```ts
type TankId = string;
```

## Seat

A control responsibility assigned to a player.

```ts
type CrewSeat =
  | "driver"
  | "gunner"
  | "combined";
```

## Combined seat

One player controls both movement and weapons for one tank.

This is equivalent to the current Single Player control experience, but may later be networked.

## Crew assignment

The authoritative relationship between a player, tank, and seat.

```ts
interface CrewAssignment {
  playerId: PlayerId;
  tankId: TankId;
  seat: CrewSeat;
}
```

## Vehicle composition

The set of tanks and assignments selected in the lobby.

Examples:

```text
Two players:
- one split tank
- two solo tanks

Three players:
- one split tank + one solo tank
- three solo tanks

Four players:
- two split tanks
- one split tank + two solo tanks
- four solo tanks
```

---

# 5. First-release Lobby V2 scope

## 5.1 Included

Implement:

- Main Menu Settings button and Settings scene
- Persistent local player nickname
- Curated default nickname pool plus exactly two decimal digits
- Randomize nickname action
- Generic two-player lobby state
- Player IDs
- Display names
- Local YOU indicator
- Host identity
- Connected/disconnected state
- Driver/Gunner seat selection
- Authoritative seat conflict resolution
- Ready and Unready
- Ready invalidation
- Lobby chat
- Full lobby snapshots
- Reconnect restoration
- Countdown
- Leave room
- Host departure policy
- Clear lobby error messages
- Keyboard and mouse accessibility
- Tests and two-browser acceptance

## 5.2 Excluded

Do not implement:

- A second tank
- Combined controls in network Multiplayer
- More than two active players
- Public matchmaking queue
- Searchable public rooms
- Persistent accounts
- Friend lists
- Voice chat
- Matchmaking rating
- Persistent chat history
- Spectators
- Mid-match new-player join
- Team-versus-team PvP
- Friendly cannon interaction
- Per-player progression
- New mode balance
- New Horde scaling


# 5A. Main Menu Settings and nickname identity

This section is an approved first-release requirement.

## 5A.1 User experience

The Main Menu adds:

```text
SETTINGS
```

Opening Settings shows:

```text
PLAYER NICKNAME
[ TurboToad07                 ]

[RANDOMIZE]
[SAVE]
[CANCEL / BACK]
```

The current saved nickname should also be visible on the Main Menu in a small, non-intrusive identity line:

```text
PLAYING AS: TurboToad07
```

This confirms which name will be sent before the player creates or joins a room.

## 5A.2 Nickname ownership

The nickname is:

- A local browser preference
- Not an account
- Not a login credential
- Not guaranteed globally unique
- Not used for authorization
- Not used as the reconnect key
- Not used as the server's player identity

Authoritative identity remains:

```text
PlayerId
SessionId
```

The nickname is presentation metadata attached to a player.

## 5A.3 First-launch default

When no valid saved nickname exists, generate one exactly once and persist it.

Format:

```text
<BaseNickname><NN>
```

Rules:

- `BaseNickname` comes from the curated pool.
- `NN` is exactly two decimal digits from `00` through `99`.
- Single-digit values are zero-padded.
- No spaces are inserted by default.
- Example: `TurboToad07`.
- Reloading the page reuses the saved value.
- Clearing browser storage causes a new default to be generated.
- Opening Settings does not regenerate the name automatically.
- RANDOMIZE explicitly generates and previews a new default.
- RANDOMIZE is not saved until the player presses SAVE.

## 5A.4 Curated default nickname pool

Use one centralized pool.

Initial recommended pool:

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

The pool should be maintained in one file, not duplicated between the Settings UI, server, and tests.

Recommended source:

```text
src/shared/lobby/nicknamePool.ts
```

The client uses it to generate defaults.

The server does not require the name to come from the pool because custom names are allowed.

## 5A.5 Random generation

Recommended API:

```ts
export const DEFAULT_NICKNAME_BASES: readonly string[];

export function generateDefaultNickname(
  randomInt?: (exclusiveMax: number) => number,
): string;
```

Behavior:

```text
baseIndex = randomInt(pool.length)
number = randomInt(100)
nickname = base + number.toString().padStart(2, "0")
```

Production randomness may use:

```text
crypto.getRandomValues
```

with a safe `Math.random` fallback because this is presentation, not security.

Tests must inject deterministic randomness.

## 5A.6 Local persistence

Recommended storage key:

```text
recoilCrew.playerSettings.v1
```

Recommended stored shape:

```ts
interface ClientPlayerSettingsV1 {
  version: 1;
  nickname: string;
}
```

Recommended service:

```text
src/client/settings/playerSettingsStore.ts
```

API:

```ts
interface PlayerSettingsStore {
  load(): ClientPlayerSettingsV1;
  save(settings: ClientPlayerSettingsV1): void;
  resetNickname(): ClientPlayerSettingsV1;
}
```

Requirements:

- Invalid or corrupted JSON falls back safely.
- Invalid saved nickname is replaced with one generated default.
- `localStorage` failure does not prevent the game from starting.
- In-memory settings continue to work when storage is unavailable.
- Do not write on every rendered frame.
- SAVE writes once.
- CANCEL restores the previously saved value.
- RANDOMIZE changes only the draft until SAVE.

## 5A.7 Custom nickname validation

Custom names are allowed.

Client and server must share one validator.

Recommended rules:

```text
Minimum: 1 visible Unicode code point
Maximum: 20 Unicode code points
Trim leading and trailing whitespace
Reject empty-after-trim
Reject control characters
Reject line breaks
Normalize repeated internal whitespace to one space
```

Recommended:

```ts
interface NicknameValidationResult {
  valid: boolean;
  normalized: string;
  reason?: "empty" | "too_long" | "control_character";
}
```

Do not use JavaScript `.length` as the sole user-visible length calculation when it would split surrogate pairs.

Rendering must use `textContent`.

## 5A.8 Create and Join behavior

Before sending `create` or `join`:

```text
load current saved nickname
validate
send normalized nickname
```

Recommended requests:

```ts
{
  t: "create";
  displayName: string;
}

{
  t: "join";
  code: string;
  displayName: string;
}
```

The server validates again.

If invalid:

```text
reject request with user-facing reason
do not create or join room
```

Reconnect uses `sessionId` as identity.

The server restores the nickname already attached to that player session rather than trusting a newly supplied nickname during an active-room reconnect.

## 5A.9 Duplicate nicknames

Duplicate nicknames are allowed.

Reasons:

- No account system exists.
- Names are cosmetic.
- `PlayerId` remains authoritative.
- Two-digit suffixes reduce accidental duplication but do not guarantee uniqueness.

The lobby must remain understandable even when both players use the same nickname.

The local YOU indicator is therefore mandatory.

## 5A.10 Local-player indicator

The local player's lobby card must display:

```text
YOU
```

Recommended treatment:

- Small `YOU` badge next to the nickname
- Local accent outline or background
- Accessible text, not color alone
- Optional `aria-label` identifying the local player card

Example:

```text
[HOST] TurboToad07 [YOU]
Seat: DRIVER
Status: READY
```

The client determines this through:

```text
player.playerId === localPlayerId
```

Do not infer the local player through:

- Nickname equality
- Seat
- Host status
- List order

## 5A.11 Settings scene and application flow

Add a content-driven Settings scene.

Recommended:

```text
content/scenes/settings.json
```

Add application flow state:

```ts
type FlowStateId =
  | ...
  | "settings";
```

Add handlers:

```ts
onOpenSettings(): void;
onSaveSettings(nickname: string): void;
onRandomizeNickname(): void;
onCancelSettings(): void;
```

Add allowlisted actions:

```text
app.openSettings
app.saveSettings
app.randomizeNickname
app.cancelSettings
```

The Main Menu scene adds the SETTINGS button.

The Settings scene uses the current presentation content pipeline rather than hardcoded ad hoc DOM outside the scene system.

## 5A.12 Main Menu context

Recommended scene context:

```ts
{
  currentNickname: string;
}
```

Recommended Main Menu presentation:

```text
PLAYING AS: {currentNickname}
```

Update this immediately after SAVE.

## 5A.13 Settings error behavior

Display validation errors inside Settings:

```text
Choose a nickname.
Nickname must be 20 characters or fewer.
Nickname contains unsupported control characters.
Settings could not be saved locally, but this nickname will be used for this session.
```

A storage failure is non-fatal.

## 5A.14 Ready-state interaction

For the first release, Settings is reachable from the Main Menu, not from the active lobby.

Therefore changing the local saved nickname does not mutate an active room.

The nickname attached to the room remains stable until the player leaves and creates or joins again.

This avoids unexpected Ready invalidation.

A future live lobby rename feature may use `lobbySetDisplayName`, but it is not required for Lobby V2.

## 5A.15 Nickname tests

Required tests:

```text
No saved setting generates BaseNN
NN is always two digits
Generated base comes from pool
Saved nickname persists
Randomize changes draft only
Cancel restores saved value
Save commits normalized value
Invalid stored JSON recovers
Invalid saved nickname recovers
Storage failure uses memory
Unicode length validation
Control-character rejection
Create sends saved nickname
Join sends saved nickname
Server rejects invalid nickname
Reconnect restores server nickname
Duplicate nickname lobby remains usable
Local player receives YOU indicator
YOU indicator uses playerId, not nickname
Main Menu updates PLAYING AS after save
```

## 5A.16 Nickname acceptance criteria

Nickname and Settings are complete only when:

1. Main Menu contains SETTINGS.
2. Settings opens through the content-driven scene flow.
3. First launch generates a curated base plus two digits.
4. The generated suffix is zero-padded.
5. The nickname persists across reloads.
6. RANDOMIZE previews a different generated name.
7. RANDOMIZE does not save automatically.
8. SAVE validates and persists.
9. CANCEL preserves the old saved nickname.
10. Corrupted storage recovers safely.
11. Storage unavailability does not block play.
12. Create sends the saved nickname.
13. Join sends the saved nickname.
14. The server validates the nickname.
15. Reconnect restores the server-side room nickname.
16. Nicknames are never used as authoritative identity.
17. Duplicate nicknames are allowed.
18. The local lobby card shows YOU.
19. YOU is resolved by PlayerId.
20. Main Menu shows PLAYING AS.


## 5.3 Hidden future fields

The server data model may contain future-compatible values such as:

```text
room gameplay type
crew assignments
maximum players
```

But unsupported values must not be selectable or accepted in the first release.

Example:

```ts
type LobbyGameplayType =
  | "sharedTank";
// Future:
// | "mixedTankCrews";
```

Do not add a disabled menu option that promises unfinished functionality.

---

# 6. First-release lobby experience

## 6.1 Create flow

```text
Main Menu
→ Settings may be used to edit nickname
→ Create Room
→ client loads and sends saved nickname
→ server validates nickname
→ server creates room
→ creator becomes Host
→ creator enters lobby
→ no automatic Ready
→ seat may default to Driver but remains changeable
```

The room code remains visible and copyable.

## 6.2 Join flow

```text
Main Menu
→ Settings may be used to edit nickname
→ Join Room
→ enter room code
→ client loads and sends saved nickname
→ server validates nickname and room
→ player enters lobby
→ player chooses available seat
```

The joiner should not be silently forced into Gunner before seeing the lobby.

A seat may be suggested, but the server remains authoritative.

## 6.3 Lobby flow

```text
Both players present
→ choose Driver/Gunner seats
→ chat
→ inspect readiness
→ both press Ready
→ server validates composition
→ countdown
→ existing Shared Tank match starts
```

## 6.4 Countdown cancellation

During countdown, cancel and return to lobby when:

- A player disconnects
- A player leaves
- A player sends an accepted Unready request
- Seat assignment becomes invalid
- Host changes a gameplay-affecting setting
- Server content validation fails

Do not continue into the match with stale lobby state.

---

# 7. First-release lobby layout

Recommended desktop layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ RECOIL CREW          ROOM: ABC123        [COPY CODE]         │
├──────────────────────────────┬───────────────────────────────┤
│ CREW                         │ ROOM CHAT                     │
│                              │                               │
│ [HOST] TurboToad07 [YOU]     │ TurboToad07: Driver?          │
│ Seat: [ DRIVER ] [ GUNNER ]  │ Player Two: I can gun.        │
│ Status: NOT READY            │                               │
│                              │                               │
│ ScrapFox42                  │                               │
│ Seat: [ DRIVER ] [ GUNNER ]  │                               │
│ Status: READY                │                               │
│                              │                               │
├──────────────────────────────┴───────────────────────────────┤
│ MODE: SHARED TANK                                           │
│ One Driver. One Gunner. One tank.                           │
│                                                              │
│ [LEAVE]                         [READY / UNREADY]             │
└──────────────────────────────────────────────────────────────┘
```

## 7.1 Player card

Show:

- Display name
- YOU badge when `playerId === localPlayerId`
- Distinct accessible local-card treatment
- Host badge
- Connected state
- Seat
- Ready state
- Reconnecting state where appropriate

## 7.2 Seat controls

A local player can request:

```text
Driver
Gunner
```

The server confirms or rejects the request.

A seat occupied by the other connected player should be visibly unavailable.

## 7.3 Match-start explanation

Show a concise rule:

```text
To start:
- both players connected
- one Driver
- one Gunner
- both players Ready
```

When invalid, show the exact missing condition.

Examples:

```text
Waiting for another player
Choose different crew roles
Player Two is not Ready
Player Two is reconnecting
```

---

# 8. Authoritative lobby data model

Replace UI dependence on fixed Driver/Gunner fields with a generic lobby snapshot.

## 8.1 Lobby player

```ts
interface LobbyPlayer {
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

Do not send raw private transport details to clients.

The client-safe snapshot may omit `sessionId`.

## 8.2 Room settings

First-release shape:

```ts
interface LobbyRoomSettings {
  gameplayType: "sharedTank";
  modeId: string;
}
```

Future shape:

```ts
interface FutureLobbyRoomSettings {
  gameplayType:
    | "sharedTank"
    | "mixedTankCrews";

  modeId: string;
  maximumPlayers: number;
}
```

## 8.3 Lobby state

```ts
interface LobbyState {
  revision: number;

  roomCode: string;
  phase: "lobby" | "countdown";

  hostPlayerId: string;

  players: LobbyPlayer[];

  settings: LobbyRoomSettings;

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

## 8.4 Revision

Every accepted lobby mutation increments:

```ts
revision: number
```

Clients render the latest complete snapshot.

Do not depend solely on a sequence of partial UI patches.

---

# 9. Compatibility adapter for the existing match

The first-release match continues using:

```text
room.driver
room.gunner
```

or equivalent fixed match slots.

Lobby V2 should add an adapter at match start:

```ts
interface SharedTankStartAssignment {
  driver: Client;
  gunner: Client;
}
```

Resolution:

```text
Lobby player with seat Driver
→ legacy match Driver slot

Lobby player with seat Gunner
→ legacy match Gunner slot
```

This isolates lobby reform from the authoritative simulation.

Recommended boundary:

```ts
function resolveSharedTankStartAssignment(
  lobby: LobbyState,
  clients: ReadonlyMap<PlayerId, Client>,
): SharedTankStartAssignment | StartAssignmentError
```

The rest of `MatchRuntime` should not need to know that the lobby was refactored.

---

# 10. Host behavior

## 10.1 Host creation

The room creator becomes Host.

## 10.2 Host authority

For the first release, the Host may:

- Select room mode ID from an allowlist, if multiple release modes exist
- Start no match directly; the server starts after valid Ready
- Remove themselves by leaving
- Potentially kick a player only if explicitly added later

The Host may not:

- Force another player's Ready state
- Assign a seat to another player without their request
- Bypass server eligibility
- Start with an invalid crew

## 10.3 Host migration

When the Host disconnects temporarily:

```text
retain host ownership during reconnect grace
```

When the Host leaves permanently or grace expires:

```text
assign Host to the connected player with the lowest joinedSequence
```

Broadcast a new lobby snapshot.

For a two-player room, this normally transfers Host to the remaining player.

---

# 11. Seat-selection rules

## 11.1 Valid first-release composition

Exactly:

```text
1 Driver
1 Gunner
```

## 11.2 Server validation

A seat request is accepted only when:

- Room phase is `lobby`
- Player belongs to the room
- Requested seat is recognized
- Requested seat is not held by another active player
- Request revision is not invalid where optimistic revision checking is used

## 11.3 Switching seats

A player may switch to the currently empty seat.

When both seats are occupied, direct switching may be handled through either:

### Option A — Release seat first

```text
Player A sets seat null
Player B changes seat
Player A selects remaining seat
```

### Option B — Swap request

A dedicated swap protocol adds complexity.

For the first release, use **Option A**.

## 11.4 Ready invalidation

Any accepted seat change clears:

```text
all players' ready states
```

Reason:

Both players must confirm the final composition.

---

# 12. Ready system

## 12.1 Ready request

```ts
{
  t: "lobbyReadySet";
  ready: boolean;
  lobbyRevision: number;
}
```

## 12.2 Ready acceptance

Ready `true` is accepted only when:

- Player is connected
- Player has a seat
- Crew composition is currently valid
- Room is in lobby
- Client revision is not dangerously stale

Unready `false` is accepted whenever the player belongs to a lobby or countdown that may be cancelled.

## 12.3 Start condition

```text
exactly two connected players
AND
exactly one Driver
AND
exactly one Gunner
AND
both Ready
AND
content/mode valid
```

## 12.4 Automatic countdown

When the eligibility becomes true:

```text
server enters countdown
server sets countdownEndsAtWallMs
server broadcasts full lobby snapshot
```

A separate `countdown` message may remain for presentation compatibility, but the wall-clock deadline is authoritative.

---

# 13. Lobby chat

## 13.1 Scope

Lobby chat is:

- Room-local
- Text-only
- Ephemeral
- Available only before the active match
- Not persisted after room destruction
- Not sent to unrelated rooms

## 13.2 Message model

```ts
interface LobbyChatMessage {
  messageId: number;
  playerId: string;
  displayName: string;
  text: string;
  sentAtWallMs: number;
}
```

## 13.3 Client request

```ts
{
  t: "lobbyChatSend";
  text: string;
}
```

The client does not supply:

- Sender player ID
- Sender name
- Timestamp
- Message ID

## 13.4 Validation

Recommended limits:

```text
Maximum message length: 200 Unicode code points
Retained room history: 30 messages
Maximum consecutive whitespace: normalize sensibly
Empty after trim: reject
Control characters: remove or reject
```

## 13.5 Rate limiting

Recommended initial policy:

```text
Burst: 4 messages
Refill: 1 message per 2 seconds
```

When rejected, return a lightweight error without disconnecting the player.

## 13.6 Safe rendering

Render message text through:

```ts
element.textContent = message.text;
```

Never use player chat as `innerHTML`.

## 13.7 History

On join or reconnect, the full current lobby snapshot may include the bounded recent history.

Chat history should not be included in gameplay snapshots.

---

# 14. Display names

## 14.1 Scope

Display names are room-scoped.

No account system is required.

## 14.2 Validation

Recommended:

```text
Minimum: 1 visible character
Maximum: 20 Unicode code points
Trim surrounding whitespace
Reject control characters
Escape through textContent
```

## 14.3 Duplicate names

Duplicate display names may be accepted because player IDs remain authoritative.

The UI may distinguish duplicates using:

```text
Name
Name (2)
```

only for presentation.

## 14.4 Default

A generated default may be:

```text
Crewmate 1
Crewmate 2
```

The server should not trust a client-supplied unique suffix as identity.

---

# 15. First-release lobby protocol

Recommended client-to-server messages:

```ts
type LobbyClientMessage =
  | {
      t: "create";
      displayName?: string;
    }
  | {
      t: "join";
      code: string;
      displayName?: string;
    }
  | {
      t: "rejoin";
      code: string;
      sessionId: string;
    }
  | {
      t: "lobbySetDisplayName";
      displayName: string;
      lobbyRevision: number;
    }
  | {
      t: "lobbySelectSeat";
      seat: "driver" | "gunner" | null;
      lobbyRevision: number;
    }
  | {
      t: "lobbyReadySet";
      ready: boolean;
      lobbyRevision: number;
    }
  | {
      t: "lobbyChatSend";
      text: string;
    }
  | {
      t: "leave";
    };
```

Recommended server-to-client messages:

```ts
type LobbyServerMessage =
  | {
      t: "created";
      code: string;
      playerId: string;
      sessionId: string;
    }
  | {
      t: "joined";
      code: string;
      playerId: string;
      sessionId: string;
    }
  | {
      t: "lobbyState";
      state: ClientLobbyState;
      chatHistory: LobbyChatMessage[];
    }
  | {
      t: "lobbyChatMessage";
      message: LobbyChatMessage;
    }
  | {
      t: "lobbyRequestRejected";
      requestType: string;
      reason: string;
      currentRevision: number;
    }
  | {
      t: "countdown";
      endsAtWallMs: number;
    };
```

A full `lobbyState` should be broadcast after every accepted lobby mutation.

---

# 16. Client application flow

The current client flow has separate states such as:

```text
create
join
ready
game
results
```

Lobby V2 should simplify the pre-game state to:

```text
main
lobby
countdown
game
results
error
```

The same lobby view handles:

- Creator
- Joiner
- Seat selection
- Ready
- Chat
- Peer reconnecting

Recommended:

```ts
type AppFlow =
  | "boot"
  | "main"
  | "lobby"
  | "countdown"
  | "game"
  | "results"
  | "error";
```

This reduces duplicated create/ready screens.

---

# 17. Reconnect behavior

## 17.1 Lobby reconnect

During grace:

- Player remains listed
- Connected state becomes false
- Seat remains reserved
- Ready becomes false
- Countdown is cancelled
- Display name remains
- Chat messages remain
- Host remains Host until grace expires

After reconnect:

- Player ID is restored
- Seat is restored
- Ready remains false
- Full lobby snapshot is sent
- Player must Ready again

## 17.2 Grace expiry

After grace expires:

- Player is removed
- Seat becomes empty
- Ready states clear
- Host may migrate
- Lobby remains available to remaining players

## 17.3 Mid-match behavior

Lobby V2 must not change existing mid-match reconnect semantics except where shared player identity types are reused.

---

# 18. First-release lobby error handling

Use user-facing messages.

Examples:

```text
That Driver seat is already taken.
Choose a crew role before getting Ready.
The crew changed. Review the lobby and Ready again.
This room is already in a match.
Chat is being sent too quickly.
Your display name is too long.
The other player disconnected. Countdown cancelled.
```

Do not expose internal validation stack traces.

---

# 19. First-release implementation architecture

Recommended modules:

```text
src/shared/lobby/
├── lobbyTypes.ts
├── lobbyProtocol.ts
├── lobbyValidation.ts
├── lobbyEligibility.ts
├── lobbySeatResolver.ts
└── lobbyChatPolicy.ts

src/server/lobby/
├── lobbyController.ts
├── lobbyChatRateLimiter.ts
├── lobbySnapshotBuilder.ts
└── sharedTankStartAdapter.ts

src/client/lobby/
├── lobbyView.ts
├── lobbyViewModel.ts
├── lobbyChatView.ts
└── lobbyController.ts

src/client/settings/
├── playerSettingsStore.ts
├── playerSettingsController.ts
└── playerSettingsViewModel.ts

src/shared/lobby/
└── nicknamePool.ts
```

Adapt to repository conventions.

Do not put all lobby logic directly into `room.ts`.

`RoomManager` should coordinate:

```text
socket
→ client identity
→ LobbyController
→ accepted mutation
→ full lobby broadcast
```

---

# 20. First-release migration plan

## Milestone L0 — Audit and baseline

Document:

- Existing room state
- Existing protocol
- Existing screens
- Existing reconnect
- Existing tests
- Existing rematch behavior

## Milestone L1 — Settings and nickname identity

Add:

```text
Settings scene
Main Menu Settings button
nickname pool
BaseNN generator
shared validator
local persistence
PLAYING AS context
create/join nickname payload
YOU indicator foundation
```

## Milestone L2 — Generic player identity

Introduce:

```text
playerId
displayName
hostPlayerId
players collection
```

Keep compatibility with current Driver/Gunner match slots.

## Milestone L3 — Lobby snapshots

Add:

```text
revision
full lobbyState
eligibility
connected state
```

Client renders only authoritative snapshots.

## Milestone L4 — Seat selection

Add Driver/Gunner requests.

Remove automatic permanent assignment from create/join.

The server may assign a temporary suggested seat, but the player can change it before Ready.

## Milestone L5 — Ready reform

Add:

- Ready and Unready
- Invalid-state explanation
- Ready invalidation
- Countdown cancellation

## Milestone L6 — Chat

Add:

- Name validation
- Chat validation
- Rate limit
- Bounded history
- Safe rendering

## Milestone L7 — Reconnect and host migration

Verify:

- Reserved seat
- Ready reset
- Countdown cancellation
- Host migration after expiry

## Milestone L8 — UI polish and two-browser acceptance

Complete the first-release lobby.

Do not proceed into multi-tank gameplay.

---

# 21. First-release test requirements

## Unit tests

```text
Nickname pool generation
Two-digit suffix padding
Player settings persistence and recovery
Shared nickname validation
Lobby player validation
Display-name validation
Seat conflict
Seat release
Ready acceptance
Ready invalidation
Start eligibility
Host migration
Chat validation
Chat rate limit
Chat history bound
Lobby revision
Shared Tank start adapter
```

## Server integration tests

```text
Create produces Host player
Join produces second player
Seat requests are authoritative
Both choose same seat: one rejected
Seat change clears Ready
Both Ready starts countdown
Disconnect cancels countdown
Reconnect restores seat
Grace expiry removes player
Host transfer works
Chat broadcasts only within room
Stale revision is rejected safely
```

## Client tests

```text
Main Menu Settings button
Settings load/save/cancel/randomize
PLAYING AS nickname context
Lobby snapshot renders player cards
Local player YOU indicator
Local seat buttons reflect authority
Ready button state
Countdown state
Chat safely renders text
Reconnect status
Eligibility reason
No unsupported multi-tank option displayed
```

## E2E

Two-browser scenarios:

```text
Set and persist nickname
Create and join with nicknames
Each client sees YOU on its own card only
Choose Driver/Gunner
Exchange chat
Ready in either order
Countdown
Cancel countdown with Unready
Reconnect in lobby
Reconnect during countdown
Start existing match
Complete results/rematch path
```

---

# 22. First-release acceptance gate

Lobby V2 is complete only when:

1. Main Menu provides Settings.
2. Nickname defaults to a curated base plus exactly two digits.
3. Nickname persists locally.
4. Main Menu shows the active nickname.
5. Create and Join send the active nickname.
6. Server validation is authoritative.
7. The local lobby card shows YOU based on PlayerId.
8. Create and Join enter the same lobby screen.
2. Both players have stable player IDs.
3. Display names are visible.
4. The creator is marked Host.
5. Players may select Driver or Gunner.
6. Seat conflicts are resolved by the server.
7. Exactly one Driver and one Gunner are required.
8. Ready can be toggled.
9. Seat changes clear Ready.
10. Gameplay-setting changes clear Ready.
11. Both valid Ready players start countdown.
12. Unready cancels countdown.
13. Disconnect cancels countdown.
14. Reconnect restores identity and seat.
15. Reconnect does not restore Ready automatically.
16. Host migration works after grace expiry.
17. Lobby chat works.
18. Chat is length-limited.
19. Chat is rate-limited.
20. Chat is rendered safely.
21. Chat history is bounded.
22. Full lobby snapshots are revisioned.
23. Current Shared Tank match starts correctly.
24. Current Driver input still controls movement.
25. Current Gunner input still controls weapons.
26. Existing Single Player is unaffected.
27. Existing progression behavior is unaffected.
28. Existing rematch flow remains functional.
29. Unsupported multi-tank options are not exposed.
30. Two-browser manual verification passes.

Additional acceptance-note:

> Numbering is descriptive; all clauses above are mandatory regardless of repeated numeric labels introduced by revision history.

Final Lobby V2 invariant:

> The first-release lobby begins with a persistent player nickname chosen in Main Menu Settings, clearly marks the local player with YOU, and is a real cooperative staging area with chat, explicit Driver/Gunner seat selection, authoritative readiness, and reconnect-safe identity, while the match remains the existing two-player Shared Tank game.

---

# 23. Deferred Extended Multiplayer vision

## 23.1 Player-count model

The future system should not hardcode one exact maximum in the foundational architecture.

Use content/server configuration:

```ts
interface MultiplayerCapacityDefinition {
  minimumPlayers: number;
  maximumPlayers: number;
  maximumTanks: number;
  maximumPlayersPerTank: 2;
}
```

An initial extended release could still cap at:

```text
4 players
```

for balance and bandwidth, while the data model remains generic.

## 23.2 Tank composition rule

Every connected match participant must belong to exactly one tank.

Every tank must have one valid control configuration:

### Solo tank

```text
1 player
seat = combined
```

### Split tank

```text
2 players
one Driver
one Gunner
```

Invalid:

```text
Driver without Gunner
Gunner without Driver
two Drivers
two Gunners
combined + another seat on same tank
player assigned to multiple tanks
empty tank
```

## 23.3 Composition validator

```ts
interface TankCrewPlan {
  tankId: TankId;
  assignments: CrewAssignment[];
}
```

Validation:

```text
For each player:
exactly one assignment

For each tank:
either:
- one combined assignment
or:
- one Driver and one Gunner
```

---

# 24. Extended lobby composition examples

## One player

```text
Tank A
- Player 1: Combined
```

This is functionally network-hosted solo or Single Player.

## Two players

### Shared Tank

```text
Tank A
- Player 1: Driver
- Player 2: Gunner
```

### Two Solo Tanks

```text
Tank A
- Player 1: Combined

Tank B
- Player 2: Combined
```

## Three players

### Three Solo Tanks

```text
Tank A: Player 1 Combined
Tank B: Player 2 Combined
Tank C: Player 3 Combined
```

### One Split + One Solo

```text
Tank A:
- Player 1 Driver
- Player 2 Gunner

Tank B:
- Player 3 Combined
```

## Four players

### Four Solo Tanks

```text
Tank A: Player 1 Combined
Tank B: Player 2 Combined
Tank C: Player 3 Combined
Tank D: Player 4 Combined
```

### Two Split Tanks

```text
Tank A:
- Player 1 Driver
- Player 2 Gunner

Tank B:
- Player 3 Driver
- Player 4 Gunner
```

### One Split + Two Solo

```text
Tank A:
- Player 1 Driver
- Player 2 Gunner

Tank B:
- Player 3 Combined

Tank C:
- Player 4 Combined
```

This composition grammar naturally extends to larger player counts.

---

# 25. Extended lobby composition editor

The future lobby should represent tanks as cards.

Example:

```text
TANK A — SPLIT CONTROL
[Player One: Driver]
[Player Two: Gunner]

TANK B — SOLO CONTROL
[Player Three: Combined]

UNASSIGNED
[Player Four]
```

Possible interactions:

- Create Tank
- Remove empty Tank
- Join Tank
- Leave Tank
- Select Driver
- Select Gunner
- Select Combined
- Drag player card into tank
- Host applies automatic composition
- Server validates every mutation

For initial implementation, buttons are safer than drag-and-drop.

## Automatic arrangement

Provide presets:

```text
All Solo
Maximum Shared Tanks
Balanced
```

Examples:

```text
3 players + Maximum Shared Tanks
→ one split tank + one solo tank

5 players + Maximum Shared Tanks
→ two split tanks + one solo tank
```

All automatic arrangements are server-generated and still require every player to Ready afterward.

---

# 26. Extended authoritative match architecture

Do not run one `MatchRuntime` per tank.

Use one shared authoritative world.

Future state:

```ts
interface TankActorState {
  id: TankId;

  tank: TankState;
  turret: TurretState;
  build: BuildState;

  alive: boolean;
  respawnT: number;
}

interface ExtendedMatchState {
  tanks: TankActorState[];
  crewAssignments: CrewAssignment[];

  enemies: EnemyState[];
  shells: ShellState[];
  xpShards: XpShardState[];
  chests: TreasureChestState[];

  sharedStage: StageState;
}
```

Shared systems:

- Map
- StageDirector
- HordeDirector
- WaveController
- Enemy population
- Projectiles
- Chests
- Match result
- Network room

Per-tank systems:

- Kinematics
- Turret
- Weapons
- Cooldowns
- Recoil
- Integrity
- Build
- Relics
- Progression offers
- Camera binding
- Prediction ownership

---

# 27. Extended crew assignment architecture

```ts
interface MatchPlayer {
  playerId: PlayerId;
  sessionId: string;
  connected: boolean;
}

interface CrewAssignment {
  playerId: PlayerId;
  tankId: TankId;
  seat: "driver" | "gunner" | "combined";
}
```

Server input resolution:

```text
socket
→ PlayerId
→ CrewAssignment
→ TankId and permitted controls
```

The client must not be trusted to choose an arbitrary target tank in each input message.

---

# 28. Extended input routing

## Driver seat

May send:

- Throttle
- Steer
- Dash
- Jump

Cannot send weapon actions.

## Gunner seat

May send:

- Aim
- Machine gun
- Cannon press/release

Cannot drive.

## Combined seat

May send both control streams for the assigned tank.

Recommended combined message:

```ts
{
  t: "combinedInput";
  inputSeq: number;

  driver: DriverInput;
  gunner: GunnerInput;
}
```

Discrete weapon action remains immediate and separately sequenced.

---

# 29. Extended prediction and presentation

## Locally controlled solo tank

Predict:

- Tank movement
- Dash/jump
- Turret
- Weapon action presentation
- Recoil impulse

## Local Driver in split tank

Predict:

- Shared tank movement
- Driver actions
- Received authoritative recoil impulses

## Local Gunner in split tank

Use current shared-tank strategy:

- Turret prediction
- Relayed Driver input for shared tank prediction
- Authoritative impulse reconciliation

## Other allied tanks

Use:

- Snapshot interpolation
- Authoritative action events
- Authoritative impulse events

Do not fully predict remote allied tank input.

---

# 30. Friendly cannon trick-play design

The desired cooperative rule:

```text
Allied cannon impact
→ no integrity damage
→ applies physical knockback
→ creates cooperative or comedic movement
```

Recommended policy:

```ts
interface FriendlyTankInteractionPolicy {
  cannonDirectDamageMultiplier: number;
  cannonSplashDamageMultiplier: number;

  cannonDirectImpulseMultiplier: number;
  cannonSplashImpulseMultiplier: number;

  machineGunDamageMultiplier: number;
  machineGunImpulseMultiplier: number;

  tankBodyCollisionPolicy:
    | "none"
    | "softSeparation"
    | "fullCollision";
}
```

Recommended initial values:

```text
Cannon damage: 0
Cannon direct impulse: 1.0
Cannon splash impulse: 0.8
MG damage: 0
MG impulse: 0
Tank body collision: soft separation
```

## Event separation

Allied tank hit must not fire:

- Enemy hit
- Enemy kill
- XP
- Drops
- Armor Shred
- Vampire Rounds
- Kill relics
- Score

Add:

```text
allyTankCannonHit
allyTankImpulse
allyLaunchAssist
```

## Why direct tank collision should be deferred

Predicted player vehicles colliding create difficult reconciliation.

Implement first:

```text
cannon impulse between tanks
```

Then consider soft body separation.

Avoid full rigid tank collision in the first multi-tank version.

---

# 31. Extended enemy and Horde behavior

The current game broadly assumes one tank as:

- Enemy target
- Flow-field destination
- Spawn visibility reference
- Horde materialization reference
- Interest origin

Extended Multiplayer must change these assumptions.

## 31.1 Common enemy targeting

Recommended:

```text
nearest reachable living tank
```

Use a multi-source flow field with all living tank positions as destinations.

Each cell leads toward the cheapest tank destination.

## 31.2 Elite targeting

Recommended:

- Choose nearest or highest-threat tank
- Preserve target for a short aggro duration
- Change when unreachable, dead, or substantially outdistanced

## 31.3 Boss targeting

Recommended:

- Threat-weighted
- Periodic retargeting
- Telegraph target clearly
- Avoid attacking only one player for the entire fight

## 31.4 Spawn visibility

Spawn checks consider all local player tanks.

A spawn should generally be:

- Outside immediate radius of every living tank
- Outside direct camera visibility where practical
- Reachable through terrain

## 31.5 Horde LOD

Distance to player interest becomes:

```text
minimum distance to any living player-controlled tank
```

Far aggregation and materialization must use multiple interest origins.

---

# 32. Extended progression design

## 32.1 Why the current model cannot be reused unchanged

Current Progression 08 is centered around:

```text
team-shared progression state
one active selection
role-specific Driver/Gunner offers
global gameplay pause
```

Mixed tank crews require different ownership.

## 32.2 Recommended future ownership

```text
Team XP timing
Per-tank builds and relic inventories
Per-player selection UI
```

Team XP keeps players synchronized in level timing.

At each level:

```text
every tank receives its own upgrade opportunity
```

For a split tank:

```text
Driver gets Driver offer
Gunner gets Gunner offer
Both modify the same tank build
```

For a solo tank:

```text
Combined player gets one combined offer
Selected card modifies their tank
```

## 32.3 Non-pausing progression

Extended multiplayer gameplay should continue while offers are active.

Policy:

```ts
interface ProgressionExecutionPolicy {
  xpScope: "teamShared";
  buildScope: "perTank";
  pausePolicy: "continueSimulation";
  selectionTimeoutSeconds: number;
}
```

## 32.4 UI

Do not open a full-screen cursor-driven overlay.

Use:

```text
compact card rail
keyboard 1 / 2 / 3
visible timeout
automatic authority selection
```

Pointer lock stays active.

## 32.5 Split-tank coordination

A split tank may have two simultaneous role-specific offers.

Neither player waits for the other.

Each selection applies independently to the same tank.

---

# 33. Extended relic and chest distribution

Recommended team-friendly design:

```text
One team chest opens
→ one shared rarity roll
→ every tank receives one independently selected relic of that rarity
```

For a split tank, the relic applies to the shared tank.

For a solo tank, it applies to that player's tank.

Advantages:

- No loot stealing
- Every tank stays engaged
- Shared objective remains valuable
- Independent builds remain possible

Alternative systems such as collector-only loot are not recommended for the first extended release.

## First-chest rule

The match has one team-level first-chest counter.

```text
First opened team chest
→ Epic 70% / Legendary 30%
```

Each tank's relic result uses that rolled rarity.

---

# 34. Extended death and wipe rules

Recommended:

## Individual tank destruction

```text
tank becomes disabled/dead
→ respawn timer
→ other tanks continue
```

## Team wipe

```text
all player tanks dead simultaneously
→ game over or team wipe penalty
```

## Split tank

Both players share the tank's death and respawn.

## Solo tank

Only the owning player loses control during respawn.

The exact revive and Phoenix Core interactions need a dedicated later design.

---

# 35. Extended results

Results should contain:

## Team results

- Stage clear
- Total kills
- Boss result
- Total XP
- Total trick plays
- Team time

## Tank results

- Damage
- Kills
- Damage taken
- Ally launches
- Deaths
- Build summary

## Player results

- Seat
- Contributions
- Driver assists
- Gunner hits
- Upgrade choices
- Reconnect status

Avoid competitive ranking as the primary presentation unless deliberately desired later.

---

# 36. Extended reconnect

Reconnect identity must restore:

```text
PlayerId
TankId
Seat
build relationship
active offer
local control authority
```

Rules:

- Tank remains in match during grace.
- Missing Driver: neutral movement/brake policy.
- Missing Gunner: stop firing, preserve aim.
- Missing Combined player: neutral all controls.
- Reconnected client receives full assignment and current tank state.
- Another player cannot take the seat during grace unless a later takeover feature is added.

---

# 37. Extended performance considerations

More player tanks add relatively little compared with hundreds of enemies, but they increase:

- Local prediction paths
- Snapshot state
- Projectiles
- Cameras
- Interest origins
- Enemy targeting
- Flow-field destinations
- Relic triggers
- UI state
- Network operations

Recommended initial extended cap:

```text
4 players
4 player-controlled tanks maximum
```

This supports all meaningful compositions while limiting validation scope.

The foundational data model may remain generic.

---

# 38. Extended security and authority

The server must validate:

- Player belongs to room
- Player has exactly one assignment
- Assignment permits requested input
- Tank exists
- Tank is alive or action is allowed while dead
- Input sequence is newer
- Weapon action sequence is newer
- Upgrade offer belongs to player/seat/tank
- Lobby composition remains valid
- Host settings use allowlisted values

Never trust client-provided:

- Player identity
- Seat authority
- Tank ownership
- Damage target
- Relic result
- Upgrade result
- Friendly impulse amount
- Chat sender identity

---

# 39. Extended implementation roadmap

This roadmap is explicitly deferred.

## Milestone X0 — Architecture audit

Find every singular assumption:

```text
state.tank
state.turret
teamProgression
room.driver
room.gunner
one prediction controller
one player interest origin
```

## Milestone X1 — TankActor abstraction

Introduce:

```text
TankId
TankActorState
CrewAssignment
```

Keep Shared Tank behavior identical through compatibility adapters.

## Milestone X2 — Multiple tank state

Create more than one authoritative tank in one MatchRuntime.

No player input yet.

## Milestone X3 — Network assignment and input

Route players to assigned tank seats.

## Milestone X4 — Multi-tank client rendering

Render all tanks.

Bind local camera to assigned tank.

## Milestone X5 — Prediction

Predict the locally controlled tank.

Interpolate remote tanks.

## Milestone X6 — Per-tank weapons and recoil

Owner-tag projectiles and impulse events.

## Milestone X7 — Friendly cannon impulse

Add zero-damage allied launches.

## Milestone X8 — Multi-target enemies and Horde

Add multi-source targeting, spawn planning, and LOD.

## Milestone X9 — Per-tank progression

Add independent live offers and per-tank builds.

## Milestone X10 — Arbitrary composition lobby

Expose the composition editor designed in this document.

## Milestone X11 — Balance, soak, and release

Complete four-player browser testing.

---

# 40. Extended regression requirements

Shared Tank must remain functional throughout the future refactor.

After every milestone:

```text
Existing Shared Tank:
- Driver controls movement
- Gunner controls aim and weapons
- shared recoil works
- progression works
- reconnect works
- rematch works

Single Player:
- combined controls work
- progression works
- local restart works
```

Do not accept a multi-tank milestone that breaks the signature Shared Tank mode.

---

# 41. Extended risks and mitigations

## Risk 1 — Giant singular-to-array rewrite

Mitigation:

```text
Add TankActor abstraction first
Use compatibility accessors
Migrate one system at a time
```

## Risk 2 — Original Shared Tank identity is diluted

Mitigation:

```text
Keep Shared Tank as the featured/default mode
Present mixed crews as an additional party mode
```

## Risk 3 — Progression becomes unreadable during combat

Mitigation:

```text
Non-pausing compact card rail
Keyboard selection
Timeout
No pointer release
```

## Risk 4 — Enemy AI focuses one tank

Mitigation:

```text
Multi-source flow field
Threat persistence
Target balancing
```

## Risk 5 — Two or more tanks trivialize PvE

Mitigation:

```text
Mode-specific Horde threat budget
More enemies and approach directions
Avoid only multiplying HP
```

## Risk 6 — Ally physics produces netcode instability

Mitigation:

```text
Authoritative discrete cannon impulse first
Soft or no body collision
Target-tagged impulse events
```

## Risk 7 — Arbitrary lobby composition becomes confusing

Mitigation:

```text
Visual tank cards
Automatic presets
Server validation
Exact start-condition messaging
```

## Risk 8 — Reconnect loses assignment

Mitigation:

```text
PlayerId and CrewAssignment are authoritative and match-scoped
Seat reserved during grace
```

---

# 42. Deferred-feature gate

Extended Multiplayer must remain deferred until all of these are true:

1. First-release Lobby V2 is complete.
2. Shared Tank release mode is stable.
3. Progression hardening is complete.
4. Coreloop release mode is active and verified.
5. Real enemy content is functional.
6. Single Player full stage passes.
7. Two-player Shared Tank full stage passes.
8. Reconnect and rematch pass.
9. Performance is known with target enemy counts.
10. A separate extended-multiplayer milestone is explicitly approved.

No current-release Codex prompt should begin Milestone X0–X11 unless the user explicitly activates this deferred roadmap.

---

# 43. Recommended first-release outcome

The build should ship with:

```text
Main Menu
├── PLAYING AS: <Nickname>
├── Settings
├── Single Player
└── Create / Join Crew
    └── Lobby V2
        ├── Player nicknames
        ├── YOU indicator
        ├── Chat
        ├── Driver/Gunner selection
        ├── Ready
        ├── Countdown
        └── Shared Tank match
```

It should not ship with an unfinished menu such as:

```text
Twin Tanks — Coming Soon
Mixed Crews — Disabled
4 Player — Experimental
```

Those options should appear only when the underlying simulation is ready.

---

# 44. Final design invariants

## Lobby V2 invariant

> The current release provides persistent Main Menu nickname settings, a clear YOU indicator, and a polished authoritative two-player lobby with chat, explicit Driver/Gunner seat selection, reconnect-safe identity, and Ready validation, while continuing to start the existing one-tank Shared Tank match.

## Extended Multiplayer invariant

> A future Recoil Crew room may contain any valid combination of solo-controlled and split-control tanks. Every player belongs to exactly one tank and one seat, all tanks share one authoritative PvE world, and the lobby fully defines the crew composition before the match begins.

## Scope invariant

> Future-compatible data structures are allowed in Lobby V2, but no multi-tank gameplay, combined network controls, additional-player simulation, friendly allied cannon physics, or independent live progression may enter the first-release implementation without a separately approved milestone.
