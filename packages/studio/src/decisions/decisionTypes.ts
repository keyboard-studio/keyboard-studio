// Decision-spike types (km/decisions-spike).
//
// A Decision is the single unit everything else views: a question module ASKS
// for it, an `extract()` probe reads it from a base keyboard's IR, and a
// renderer EDITS it. One id space, three views — this is what lets questions
// be added, removed, and reordered without touching any flow glue.

import type { IRPath } from "@keyboard-studio/contracts";

/** The typed facts the spike tracks, by stable id. */
export type DecisionId =
  | "language-name"
  | "language-region"
  | "language-autonym"
  | "language-code"
  | "target-script"
  | "author-name"
  | "author-email"
  | "copyright-holder"
  | "character-inventory"
  | "authoring-track"
  | "project-display-name"
  | "project-keyboard-id"
  // Proposed full-identity (reserve) flow answers (spec 087 US4) — distinct from the live il_* ids
  // so the two flows never double-provide a decision.
  | "reserve-desktop-notice"
  | "reserve-language-name"
  | "reserve-language-autonym"
  | "reserve-language-code"
  | "reserve-language-region"
  | "reserve-primary-script"
  | "reserve-writing-direction"
  | "reserve-layout-family"
  | "reserve-script-family"
  | "reserve-primary-target"
  | "reserve-author-name"
  | "reserve-author-email"
  | "reserve-copyright-holder"
  | "reserve-provenance-opt-in"
  | "reserve-requester-name"
  | "reserve-requester-contact"
  | "reserve-requester-affiliation"
  | "reserve-requester-relation"
  | "reserve-community-rep-name"
  | "reserve-community-rep-role"
  | "reserve-community-rep-email"
  | "reserve-speaker-count"
  | "reserve-regions"
  | "reserve-language-status"
  | "reserve-existing-tools"
  | "reserve-orthography-url"
  | "reserve-community-involvement"
  | "reserve-casing-notes"
  | "reserve-additional-notes"
  // Phase B character-discovery answers (spec 087 US4)
  | "text-sample"
  | "special-letters"
  | "latin-digraphs-wanted"
  | "indic-onset-vowels-wanted"
  | "syllabic-finals-wanted"
  // Phase F help-doc answers (spec 087 US4)
  | "help-welcome-paragraph"
  | "help-usage-tip-1"
  | "help-usage-tip-2"
  | "help-history-bullets"
  | "help-doc-language"
  | "help-font-guidance"
  | "help-scope-variety"
  | "help-provenance-basis"
  | "help-canonical-order"
  | "help-script-glossary"
  | "help-example-words"
  | "help-troubleshooting"
  | "help-related-keyboards"
  | "help-known-limitations"
  | "help-further-reading"
  | "help-project-url"
  | "help-credits"
  | "help-contact-info"
  // Phase B/F, reserve and parked-question answers whose modules previously
  // carried no provides (spec 087 US4) — every answerable module now provides.
  | "additional-methods"
  | "azerty-qz-swap"
  | "char-count"
  | "co-installed-keyboards"
  | "contact-language"
  | "digit-set"
  | "discovery-intro"
  | "existing-keyboards"
  | "help-design-rationale"
  | "help-history-entry"
  | "help-more-detail"
  | "help-usage-tip-3"
  | "help-usage-tip-4"
  | "help-usage-tip-5"
  | "indic-conjuncts-wanted"
  | "indic-nukta-detail"
  | "indic-nukta-wanted"
  | "indic-onset-vowels-list"
  | "indic-pre-base-vowels"
  | "indic-virama"
  | "indic-vowels-separate"
  | "ip1-keep-strategies"
  | "ip2-keep-device-targets"
  | "ip3-keep-script-conventions"
  | "latin-azerty-branch"
  | "latin-digraphs-list"
  | "latin-qwerty-branch"
  | "legacy-encoding"
  | "linguist-confirm"
  | "mark-input-order"
  | "non-roman-branch"
  | "other-free-entry"
  | "picker-confirm"
  | "punctuation-list"
  | "punctuation-wanted"
  | "rtl-direction-confirm"
  | "rtl-short-vowels"
  | "rtl-special-letters"
  | "sa1-target-script-spread"
  | "sa2-base-script-mismatch"
  | "sa3-latin-flavor"
  | "sea-medials"
  | "sea-stacked-consonants"
  | "spare-keys-azerty"
  | "spare-keys-qwerty"
  | "special-letters-notes"
  | "special-letters-wanted"
  | "standard-letters"
  | "syllabic-finals-list"
  | "syllabic-grid"
  | "syllabic-note"
  | "text-sample-review"
  | "tp1-confidence-threshold"
  | "tp2-fallback-tier-prefill"
  | "tp3-orthography-join"
  | "typing-approach"
  | "use-case"
  // Wizard-step decisions (spec 087 US4): what an editor step settles that no
  // question module asks for. Provided/required by steps (steps/stepDependencies.ts)
  // and ordered by the same orderByDependencies as the questions.
  | "windows-layout"
  | "base-keyboard"
  | "marks-treatment"
  | "punctuation-inventory"
  | "invisibles-inventory"
  | "retained-convenience-chars"
  | "carved-layout"
  | "deadkeys-defined"
  | "rule-set"
  | "physical-layout"
  | "touch-seed-source"
  | "touch-layout"
  | "help-docs";

/** Where a decision's value came from. */
export type DecisionProvenance = "asked" | "extracted" | "default";

/**
 * One resolved fact about the keyboard.
 *
 * `source` names the origin for extracted values (e.g. the base keyboard id),
 * so a future UI can render "from sil_cameroon_qwerty — tap to change".
 */
export interface Decision<T = unknown> {
  id: DecisionId;
  value: T;
  provenance: DecisionProvenance;
  source?: string;
}

/**
 * The resolved decisions so far. Partial by design: gated-out or never-asked
 * decisions simply have no entry (an exact Record would force placeholder
 * entries for questions the author was never asked).
 */
export type DecisionSet = Readonly<Partial<Record<DecisionId, Decision<unknown>>>>;

/**
 * The one prop contract every decision renderer satisfies (km/decisions-spike
 * fix 3). The runner owns the value; the renderer only renders and reports.
 * `T` is the module's answer type (e.g. `string[]` for a character
 * inventory); the registry field uses `DecisionRendererProps<any>` because
 * modules in one registry carry different `T`s — the same heterogeneous-
 * registry pattern as `EditorStepProps` in steps/types.ts.
 */
export interface DecisionRendererProps<T = unknown> {
  value: T | undefined;
  onChange: (value: T) => void;
  decisionId: DecisionId;
}

/**
 * Declared relation between each decision and the KeyboardIR locations it
 * populates (km/decisions-spike fix 1).
 *
 * This is what keeps the two dependency graphs — ordering (`provides` /
 * `requires`) and data flow (`inputs` / `writes`) — from diverging silently:
 * `decisionIRConsistency.test.ts` asserts every provider's declared `writes`
 * covers its mapped paths (each mapped path must be a prefix of, or equal to,
 * a declared write). The `Record` type makes the map exhaustive at compile
 * time: a new DecisionId cannot be added without declaring its IR relation.
 *
 * Most decisions reach their artifact through `outputs` (package-descriptor)
 * or a step's own `writes`, so their entry is `[]`; the test pins that set as
 * an explicit allowlist. A decision whose provider declares IR `writes` must
 * map to those paths instead (the test fails on `[]` there, and on a mapped
 * path the provider never writes).
 */
export const decisionIRPaths: Record<DecisionId, readonly IRPath[]> = {
  "language-name": [],
  "language-region": [],
  "language-autonym": [],
  "language-code": [],
  "target-script": [],
  "author-name": [],
  "author-email": [],
  "copyright-holder": [],
  "character-inventory": [],
  "authoring-track": [],
  "project-display-name": [["header", "name"]],
  "project-keyboard-id": [["header", "keyboardId"]],
  "reserve-desktop-notice": [],
  "reserve-language-name": [["header", "name"]],
  "reserve-language-autonym": [],
  "reserve-language-code": [["header", "bcp47"]],
  "reserve-language-region": [],
  "reserve-primary-script": [["header", "bcp47"]],
  "reserve-writing-direction": [],
  "reserve-layout-family": [],
  "reserve-script-family": [],
  "reserve-primary-target": [],
  "reserve-author-name": [],
  "reserve-author-email": [],
  "reserve-copyright-holder": [["header", "copyright"]],
  "reserve-provenance-opt-in": [],
  "reserve-requester-name": [],
  "reserve-requester-contact": [],
  "reserve-requester-affiliation": [],
  "reserve-requester-relation": [],
  "reserve-community-rep-name": [],
  "reserve-community-rep-role": [],
  "reserve-community-rep-email": [],
  "reserve-speaker-count": [],
  "reserve-regions": [],
  "reserve-language-status": [],
  "reserve-existing-tools": [],
  "reserve-orthography-url": [],
  "reserve-community-involvement": [],
  "reserve-casing-notes": [],
  "reserve-additional-notes": [],
  "text-sample": [],
  "special-letters": [],
  "latin-digraphs-wanted": [],
  "indic-onset-vowels-wanted": [],
  "syllabic-finals-wanted": [],
  // Phase F help-doc answers: package-descriptor / help output, no IR writes.
  "help-welcome-paragraph": [],
  "help-usage-tip-1": [],
  "help-usage-tip-2": [],
  "help-history-bullets": [],
  "help-doc-language": [],
  "help-font-guidance": [],
  "help-scope-variety": [],
  "help-provenance-basis": [],
  "help-canonical-order": [],
  "help-script-glossary": [],
  "help-example-words": [],
  "help-troubleshooting": [],
  "help-related-keyboards": [],
  "help-known-limitations": [],
  "help-further-reading": [],
  "help-project-url": [],
  "help-credits": [],
  "help-contact-info": [],
  // Previously provides-less Phase B/F, reserve and parked-question modules.
  "additional-methods": [],
  "azerty-qz-swap": [],
  "char-count": [],
  "co-installed-keyboards": [],
  "contact-language": [],
  "digit-set": [],
  "discovery-intro": [],
  "existing-keyboards": [],
  "help-design-rationale": [],
  "help-history-entry": [],
  "help-more-detail": [],
  "help-usage-tip-3": [],
  "help-usage-tip-4": [],
  "help-usage-tip-5": [],
  "indic-conjuncts-wanted": [],
  "indic-nukta-detail": [],
  "indic-nukta-wanted": [],
  "indic-onset-vowels-list": [],
  "indic-pre-base-vowels": [],
  "indic-virama": [],
  "indic-vowels-separate": [],
  "ip1-keep-strategies": [],
  "ip2-keep-device-targets": [],
  "ip3-keep-script-conventions": [],
  "latin-azerty-branch": [],
  "latin-digraphs-list": [],
  "latin-qwerty-branch": [],
  "legacy-encoding": [],
  "linguist-confirm": [],
  "mark-input-order": [],
  "non-roman-branch": [],
  "other-free-entry": [],
  "picker-confirm": [],
  "punctuation-list": [],
  "punctuation-wanted": [],
  "rtl-direction-confirm": [],
  "rtl-short-vowels": [],
  "rtl-special-letters": [],
  "sa1-target-script-spread": [],
  "sa2-base-script-mismatch": [],
  "sa3-latin-flavor": [],
  "sea-medials": [],
  "sea-stacked-consonants": [],
  "spare-keys-azerty": [],
  "spare-keys-qwerty": [],
  "special-letters-notes": [],
  "special-letters-wanted": [],
  "standard-letters": [["stores", { kind: "[]" }]],
  "syllabic-finals-list": [],
  "syllabic-grid": [],
  "syllabic-note": [],
  "text-sample-review": [],
  "tp1-confidence-threshold": [],
  "tp2-fallback-tier-prefill": [],
  "tp3-orthography-join": [],
  "typing-approach": [],
  "use-case": [],
  // Wizard-step decisions: editor steps write through their own declared
  // `writes` (steps/editorMutate.ts), not through a decision -> IR mapping.
  "windows-layout": [],
  "base-keyboard": [],
  "marks-treatment": [],
  "punctuation-inventory": [],
  "invisibles-inventory": [],
  "retained-convenience-chars": [],
  "carved-layout": [],
  "deadkeys-defined": [],
  "rule-set": [],
  "physical-layout": [],
  "touch-seed-source": [],
  "touch-layout": [],
  "help-docs": [],
};
