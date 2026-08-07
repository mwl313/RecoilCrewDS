# Multiplayer Cannon Projectile Presentation Sync — Implementation Report

## Scope and revision

- Branch: `codex/projectile-sync`
- Isolated worktree: `C:\Users\임민우\Desktop\Recoil Crew DS-projectile-sync`
- Implementation base SHA: `66cc5ddd35c672b1d68cda564925dac8123ade4c`
- Implementation commit: the commit containing this report (the self-referential SHA is intentionally omitted)
- Binding source: `recoilcrew_multiplayer_cannon_projectile_sync_fix.zip`

## Root cause

`RemoteEntityInterpolator` placed every shell on the same delayed render clock used by enemies and the truck. The clock begins about 100 ms behind the newest authoritative snapshot. Cannon impact events, however, are presented immediately. At the base 52 m/s cannon speed, that clock mismatch can leave the mesh roughly five metres behind the authoritative explosion.

The old `renderDelayMs` diagnostic also used `renderTime - serverTime`, so an intentionally behind render clock usually reported zero instead of its real positive delay.

## Implemented presentation path

Multiplayer shells matching `kind === 'cannon' && team === 'player'` are removed from the delayed shell frame and replaced with pooled records from `PlayerCannonProjectilePresenter`:

```text
newest accepted authoritative shell state
+ estimated one-way transit time (RTT / 2)
+ elapsed time since snapshot receipt
-> velocity/gravity extrapolation
-> 120 ms clamp
-> shell mesh
```

Enemy, tower, and other remote interpolation remains unchanged. Single Player continues to render directly from its local simulation state.

Horizontal presentation uses the shell's actual `vx` and `vz`. Vertical presentation uses its actual `vy` and the resolved `movement.weapon.cannonGravity` replicated by the server, with `BASE_CONFIG.weapons.cannonGravity` only as the compatibility fallback. No cannon speed is hardcoded and no visual speed multiplier is used.

The client RTT measurement is now published to `netcodeMetrics.rttMs`. The server-time estimate uses half that RTT plus local elapsed time anchored to the latest snapshot's `serverTime`. Forward extrapolation stops at 120 ms during a packet stall.

## Reconciliation and impact handling

Presentation records are keyed by `shell.id` and reused. On a new snapshot:

- errors below 0.5 m switch to the new authoritative base directly;
- errors from 0.5 m through 2 m retain a correction offset that decays within 40 ms;
- errors above 2 m snap to the new authority.

Authoritative cannon `enemyExplosion` events now carry `SimEvent.id = shell.id`. The client marks that id impacted, removes its existing shell rig before playing the explosion, and keeps a one-second tombstone. Repeated impacts are harmless, stale snapshots cannot recreate the shell during the guard window, and impacting one Twin Shell id does not remove another.

Reset/rematch/reconnect cleanup clears all projectile records, correction state, output records, metrics, and tombstones.

## Diagnostics

- `renderDelayMs` now reports `max(0, estimatedServerNow - renderTime)`.
- `remoteRenderDelayMs` exposes that value explicitly.
- `playerCannonExtrapolationMs` reports the current bounded forward sample age.
- `playerCannonVisualErrorMeters` reports the active short correction offset.

## Files changed

- `src/client/prediction/projectilePresenter.ts`
- `src/client/app/networkStatePresenter.ts`
- `src/client/app/gameClient.ts`
- `src/client/netcode/netcodeMetrics.ts`
- `src/client/main.ts`
- `src/shared/projectiles/projectileSystem.ts`
- `tests/netcode/projectilePresenter.test.ts`
- `tests/weaponSystem.test.ts`
- this report

No authoritative projectile movement, collision, damage, splash, knockback, hit timing, server tick, or Single Player simulation code was changed.

## Automated qualification

Passing:

- `npx tsc --noEmit` (using the repository's installed TypeScript binary)
- `npm run build`
- `npm run test:netcode`: 7 files, 44 tests
- targeted projectile/weapon/interpolation run: 9 files, 65 tests

Focused coverage proves:

- newest-authority player cannon pose replaces the delayed lerp pose;
- 50 m/s for 0.1 s produces 5 m of visual advance;
- ballistic Y and visual vertical velocity use cannon gravity;
- a 0.5 s age is clamped to 0.12 s;
- impact removes the shell view immediately and idempotently;
- a stale post-impact snapshot cannot resurrect the shell;
- shell 42 impact leaves shell 43 visible;
- charged shells use their actual velocity and preserve `chargeRatio`/`visualScale`;
- reset clears presentation state and tombstones;
- enemy and tower interpolation remain delayed and unchanged;
- the render-delay diagnostic has the correct positive sign;
- authoritative cannon explosion events include a shell id.

The complete `npm test` run executed 1,305 tests: 1,296 passed and 9 unrelated baseline tests failed. The failures are in existing driver-prediction pending-count assertions, a stale protocol-version assertion, a progression stat expectation, the Demo golden fixture, one horde timeout, and two Monster Pack importer cases whose external ZIP is absent from this isolated worktree. None touch the changed projectile presentation/event files.

## Browser qualification

The requested close/medium/far and 20/80/150 ms visual pass could not be completed because current `origin/main` fails before a Gunner cannon action is accepted. The stock `e2e/gunner-responsiveness.spec.ts` was run at 80 ms and timed out waiting for cannon cooldown; its Playwright capture showed the joined Gunner client displaying the Driver role/UI. A separate projectile probe hit the same pre-existing role/input blocker. Temporary probe hooks were removed, so no browser-only scaffolding remains in the implementation.

This leaves real-browser perceived impact alignment and Charge/Twin Shell visual observation as the remaining manual qualification. The deterministic presenter, event-removal, stale-order, Charge, Twin Shell, and interpolation-regression behaviors are covered by passing tests.

## Remaining latency

The visual path compensates by RTT/2 plus time since receipt, bounded to 120 ms. Under stalls longer than the cap the shell holds at the capped estimate until a newer snapshot or authoritative impact arrives; it never gains gameplay authority. Residual error can still come from asymmetric routing, RTT sampling error, or a stall beyond 120 ms. The authoritative impact always removes the matching visual immediately.
