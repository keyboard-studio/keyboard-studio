# Data Model: Documentation completeness (spec 076)

**Date**: 2026-09-10 | **Source**: [spec.md](spec.md) Key Entities + [research.md](research.md)

New types are additive to `@keyboard-studio/contracts` (no locked-contract edits; the
`Pattern` schema is untouched). Each runtime-boundary type gains a zod mirror in
`packages/contracts/src/schemas.ts` with the standard compile-time drift guard.

## 1. `DocMemberId` / `DocMemberState` (spec: "Documentation member", "Source tier")

```ts
type DocMemberId =
  | "readme-md"        // README.md
  | "history-md"       // HISTORY.md
  | "license-md"       // LICENSE.md
  | "readme-htm"       // source/readme.htm
  | "welcome-htm"      // source/welcome/welcome.htm
  | "help-php";        // source/help/<id>.php

type DocSourceTier = "derived" | "inherited" | "authored";

interface DocMemberState {
  member: DocMemberId;
  /** Projected output path, e.g. "source/welcome/welcome.htm". */
  path: string;
  /** Highest-priority tier that contributed prose (FR-005 order). */
  tier: DocSourceTier;
  /** True while content is the fallback stub (FR-017 marker). */
  placeholder: boolean;
  /** Step id that supplies this member's content (checklist link-back target). */
  fillStepId: string;
  /** Row annotations, e.g. missing inherited images (edge case). */
  warnings: string[];
}
```

**Derivation, not storage**: `deriveDocMemberStates(input)` (engine, pure) is the
single source of truth (research R5). Validation rule: exactly six entries, one per
`DocMemberId`; `tier` respects the FR-005 priority — `authored` only when an author
answer contributed prose, `inherited` only on Track 2 with base content present,
otherwise `derived`.

**State transitions** (per member): `derived+placeholder` → (base instantiation)
`inherited` → (author answer / HISTORY confirm) `authored`; `placeholder` clears when
the member's governing content passes the stub test. Dismissing the HISTORY proposal
returns `history-md` to `placeholder: true` (FR-011).

## 2. `BaseDocumentationProfile` (spec: "Base documentation profile")

```ts
type BaseDocLevel = "none" | "minimal" | "full" | "unknown";
type WelcomeConvention = "folder" | "flat" | "absent";

interface BaseDocumentationProfile {
  level: BaseDocLevel;               // "unknown" until computed (spec assumption)
  members: DocMemberId[];            // members the base ships (from .kps <Files>)
  welcomeConvention: WelcomeConvention;
  /** Welcome-folder image paths declared by the base's .kps (source/-relative). */
  welcomeImages: string[];
  /** FR-009 gate: base has a usable description per the spec's threshold. */
  hasUsableDescription: boolean;
}
```

Computed by `classifyBaseDocumentation(kpsFiles, welcomeText?, helpText?)` (engine,
pure) for the focused/selected base only (FR-008) and cached on an additive optional
`BaseKeyboard.docProfile?` carrier field (`packages/contracts/src/baseKeyboard.ts`). Validation: `level === "full"` ⇒ `hasUsableDescription`; `welcomeConvention ===
"folder"` wins when both conventions exist (spec edge case); a `.kps`-declared welcome
file that 404s downgrades to `absent` (edge case: ghost descriptor entry).

## 3. `HistoryEntryState` (spec: "HISTORY proposal")

```ts
type HistoryProposalStatus = "proposed" | "confirmed" | "edited" | "dismissed";

interface HistoryProposal {
  /** Version the heading was derived for; re-derived on version change. */
  version: string;
  /** Injected date recorded at proposal/confirmation time (determinism, R12). */
  dateIso: string;
  bullets: string[];
}

interface HistoryEntryState {
  status: HistoryProposalStatus;
  proposal: HistoryProposal;
  /** Author-edited bullets; null until edited. */
  editedBullets: string[] | null;
}
```

Store slice on `workingCopyStore`, persisted like `helpDocs`. Transitions:
`proposed` → `confirmed` | `edited` | `dismissed`; a keyboard-version change re-derives
`proposal.version`/heading and preserves `editedBullets` (spec edge case). Invariant:
on adaptations the rendered entry always contains the "Adapted from" bullet regardless
of `editedBullets` (FR-012 — injected at render, not stored).

## 4. `LayoutChartFile` / `LayoutChartInput` (spec: "Layout chart")

```ts
interface LayoutChartFile {
  /** "ks-layout-<platform>-<layer>.svg" — reserved prefix, collision-free (FR-015). */
  filename: string;
  platform: "desktop" | "phone" | "tablet";
  layerId: string;
  svg: string;              // deterministic text (FR-014)
}

interface LayoutChartInput {
  displayName: string;
  kvks: KvksIR | null;                  // desktop labels when present
  ir: KeyboardIR;                       // desktop fallback via rule outputs
  touchLayout: TouchLayoutIR | null;    // geometry-bearing touch model
}
```

Validation: one file per (platform, layer) pair present in the model; zero touch files
when `touchLayout` is null (edge case: desktop-only) and vice versa; `filename` is a
pure function of `(platform, layerId)`.

## 5. `ChartPreference` (working-copy slice)

```ts
type ChartPreference = "keep-base-images" | "regenerate";
```

Defaults to `keep-base-images` when the base ships images, `regenerate` (i.e.
generate) otherwise (FR-015). Author-settable; persisted.

## 6. Base doc fetch bundle (loader result extension)

`FetchKeyboardSourceResult` gains (all optional, fetch-don't-write like the existing
`baseWelcomeHtmText`):

```ts
baseReadmeMdText?: string;
baseHistoryMdText?: string;
baseWelcomeImages?: Array<{ path: string; bytes: Uint8Array }>;  // source/-relative
baseWelcomeConvention?: WelcomeConvention;
```

`baseWelcomeHtmText` resolution order changes to: descriptor-named → folder → flat
(research R3). Corresponding retained slices on `workingCopyStore` follow the existing
`baseWelcomeHtmText` pattern (set on the adapt branch; images also set on Track 1 for
R9 skeleton/image inheritance — prose fields stay null on Track 1, FR-007).

## 7. `DocLintInput` (keyboard-lint check input, spec: "Documentation finding")

```ts
interface DocLintInput {
  keyboardId: string;
  keyboardVersion: string;          // from .kmn &VERSION / identity
  targets: string[];                // parsed &TARGETS tokens
  layerIds: string[];               // desktop + touch layer ids for 11.6
  displayName: string;              // for 11.7 page-name format
  copyrightHolders: {               // for 4.7
    license?: string; kmn?: string; kps?: string; readme?: string; history?: string;
  };
  members: Partial<Record<DocMemberId, string>>;  // rendered/current member texts
  deletedFilenames: string[];       // for 3.7
  baseHistoryMdText?: string;       // for 3.4 (entries present at instantiation)
}
```

Checks are pure `(input: DocLintInput) => LintFinding[]`; findings use the existing
`LintFinding` contract (`code` = the criteria row's `lintRuleId`, `severity:
"warning"`, `layer: "C"`, `hint` populated, `origin` set by the studio-side
upstream classifier — research R7/R8). No new finding type is introduced.

## 8. Relationships

```
BaseKeyboard ──(select)──► BaseDocumentationProfile ──(FR-009)──► pf_welcome_paragraph required?
      │
      ▼ instantiate (track-gated, R9)
workingCopyStore: helpDocs, historyEntryState, chartPreference, base*Text/Images
      │                                   │
      ▼ deriveDocMemberStates (R5)        ▼ buildHistoryProposal (R6, reads decision record)
DocMemberState[6] ──► Output checklist (FR-017)
      │
      ▼ projection step 5c (+ charts R2, welcome folder R3, renderHistoryMd R6)
projected VFS ──► collectDocLintInput ──► doc checks (R7) ──► LintFinding[] (origin via R8)
      │
      ▼ descriptor build/patch (R3) ──► .kmp / .zip / PR (unchanged delivery)
```
