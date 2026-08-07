# Recoil Crew — Codex Drop-In Package

Copy/merge this package into the repository root.

Codex entry point:
`docs/progression08/CODEX_PROMPT_IMPLEMENT_PROGRESSION_REWARD_ROULETTE.md`

Binding design:
`docs/progression08/PROGRESSION_REWARD_ROULETTE_PRESENTATION_DESIGN.md`

Critical product rules in this revision:

1. STACKABLE RELICS
   - remain eligible after acquisition;
   - may roll again;
   - increase stack count;
   - increase their stack-scaled effect according to content.

2. NON-STACKABLE RELICS
   - are eligible only while unowned;
   - are removed from future relic-roll eligibility after acquisition;
   - never reappear in that match;
   - never convert into XP.

3. SINGLE PLAYER / MULTIPLAYER PARITY
   - same roulette animation;
   - same timing;
   - same layout;
   - same controls;
   - same rarity effects;
   - same relic presentation.
   - The only presentation difference is real Multiplayer peer READY / VIEWING status.

4. MULTIPLAYER RELIC CONTINUATION
   - each currently required connected player acknowledges once;
   - local acknowledgement shows READY while the other player is still viewing;
   - both ready -> CREW READY -> gameplay resumes;
   - disconnected peers cannot deadlock the run.

5. INPUT
   - normal progression does not require Escape;
   - pointer lock is retained when already active;
   - 1/2/3 + locked-mouse selection are supported;
   - no reward input may leak into TPS gameplay.
