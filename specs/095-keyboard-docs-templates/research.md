# Research: spec 095

## R1. Copy vs Adapt comes from the existing track answer

**Decision**: no new question or decision. `instantiationMode` (`"new-from-base"` = Copy, `"adapt-existing"` = Adapt) is already derived from the `authoring-track` decision and persisted, so version and docs read it.
**Rationale**: user ruling, 2026-10-14. The existing `track_choice` already offers Copy and Adapt, and a second Copy/Adapt question would give "Adapt" two meanings.
**Alternatives considered**: a new `start-relationship` decision (the design note's Q3), dropped by the ruling. A three-way track question, also dropped by the ruling.

## R2. Fix the version at the resolver, keep the wire names

**Decision**: in `resolvePublishVersion`, mode `"new-from-base"` returns `"1.0"`. In `resolveTestBuildVersion`, `"new-from-base"` computes against P = 1.0, which is always 0.N. `OutputVersionMode` keeps its two literals. Today the invalid-version check runs before the mode branch. It moves after the `"new-from-base"` branch, so a Copy test build is 0.N even when the source version is invalid.
**Rationale**: the four callers (`serializeWorkingCopy`, the `flowStepOptions` history proposal, `useDocumentationFindings`, `usePreviewArtifact` test builds) already map `instantiationMode` to the mode and call the resolver, so one edit fixes every place a version is computed. `"new-from-base"` is a persisted value of `DecisionRecord.instantiationMode` (contracts), so renaming the output-mode literal to `copy` would split two names for one fact.
**Alternatives considered**: a `copy` / `adapt-variant` / `adapt-existing` mode set (design note). It isn't needed once there is no variant mode.

## R3. The two copy-path bypasses

**Decision**: `serializeWorkingCopy` sets `publishVersion` from the resolver for both tracks and always writes `identityForProjection.version = shippedVersion`. Today the copy path writes it only for a test build. The copy-version preservation in `projectWorkingCopyVfs.ts` (step 4, `copyVersion`) is deleted. `resetIdentity` then takes the overlay's version, or its own `1.0` default when there is none.
**Rationale**: that preservation exists only to keep the `.kmn`, `.kps` and file name agreeing on the *base* version. With the overlay always carrying the resolved version, all of them agree on 1.0 by construction (FR-009), including an unrenamed copy, where step 4 never runs.
**Alternatives considered**: patching the `.kps` with a regex as the adapt path does. That would be a second writer, and the single descriptor writer already receives `identity.version`.

## R4. Lineage line for Copy

**Decision**: `renderHistoryMd`'s `adaptedFrom` option becomes `lineage: { kind: "created" | "adapted"; id; version } | null`. A new `createdFromBullet` gives "Created from <id> v<ver> via keyboard-studio." and `adaptedFromBullet` is unchanged. The serializer passes `created` with the start keyboard's id and raw version on Track 1. `buildHistoryProposal` keeps the Track 2 attribution only, so the Copy line is injected at render, like the adapt line.
**Rationale**: Track 2 history must not change (FR-007, FR-011). The existing dedupe ("unless the bullets already contain it verbatim") works unchanged for both kinds.
**Alternatives considered**: the design note's backticked "Keyboard Studio" form. It would differ from the Track 2 line, and changing that line would break stored edited bullets that contain it verbatim.

## R5. Where derived content is computed

**Decision**: `packages/studio/src/lib/docContent.ts`, `buildDocContent(input)`. It is pure and synchronous. Its input is the working-copy IR (the same IR the layout charts are drawn from), the parsed touch layout, and the inherited prose for suppression.
**Rationale**: the shortest keystroke path per character already exists as `charProducers(ir, ch)` → `CharProducer.steps` in `lib/irToCarveNodes.ts` (studio). Both docs callers are in the studio. Static derivation is synchronous, which keeps the preview inside D3. Simulating needs a compiled KMX, which is async.
**Alternatives considered**: an engine `buildDocSlotModel` driven by the simulator (design note), rejected for the async compile and for duplicating `charProducers`. Moving `irToCarveNodes` into the engine is out of scope.

## R6. Typing guide

**Decision**: the rows are every produced character (`buildProducedSet(ir)`) outside printable ASCII U+0020–U+007E, which is the US English base layout's output. For each character, the producer with the fewest `steps` wins, ties broken by the joined label in code-point order. Producers with only a `triggerFloor` count as one step. Rows are sorted by code point. Above **200** rows the guide becomes a summary: counts per character group plus a pointer to the layout charts. Each row shows the character (combining marks on U+25CC), its `getName` name, or `U+XXXX` when unnamed, and the keystroke labels.
**Rationale**: the spec says the base keyboard is US English unless declared otherwise, and the studio declares no other base. 200 is the spec's initial value and keeps a welcome page readable.
**Alternatives considered**: reading the base layout from `base-layouts.json`. It holds letters only, with no punctuation or digits. `// simplified: base = printable ASCII; when another base layout is declared, derive the set from it.`

## R7. Mechanism detection

**Decision**: fixed order, one paragraph each, present only when detected in the IR:

1. **deadkeys**: any rule context contains a `deadkey` element.
2. **right-Alt layer**: any rule whose `ruleModifier(rule)` is `"ralt"`.
3. **repeat-to-cycle**: a rule whose context is a produced character followed by a key, where the same key also produces that character directly.
4. **combining-mark order**: the keyboard produces a character with General_Category Mn or Mc.

The paragraph wording lives in `doc-forms.json` under `mechanisms`.
**Rationale**: it describes the keyboard as built, including rules inherited from the start keyboard (FR-012). The content catalog sits beside the forms, which settles the design note's open item.
**Alternatives considered**: reading the author's mechanism decisions. That misses inherited rules.

## R8. Forms as one JSON data file

**Decision**: `packages/contracts/data/doc-forms.json` holds `forms` (one entry per file plus `body`, each an array of lines joined with `\n`) and `mechanisms` (one paragraph per mechanism id). It is loaded the way `axisPriors.ts` loads its data (`import … with { type: "json" }`) and zod-parsed at load.
**Rationale**: JSON imports already work in Node, Vitest and Vite. `.tmpl` text files would need a prebuild codegen or a Vite `?raw` import the engine's Node consumers lack. Line arrays keep diffs readable for the content team.
**Alternatives considered**: `.tmpl` files plus codegen. That's a new generator for no runtime gain.

## R9. Renderer and checks

**Decision**: `renderDocForm(form, slots)` supports `{{id}}` and `{{#id}}…{{/id}}`, and nothing else. A block whose slot is empty or absent is dropped, together with the newline that follows it. `parseDocForm(form)` returns the slot ids it references or throws naming the problem. A contracts test runs it over every form against `DOC_SLOT_IDS` (FR-028). Slot values reach the renderer already escaped: `escapeHtml` for `.htm`/`.php` and a minimal Markdown escaper for `.md`.
**Rationale**: "the project's checks" means `pnpm -r test` in CI, the same gate that covers `criteria.json`.
**Alternatives considered**: a new `pnpm lint` checker script. It would duplicate the test.

## R10. Generated-block markers on Track 2

**Decision**: generated sections are wrapped in `<!-- ks:generated:start -->` … `<!-- ks:generated:end -->`. Before merging, `helpDocsRender` strips any such block, and any legacy `<!-- Keyboard Studio additions -->` tail, from the inherited prose. Copy has no inherited prose, so it gets no markers.
**Rationale**: output always renders from the pristine fetched base text, so the studio never stacks its own blocks within one project. The one real duplication case is a Track 2 adapt of a keyboard whose published docs were themselves studio-generated.
**Alternatives considered**: markers without stripping. That would fail SC-005 for the case above.

## R11. Typing-guide suppression

**Decision**: when there is inherited prose, collect the characters inside each `<table>`, `<ul>`/`<ol>`, or Markdown table/list. If any one of them holds at least 50 % of the guide's characters, the `typingGuide` slot is set empty and `docContent` returns `typingGuideSuppressed: true`. `DocumentationChecklist` then shows `output.docs.checklist.typingGuideSuppressed`.
**Rationale**: the check is content-based, so it works whatever language the original docs are in (design note Q9).
**Alternatives considered**: matching heading text, which depends on the language.
