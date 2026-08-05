# Map Movement & Terrain Polish — Quick Acceptance Checklist

## Branch

- [ ] Created `map-movement-polish` from latest `main`
- [ ] Preserved uncommitted work
- [ ] Did not merge or cherry-pick `map-overhaul`
- [ ] Left completed branch unmerged

## Natural crest launch

- [ ] Shared `stepTankKinematics()` implementation
- [ ] Uses actual horizontal movement direction
- [ ] Samples behind/current/ahead terrain
- [ ] Requires minimum speed
- [ ] Requires meaningful incoming uphill grade
- [ ] Requires flat or descending outgoing grade
- [ ] Launch velocity is retained, configurable, and capped
- [ ] Manual jump is not overwritten
- [ ] Existing explicit ramp launch remains
- [ ] Double launch is prevented

## Render-safe map

- [ ] `map.rocketJumpHighlands` remains the default
- [ ] Smooth heightfield generator remains active
- [ ] `correctAllMap` enabled
- [ ] `cliffPlateau.count = 0`
- [ ] `escarpment.count = 0`
- [ ] Ordinary hills/ridges/plateaus/valleys remain
- [ ] Maximum neighbor height delta test added
- [ ] All samples finite
- [ ] Deterministic checksum preserved
- [ ] Seed sweep has zero fallback

## Tests

- [ ] Fast crest launches
- [ ] Slow crest stays grounded
- [ ] Continuing uphill stays grounded
- [ ] Downhill-only does not launch
- [ ] Flat ground does not launch
- [ ] Launch cap works
- [ ] Horizontal momentum retained
- [ ] Explicit ramp still works
- [ ] Typecheck passes
- [ ] Unit tests pass
- [ ] Map tests pass
- [ ] Build passes

## Manual

- [ ] Three fixed seeds inspected
- [ ] No stretched triangular terrain textures
- [ ] No constant hopping on small bumps
- [ ] Dash-uphill launch feels good
- [ ] Normal-speed launch feels controllable
- [ ] Multiplayer and Single Player match
