# Monster Pack 10 — Known Limitations

- The served multiplayer room mode is Demo (progression-disabled, no
  Quaternius gameplay definitions), so the Quaternius models are available
  through the opt-in preview roster and gallery; wiring a release stage to
  the roster is a gameplay-design step outside this import.
- Common-far runtime horde presentation still uses individual rigid clones
  for non-fodder enemies in the current presenter; the generic
  `createAssetInstancedHost` adapter and the benchmark prove the instanced
  path for Quaternius far assets and are ready for a future fodder roster.
- Aggregate sector records now render through `AggregateSectorRenderer`
  (shared InstancedMesh per aggregate asset, procedural fallback), but the
  production horde modes currently have no gameplay definitions referencing
  Quaternius aggregates; the benchmark exercises the path directly.
- Socket bindings are recorded in `generated/SOCKET_MAPPING.json`; native
  `socketBindings` are applied per profile only where the node exists in the
  GLB.
- Preview gallery loads models on demand; loading all 45 heroes at once is
  intentionally not supported (selective preload is the design).
- The headless progression simulation remains nondeterministic across runs
  (pre-existing, wall-clock timeout inputs); unrelated to this import.
