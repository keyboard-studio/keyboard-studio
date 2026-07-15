# Contract: keyboard-base bridge (`@keyboard-studio/glottolog/bridge`)

The bridge joins Glottolog relatedness to real keyboards. It is a **pure function with injected dependencies** (D8) so the package stays contracts-only: the caller (studio base-resolution) supplies the langtags-backed resolver and the phonebook map. Types: [data-model.md](../data-model.md).

## Signature

```ts
function findKeyboardBaseCandidates(
  target: BridgeTarget,
  deps: BridgeDeps,
  opts?: BridgeOptions,
): KeyboardBaseCandidate[];

interface BridgeTarget {
  /** BCP47 tag of the target language, e.g. "byn", "hi-Latn". */
  bcp47: string;
}

interface BridgeDeps {
  /**
   * Langtags-backed resolver. MUST return the target's ISO 639-3 and its
   * (chosen) ISO 15924 script. Injected so glottolog never imports engine (D5/D8).
   */
  resolveLanguage(bcp47: string): { iso639p3?: Iso639P3; script?: Script } | null;
  /** Phonebook map: keyboard id → the BCP47 tags it declares (same shape suggestBases uses). */
  languagesById: Readonly<Record<string, readonly string[]>>;
  /**
   * OPTIONAL. The existing script-based fallback (studio's `suggestBases`), injected to
   * supply Tier 2 candidates. When omitted, Tier 2 is skipped and only genealogical +
   * direct candidates are returned.
   */
  scriptFallback?(target: { script: string; bcp47?: string }): ReadonlyArray<{ keyboardId: string }>;
  /** OPTIONAL resolver keyboardId → BaseKeyboard, to populate `candidate.base`. */
  getBase?(keyboardId: string): BaseKeyboard | undefined;
}

interface BridgeOptions {
  maxResults?: number;   // opt-in; default no cap (D9)
}
```

## Behaviour

1. **Resolve target** via `deps.resolveLanguage(target.bcp47)`. If it yields no script, the bridge cannot enforce script coincidence → returns `[]` (never guesses).
2. **Direct tier** — keyboards in `languagesById` that declare the target's own language *and* match its script → `tier: "direct"`, distance 0, ranked first (FR-017).
3. **Genealogical tier (Tier 1)** — `relatedIsoCodes(targetIso)` gives related ISO codes with distances. For each, find keyboards in `languagesById` that declare it. Keep only those whose script equals the target script (FR-017b, D12). Rank by the relative's distance (closest-first).
4. **Script fallback (Tier 2)** — if provided, `deps.scriptFallback` supplies same-script keyboards regardless of family. Included only for keyboards not already surfaced by tiers above, ranked after them (FR-017c).
5. **Per-keyboard dedup (FR-016a, D10)** — a keyboard appears **once**, attributed to its closest supported relative (smallest distance) with the tier of that best link; other relatives it supports go into `alsoSupports`.
6. **Ordering** — `direct` → `genealogical` (by closeness) → `script-fallback`; ties by `keyboardId`.
7. **Empty result** — `[]` only when all tiers are empty (FR-015). Never emits a candidate whose script differs from the target (FR-017b, SC-002).

## Invariants (test targets)

- Every returned candidate has `script === targetScript`.
- Candidates are unique by `keyboardId`.
- A keyboard supporting two relatives at different distances appears once, at the smaller distance, with the other in `alsoSupports`.
- With no `scriptFallback` injected and no same-script relative, result is `[]` (not an error).
- The function is pure: identical `(target, deps, opts)` ⇒ identical output; no I/O.

## Consumer wiring (studio, non-normative)

`packages/studio/src/lib/suggestBase.ts` / `BaseResolution.tsx` wire it: `resolveLanguage` from `@keyboard-studio/engine/langtags`, `languagesById` from the base-browser phonebook, `scriptFallback` from the existing [`suggestBases`](../../packages/studio/src/lib/suggestBases.ts), `getBase` from the base-browser. The genealogical tier slots between `suggestBases`' `language-match` and `script-match` tiers.
