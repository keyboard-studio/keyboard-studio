# Data model: Test-and-revise loop

These are studio-side types. The `Pattern` schema and `@keyboard-studio/contracts` are not
touched (Article I). Every record persists inside the existing `DurableDraft` envelope as one
optional field, `testing?: TestingRecord` (see [research.md](research.md) R6).

## TestingRecord

| Field | Type | Notes |
|---|---|---|
| `nextBuildNumber` | integer ≥ 1 | Advanced only after a build succeeds (FR-011). On a two-device merge, the maximum of the two. |
| `builds` | `TestBuild[]` | Kept in the order they were made. |
| `reports` | `TesterReport[]` | Kept in the order they were recorded. |

A missing or empty record means no testing has happened yet. A draft without the field behaves
exactly as it does today.

## TestBuild

| Field | Type | Notes |
|---|---|---|
| `buildId` | string (random, 16 hex) | Unique key used for the two-device merge. |
| `number` | integer ≥ 1 | The N in "Test build N". Two builds share a number only after a two-device collision, and the list then flags both. |
| `version` | string | T(N) from R1, recorded as it was built. |
| `createdAt` | ISO-8601 string | Client clock, display only. |
| `fingerprint` | 64-hex SHA-256 | Taken over the publish projection in stable mode (R7), so the three-part version rule and the HISTORY date never make unedited builds differ. |
| `decisionCursor` | integer ≥ 0 | The decision-record entry count when the build was made. |
| `changedSections` | `string[]` (stage ids) | Derived when the build is made, from entries between the previous build's cursor and this one. Can contain `"source"` for a direct `.kmn` edit. |
| `identicalTo` | integer? | Set to the previous build's number when the fingerprints match. |

**Validation**

- `version` must pass kmc-package's version regex.
- For any two builds where a.number < b.number, `compareVersions(a.version, b.version) < 0`.
- Every build's version is strictly lower than `resolvePublishVersion(..., hasTestBuilds: true)`.

## TesterReport

| Field | Type | Notes |
|---|---|---|
| `reportId` | string (random) | Merge key. |
| `text` | string, 1-2000 chars | The author's own note (FR-012). |
| `foundInBuild` | integer | Must be the number of an existing build. |
| `sectionId` | stage id? | Optional. It must be a step in the manifest, and it opens with the Output return (FR-013). |
| `status` | `"open" \| "fixed"` | |
| `markedFixedAt` | integer? | The decision cursor when the report was marked fixed. |
| `fixedInBuild` | integer? | Set when the next build is made after the report was marked fixed (FR-014). Cleared if the report is reopened. |

**State transitions**

```text
open --markFixed--> fixed (fixedInBuild unset)
fixed (unset) --next successful build--> fixed (fixedInBuild = N)
fixed --reopen--> open (markedFixedAt and fixedInBuild cleared)
```

## Derived (not stored)

- **OutputBlocker** `{ kind: "touchStale" | "coverage" | "license" | "attribution" | "notReady"
  | "versionUnsupported", stepId?, messageId }`. Computed by `outputBlockers()` (R5).
- **ChangedSinceLastBuild** `{ changed: boolean, sections: string[] }`. Computed when the publish
  hand-over opens, by comparing the current fingerprint with the last build's (FR-016).
- **RevisionArrival** `{ returnTo: Location, snapshot: RevisionSnapshot }`, where `RevisionSnapshot`
  is the draft envelope's `workingCopy`, `phaseBDraft`, `surveyAnswers` and `decisionRecord`
  (no traversal). Kept in StepHost
  component state for the lifetime of one deep-link arrival and never persisted (R3).

## Lifecycle

- **Start over** clears the whole `TestingRecord` (FR-015).
- **Submitted project**: the record is kept, and the UI renders it read-only.
- **Publish projection**: never reads `builds` or `reports` (FR-010). The only thing it reads is
  `hasTestBuilds = builds.length > 0`, for the three-part version rule in R1.
