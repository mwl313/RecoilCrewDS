# RECOIL CREW

**One tank. Two brains. Zero brakes.**

Two-player online cooperative tank game — the Driver drives, the Gunner
aims, and the cannon's recoil throws the tank around. The Driver jumps with
Space and dashes with Left Shift; both actions are server-authoritative,
locally predicted, and data-driven. The full project readme now lives in
the docs folder:

Single Player is also available: one player drives, aims, and fires with
combined controls on the same deterministic simulation, fully offline.

Combat 05: normal driving no longer damages enemies — only the Dash damage
window does. The turret is mouse-synchronous, falls are harmless, and the
JACKPOT meter is gone: a relic-granted `cannon.charge` capability turns the
secondary cannon into a hold/release charge shot.

- [Project README / docs index](docs/README.md)
- [Architecture](docs/guides/ARCHITECTURE.md)
- [Content authoring guide](docs/guides/CONTENT_AUTHORING_GUIDE.md)
- [Single Player mode guide](docs/guides/SINGLE_PLAYER_MODE_GUIDE.md)
- [Tank rig and weapon socket guide](docs/guides/TANK_RIG_AND_WEAPON_SOCKET_GUIDE.md)
- [Cannon charge authoring guide](docs/guides/CANNON_CHARGE_AUTHORING_GUIDE.md)
- [Combat contact rules](docs/guides/COMBAT_CONTACT_RULES.md)
- [Core Loop 06 implementation report](docs/coreloop06/CORELOOP06_IMPLEMENTATION_REPORT.md)
- [Core Loop 06 authoring guide](docs/coreloop06/CORELOOP06_AUTHORING_GUIDE.md)
- [Map Lab (map generation tool) user guide](docs/maplab/MAP_LAB_USER_GUIDE.md)
- [Enemy animation system (Animation07) implementation report](docs/animation07/ANIMATION07_IMPLEMENTATION_REPORT.md)
- [Power-up / relic progression (Progression08) implementation report](docs/progression08/PROGRESSION08_IMPLEMENTATION_REPORT.md)
- [Refactor status](docs/refractor/REFACTOR_STATUS.md)

See [docs/](docs/) for guides, design decisions, bugfix reports, planning
documents, and the refactor pack.

Animation07: enemy models, clips, semantic roles, LOD behavior, and
presentation variants resolve from validated content. Full skeletal
animation is reserved for nearby enemies; distant hordes use progressively
cheaper rigid/far presentation without changing gameplay.
