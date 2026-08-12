# Draft context overlay

The draft room has a manual context overlay for information that the base ranking feeds do not reliably encode:

- offensive coordinator or play-caller changes
- offensive line, run-blocking, and pass-blocking context
- committee risk
- camp or beat-writer usage signal
- scheme fit
- short draft notes

The overlay is intentionally separate from the fetched rank/ADP pipeline. It should be maintained as sourced analyst context, not as a replacement projection model.

## Files

Team-level notes live in:

```text
src/data/teamContext.2026.json
```

Player-level notes live in:

```text
src/data/playerContext.2026.json
```

The draft board combines both through:

```text
src/utils/contextLabels.ts
```

Validation lives in:

```text
src/utils/contextOverlayValidation.ts
scripts/validateContextOverlay.ts
```

## Team entry example

```json
{
  "teams": {
    "DET": {
      "ocChange": true,
      "playCallerChange": true,
      "offensiveLineRank": 3,
      "runBlockRank": 2,
      "passBlockRank": 6,
      "schemeNote": "New play caller; strong line context remains a positive input.",
      "confidence": "medium",
      "sourceUrls": ["https://example.com/source"]
    }
  }
}
```

## Player entry example

```json
{
  "players": {
    "sleeper-player-id": {
      "roleTag": "Lead committee",
      "committeeRisk": "medium",
      "campSignal": "Rotating with starters",
      "schemeFit": "neutral",
      "draftNote": "Do not reach above same-tier RB/WR unless roster need is strong.",
      "confidence": "medium",
      "sourceUrls": ["https://example.com/source"]
    }
  }
}
```

## Source discipline

Any populated note must include:

```text
confidence
sourceUrls
```

The validator fails if a note has draft content but no source URL. That is intentional. Empty overlay files are valid.

## Validation

Run:

```powershell
npm run context:check
```

Before a real draft data refresh, run the full check:

```powershell
npm run context:check
npm run build
npm run test:run
```

## UI behavior

The board shows a compact `Context` label and puts details in the hover tooltip.

Typical labels:

```text
—
Note
Committee
Camp
Scheme good
New OC
OL #12
```

`—` means the player has no manual overlay note and no team-level context note.

## Maintenance rule

Do not populate this overlay from memory. Use current sources and keep source URLs in the JSON entry. If a note cannot be sourced, leave the player/team blank.
