# Spec 050 Text-sample prefill: as built

**Status:** Retired 2026-10-14 by maintainer ruling. Partially shipped (before the spec was written); the remainder is tracked as a standalone issue filed with this retirement.
**Full docs:** [specs/_archive/050-text-sample-prefill/](../_archive/050-text-sample-prefill/) (spec and companions). Not read by default.

## What shipped
- FR-001/FR-002/FR-004: multiline paste + character extraction into the Phase B prefill (predates this spec; the spec documented it after the fact).

## What did not ship (moved to an issue, 2026-10-14)
- FR-003 (file upload), FR-005/FR-006 (044-contract propose-then-confirm + per-character attribution), FR-007 (union with exemplar inventory). The shipped paste path still uses the simple bool gate these FRs were meant to replace.
