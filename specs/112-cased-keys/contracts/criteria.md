# Contract: criteria rows and findings

Criteria data is `packages/contracts/data/criteria.json`; wording is content's (Constitution Art. VI).
Rows below are proposals for content to confirm.

## 7.28 `KM_LINT_CASEDKEYS_MISSING` (exists; extended by FR-002)

Results, in order of evaluation:

| Case | Result | Message gist |
|---|---|---|
| `&MNEMONICLAYOUT` = 1 | pass | Mnemonic layout: does not apply |
| no cased letter produced | pass | No cased letters: does not apply |
| cased, no `&CasedKeys` | **fail** | produces cased letters (e.g. "x") but declares no `&CasedKeys` |
| declared, set ⊇ derived keys | pass | declared |
| declared, derived keys missing | **fail** (new) | `&CasedKeys` misses keys with a case pair: `[K_LBRKT]` (ŋ/Ŋ), … |

R1 conflicts are listed in the message as information ("not added: RAlt output on K_E is €/£").
`bcp47` comes from the first `.kps` language when present (research R3).

The declared-before-mnemonic order changes: today a declared store passes before the mnemonic test.
kmc rejects both together, so a mnemonic keyboard with `&CasedKeys` is a compile error, not a 7.28
concern; the order is kept.

**Corpus re-baseline** (SC-001): the 151 "declares it" will split into pass / fail-incomplete. The new
counts are recorded in the implement commit, not here.

## New: touch caps layer (FR-003)

Proposed row:

```json
{
  "id": "18.16-touch-caps-layer-complete",
  "section": "18. Design heuristics (DISCUS)",
  "band": "layer-c-enforce",
  "description": "A keyboard that produces cased letters has a touch `caps` layer, reached by double-tapping Shift on `default`, carrying the uppercase of every cased letter on `default`; its character keys do not switch layers",
  "lintRuleId": "KM_LINT_TOUCH_CAPS_LAYER"
}
```

Check `keyboard-lint/src/checks/criteria/check-touch-caps-layer.ts`, one finding per problem:

| Problem | Finding |
|---|---|
| no `caps` layer | "no caps layer" |
| no double-tap | "Shift on default has no double-tap to caps" |
| missing uppercase | "caps layer lacks: Ŋ (K_LBRKT), …" |
| switching keys | "caps-layer keys switch layer after typing: K_A, …" |

**Amended by spec 111 T059a (the owner's full Capsifesto behaviour, `processTouch.py`).** The row's
description now also requires, and the check also reports (in `touchLayerRules` terms, shared with the
fixer `syncTouchCapsLayerRaw`):

| Problem | Finding |
|---|---|
| `rightalt-shift` / `ctrl-shift` without `rightalt-caps` / `ctrl-caps` | "no rightalt-caps layer although rightalt-shift exists" |
| `rightalt-caps` / `ctrl-caps` keys switching layer | "rightalt-caps keys switch layer after typing: …" |
| no double-tap Shift on `rightalt` / `ctrl` | "Shift on rightalt has no double-tap to rightalt-caps" |
| character keys on a non-default, non-caps layer stay on it | "shift character keys stay on the layer after typing: …" |
| Shift on a shift/caps layer not `*Shifted*` / `*ShiftedLock*` returning to the unshifted layer | "Shift on shift is not *Shifted* returning to default" |

This lifts research R8's exclusion of `rightalt-caps`. Two sibling rows were added with it:
`18.17-touch-modifier-keys-consistent` (`KM_LINT_TOUCH_MODIFIER_KEYS`) and
`18.18-touch-symbols-layer-linked` (`KM_LINT_TOUCH_SYMBOLS_LAYER`).

Not applicable (pass with reason): no touch layout; no cased letters on `default`; mnemonic.

Registering the row moves the band counts and the studio criteria tests the way 7.28 did
(`implementedChecks.ts`, `gateCoverage.ts`, `battery.generated.json`, the count tests).
