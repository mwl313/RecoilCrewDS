# Recoil Crew

> **One tank. Two brains. Zero brakes.**

Recoil Crew is a browser-based action game about sharing one heavily armed tank.

In two-player co-op, the Driver controls the tank while the Gunner controls the turret and weapons. The cannon's recoil can throw the whole vehicle across the battlefield, so every shot can be both an attack and a movement tool.

You can also play alone in Single Player, where one person controls both roles.

## About the Game

Fight through increasingly crowded monster hordes, survive elite encounters and bosses, collect upgrades, and build a powerful run with level-up bonuses and relics.

### Highlights

- Two-player online co-op with separate Driver and Gunner roles
- Single Player mode with combined controls
- Recoil-powered movement that turns the cannon into a traversal tool
- Dash, jump, drift, and charge-shot combat
- Large monster hordes, elite enemies, and bosses
- Level-up upgrades and collectible relics
- Generated battlefields with urban streets, terrain, ramps, and hazards
- Room codes, seat selection, ready checks, chat, rematches, and reconnect support
- Dynamic soundtrack and procedural combat audio

## How to Play

### Multiplayer

1. Choose **Multiplayer** from the main menu.
2. One player creates a crew and shares the room code.
3. The second player joins using that code.
4. Choose the Driver and Gunner seats, ready up, and begin the match.

### Single Player

Choose **Single Player** from the main menu. You can drive, aim, and fire without another player or a separate game server.

## Controls

| Action | Control |
| --- | --- |
| Drive forward / backward | `W` / `S` |
| Steer left / right | `A` / `D` |
| Aim / free-look | Mouse |
| Machine gun | Left mouse button |
| Cannon | Right mouse button |
| Charge shot | Hold and release right mouse button when unlocked |
| Dash | Left `Shift` |
| Jump | `Space` |
| Recenter camera | `R` |
| Tactical map and upgrade status | `Tab` |
| Pause | `Esc` |

In Multiplayer, movement controls belong to the Driver and weapon controls belong to the Gunner. In Single Player, one player uses the full control set.

## Install and Run Locally

### Requirements

- Node.js 20 or newer
- npm, which is included with Node.js
- Git, or a downloaded ZIP of this repository

### Installation

```bash
git clone https://github.com/mwl313/RecoilCrewDS.git
cd RecoilCrewDS
npm install
```

### Start the Game

Build and start the production server:

```bash
npm start
```

When startup finishes, open [http://localhost:8080](http://localhost:8080).

For local two-player testing, open the game in two browser windows. To play from another computer on the same network, open port `8080` on the host machine and use the host computer's local IP address instead of `localhost`.

### Development Mode

Run the server and client in separate terminals:

```bash
npm run dev:server
```

```bash
npm run dev:client
```

Then open [http://localhost:5173](http://localhost:5173).

## Project Status

Recoil Crew is nearing feature completion and remains in active development. Balance, visuals, audio, content, and release hardening are still being refined.

## Documentation

- [Documentation index](docs/README.md)
- [Architecture overview](docs/guides/ARCHITECTURE.md)
- [Single Player guide](docs/guides/SINGLE_PLAYER_MODE_GUIDE.md)
- [Map Lab guide](docs/maplab/MAP_LAB_USER_GUIDE.md)
- [Content authoring guide](docs/guides/CONTENT_AUTHORING_GUIDE.md)
- [Deployment guide](docs/guides/DEPLOYMENT.md)

---

Built with a focus on cooperative chaos, exaggerated tank movement, and runs that become increasingly crowded and powerful.
