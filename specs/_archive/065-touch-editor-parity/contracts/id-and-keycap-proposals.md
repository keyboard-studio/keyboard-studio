# Contract: id and keycap proposals

**Feature**: 065-touch-editor-parity (US5) · **Extends**
[specs/063-touch-key-editor/contracts/key-id-policy.md](../../063-touch-key-editor/contracts/key-id-policy.md),
which stays authoritative for the four existing minting rows.

Owner: `packages/engine/src/pattern-apply/proposeTouchKeyId.ts` (new) and
`keycapRelatedness.ts` (new). `keyIdMinting.ts` is **not** modified except to admit one member to
`KeyIdMintingPath`.

This is the §3c requirement — "defaults are the product", propose-then-confirm, "no default is a
defect". The measure is SC-007: for every character class an author can reach, the editor proposes
an id and a keycap, **or states why it cannot**.

---

## 1. `proposeTouchKeyId` — the inherit-first wrapper

```ts
export interface TouchKeyIdProposalRequest {
  readonly chars: string;
  readonly inheritedId?: string;
  readonly ruleIndex: TouchKeyRuleIndex;
  readonly expectedOutputs: readonly string[];
  readonly capsHandled: boolean;
  readonly bcp47?: string;
  readonly caseTripleRequested?: boolean;
  readonly sharedCandidateCount?: number;
}

export function proposeTouchKeyId(req: TouchKeyIdProposalRequest): TouchKeyIdProposal;
```

`TouchKeyIdProposal extends KeyIdMintingProposal` with `because: TouchKeyIdProposalReason` and an
optional `noProposalReason`.

### 1.1 Order of attempt

| Step | Condition | Result |
|---|---|---|
| 1. **Inherit** (FR-029) | `inheritedId` present **and** `producedByKeyId(ruleIndex, inheritedId)` covers every entry of `expectedOutputs` | `path: "inherited"`, `id: inheritedId`, `ruleRequired: false`. **No rule is written.** |
| 2. **Existing producer** (FR-030) | some physical key id already produces `chars` | that id is proposed, `ruleRequired: false` |
| 3. **Mint** (FR-031) | otherwise | delegate to `proposeKeyId` — `unicode-default`, `combining-mark-guard`, `multi-codepoint-string`, `case-triple`, unchanged |
| 4. **None** (FR-032) | no path applies | `noProposalReason` set; the panel states why |

**"Never by geometric proximity"** (FR-030) is structural, not a promise: the request shape carries
no row, no index, no coordinate. The only question askable is `producedByKeyId`.

`expectedOutputs` covers FR-029's "**default and modifier** outputs" — the inherited id must still
produce *everything* the physical key produced, not just its unshifted output. A physical key whose
shift output has been reassigned fails step 1 and falls through to minting, which is correct.

### 1.2 `NoProposalReason` — FR-032's "state why"

```ts
export type NoProposalReason =
  | { readonly kind: "titlecase-self-third-form" }
  | { readonly kind: "unassigned-codepoint" }
  | { readonly kind: "variation-selector-only" }
  | { readonly kind: "emoji-sequence-unsupported" }
  | { readonly kind: "empty-output" };
```

Structured, never prose (FR-037). The studio composes and localizes each into
`key-property-panel-no-proposal-reason`.

`titlecase-self-third-form` needs **no new engine logic** — `NoCaseTripleReason` already carries it,
because `caseCounterpart` tests only `\p{Ll}`/`\p{Lu}` and a General_Category `Lt` character (Ǆ, Ǉ,
Ǌ) is its own third case-form. It is fail-safe by design. What this feature adds is the *copy* that
says so, instead of silently offering nothing (spec Edge Cases).

`empty-output` covers the dotted-circle-with-nothing-on-it edge case: a keycap that is a bare U+25CC
credits no character, so there is nothing to propose an id for.

### 1.3 The gap analysis is a prerequisite, not a deliverable

FR-032 is only meaningful once the reachable character classes are enumerated. The class table —
titlecase characters, free-standing modifier symbols, emoji sequences, variation selectors, plus the
four already-handled minting rows — is the **first task of US5**, and the table-driven test asserting
"proposal or stated reason" for each row is what makes SC-007 checkable rather than aspirational.

---

## 2. `proposeKeycap` (FR-033, FR-034)

```ts
export function proposeKeycap(output: string): KeycapProposal;

export interface KeycapProposal {
  /** The default, pre-selected form. */
  readonly keycap: string;
  /** Which rule produced it. */
  readonly form: "character" | "dotted-circle-carrier";
  /** Present only for a combining mark: the standalone form, offered explicitly. */
  readonly alternative?: { readonly keycap: string; readonly consequence: KeycapConsequence };
}

export type KeycapConsequence = { readonly kind: "renders-without-carrier" };
```

| Output | Default keycap | Alternative offered |
|---|---|---|
| combining mark (`\p{M}`) | `U+25CC` + the mark | the bare mark, with its rendering consequence stated |
| anything else | the character itself | none |

- The dotted-circle carrier is the **default** for a combining mark (FR-033).
- The standalone form is an **explicit non-default alternative**, and offering it must state the
  consequence (FR-034) — the studio localizes `KeycapConsequence`, the engine names it.
- The keycap **need not match the output** (spec Clarifications: "keycaps for letters can, but won't
  always match"). `proposeKeycap` proposes; it never enforces.

### 2.1 `keycapAuthored` — a proposal never overwrites a hand edit

FR-035: once the author edits a keycap by hand, later output changes must not rewrite it.

- `TouchKeyIR.keycapAuthored?: boolean`, additive and optional. Absent means proposal-managed,
  which is the right reading for every existing corpus key.
- Set **only** by the property panel's keycap field on author edit. Never by a proposal.
- Read by `proposeKeycap`'s caller to skip re-proposing, and by the mismatch detector to suppress.
- Studio state on the IR, not a wire property — so it does not survive export→reimport, which is
  correct: a reimported keyboard has no record of who typed what.

---

## 3. `isKeycapRelated` — the mismatch guard (FR-036)

```ts
export function isKeycapRelated(
  keycap: string,
  output: string,
  opts?: { readonly bcp47?: string },
): boolean;
```

`TOUCH_KEY_KEYCAP_MISMATCH` fires only when this returns `false`. **All five tests must fail** before
the hint is raised — the guard is deliberately generous, because a false mismatch on a legitimate
keyboard is worse than a missed one.

| # | Test | Makes related |
|---|---|---|
| 1 | **Identity** after NFC | `é` ↔ `é` |
| 2 | **Case variants** — `toLocaleUpperCase`/`toLocaleLowerCase` under `bcp47` | `A` ↔ `a` |
| 3 | **Normalization variants** — NFC/NFD equality, plus **NFKD** equality | `1` ↔ `١`, `ﬁ` ↔ `fi` |
| 4 | **Dotted-circle carrier** — strip `U+25CC`, retest | `◌́` ↔ `́` |
| 5 | **Spacing-accent stand-in** — a spacing clone whose NFKD-decomposed combining form matches the output's mark | `` ` `` ↔ `U+0300` |

**Test 3 is the only place compatibility decomposition is used in this codebase for this purpose.**
The house rule — canonical decomposition only, for character *identity* — is unchanged. This is a
**display judgement**, and the carve-out is scoped to this one module and stated in its docstring so
a reviewer can read the whole blast radius in one file.

Test 3 is what satisfies SC-008: a keyboard whose number row is localized (`1` on the cap, `١` as the
output) raises **no** mismatch warnings — the spec's US5 AS6, verbatim.

Test 5's spacing clones: `` ` `` U+0060, `´` U+00B4, `^` U+005E, `~` U+007E, `¨` U+00A8, `¯` U+00AF,
`¸` U+00B8 — each NFKD-decomposing to (or standing in for) its combining counterpart. Derived, not
hardcoded as pairs: the function decomposes the spacing character and compares against the output's
combining mark, so the list above is illustrative of coverage rather than a table to maintain.

### 3.1 Gating conditions before the guard is even consulted

The mismatch hint is scoped narrowly by FR-036 — "only on character-class keys". The detector
checks, in order, and bails on the first failure:

1. `sp === 0` (character class). Never `1` (special), `2` (active-special), `8` (deadkey-styled),
   `9` (blank) or `10` (spacer).
2. The key has a resolvable output.
3. The keycap is non-empty.
4. `keycapAuthored` is not set.
5. `isKeycapRelated(keycap, output)` is `false`.

Severity is `hint`. It never blocks, and it is never an error.
