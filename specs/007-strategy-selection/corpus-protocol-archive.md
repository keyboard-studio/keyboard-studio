# §7.5.1 Corpus evaluation protocol (archived 2026-10-14)

Moved out of spec.md during the 2026-10-14 hypersimplification. This protocol was **never run**: no `StrategyDivergence` records exist in the tree, and the EuroLatin divergence it was meant to settle remains open. Retained as the design record if the corpus pass is ever scheduled.

#### 7.5.1 Corpus evaluation protocol

The hand-enumerated table above is the **seed fixture set**; once the KeyboardIR codec (§5a) and pattern recognizer (§8 step 2) land, the same round-trip runs at corpus scale. For every `release/` keyboard that passes the Layer A' import-fidelity checks: parse to IR, run the recognizer, derive the axis vector from the lifted patterns and IR structure, run the decision tree (§7.2), and compare the tree-selected primary against the dominant `strategyId` among the recognized patterns. Disagreements are emitted as `StrategyDivergence` records in the supportability scanner output (§13). Divergence *clusters* — many keyboards mis-routed the same way — are how the tree finds its next rules: the EuroLatin and IPA mismatches above were found by hand; the corpus pass finds the rest. Isolated divergences are triaged the same way as the known mismatches: the tree may be wrong, or the keyboard may be idiosyncratic — the record carries enough provenance to decide.

