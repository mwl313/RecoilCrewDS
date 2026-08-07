# Recoil Crew — Gameplay Readability / Tactical / Environment Codex Package

Drop this package into the repository root.

Codex entry point:

`docs/quality/CODEX_PROMPT_IMPLEMENT_GAMEPLAY_READABILITY_TACTICAL_ENVIRONMENT.md`

Binding design:

`docs/quality/GAMEPLAY_READABILITY_TACTICAL_ENVIRONMENT_DESIGN.md`

Critical minimap rule:

- player marker is an isosceles triangle;
- triangle points in VEHICLE/CHASSIS facing direction;
- camera orbit and turret yaw do not rotate it;
- minimap remains north-up.

The design uses the current Recoil Crew UI system as visual grammar but explicitly tells Codex not to mechanically force menu/modal templates onto the tactical gameplay drawer.


## Performance-budgeted fake world defaults

The visual world apron is deliberately sparse:

```text
Near apron, 0–80m beyond bounds:
~100–160 instanced existing buildings total
~20–30 trees/vehicles/props total

Far skyline, 80–220m+ beyond bounds:
~50–100 simple silhouette/box buildings total
```

All fake scenery is presentation-only, static, shared-material, and shadowless.

Acceptance target:

```text
urban400 + apron must add no more than ~10–20% measured render cost
versus baseline urban400 under the same conditions.
```

If it exceeds 20%, Codex must reduce fake scenery complexity before completion.
