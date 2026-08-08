# Implementation Plan: Help documentation generation from Phase F answers

**Branch**: `061-help-docs-generation` | **Spec**: [spec.md](spec.md) | **Date**: 2026-08-07

## Summary

Phase F's help-docs survey questions (`content/flows/phase_f_helpdocs.modular.yaml`, live
modules under `packages/studio/src/survey/questions/f/`) all declare `writes: []` — every module
collects an answer and discards it. This plan wires those answers into a new `helpDocs` field on
the working-copy store (a sibling to the existing `attribution` field, not a KeyboardIR mutation),
populated by a dedicated `onCommit` hook on Phase F's step options — the same pattern `attribution`
already uses, not the project-wide `writes`/`mutate` pipe (which is unimplemented for every module
today and out of scope to unblock here). A new pure render module in the engine turns those answers
plus already-available design-derived metadata (display name, primary BCP47 tag, copyright holder,
`store(&TARGETS)` platform list, keyboard id) into the four shipped documentation files, replacing
today's one-line placeholders. Rendering runs inside `projectWorkingCopyForOutput` — the projection
shared by all three delivery modes (`.kmp` download, `.zip` download, GitHub fork+PR) — so every
mode regenerates from current answers (FR-010), not just the `.kmp` download path that today's
`ensurePackageFiles` alone covers. A Story 2 in-studio preview reuses the same pure render module
synchronously (no new debounce timer — Constitution Article IV reserves the one 300ms cycle for
validation).

## Project Structure

```
packages/contracts/src/
  help-docs.ts                          # NEW — HelpDocsAnswers type + zod schema mirror

packages/engine/src/shared/
  packageDocs.ts                        # MODIFIED — welcomeHtm/readmeHtm become answer-aware
  helpDocsRender.ts                      # NEW — pure render functions (README.md, readme.htm,
                                         #   welcome.htm, help/<id>.php), shared section builder

packages/engine/src/loader/
  fetchKeyboardSourceToVfs.ts            # MODIFIED — best-effort fetch of the base's own
                                         #   source/welcome.htm + source/help/<id>.php (mirrors
                                         #   the existing baseLicenseText fetch), exposed as
                                         #   result fields, never written straight into the VFS

packages/engine/src/package-descriptor/
  build.ts                               # MODIFIED — PackageDescriptorIdentity gains
                                         #   websiteUrl?; buildKpsContent emits <WebSite URL="...">

packages/engine/src/output/
  ensurePackageFiles.ts                  # MODIFIED — delegates body text to helpDocsRender
                                         #   instead of the bare packageDocs placeholders

packages/studio/src/stores/
  workingCopyStore.ts                    # MODIFIED — helpDocs, baseWelcomeHtmText,
                                         #   baseHelpPhpText fields + setHelpDocs action
                                         #   (mirrors attribution / baseLicenseText exactly)

packages/studio/src/editors/adapters/
  flowStepOptions.tsx                    # MODIFIED — phaseFOptions gains onCommit + extractHelpDocs
  makeFlowStepComponent.tsx              # MODIFIED — FlowStepDeps.setHelpDocs, depsRef wiring

packages/studio/src/lib/
  serializeWorkingCopy.ts                # MODIFIED — projectWorkingCopyForOutput reads
                                         #   state.helpDocs / baseWelcomeHtmText / baseHelpPhpText,
                                         #   calls helpDocsRender, writes all four files
  buildOutputBundle.ts                   # MODIFIED (minor) — ensurePackageFiles call site unchanged
                                         #   in shape; body text now comes from the shared render

packages/studio/src/hooks/
  useDocsPreview.ts                      # NEW — Story 2: synchronous derivation from
                                         #   useWorkingCopyStore, no debounce (D3 stays scoped
                                         #   to validation)

packages/studio/src/components/
  DocsPreviewPanel.tsx                   # NEW — Story 2 UI surface

docs/
  keyboard-documentation-plan.md         # NEW on this branch — currently exists only on the
                                         #   unmerged km/keyboard-documentation-plan branch;
                                         #   spec.md's Governing Context cites it as already
                                         #   authoritative, so it lands here (Setup phase)
```

**Structure Decision**: Single-package-boundary-respecting change: new state lives on
`workingCopyStore` (studio), new rendering logic lives in the engine (`packages/engine/src/shared`,
`output`, `package-descriptor`, `loader`) per the Engine/Content team split (Constitution Article
VI) — Phase F's question *content* (prompts, help text, routing) is untouched; only the
previously-inert `writes`/consumption side is built.

## Constitution Check

| Article | Assessment |
| --- | --- |
| I. Pattern schema is a locked contract | PASS — `Pattern`/`Criterion` untouched. |
| II. KeyboardIR is the engine spine | PASS — `helpDocs` lives on the working-copy store *beside* `baseIr`/`KeyboardIR`, exactly where `attribution` already lives; no new KeyboardIR field, no codec change. |
| III. Single persistent working copy | PASS — no second working copy; render happens against the one working copy's already-cloned output-projection VFS. |
| IV. Validator layering / single 300ms debounce | PASS — the docs preview (Story 2) is a synchronous pure derivation from store state, not a validation cycle; it introduces no timer at all, so D3's single-debounce invariant is untouched. |
| V. VirtualFS only during authoring | PASS — rendering/merging into `README.md`/`readme.htm`/`welcome.htm`/`help/<id>.php` happens inside `projectWorkingCopyForOutput`'s cloned output VFS (output-time only), never against the live authoring VFS. |
| VI. Team boundaries | PASS — engine owns the render/output/loader/descriptor changes; studio (engine team's SPA) owns the store field + adapter wiring; no content-team survey question is added, removed, or reworded. |
| VII. Out of scope for v1 | PASS — no touched item overlaps the excluded list. |
| VIII. House conventions | PASS — plan follows commit/title conventions; no emoji; markdown links for file references. |

No violations — Complexity Tracking table omitted.
