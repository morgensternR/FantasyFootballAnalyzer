# Draft context overlay

The Draft Room uses two context layers that stay separate from the base ranking/ADP projection pipeline.

## 1. Live Sleeper player facts

`src/api/sleeperLiveContext.ts` refreshes current Sleeper player facts when the app is opened and the local cache is stale for the current date or bundled pool build.

The compact cache carries only draft-relevant fields for players already in the pool:

- current NFL team
- status / injury status and details
- depth-chart order
- rookie status
- additional Sleeper facts retained for future use (practice participation and depth-chart position)
- NFL season/week state

The app uses a same-day local cache first, refreshes in the background when stale, and keeps the bundled/stale data when Sleeper is unavailable. A successful refresh rerenders the app in place; it does not reset an in-progress draft.

Sleeper facts remain factual inputs. Depth-chart order is a role clue, not a snap-share or workload projection.

## 2. Sourced team/player context

Team context lives in:

```text
src/data/teamContext.2026.json
```

Player-specific analyst context lives in:

```text
src/data/playerContext.2026.json
```

The team file exposes four compact fantasy-facing signals:

- `OFF`: consensus offensive environment
- `DEF`: consensus defensive strength
- `SOS`: consensus schedule difficulty (`1` easiest, `32` hardest)
- `CTX`: coaching/play-caller/scheme uncertainty

The raw UI does not show every contributing source metric. Source URLs, confidence, checked date, and supporting fields remain in the JSON/tooltips for auditability.

The current 2026 baseline uses the sourced Mike Clay / ESPN FPI / Sharp inputs researched for this project. `scheduleConfidence: low` means the underlying schedule models materially disagree rather than pretending the consensus rank is precise.

Live player injuries are intentionally not frozen into `CTX`; Sleeper handles those separately so a dated team snapshot does not leave an old injury warning behind.

## Team entry example

```json
{
  "teams": {
    "DET": {
      "offenseRank": 3,
      "defenseRank": 9,
      "scheduleRank": 1,
      "scheduleConfidence": "high",
      "contextTrend": "down",
      "contextNote": "New offensive play-caller; elite underlying offense and favorable schedule.",
      "ocChange": true,
      "playCallerChange": true,
      "contextDate": "2026-08-13",
      "confidence": "medium",
      "sourceUrls": ["https://example.com/source"]
    }
  }
}
```

Team keys must use this repository's canonical draft-pool abbreviations. For example, Jacksonville is `JAC` even though Sleeper/ESPN commonly use `JAX`.

## Player entry example

```json
{
  "players": {
    "bijan-robinson-rb": {
      "roleTag": "Lead committee",
      "committeeRisk": "medium",
      "campSignal": "Rotating with starters",
      "schemeFit": "neutral",
      "draftNote": "Role note backed by current reporting.",
      "confidence": "medium",
      "sourceUrls": ["https://example.com/source"]
    }
  }
}
```

Player entries can be keyed by any supported current-pool key:

```text
stable generated id       bijan-robinson-rb
Sleeper id                9758
normalized name           bijan robinson
normalized name + team    bijan robinson|ATL
raw name + team           Bijan Robinson|ATL
```

The stable generated id is preferred.

## UI behavior

The board keeps the display compact. A team-only context cell can look like:

```text
Elite · Very easy
Strong · Neutral
Weak · Hard
```

Hovering exposes OFF/DEF/SOS/CTX ranks, confidence, notes, checked date, and source URLs. Player-specific committee/camp/scheme notes take priority when present.

Context remains a small suggestion tiebreaker. It must not override a clear value/tier/roster-fit advantage by itself.

## Source discipline

Every populated sourced context entry must include:

```text
confidence
sourceUrls
```

Do not populate analyst context from memory. If a claim cannot be sourced, omit it.

## Validation

Find supported player keys:

```powershell
npm run context:keys -- bijan
```

Validate source/schema/pool coverage:

```powershell
npm run context:check
```

Before merging or using the branch for a real draft:

```powershell
npm run context:check
npm run test:run
npm run build
```

## Refresh policy

- Sleeper injury/team/depth facts: refresh on app use when the daily cache/build is stale.
- Base ranking feeds: existing daily GitHub Actions refresh/rebuild/deploy pipeline.
- Clay/FPI/Sharp/coaching team model: keep its real checked/source dates. Do not change `contextDate` merely because the app opened; refresh the snapshot only after the underlying sources are actually checked.
