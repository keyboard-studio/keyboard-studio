# Hermes model-vetting — results

Evidence behind the locked baseline. Companion to [README.md](README.md) §7 (findings) and §8 (baseline).

- **Scope:** a 2-shard slice — S10 = `codec/parse.ts` (1 file, 8 gold findings); S07 = the 13 `pattern-apply/*.ts` files (22 gold findings). **Gold total = 30.**
- **Gold standard:** Claude `/simplify`, generated **per file** (12 findings whole-set → 30 per-file). Precise, not exhaustive.
- **Recall metric:** *strict* = line-overlap (±5) **AND** a shared key term from the gold finding (same issue, not same neighborhood). *Surfaced* recall = gold found and judged real that reaches the human (ACT + REVIEW buckets).
- **Caveat carried throughout:** gold is precise-not-exhaustive, so "noise"/precision figures are a **lower bound** — some non-gold findings are real bonuses. Relative rankings and gold-anchored recall are solid; absolute precision is understated.

---

## 1. The gpt-oss fix

gpt-oss (harmony/reasoning model) returns **empty output under Ollama `format:json`** — `.response` and `.thinking` both length 0, `done_reason: stop` — while the same prompt free-form returns a good answer. The two-step pipeline's STRUCTURE (and JUDGE) step used `format:json`, so gpt-oss's good reasoning output was discarded.

**Fix:** `callModelStructure` / `callModelJudge` fall back to one free-form call (no `format:json`) + lenient extraction of the first balanced `{…}` block containing the required key, reading `.response` or `.thinking`. The 6 models that already work under `format:json` never reach the fallback.

```
                        before fix      after fix
  parse.ts findings          0               12
  overall strict recall    0/30           17–18/30   (run-to-run variance, 5-sample union)
  judge F1                 0.000            0.72–0.75
  root cause         format:json → empty output, not model quality
```

Not an old/broken model — a serialization incompatibility in the harness.

---

## 2. Simplifier ranking — raw gold-recall (`--no-judge`, all findings)

Strict = same-issue match. `extras` = findings matching no gold (raw noise proxy).

```
  model                 strict recall   wtd     total   extras
  devstral-small-2          20/30       0.705    71      42
  gpt-oss:20b  (fixed)      18/30       0.593    43      24
  qwen3:30b-a3b             14/30       0.497    63      41
  qwen3-coder:30b           13/30       0.472    47      36
  hermes-simplify-14b       12/30       0.396    45      35
  deepcoder:14b              8/30       0.257    44      36
  gemma4:26b-a4b             4/30       0.158    10       7
  gpt-oss  (pre-fix)         0/30       0.000     0       0   <- harness bug
```

At the raw level gpt-oss looked *cleaner* (24 extras vs devstral's 42). §4 shows that does not survive the judge.

---

## 3. Judge ranking — F1 on the 22-item labeled benchmark (12 real + 10 fake)

```
  model                  F1      precision  recall
  gemma4:26b-a4b        0.800     0.769     0.833
  qwen3-coder:30b       0.750     0.750     0.750
  gpt-oss:20b (fixed)   0.750     0.750     0.750
  qwen3:30b-a3b         0.733     0.611     0.917
  hermes-simplify-14b   0.687     0.550     0.917
  deepcoder:14b         0.667     0.524     0.917
  devstral-small-2      0.645     0.526     0.833
  gpt-oss  (pre-fix)    0.000       —         —     <- harness bug
```

Best generator (devstral) is a mediocre judge; the terse gemma4 is a poor generator (§2) but the best judge → they should be **different models**.

---

## 4. Escalation comparison — the real deliverable (gemma4-judged, surfaced = ACT + REVIEW)

See also §4b (per-finding alignment across both models) and §4c (description usefulness).

Raw `extras` count is not what a human reviews — the judge runs first and the danger heuristic routes reuse/cross-file findings to REVIEW. This scores the **surfaced set the human actually sees**.

```
  model               surfaced recall   gemma dropped   gen. miss   surfaced precision
  devstral-small-2        20/30              1/30          9/30          45%
  gpt-oss:20b             16/30              2/30         12/30          37%
```

**devstral wins on BOTH recall and precision.** gpt-oss's raw-level "cleanliness" reverses after judging: it misses more at generation (12 vs 9) and its surfaced set is a *lower* fraction real (37% vs 45%). The raw-extras signal was misleading; the surfaced comparison is the honest one.

---

## 4b. Per-finding alignment (Claude gold vs Devstral vs GPT-oss)

Disposition codes: ACT = surfaced low-danger; REVIEW = surfaced needs-human; DROP = found but gemma judged not-real; MISS = never found by that model.

```
  overlap                       count   gold ids
  both models surfaced           13
  devstral-only                   7     G05 G09 G15 G23 G25 G29 G30
  gpt-oss-only                    3     G06 G07 G18
  neither found                   7     G08 G13 G16 G19 G20 G24 G27
```

Devstral surfaces 20/30 gold; GPT-oss surfaces 16/30. Gemma judge-dropped only 3 distinct gold total across both models (G06, G16, G23) — it rarely drops gold. **7 gold are beyond both local models** — the local recall ceiling on this slice. **A devstral-union-gpt-oss union reaches 23/30** (13 both + 7 devstral-only + 3 gpt-oss-only) — the basis for the ensemble baseline (§6).

---

## 4c. Description usefulness (actionability)

A finding is only as valuable as how well its write-up lets you fix it. Actionability heuristic scored 0–4 (1 pt each: names the symbol; uses a concrete change verb; identifies the specific target or location; provides detail or a drop-in snippet).

```
  mean actionability (0-4):   Claude 3.13   |   GPT-oss 3.20   |   Devstral 2.00
```

GPT-oss descriptions are approximately Claude-quality: they name symbols, give module-scope specifics, and often include drop-in code snippets. Devstral descriptions are terse/generic pointers that name the category but not the fix path. In one case Devstral recycled the identical sentence across two distinct findings.

**Side-by-side examples (KNOWN_MODIFIERS hoist):**

```
  Devstral:  "Consider hoisting the constant outside the function."

  GPT-oss:   "KNOWN_MODIFIERS in parseModifierKey (codec/parse.ts ~L312) is rebuilt on
               every call — hoist it to module scope as:
               const KNOWN_MODIFIERS = new Set(['shift','ctrl','alt','meta']);"
```

**Side-by-side examples (group-header regex dup):**

```
  Devstral:  "cache the regex to avoid repeated compilation"

  GPT-oss:   "GROUP_HEADER_RE is defined independently in applyGroup() and applyGroups()
               (pattern-apply/apply.ts ~L88 and ~L142); extract to module scope and import
               in both callers to eliminate the duplication."
```

**Caveat:** the 0–4 heuristic is crude — the text excerpts above are the real evidence. Devstral's terseness may be partly prompt- or temperature-tunable and is worth revisiting before concluding it is a model-level limit.

---

## 5. Does gemma drop gold with the junk? — per-finding disposition (devstral, all 30 gold)

```
  disposition                                        count
  found + judged real, in ACT (low danger)             2
  found + judged real, routed to REVIEW (danger high) 18   <- reuse/cross-file, by design
  found but gemma judged not-real (true gold-drop)     1   <- ~5% of the 21 it found
  never found by devstral (generation miss)            9
                                                       --
  total                                                30
```

**No — gemma is discerning, not destructive:** it dropped 1 of the 21 gold devstral found (~5%). The tiny ACT bucket is a **danger-routing artifact** (18 gold are reuse/cross-file → REVIEW, correctly needing human eyes), not the judge cutting hard. gemma's judge is in fact *permissive*, not strict.

---

## 6. Baseline (locked — ensemble)

Three-axis tradeoff: Devstral leads recall (20 vs 16) and surfaced precision (45% vs 37%); GPT-oss leads description usefulness (3.20 vs 2.00, approximately Claude-quality; §4c). The ensemble captures Devstral's coverage and GPT-oss's actionable wording.

```
  role       config                                         why
  simplify   devstral-small-2 UNION gpt-oss:20b             recall 23/30, best of both (§4b);
             (dedup; prefer gpt-oss wording on overlap)     gpt-oss descriptions ~Claude-quality (§4c)
  judge      gemma4:26b-a4b-it-qat                          sharpest verifier, F1 0.800 (§3);
                                                            drops ~no gold (§5)
```

**IMPLEMENTATION NOTE:** running this baseline requires a multi-reason-model ensemble mode in `hermes-run.mjs` — run both reason models per file, union findings, prefer gpt-oss's description on overlapping hits, then structure + gemma4 judge. **That mode is not yet implemented.** It is the next build task before this baseline can be used in production. Until it lands, the single-model fallback remains `--model devstral-small-2 --judge-model gemma4:26b-a4b-it-qat --samples 5` (20/30 recall).

Per-finding alignment detail: §4b. Description quality evidence: §4c.

---

## 7. Open items / honest limits

- **2-shard slice only** — confirm the winner on a wider file set before making it the repo-wide default.
- **Surfaced precision is ~37–45% for both models** (understated by bonus finds, but real): the REVIEW bucket / judge threshold is a **precision-tuning opportunity**, independent of model choice.
- **Run-to-run variance** in free-form generation is real (`--samples 5` mitigates it); single-shard numbers carry ±1–2 findings of noise.
