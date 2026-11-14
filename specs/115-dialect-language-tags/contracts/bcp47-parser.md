# Contract: BCP 47 parser (`@keyboard-studio/contracts`)

**Module**: `packages/contracts/src/utils/bcp47.ts` (exported from the contracts barrel). **Research**: R1. **Types**: [data-model.md § Bcp47Parts](../data-model.md#bcp47parts-contracts-r1).

Pure functions, no data, no workspace imports. Safe for `/api` bundling (no JSON load).

```ts
export type Bcp47ParseResult =
  | { ok: true; parts: Bcp47Parts }
  | { ok: false; reason: Bcp47ParseError; at: number };

export function parseBcp47(tag: string): Bcp47ParseResult;
export function formatBcp47(parts: Bcp47Parts): string;          // canonical order + case
export function isWellFormedBcp47(tag: string): boolean;          // parseBcp47(tag).ok

// Rewritten on parseBcp47; signatures unchanged.
export function scriptSubtagOf(tag: string): string | undefined;  // never past a variant/singleton
export function regionSubtagOf(tag: string): string | undefined;  // moved here from keyboard-lint
```

## Behaviour (each line is a test)

| Input | Result |
|---|---|
| `oc-gascon` | language `oc`, variants `[gascon]` |
| `ca-ES-valencia` | language `ca`, region `ES`, variants `[valencia]` |
| `sl-rozaj-biske` | variants `[rozaj, biske]` (order kept as written) |
| `sl-rozaj-rozaj` | error `duplicate-variant`, at 2 |
| `sq-AL-gheg` | error `bad-subtag`, at 2 (`gheg` is 4 letters after a region) |
| `en-US-x-twain` | region `US`, privateUse `[twain]` |
| `buu-x-koya` | privateUse `[koya]`; `scriptSubtagOf` → `undefined` |
| `lif-x-Deva` | privateUse `[deva]`; `scriptSubtagOf` → `undefined` (replaces the old `"Deva"` assertion) |
| `en-u-co-phon` | extensions `[{u,[co,phon]}]`; `scriptSubtagOf` → `undefined` |
| `fr-u-co-phonebk` | extensions `[{u,[co,phonebk]}]` |
| `zh-yue-HK` | language `zh`, extlang `[yue]`, region `HK`; `regionSubtagOf` → `HK` |
| `en-x-001` | `regionSubtagOf` → `undefined` (so 12.4 no longer trips on it) |
| `qaa-x-foo` | language `qaa`, privateUse `[foo]` |
| `x-whatever` | language `""`, privateUse `[whatever]` (private-use-only tag is well-formed) |
| `i-klingon` | grandfathered `i-klingon` |
| `BFD-latn-cm` | parses; `formatBcp47` → `bfd-Latn-CM` |
| `` (empty) | error `empty` |

`formatBcp47(parseBcp47(t).parts)` is idempotent and only changes case. It never reorders variants or drops anything; minimality is the engine's job ([langtags-api.md](langtags-api.md)).

## Callers moved onto it

`kps-parser.ts:74` (`extractScriptSubtag` becomes a re-export), `check-bcp47.ts:98,104`, `check-currency.ts:49,82`, `assembleLintContext.ts:96`, `baseLayouts.ts:322`, `languageTags.ts:11,98-99,102,161`, `docLanguageTag.ts:11`, `utilities/facet-index/{build-index,declared-bcp47-tags-classifier}.ts`. The private copies are deleted.
