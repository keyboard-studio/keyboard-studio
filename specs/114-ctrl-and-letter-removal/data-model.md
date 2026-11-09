# Data Model

- **RawCtrlFinding**: `{ file, ruleIndex, key, plane, outputs: string[] }`, one per reported rule.
- **NeededLetterMap**: `Map<string /* NFC char */, string[] /* bcp47 tags */>`, built from each listed language's main exemplar set.
- **RemovalWarning**: `{ char, languages: string[], dismissed: boolean }`, session-scoped, not persisted as a decision.
- **Inventory entry (unplaced)**: existing inventory shape; the fix adds entries only for characters no remaining rule types.
