# Docs Manifest

Owned by `/km-doc`. Update this file whenever a doc is added, archived, or re-scoped.

## Release docs

| Doc | Purpose | Update Triggers | Status |
|---|---|---|---|
| [`CHANGELOG.md`](../CHANGELOG.md) | Versioned user-visible changes | Every public-API commit | live |

## Architecture / module docs

| Doc | Purpose | Update Triggers | Status |
|---|---|---|---|
| [`packages/engine/README.md`](../packages/engine/README.md) | Engine package surface: validator, compiler, simulator, loader, output, codec | New engine module, public-API addition or removal | live |
| [`packages/contracts/README.md`](../packages/contracts/README.md) | Contracts package: all shared TS types, revision policy | New type file added or removed from `packages/contracts/src/` | live |
| [`packages/studio/README.md`](../packages/studio/README.md) | Studio SPA shell overview | SPA architecture changes | live |
| [`packages/studio-poc/README.md`](../packages/studio-poc/README.md) | Studio POC notes | POC changes | live |

## Convention docs

| Doc | Purpose | Update Triggers | Status |
|---|---|---|---|
| [`docs/criteria.md`](criteria.md) | Criteria catalog and band classification guidance | Criteria band changes; new criteria categories | live |
| [`docs/lint.md`](lint.md) | Linter check reference | New Layer-A/B/C checks; check reclassification | live |
| [`docs/keyboard-design-principles.md`](keyboard-design-principles.md) | Keyboard design guidance | New design decisions ratified in spec | live |
| [`docs/discus-principles-integration.md`](discus-principles-integration.md) | DISCUS principles integration notes | Changes to criteria.json DISCUS rows | live |
| [`docs/working-agreement.md`](working-agreement.md) | Team working agreement | Team process changes | live |
| [`docs/github_flow.md`](github_flow.md) | Delivery-option progress (Options A/B/C) | Scaffolder, VFS, or output-path work lands | live |

## Usage / workflow docs

| Doc | Purpose | Update Triggers | Status |
|---|---|---|---|
| [`docs/making-a-template.md`](making-a-template.md) | Template authoring guide | Template pipeline changes | live |
| [`docs/Checking Keyman Keyboard Pull Requests.md`](<Checking Keyman Keyboard Pull Requests.md>) | PR review checklist | Criteria or review-process changes | live |
| [`docs/triage-scheduling.md`](triage-scheduling.md) | Issue triage and scheduling guide | Process changes | live |
| [`docs/workflow-model.md`](workflow-model.md) | Supplementary workflow graph + question analysis; authoritative hybrid ordering now in spec §8 | Spec §8 workflow changes; two-track authoring changes | live |

## Audit / inventory docs

| Doc | Purpose | Update Triggers | Status |
|---|---|---|---|
| [`docs/spec-signoff.md`](spec-signoff.md) | Spec review-cycle log and decision summary (D1-D9) | New spec version sign-off | live |
| [`docs/survey-gap-analysis.md`](survey-gap-analysis.md) | Survey gap analysis | Survey changes | live |
| [`docs/placement-intelligence-review.md`](placement-intelligence-review.md) | Placement intelligence review findings | Placement algorithm changes | live |
| [`docs/keyboard-index.md`](keyboard-index.md) | Keyboard phonebook (BCP47, author, path per keyboard referenced) | Any keyboard cited or introduced in the repo | live |
| [`docs/review-loop/STATUS.md`](review-loop/STATUS.md) | Automated review-loop iteration queue | New review-loop iterations | live |

## Spec amendments

| Doc | Purpose | Update Triggers | Status |
|---|---|---|---|
| [`docs/spec-amendment-2026-06-08-keyboardir.md`](spec-amendment-2026-06-08-keyboardir.md) | v1.1.0 KeyboardIR import amendment record | Superseded by spec.md §19 | archived |
| [`docs/spec-amendment-2026-06-11-placement-priors.md`](spec-amendment-2026-06-11-placement-priors.md) | v1.1.1 placement-priors amendment record | Superseded by spec.md §19 | archived |

## Project guidance

| Doc | Purpose | Update Triggers | Status |
|---|---|---|---|
| [`CLAUDE.md`](../CLAUDE.md) | Agent and contributor guidance; architecture map; build commands | Architecture changes; new packages; process updates | live |
| [`README.md`](../README.md) | One-line external project description | Significant scope changes only | live |

## Templates

| Doc | Purpose | Update Triggers | Status |
|---|---|---|---|
| _(none yet)_ | `docs/_templates/` directory not yet created | When a third recurrence of a structure pattern appears | — |

---

**Last verified:** 2026-06-14
**Manifest owner:** `/km-doc`
