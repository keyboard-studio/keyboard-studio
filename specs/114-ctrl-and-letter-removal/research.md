# Research

## Where the check lives
**Decision**: a Layer C check in `keyboard-lint` (`check-raw-ctrl.ts`), modelled on `check-cased-keys.ts`, registered in `implementedChecks.ts` and `gateCoverage.ts`. **Rationale**: criteria are data rows plus a lint rule id (FR-008). **Alternatives**: a studio-only check; rejected, other lint consumers would miss it.

## Raw Ctrl predicate
**Decision**: a rule whose modifier set has unsided `CTRL` and none of `ALT`, `LALT`, `RALT`. Skip Space, skip an ASCII digit typing the digit the base layout gives, skip `basic_*` by keyboard id. **Rationale**: matches the spec census and edge cases. esperanto_sava_eujao is checked against this in the census run.

## Rules outside the main key group
**Decision**: report raw Ctrl rules in any group that matches on a key, including deadkey and context groups. **Rationale**: the keystroke collides regardless of group; the fix removes by rule. **Alternative**: main group only; rejected, it hides content the Keyman team objects to.

## Repeat warning
**Decision**: warn once per character per session; a character the author already dismissed is not warned again. **Rationale**: the removal is the author's call (Art. X); repeating is noise.

## Needed-letter lookup
**Decision** *(revised 2026-11-06 after /speckit-analyze)*: build the per-language map (character to languages) from each listed language's main exemplar set, using the per-tag data in `openExpectedInventory.ts` (`standardExemplarChars`), shared by Copy and Open. Normalise to NFC both sides. **Rationale**: `resolveCarveNeededSet` / `useCarveNeededSet` covers one language and also unions tiered marks and the confirmed inventory, so it would warn on characters no listed language needs (fails SC-006) and miss the other listed languages.

## Fix shape
**Decision**: parse to IR, drop the matching rules, `projectKmnText` back, add uncovered characters to the inventory as unplaced. Same pattern as `buildCasedKeysOffer`. Not offered when the projection fails.
