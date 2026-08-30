# Fantasy Football Analyzer — Draft Context Fork

Free, open-source fantasy football league analysis plus a live/mock draft assistant for Sleeper, ESPN, and Yahoo.

This fork keeps the original analyzer and expands the Draft Room into a source-backed draft context dashboard: role/depth, bye fit, injuries, team outlook, coaching/play-caller changes, offensive-line context, an overall context tiebreaker, larger hover details, resizable columns, and a league-settings-based pick clock.

## Branch status

The enhanced fork currently lives on:

```text
draft-risk-dashboard
```

The repository default branch is still `master`, so **check out `draft-risk-dashboard` after cloning** if you want the features documented below.

The production site may track `master` rather than this branch:

https://fantasyfootballanalyzer.app/

## What this fork adds

### Draft Room context dashboard

The desktop Available Players board adds six fast-scanning context columns:

```text
NFL Role | Bye Fit | Injury | Outlook | Team Changes | Overall CTX
```

Phone layouts carry the same context in compact inline labels.

| Column | What it means |
| --- | --- |
| **NFL Role** | Current depth/role clue such as RB1, WR2, etc. Depth-chart position is treated as a clue, not a guaranteed workload projection. |
| **Bye Fit** | Checks the player's bye week against your drafted roster and warns about concentrated starter byes. |
| **Injury** | Current availability signal plus sourced/contextual details when available. Broad labels are not converted into unsupported diagnoses. |
| **Outlook** | Offensive player: team **OFF + SOS**. D/ST: team **DEF + SOS**. `DEF` means that NFL team's defense against opposing offenses, not offensive-line protection. |
| **Team Changes** | Actual play caller, coordinator/caller change, caller experience/history, OL consensus and underlying source ranks, plus concise transition notes. |
| **Overall CTX** | Composite context signal: `Excellent`, `Positive`, `Neutral`, `Caution`, or `High Risk`. It is a tiebreaker only. |

`Overall CTX` does **not** replace rank, tier, ADP, projected value, roster fit, or survival probability. `Neutral` contributes no suggestion-score bonus or penalty.

### Better draft suggestions

Suggestion scoring now incorporates a small contextual adjustment from the new risk/context model while keeping the traditional draft inputs primary.

The model can account for:

- injury / availability
- depth and role uncertainty
- bye-week fit
- team offensive environment
- schedule difficulty
- actual offensive play caller
- play-caller history / first-time caller uncertainty
- offensive-line context
- team transitions
- committee risk
- camp/preseason role signals
- scheme fit when explicitly sourced

A new offensive coordinator is **not automatically a downgrade**. The actual play caller and their history matter more. A first-time caller is treated as uncertainty, not automatically bad.

### Source-backed team context

The branch adds three maintained context datasets:

```text
src/data/teamContext.2026.json
src/data/teamInfrastructure.2026.json
src/data/playerContext.2026.json
```

They separate different kinds of information instead of mixing everything into one opaque score.

#### Team outlook

`teamContext.2026.json` contains compact preseason consensus signals:

- `OFF` — expected fantasy offensive environment
- `DEF` — expected NFL defense strength against opposing offenses
- `SOS` — schedule difficulty (`1` easiest, `32` hardest)

Current source families include Mike Clay / ESPN, ESPN FPI, and Sharp-style schedule/environment inputs. Source dates stay attached to the underlying snapshot instead of being falsely advanced every time the app opens.

#### Coaching / play caller / offensive line

`teamInfrastructure.2026.json` contains:

- offensive coordinator where relevant
- actual offensive play caller
- play-calling experience
- caller-history classification
- first-time-caller status
- current OL consensus rank
- underlying PFF and Sharp OL ranks
- concise sourced OL / transition notes
- real checked dates

Play-caller history uses descriptive states such as:

```text
Excellent
Positive
Neutral
Concerning
Poor
First-time
Not graded
```

#### Player-specific context

`playerContext.2026.json` is reserved for context that team-level data and a depth chart cannot describe well:

- committee risk
- camp/preseason usage
- scheme fit
- short sourced role notes
- confidence and source URLs

Do not populate these files from memory. Unsupported claims should be omitted or marked not graded.

### Large context tooltips

Context cells use larger draft-readable hover/focus cards instead of tiny native browser tooltips.

Current behavior:

- up to roughly 720 px wide
- larger body and heading text
- structured bullets
- injury cards may append general sports-medicine recovery/recurrence context when the available label is specific enough
- general medical context is explicitly not presented as a player-specific diagnosis or return date

The tooltip system is mounted **only after the Draft Room has successfully entered the drafting phase**. It is not installed globally at app startup.

### Resizable draft-board columns

Desktop Draft Room columns can be resized by dragging a header divider.

- widths persist locally in the browser
- double-click a divider to reset widths
- resizing is scoped to the Draft Room player table
- the interaction is mounted only after the draft starts

This scoped design is intentional. Earlier global DOM listeners/observers interfered with the setup-to-draft transition, so the current branch keeps `main.tsx` minimal and mounts these features only after `phase === 'drafting'`.

### League-settings pick clock

A reference countdown appears beside:

```text
Board | Tiers | Teams | NFL Teams
```

The timer uses the league's actual configured draft setting when the platform exposes it:

| Platform | Setting used |
| --- | --- |
| Sleeper | `draft.settings.pick_timer` |
| ESPN | `settings.draftSettings.timePerSelection` |
| Yahoo | `settings.draft_pick_time` |

Behavior:

- resets when the app logs/ingests a new pick
- stays anchored to the latest pick timestamp when switching board tabs
- warning state at 30 seconds or less
- urgent state at 10 seconds or less
- shows `--` instead of inventing a value when the platform does not provide a usable timer
- guest mode has no connected league timer, so no fake league value is assumed

It is a **reference timer**, not the authoritative platform draft clock; API/network/logging delay can create a small offset from the native draft room.

### Setup sanity checks

The Draft Room setup screen includes additional checks for mismatches such as:

- team count
- draft type
- scoring type
- roster slots
- round count
- auction budget
- superflex configuration

The goal is to catch a bad setup before the draft starts instead of discovering it several rounds in.

### Better roster / bye visibility

Roster summaries expose more useful draft-day information, including bye-week concentration and the players/slots involved rather than only raw counts.

### Context validation tooling

The fork adds validation scripts for the hand-maintained context overlay:

```bash
npm run context:check
npm run context:keys -- bijan
```

Before using the branch for a real draft, run:

```bash
npm run context:check
npm run test:run
npm run build
```

See:

- `docs/draft-context-overlay.md`
- `docs/draft-room-readiness-checklist.md`

## Important current-state note

The repository contains `src/api/sleeperLiveContext.ts`, which can hydrate current Sleeper team/injury/depth/practice facts and cache them by day/build.

However, on the current `draft-risk-dashboard` branch, the **global auto-bootstrap is intentionally not called from `src/main.tsx`**. A previous globally installed startup layer caused **Start Mock Draft** to stop transitioning out of setup. The working architecture keeps app startup clean and mounts the tooltip, resize, and clock interactions only after drafting begins.

That means:

- the context datasets and draft UI are active
- the large tooltips are active during drafting
- resizable columns are active during drafting
- the league-settings pick clock is active during drafting
- the old global freshness badge is currently disabled
- automatic global Sleeper live-context hydration still needs to be reintroduced later as a React-scoped feature rather than as startup-wide DOM behavior

This README describes the current working branch, not the earlier broken startup design.

---

## Existing analyzer features retained

The fork keeps the original application's major functionality.

### Draft tools

- snake and auction Draft Room
- mock drafts against AI opponents
- manual live-draft logging
- Sleeper Live Sync for running drafts
- rankings and tiers
- FantasyPros / ESPN / Sleeper market comparisons
- league-scaled auction values
- live auction inflation
- nomination advice and comfort-bid math
- stack / handcuff detection
- positional-run and tier-break alerts
- target / avoid list
- draft queue
- undo
- end-of-draft recap and grades
- keyboard-driven draft flow

### Rankings / draft prep

- overall rankings
- per-position ranking pages
- site-value comparison pages
- guest mode with no league login
- daily rankings refresh/build pipeline

### League analysis

- draft grades from actual season production
- points-left-on-board analysis
- trade verdicts using points above replacement
- waiver receipts
- luck / expected wins / all-play records
- team hub pages
- head-to-head views
- manager skill scores
- league history
- champions wall
- season records
- generated awards and exportable graphics

---

# Install and run locally

## Requirements

- **Node.js 20 or newer**
- npm
- Git
- a modern browser

Check Node first:

```bash
node --version
npm --version
```

`package.json` requires:

```text
node >= 20
```

## 1. Clone the repository

```bash
git clone https://github.com/morgensternR/FantasyFootballAnalyzer.git
cd FantasyFootballAnalyzer
```

## 2. Check out the enhanced fork branch

```bash
git fetch origin
git checkout draft-risk-dashboard
git pull --ff-only
```

Confirm:

```bash
git branch --show-current
```

Expected:

```text
draft-risk-dashboard
```

## 3. Install dependencies

```bash
npm install
```

## 4. Run the development server

```bash
npm run dev
```

Vite normally serves the app at:

```text
http://localhost:5173/
```

Direct Draft Room URL:

```text
http://localhost:5173/draft-room
```

## 5. Run a production build locally

```bash
npm run build
npm run preview
```

Vite preview normally runs at:

```text
http://localhost:4173/
```

## 6. Run validation/tests

Recommended full pre-draft gate:

```bash
npm run context:check
npm run test:run
npm run build
```

Other useful commands:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:coverage
npm run context:keys -- <player-name>
```

---

# Connecting a league

## Guest mode

No account or platform connection is required for the public draft-prep tools.

Guest mode can use:

- Rankings
- Draft Room / mock draft
- Values
- Trade Analyzer
- Draft Grades

Guest mode cannot know a real league's native pick timer unless you manually reproduce the league elsewhere; the fork intentionally does not invent one.

## Sleeper

Sleeper's API is CORS-accessible, so normal Sleeper league loading does not require a custom backend.

The app can use Sleeper for league/draft data and Live Sync.

## ESPN

Public ESPN leagues can be read directly.

Private/historical ESPN leagues use the serverless ESPN proxy so the browser does not need to send ESPN cookies cross-origin.

The existing project defaults to its deployed proxy. If you self-host the proxy, set the frontend variable:

```text
VITE_ESPN_PROXY_URL=https://your-vercel-project.example/api/espn-proxy
```

## Yahoo

Yahoo requires OAuth and the serverless proxy in `api/`.

The frontend defaults to the project's existing Vercel API host. If you deploy your own API layer, set:

```text
VITE_YAHOO_API_URL=https://your-vercel-project.example
```

For a local OAuth round trip, your Vercel development/preview environment must explicitly permit localhost redirects; see `ALLOW_DEV_OAUTH` below.

---

# Optional local environment variables

Create `.env.local` in the repository root when overriding the hosted defaults:

```dotenv
VITE_ESPN_PROXY_URL=https://your-vercel-project.example/api/espn-proxy
VITE_YAHOO_API_URL=https://your-vercel-project.example
VITE_SENTRY_DSN=
```

Do **not** put Yahoo client secrets or ESPN cookies in the frontend environment file.

---

# Self-hosting the serverless API

The React app is static. Vercel is used only for the small `api/` layer that handles Yahoo OAuth/proxying and private ESPN requests.

For your own Vercel deployment, configure server-side environment variables:

```text
FRONTEND_URL=https://your-frontend.example
YAHOO_CLIENT_ID=...
YAHOO_CLIENT_SECRET=...
```

Optional development-only setting:

```text
ALLOW_DEV_OAUTH=1
```

Use `ALLOW_DEV_OAUTH=1` only for development/preview if you want Yahoo OAuth to return to `localhost:5173` or `localhost:4173`. Leave it unset in production.

For optional Sentry source-map uploads in CI/build infrastructure, the project also supports the Sentry build variables documented in `CLAUDE.md`.

---

# Architecture

```text
Browser / React + TypeScript + Vite
        |
        |-- Sleeper API (direct)
        |-- ESPN API (direct for public leagues)
        |-- Vercel api/ layer
              |-- private ESPN proxy
              |-- Yahoo OAuth
              |-- Yahoo API proxy

Bundled draft data + maintained context JSON
        |
        |-- rankings / tiers / ADP / values
        |-- OFF / DEF / SOS
        |-- play caller / OC / OL context
        |-- player-specific committee / scheme notes
```

The frontend is a static SPA. There is no application database and no server-side league-data store.

## Frontend deployment

GitHub Pages serves the built SPA from `gh-pages`.

Manual fallback deployment:

```bash
npm run deploy
```

Normally, use the repository's CI deployment path instead of manually deploying an uncommitted local tree.

## Serverless deployment

Changes under `api/` require a Vercel deployment. Normal React/frontend changes do not.

---

# Draft data and context files

## Generated ranking data

Draft pool data is generated from the rankings pipeline and lives under `src/data/` / `data/raw/`.

Useful commands:

```bash
npm run fetch:rankings
npm run build:draft-data
npm run update:rankings
```

Do not casually commit a stale locally generated draft pool over newer bot-generated data.

## Hand-maintained context data

The new draft-context layer is intentionally separate from generated rankings:

```text
src/data/teamContext.2026.json
src/data/teamInfrastructure.2026.json
src/data/playerContext.2026.json
```

Every analyst/context entry should retain its real source URLs, confidence, and source/check date where applicable.

Refresh policy:

- rankings: daily generated-data pipeline
- Sleeper player status/depth/practice module: daily/cache-aware when safely integrated
- OFF/DEF/SOS: recheck underlying sources before advancing dates
- play caller / OL: recheck underlying sources before advancing dates
- player-specific notes: add only with explicit current sourcing

---

# Main fork files

Key additions compared with `master` include:

```text
docs/draft-context-overlay.md
docs/draft-room-readiness-checklist.md
scripts/listContextOverlayKeys.ts
scripts/validateContextOverlay.ts
src/api/sleeperLiveContext.ts
src/data/playerContext.2026.json
src/data/teamContext.2026.json
src/data/teamInfrastructure.2026.json
src/utils/contextLabels.ts
src/utils/contextOverlayCoverage.ts
src/utils/contextOverlayValidation.ts
src/utils/draftContextView.ts
src/utils/draftRisk.ts
src/utils/draftSetupWarnings.ts
src/utils/injuryOutlook.ts
src/utils/draftBoardEnhancements.ts
src/utils/draftPickClock.ts
src/draftBoardInteractions.css
```

The branch also modifies the Draft Room player table, roster summary, setup screen, and suggested-pick scoring, with additional regression/validation tests around the new behavior.

---

# Current development checklist

Before trusting the branch for a real draft:

```bash
npm run context:check
npm run test:run
npm run build
```

Then smoke-test:

1. Open `/draft-room`.
2. Confirm setup values match the league.
3. Start a mock draft.
4. Confirm the board opens normally.
5. Confirm Role / Bye Fit / Injury / Outlook / Team Changes / Overall CTX render.
6. Hover context cells and confirm the large cards appear.
7. Resize a column and reload to confirm its width persists.
8. Confirm the pick clock matches the connected league's configured pick time.
9. Log/ingest a pick and confirm the reference clock resets.
10. Verify queue, quick draft, undo, suggested picks, and roster/bye updates.

---

# Documentation

- `README.md` — overview, fork changes, installation, local run instructions
- `CLAUDE.md` — architecture, deployment, data pipeline, environment, contributor notes
- `docs/draft-context-overlay.md` — detailed context-model behavior and source discipline
- `docs/draft-room-readiness-checklist.md` — pre-draft validation/smoke-test checklist
- `docs/FANTASY_FOOTBALL.md` — fantasy/domain rules and platform behavior
- `docs/DESIGN_SYSTEM.md` — GRIDIRON design language
- `docs/API_REFERENCE.md` — platform endpoint notes
- `docs/archive/` — superseded/historical documentation
