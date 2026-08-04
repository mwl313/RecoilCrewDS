# Animation07 — Content Authoring Guide

## Adding a new enemy family (no engine edits)

1. Register model assets in `content/assets/project.json` (namespace
   `custom`, `fallbackAssetId` pointing at a built-in procedural stand-in).
2. Add a presentation profile in `content/enemy-presentation-profiles/`
   (`enemyPresentation.<family>.<tier>`): near/far model ids, animation
   profile id, LOD + shadow policy ids, transform, material policy, tags.
3. Add an animation profile in `content/enemy-animation-profiles/`
   (`enemyAnimation.<family>.<tier>`): semantic role → clip name map,
   fallback chain, locomotion references, transitions, playback settings,
   `rootMotion: false`.
4. Point an enemy definition at it with `presentationProfileId`.
5. Run `npm run generate:presentation-content` (also runs the enemy
   animation generator), then `npm test` + `npm run validate:enemy-animations`.

## Semantic roles

`idle walk run hoverMove fastHover attackPrimary attackSecondary
attackSpecial pounce webCast summon charge leap roar castStart castLoop
castRelease hit stagger knockback land spawn entrance death phaseTransition
recovery`

Every role is optional; define fallbacks so missing clips degrade safely.
Never reference clip names in gameplay code.

## Rules

- `rootMotion: false` is required on every animation profile.
- LOD policies use enter/leave hysteresis distances and mixer caps.
- Shadow policies are per-tier content.
- Existing `presentationId` content keeps working through generated legacy
  profiles.
- Missing final GLBs must never break startup: placeholders are registered
  project assets with procedural fallbacks.
