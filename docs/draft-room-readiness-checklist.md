# Draft Room readiness checklist

Use this before a real draft or before merging the draft-room risk/context branch.

## Required local checks

Run from the repository root:

```powershell
npm run context:check
npm run build
npm run test:run
```

Expected state:

```text
Context overlay validation passed.
Build passes.
All tests pass.
```

The Vite large-chunk message is currently a warning, not a release blocker.

## Setup screen check

Before starting a draft, confirm the setup sanity panel. It should show either:

```text
Setup sanity check passed
```

or specific warnings to fix before drafting.

Treat these warnings as blockers unless they are intentional:

- team count mismatch
- draft type mismatch
- scoring mismatch
- roster slot mismatch
- round count mismatch
- auction budget mismatch
- missing superflex

For the expected 10-team, 1QB, 2-FLEX redraft setup, confirm:

```text
Teams: 10
QB: 1
RB: 2
WR: 2
TE: 1
FLEX: 2
SUPERFLEX: 0
K: 1
DST: 1
```

## Draft board smoke test

Start a mock draft and verify:

- Available Players renders on desktop.
- Available Players renders on phone width.
- NFL Role, Bye Fit, Draft Risk, and Context columns render.
- Suggested rows still show reasons.
- Queue toggle works.
- Draft button or `D` key logs a snake pick when allowed.
- Undo removes the last human pick.
- My Team panel updates after a pick.
- Bye summary lists players and slots, not only raw counts.

## Context overlay check

Run a lookup for at least one known player:

```powershell
npm run context:keys -- bijan
```

Then, when context JSON is populated, run:

```powershell
npm run context:check
```

Every populated player/team note must include:

- confidence
- sourceUrls

Do not populate the context overlay from memory.

## Live Sleeper draft check

For a Sleeper league, before relying on live sync:

- Confirm the connected league is the correct season.
- Confirm the draft order matches Sleeper.
- Confirm your team is marked `Me`.
- Turn on Live Sync only after the actual Sleeper draft room is available.
- Watch the first one or two picks and confirm they ingest correctly.
- Keep manual logging available as the fallback.

## Merge gate

Merge only after:

```text
context:check passes
build passes
test:run passes
setup sanity panel is correct for the league
one mock draft smoke test passes
```
