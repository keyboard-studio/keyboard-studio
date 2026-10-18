# refusal-probe — spec 104 T026

Runs the FR-008 severance transplant (engine `severTouchKey`) over every
K_-linked touch key of every corpus keyboard that ships a touch layout,
and reports the refusal rate + binding causes per keyboard. This is the
evidence base for sizing the Track 2 (Adapt) choice UX: FR-016 rules that
on transplant refusal the author's choice collapses to keep-link vs
manual-definition flag, so the refusal rate is how often that collapsed
choice is the only one an Adapt author sees.

Not a gate. A completed scan exits 0 whatever the rate; scanning nothing
exits 2 (the roundtrip-probe convention — a probe that examined no
keyboards must never look like a pass).

## Run

From the repo root:

```
TSX_TSCONFIG_PATH=utilities/refusal-probe/tsconfig.json \
  pnpm dlx tsx utilities/refusal-probe/probe.ts [keyboards-root ...]
```

Roots default to the sibling `keyboards/release` checkout (the repo's
corpus convention: `keyboards/` beside the keyboard-studio checkout).
Pass explicit roots to run against a full keymanapp/keyboards checkout.

## Output

`refusal-report.md` (headline + per-keyboard table) and
`refusal-report.json` (full per-key detail, including the verbatim
`refusalBinding` text) land beside `probe.ts`. The report header states
its coverage honestly: rates from a partial checkout size the UX for the
keyboards at hand and must be re-run against the full corpus before
being treated as corpus-wide.

Method notes:

- One attempt per distinct K_-linked key per platform, anchored at the
  first layer carrying it; the transplant is pure, so attempts never
  disturb each other.
- Emulation-class keys (K_BKSP, K_ENTER, K_LOPT, …) refuse by design and
  are never severance candidates; the report gives both the raw rate and
  the candidate-only rate.
- When the opaque-fragment gate refuses, the key is retried with
  `opaqueAcknowledged: true` so the report separates the gate from the
  binding cause behind it.
