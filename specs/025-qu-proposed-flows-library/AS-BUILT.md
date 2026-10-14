# Spec 025 Proposed-flows library: as built

**Status:** Retired 2026-10-14. The library shipped; this spec's representation mandate did not.
**Full docs:** [specs/_archive/025-qu-proposed-flows-library/](../_archive/025-qu-proposed-flows-library/) (spec). Not read by default.

## What shipped
- The Library surface: proposed flows rendered as an ordered graph, a flat Leftover list, and drill-down reserve nodes (Flow Map views); the demoted Phase A battery (spec 022) is visible there and excluded from live flow.

## Divergences from the spec
- §3/§6 mandated dual representation (a registry entry AND a manifest entry, kept in sync). That contradicts this spec's own governing ADR-0001 (one source of truth) and was never built: proposed/live status is **derived** from the registry in `packages/studio/src/steps/flowSources.ts`. Derivation won; the archived text's sync requirement is void.
