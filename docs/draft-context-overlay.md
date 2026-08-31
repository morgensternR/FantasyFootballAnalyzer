# Draft context overlay

The Draft Room keeps live factual inputs separate from slower analyst/model context, then compresses them into fast-scanning draft signals.

## 1. Live Sleeper player facts

`src/api/sleeperLiveContext.ts` refreshes current Sleeper player facts when the app is opened and the local cache is stale for the current date or bundled pool build.

The compact cache carries only draft-relevant fields for players already in the pool:

- current NFL team
- status / injury status and details
- practice participation
- depth-chart order and position
- rookie status
- NFL season/week state

The app uses a same-day local cache first, refreshes in the background when stale, and keeps bundled/stale data when Sleeper is unavailable. A successful refresh rerenders the app in place; it does not reset an in-progress draft.

Sleeper facts remain factual inputs. Depth-chart order is a role clue, not a snap-share or workload projection.

## 2. Season outlook

Team projection context lives in:

```text
src/data/teamContext.2026.json
```

The file retains compact preseason consensus signals:

- `OFF`: expected offensive environment
- `DEF`: expected strength of that NFL team's defense against opposing offenses
- `SOS`: schedule difficulty (`1` easiest, `32` hardest)

Important UI rule:

- QB/RB/WR/TE/K Outlook shows **OFF + SOS**.
- D/ST Outlook shows **DEF + SOS**.
- `DEF` is not offensive-line defense, pass protection, or a blocking metric.

`scheduleConfidence: low` means the underlying schedule sources materially disagree; the app exposes that instead of pretending the consensus rank is precise.

## 3. Team Changes / offensive infrastructure

Current play-caller and offensive-line context lives in:

```text
src/data/teamInfrastructure.2026.json
```

It contains:

- offensive coordinator where relevant
- actual offensive play caller
- play-calling experience
- play-caller history classification
- CBS rank among new 2026 play callers when applicable
- one offensive-line consensus rank
- underlying PFF and Sharp OL ranks
- concise sourced OL change/availability notes

A coordinator title change is not automatically a downgrade. The actual play caller matters more.

Play-caller history uses these descriptive states:

```text
Excellent
Positive
Neutral
Concerning
Poor
First-time
Not graded
```

`First-time` is deliberately neutral uncertainty, not an automatic negative.

The OL column is also compressed rather than exposing multiple metrics. `offensiveLineRank` is the derived consensus order from the current PFF and Sharp 2026 all-team ranks; the raw source ranks stay in the Team Changes tooltip so disagreement remains visible.

## 4. Player-specific analyst context

Player-specific context lives in:

```text
src/data/playerContext.2026.json
```

This is for items that the team model and Sleeper factual feed do not adequately describe:

- committee risk
- camp/preseason usage
- scheme fit
- short sourced role/draft notes

Example:

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

Player entries can be keyed by stable generated id, Sleeper id, normalized name, or name+team. The stable generated id is preferred.

## Draft Room UI

The desktop board exposes six context columns:

```text
NFL Role | Bye Fit | Injury | Outlook | Team Changes | Overall CTX
```

Phone rows expose the same information in compact inline labels.

### Injury

Fast label examples:

```text
Healthy
Questionable
PUP
IR
```

Hover bullets can include:

- current Sleeper status
- body part
- practice participation
- injury start date
- Sleeper note
- refresh behavior

Sleeper is the live factual backbone. External injury-news sources may add prognosis/return-timeline context later without replacing Sleeper status.

### Outlook

Fast label examples:

```text
Elite · Very easy
Strong · Neutral
Weak · Hard
```

For an offensive player, those labels mean team offense + schedule. For D/ST, they mean team defense + schedule.

### Team Changes

Fast label examples:

```text
Stable · Excellent · OL #9
New caller · First-time · OL #26
New caller · Concerning · OL #10
```

Hover bullets show the actual caller, history, experience, OC/caller-change flags, OL consensus/source ranks, scheme/transition notes, and checked dates.

### Overall CTX

Overall CTX is the one quick composite summary:

```text
Excellent
Positive
Neutral
Caution
High Risk
```

It combines the already-visible context categories rather than introducing another independent data source:

- injury / availability
- team offensive environment (or defense for D/ST)
- schedule
- play-caller history
- offensive line for offensive players
- team transition context
- player committee/scheme notes when populated

Overall CTX is only a tiebreaker. Rank, tier, ADP, projected value, roster fit, and survival remain primary. `Neutral` gives no suggestion-score bonus or penalty.

## Source discipline

Sourced analyst entries retain real source URLs and checked dates. Do not advance a checked date merely because the app opened.

Current source families include:

- Mike Clay / ESPN FPI / Sharp for compact OFF/DEF/SOS context
- CBS 2026 play-caller/infrastructure analysis for caller identity/history
- PFF and Sharp 2026 OL rankings for the OL consensus
- Sleeper for live player status/depth/practice facts

Do not populate analyst context from memory. If a claim cannot be sourced, omit it or mark it not graded.

## Validation

Find supported player keys:

```powershell
npm run context:keys -- bijan
```

Before merging or using the branch for a real draft:

```powershell
npm run context:check
npm run test:run
npm run build
```

## Refresh policy

- Sleeper injury/team/depth/practice facts: refresh on app use when the daily cache/build is stale.
- Base ranking feeds: existing daily GitHub Actions refresh/rebuild/deploy pipeline.
- OFF/DEF/SOS, play-caller history, and OL context: retain their real source/check dates until the underlying sources are actually rechecked.
