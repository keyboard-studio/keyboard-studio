# Spec 008 Data flow: as built

**Status:** Retired 2026-10-14. Architecture-core material; its living content is covered by [docs/architecture.md](../../docs/architecture.md).
**Full docs:** [specs/_archive/008-data-flow/](../_archive/008-data-flow/) (spec). Not read by default.

## What this spec was
- The 15-step meta-flow pipeline (selection → instantiation → survey phases → galleries → validation → output), extracted from root spec.md §8 before the migration rule reserved architecture-core sections to spec.md and docs/architecture.md.

## Divergences from the spec
- Its step 15 still instructs preserving an `.kmn.imported` sidecar that root spec D11 records as removed.
- Its claim to be "authoritative… on conflict, this file wins" (and its citation of manifest SPINE ORDER as the single source of survey order) is void: order is derived by the decision registry (specs 087/091), and conflicts resolve by the constitution's precedence-by-topic table.
- The meta-flow as built — decision spine, draft envelope, extraction, test-and-revise loop — is described in docs/architecture.md, which supersedes this file as the composition reference.
