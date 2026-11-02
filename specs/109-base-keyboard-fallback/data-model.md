# Data model: Base-keyboard fallback

**Spec**: [spec.md](spec.md)

## FallbackPolicy (contracts, changed)

`{ letters: Disposition; digits: Disposition; punctuation: Disposition }` where `Disposition = "swallow" | "pass-through"`. Default: all `"swallow"`, as today. The zod schema and both drift guards change with the type.

A legacy single value `v` migrates to `{ letters: v, digits: v, punctuation: v }`.

## Working-copy state (studio)

- `fallbackPolicy: FallbackPolicy`
- `fallbackPolicyConfirmed: boolean`. False after migration or default; true once the author confirms on the surface. Persisted in the draft envelope. Missing in old drafts reads as false.

## UnhandledPosition (engine)

`{ key: string; modifiers: string; layerBound: boolean }`. `key` is a virtual-key name, `modifiers` the kmn modifier set. `layerBound` is true when the IR binds at least one key on that modifier layer. Independent of any base keyboard.

## Leak (studio view)

`{ position: UnhandledPosition; baseKeyboard: string; outcome: { kind: "char"; char: string; leakClass: LeakClass } | { kind: "deadkey" } | { kind: "unknown" } }`

`LeakClass = "letters" | "digits" | "punctuation"`, from the character's General Category.

## BaseLayoutData (generated)

Per catalog keyboard id: layers `base`, `shift`, `altgr`, `shiftAltgr`, each mapping key to a character or `"deadkey"`. The source block carries the corpus commit and a SHA-256 per keyboard.

## Proposal

`{ class: LeakClass; disposition: Disposition; evidence: { baseKeyboard: string; char: string; count: number } | null }`. Computed per class from the IR's own output, the target script and the picks (FR-020).
