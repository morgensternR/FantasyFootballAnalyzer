# Draft offensive volume and snap context

The Draft Room treats **projected workload** and **historical snap usage** as different signals.

A snap percentage from last season is an observed usage fact. Carries, targets, pass attempts, and receptions for the upcoming season are projections. The UI never labels a historical snap percentage as a projected snap share.

## Draft Room display

Volume is intentionally folded into the existing **NFL Role** column rather than adding another structural table column.

Examples:

```text
RB1
285 CAR · 77 TGT
```

```text
WR1
146 TGT
```

```text
QB1
575 PA · 82 RU
```

Hovering the role/volume cell opens the large Draft Room tooltip with:

- the normal depth-chart/role explanation
- consensus projected carries / targets / attempts
- RB projected opportunities (`carries + targets`)
- number of projection sources
- model disagreement / confidence
- each source's raw projection
- previous-season offensive snaps
- previous-season offensive snap percentage
- previous-season last-four-active-games snap percentage
- source URLs

If no projection exists but a previous-season snap record does, the compact fallback is the historical snap percentage, for example `79% SNP`.

## Automatic sources

### FantasyPros consensus projections

The updater queries FantasyPros preseason NFL statistical projections for QB, RB, WR, and TE.

Source / API documentation:

- https://api.fantasypros.com/public/v2/docs/

Fields used when available:

- passing attempts
- rushing attempts
- receiving targets
- receptions

FantasyPros is treated as one projection model/consensus input, not ground truth.

### Sleeper season projections

The updater also queries Sleeper's public season projection feed for QB/RB/WR/TE and reads:

```text
pass_att
rush_att
rec_tgt
rec
```

The endpoint is public and used by Sleeper's web client, but it is not part of Sleeper's stable documented API. For that reason it is best-effort: a Sleeper endpoint change must not erase otherwise-good volume data.

### nflverse / Pro-Football-Reference snap counts

Previous-season game-level snap data comes from nflverse's snap-count release:

```text
https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_<season>.csv
```

The upstream snap-count data includes:

```text
offense_snaps
offense_pct
```

The updater uses regular-season games and computes:

- total offensive snaps
- season weighted offensive snap percentage
- last four active games weighted offensive snap percentage
- games with offensive snaps

These are **actual previous-season usage values**, not upcoming-season projections.

## Position-specific volume logic

### RB

Primary draft workload:

```text
projected opportunities = projected carries + projected targets
```

The compact board shows carries and targets separately because two backs with identical total opportunities can have substantially different receiving floors.

### WR / TE

Targets are the primary fantasy-volume signal. Snap percentage is useful context but can be misleading for blocking-heavy tight ends or low-target full-time receivers.

The tooltip also shows projected receptions when available.

### QB

Passing attempts are the primary volume signal, with projected rushing attempts shown alongside them when available.

## Consensus and confidence

Every source remains visible separately in the tooltip. The displayed consensus is a simple mean of available source projections for each stat.

For a position's primary volume metric, disagreement is:

```text
spread % = (highest source - lowest source) / source mean × 100
```

Current confidence labels:

```text
High    <= 10% spread
Medium  <= 20% spread
Low      > 20% spread
Single  only one source supplies the primary metric
```

The source spread is useful information in its own right. A wide range often indicates committee, role, injury, rookie, or depth-chart uncertainty that should not be hidden inside one average.

## Optional commercial / manually imported sources

The pipeline supports additional projections without brittle automated scraping of paid or restricted sites.

Candidate sources include:

- 4for4
- Footballguys
- RotoWire
- Fantasy Life
- CBS Sports

Use data only when the user/project has permission to access and store it. Put manually exported/licensed values in:

```text
data/volume/manual.<season>.json
```

Example:

```json
{
  "sources": [
    {
      "id": "4for4",
      "label": "4for4",
      "url": "https://www.4for4.com/fantasy-football-projections/2026",
      "checkedAt": "2026-08-30",
      "note": "Manually imported from an authorized projection view/export."
    },
    {
      "id": "footballguys",
      "label": "Footballguys",
      "url": "https://www.footballguys.com/projections",
      "checkedAt": "2026-08-30"
    }
  ],
  "players": [
    {
      "source": "4for4",
      "name": "Bijan Robinson",
      "team": "ATL",
      "pos": "RB",
      "rushAttempts": 285,
      "targets": 76,
      "receptions": 60
    },
    {
      "source": "footballguys",
      "name": "Bijan Robinson",
      "team": "ATL",
      "pos": "RB",
      "rushAttempts": 296,
      "targets": 72,
      "receptions": 57
    }
  ]
}
```

Supported manual metrics are:

```text
passAttempts
rushAttempts
targets
receptions
```

Unknown players or ambiguous same-name players are skipped rather than joined to the wrong draft-pool row.

## Update commands

Refresh only volume/snap context:

```bash
npm run update:volume
```

Specify another season:

```bash
npm run update:volume -- --season=2027
```

The normal full ranking refresh now also refreshes volume after rebuilding the draft pool:

```bash
npm run update:rankings
```

The order matters because the volume updater joins all sources to the stable player ids in the freshly generated draft pool.

## Generated files

```text
src/data/volumeContext.<season>.json
src/data/volumeContext.ts
```

Do not hand-edit either generated file.

`src/data/volumeContext.ts` is the season indirection, following the same pattern as `draftPool.ts`.

## Failure behavior

The volume pipeline is designed to degrade safely:

- individual projection sources are independent
- if FantasyPros fails but Sleeper succeeds, Sleeper volume still ships
- if nflverse is unavailable, projections still ship without historical snap context
- if **all** projection sources fail, the updater exits without replacing existing good volume context with an empty file
- source-specific values remain in the output so a consensus number can always be audited

## Draft-start safety

The volume UI does not run during Draft Setup or application startup.

It mounts only after the room has already entered the `drafting` phase, through the same scoped lifecycle used by the pick clock / large context interactions. It does not add or reparent React-owned table rows or cells; the compact volume label is rendered as a CSS second line inside the existing NFL Role cell.

This constraint is intentional because an earlier global DOM/bootstrap implementation interfered with **Start Mock Draft**.
