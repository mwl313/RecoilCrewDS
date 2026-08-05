# Lobby 09 — Code Audit

Branch: `lobby-upgrade` (from `models-added` @ `0b4f01d`).

## Server room model

`src/server/room.ts` currently models crew identity with fixed fields:

```ts
room.driver: Client | null
room.gunner: Client | null
room.ready: { driver: boolean; gunner: boolean }
```

- Create assigns the creator to `driver`; join assigns the second client to
  `gunner`.
- Reconnect resolves by `sessionId` (`rejoin`) and restores the role.
- Disconnect grace (`GAME.reconnectGrace`) then removal; a removed role
  leaves the room half-open (no host migration concept).
- Countdown is a simple `countdownT` countdown; both `ready` booleans gate
  the start.
- Full state is not revisioned; `lobby` broadcasts only the two ready
  booleans; `peer` broadcasts connection booleans.
- `tick()` advances countdown, disconnects, match stepping, snapshots.

## Wire protocol

`src/shared/net/protocol.ts` is at `PROTOCOL_VERSION = 7`. Client messages:
`create`, `join`, `rejoin`, `ping`, `ready`, `input`, `action`, `rematch`,
`selectUpgrade`, `skipRelicPresentation`, `leave`. Server messages include
`created`, `joined`, `lobby`, `peer`, `countdown`, `start`, `snapshot`,
`results`.

## Client application flow

`src/client/main.ts` owns `flow`:

```ts
type Flow = 'boot' | 'main' | 'create' | 'join' | 'ready' | 'game' | 'results' | 'error';
```

Create shows the `createCrew` scene; Join shows `joinCrew`; after joining
the client shows the `readyLobby` scene. `Hud` forwards screen/context
operations to `SceneFlowPresenter`, which renders content-driven scenes.

## Presentation system

- Scenes live in `content/scenes/*.json`; the flow in
  `content/scene-flows/primary.json`.
- `src/client/presentation/flowTypes.ts` defines `AppFlowHandlers` and
  `FlowStateId`.
- `SceneActionRegistry` is the action allowlist; schema `ACTION_IDS` in
  `src/shared/presentation/schemas.ts` is the content-time allowlist.
- UI components: container/panel/text/button/input/repeater/progressBar etc.
  The `input` component is room-code-specific (uppercase, alphanumeric
  sanitization); a generic text mode is needed for nicknames/chat.
- `SceneFlowPresenter.updateLobby(driverReady, gunnerReady, role)` updates
  the legacy ready-lobby scene context; there is no generic player list,
  chat, or seat model.

## Main Menu

`content/scenes/mainMenu.json` has CREATE/JOIN/SINGLE PLAYER/HOW TO PLAY but
no Settings and no identity line. Context support exists through
`setSceneContext`.

## Persistence

No `localStorage` usage exists in client code.

## E2E dependency

Many two-browser specs click `#create-ready` then `#ready-go` and wait for
`#screen-ready`. The Lobby V2 view must preserve these hooks (or migrate the
specs atomically).

## Gaps for Lobby V2

1. No nickname pipeline (client or server).
2. No generic player list / player IDs / host identity.
3. No seat selection; roles are hard-assigned.
4. No chat.
5. No revisioned lobby state.
6. No host migration.
7. No Settings scene/flow state/actions.
8. No persistent settings store.
