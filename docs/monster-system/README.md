# Recoil Crew — Monster System Second-Pass Fix Pack

Target repository:

```text
https://github.com/mwl313/RecoilCrewDS
```

Target branch:

```text
monster-system
```

Expected branch head at the time of the audit:

```text
18a8fe8054d948d32738d3d5ac4b993a7edf62a5
```

The qualified implementation commit immediately below that documentation-only head was:

```text
8d93a5d3414488760170572269a3f4b0198fef86
```

Codex must fetch and verify the actual remote head before editing. These SHAs are audit anchors, not permission to reset or overwrite newer work.

## Included documents

1. `MONSTER_SYSTEM_POST_FIX_AUDIT_REPORT.md`
   - Records the remaining defects found after the first bug-fix pass.
   - Separates confirmed defects from strong code-based inferences.

2. `MONSTER_SYSTEM_SECOND_PASS_FIX_SPECIFICATION.md`
   - Binding implementation specification.
   - Defines P0 and P1 fixes, forbidden shortcuts, required tests, and acceptance criteria.

3. `MONSTER_SYSTEM_SECOND_PASS_QUALIFICATION_PLAN.md`
   - Defines unit, integration, browser, multiplayer, visual, protocol, stress, and human-playtest gates.

4. `CODEX_MONSTER_SYSTEM_SECOND_PASS_FIX_PROMPT.md`
   - Ready-to-use prompt for Codex.
   - Requires branch isolation, focused commits, reports, and complete qualification.

## Authority order

When these documents conflict, use this order:

```text
1. MONSTER_SYSTEM_SECOND_PASS_FIX_SPECIFICATION.md
2. CODEX_MONSTER_SYSTEM_SECOND_PASS_FIX_PROMPT.md
3. MONSTER_SYSTEM_SECOND_PASS_QUALIFICATION_PLAN.md
4. MONSTER_SYSTEM_POST_FIX_AUDIT_REPORT.md
5. Existing first-pass bug-fix documents
6. Older implementation reports and plans
```

The original monster-system design remains binding for gameplay intent. This pack only corrects integration, rendering, networking, and qualification defects. It must not become a balance redesign, map-art task, or general refactor.
