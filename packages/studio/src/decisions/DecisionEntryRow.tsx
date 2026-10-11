// DecisionEntryRow — one decision in the trail (specs/053 FR-013/FR-014/FR-015).
//
// Collapsed by default and expandable to the attributed source change. Expansion
// is what triggers the impact resolution (FR-010) — the row is handed a resolver,
// not a resolved impact, precisely so that mounting a hundred rows computes
// nothing.
//
// The four impact states each get their own rendering, and the distinctions are
// not cosmetic:
//
//   captured    -> each changed file, identified by path, rendered as its own
//                  block (specs/055 FR-017) — never merged into one diff blob
//                  — plus a shared-change note (FR-019) when `sharedWith` is
//                  present. Absent `sharedWith` means this entry claims the
//                  change outright and nothing extra renders.
//   none        -> "this changed nothing in the source", in words. NOT an empty
//                  diff region, which reads as a failure (spec Edge Cases).
//   unavailable -> the localized reason. The studio cannot isolate this change and
//                  says so, rather than implying the decision did nothing. The
//                  three reasons (`lock-gate-dependency`, `no-rederivable-write-path`,
//                  `no-working-copy-yet`) each render distinct prose, from each other
//                  AND from "none" (FR-020; spec 059 FR-012). Each gets an EXPLICIT
//                  arm — a new reason absorbed into a trailing else would render as
//                  the old, now-false message.
//   shed        -> `impact` is null: the detail existed and was dropped to fit the
//                  save budget. Distinct from "never captured" because the author
//                  can act on it (a shorter session keeps its detail).
//
// Resolution may be ASYNC (spec 059): attributing a decision recorded before a
// working copy existed means projecting the working copy twice and diffing, which is
// async because pattern resolution is. `useEntryImpact` owns that, and a stored
// capture still resolves synchronously so a long-recorded fact never flickers
// through the pending state.
//
// The `data-testid` values here are the contract (trail-ui.contract.md §2);
// renaming one breaks tests.
//
// Decisions-page enrichment (docs/decisions-page-audit.md): a meta line under
// the headline states provenance in words and the recorded time for EVERY
// kind (before, provenance reached the author only as a survey headline's
// verb, a `decision` entry's not at all, and `recordedAt` was rendered
// nowhere); the expanded region leads with a detail block — what the entry
// RECORDED — above the impact's what-it-CHANGED: a decision's module label
// and stored value (decisionValueText.ts), a survey answer's overridden
// offer, an editor step's affected-item sample, a base contribution's
// instantiation mode. Superseded entries link to their replacement (and a
// replacing entry back to what it replaced) through the view's reveal
// callback. All new testids are additive; none above was renamed.

import { useMemo, useState } from "react";
import type { DecisionEntry, DecisionImpact, EditorActionType } from "@keyboard-studio/contracts";
import { useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import {
  formatAnswerValue,
  headlineFor,
  type HeadlineDimension,
  type QuestionName,
} from "./headline.ts";
import { createLookupDecisionLabel, createLookupQuestionLabel } from "./lookupQuestionLabel.ts";
import { decisionValueLines, type DecisionValueLine } from "./decisionValueText.ts";
import { formatClauseList, stageActionLabel } from "./stageText.ts";
import { DiffHunkList } from "../ui/DiffHunkList.tsx";
import { useEntryImpact } from "./useEntryImpact.ts";
import { ACCENT, BORDER, FONT, TEXT_DIM } from "../ui/theme.ts";

// ---------------------------------------------------------------------------
// Deep-link jump affordance (spec 057 FR-030/FR-031/FR-035/FR-036, T039/T042).
//
// FR-036 draws a hard line this row already respects for IMPACT (see the
// module header above: expansion, not mount, resolves the diff). LOCATION
// resolution is the opposite case by the spec's own words — "cheap and pure,
// and is fine" on every render — so unlike `resolveImpact` this is computed
// unconditionally, not gated behind `expanded`.
//
// `jumpToLocation` is the ONE jump implementation (its own header names the
// trail and the footer as its two callers); this row calls it directly to
// PERFORM a jump — that's a `lib/` import, which `.dependency-cruiser.cjs`'s
// `decisions-layer` rule allows.
//
// What this row does NOT do is import `stores/` to pre-CHECK reachability
// itself. That rule is absolute here (`tsPreCompilationDeps: true` follows
// even a type-only import — see progressDots.ts's identical note, the
// sibling module this same feature already had to solve this for), so the
// live traversal/hasProject state needed for FR-035's pre-emptive
// "state the reason instead of a link" has to arrive as DATA from a caller
// above the decisions/ boundary — the same shape `resolveImpact` already
// is. `resolveCtx` is that seam, and it is deliberately OPTIONAL: without it
// (today, since DecisionTrailView.tsx is owned by a concurrent task and
// does not pass it yet) every entry optimistically offers the jump control,
// and the jump itself is still always correct — `jumpToLocation` resolves
// for real, live, at click time, safely inside `lib/`. Only the pre-check
// is dormant until a caller supplies `resolveCtx`.
//
// `unreachableReasonLabel` is imported from `./progressDots.ts` rather than
// redefined here — the footer's dot row (T048) landed the SAME "one reason
// code, one sentence" vocabulary this row needs (tasks.md T040 explicitly
// calls the id set "shared by the trail and the footer's upcoming dots"),
// and reusing it is what makes that true rather than merely intended: two
// independently-authored switch statements over the same closed
// `UnreachableReason` union would drift the moment one of them gained a
// case the other forgot, and would cost a second permanent message-id set
// for prose that means the same thing either way.
import { resolveLocation, type ResolveContext, type UnreachableReason } from "../lib/resolveLocation.ts";
import { jumpToLocation } from "../lib/jumpToLocation.ts";
import type { Location } from "../lib/location.ts";
import { unreachableReasonLabel } from "./progressDots.ts";

/** `Location.step`'s value type, without importing `ActiveStepId` from
 * `stores/surveySessionStore.ts` directly — see the import-boundary note
 * above. Deriving the type from the already-legal `Location` import gets the
 * same type with no new edge (progressDots.ts's identical `StepId` alias). */
type StepId = NonNullable<Location["step"]>;

export interface DecisionEntryRowProps {
  entry: DecisionEntry;
  /** True when a later entry replaces this one. */
  superseded: boolean;
  /**
   * Hide the row from view while keeping it in the document.
   *
   * FR-015 requires superseded entries to REMAIN part of the trail, not to
   * disappear when collapsed — history that unmounts is history the author cannot
   * be sure is still there. So the superseded toggle hides; it does not filter.
   */
  hidden?: boolean;
  /**
   * Resolve this entry's impact. Called ONLY on expand — see the module header.
   * Returns `null` when the entry's detail was shed.
   */
  resolveImpact: (entry: DecisionEntry) => DecisionImpact | null;
  /**
   * Async resolver for an entry whose effect must be re-derived by projecting the
   * working copy (spec 059 FR-009). Optional: when absent the row falls back to
   * `resolveImpact` alone, which is what every existing test and the fixture-driven
   * renders rely on.
   *
   * Also called ONLY on expand — `useEntryImpact` gates on that, so passing this
   * does not make mounting the trail compute anything (FR-011, SC-006).
   */
  resolveImpactAsync?: (entry: DecisionEntry) => Promise<DecisionImpact | null>;
  /**
   * Live resolution context for the jump affordance (spec 057 FR-013/FR-035).
   * Optional — see the import-boundary note above the imports for why this
   * is a prop rather than something this file reads for itself, and why its
   * absence still leaves the jump control fully working, just un-gated.
   */
  resolveCtx?: ResolveContext;
  /**
   * The `entryId` of the entry that replaced this one, when this entry is
   * superseded. Arrives as DATA from the view (which holds the whole
   * record) for the same reason `resolveCtx` does: a row is handed one
   * entry at a time (FR-021), so which entry replaced it is not something
   * the row can know on its own. Absent when nothing replaced this entry.
   */
  replacementEntryId?: string;
  /**
   * Ask the view to reveal another entry — un-hide it if it is a collapsed
   * superseded entry, expand its stage, and scroll to it. The row owns no
   * such state (the superseded toggle and the stage collapse set are the
   * view's), so revealing is a request, not something the row performs.
   * Absent (fixture-driven renders), the supersede links simply do not
   * render; the "Replaced by a later decision" marker still does.
   */
  onRevealEntry?: (entryId: string) => void;
  /** True briefly after the view reveals this row — renders a highlight outline. */
  highlighted?: boolean;
}

const rowStyle: React.CSSProperties = {
  borderBottom: `1px solid ${BORDER}`,
  padding: "8px 12px",
  fontSize: 13,
  fontFamily: FONT,
  listStyle: "none",
};

const expandButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: ACCENT,
  cursor: "pointer",
  padding: 0,
  fontSize: 12,
  textDecoration: "underline",
};

const noticeStyle: React.CSSProperties = { margin: 0, color: TEXT_DIM };

const metaStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 2,
  fontSize: 11,
  color: TEXT_DIM,
};

const detailLabelStyle: React.CSSProperties = {
  margin: "0 0 2px",
  fontWeight: 600,
  color: "var(--app-text)",
};

/**
 * Stand-in resolver for when no async resolver was supplied.
 *
 * Never actually called — `useEntryImpact` is passed `expanded && asyncEnabled`,
 * which is false in exactly that case. It exists because the hook must be called
 * unconditionally and its resolver parameter is required; a module-level constant
 * also keeps the hook's dependency identity stable across renders.
 */
const NEVER_RESOLVES = async (): Promise<DecisionImpact | null> => null;

const jumpButtonStyle: React.CSSProperties = {
  background: "none",
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  color: ACCENT,
  cursor: "pointer",
  padding: "2px 8px",
  fontSize: 12,
  whiteSpace: "nowrap",
};

const jumpUnreachableStyle: React.CSSProperties = {
  fontSize: 11,
  color: TEXT_DIM,
  whiteSpace: "nowrap",
};

export function DecisionEntryRow({
  entry,
  superseded,
  hidden = false,
  resolveImpact,
  resolveImpactAsync,
  resolveCtx,
  replacementEntryId,
  onRevealEntry,
  highlighted = false,
}: DecisionEntryRowProps) {
  const { t, i18n } = useLingui();
  const [expanded, setExpanded] = useState(false);

  // The production `lookupQuestionLabel` (specs/055 contracts/headline-spec.contract.md
  // §1) — resolved once per locale rather than reconstructed on every render.
  const lookupQuestionLabel = useMemo(() => createLookupQuestionLabel(i18n), [i18n]);
  const lookupDecisionLabel = useMemo(() => createLookupDecisionLabel(i18n), [i18n]);
  const spec = headlineFor(entry, { lookupQuestionLabel });

  // ---------------------------------------------------------------------------
  // Jump target + reachability (spec 057 FR-030/FR-031/FR-035/FR-036).
  //
  // Built from what the entry already carries — `stepId`, and for a survey
  // answer `payload.questionId` — never a new field on the record. A cast is
  // needed because `entry.stepId` is a plain `string` (it can be
  // PRE_IDENTITY_STEP_ID, or a step a later build removed); `resolveLocation`
  // is exactly what turns an invalid one of those into a stated reason rather
  // than a runtime type problem, the same way StepHost's own step-id cast
  // does at the other end of this same jump.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const targetStepId = entry.stepId as StepId;
  const entryLocation: Location =
    entry.payload.kind === "survey-answer"
      ? { route: "survey", step: targetStepId, question: entry.payload.questionId }
      : { route: "survey", step: targetStepId };

  // Pure and cheap by contract (contracts/location-grammar.md §4) — this is
  // LOCATION resolution, not IMPACT resolution, so running it unconditionally
  // on every render (once `resolveCtx` is supplied) is exactly what FR-036
  // permits (the module header's own distinction: "mounting the trail
  // resolves NO impact" says nothing about location). `resolveCtx` is
  // optional (see its own doc comment above) — absent it, there is nothing
  // to gate on, so the row optimistically treats the entry as jumpable.
  //
  // Every entry here carries a `step` (route is always "survey"), and
  // `resolveLocation` never reports its `"unreachable"` kind for a
  // step-scoped location — dropping `question` then `step` always leaves the
  // bare route, which is always reachable, so a step-having request always
  // resolves either `"reachable"` or `"degraded"` (see resolveLocation.ts's
  // own `refuse()` and jumpToLocation.test.ts's "every refusable location
  // degrades instead" case — progressDots.ts documents the identical reading
  // for its own `!== "reachable"` checks). A "degraded" landing is a real,
  // working jump — but NOT to the decision point the entry actually names
  // (the nearest ancestor, dropping the question or the whole step), so
  // FR-035's "state the reason instead of a link" applies to it exactly as
  // it would to a flat refusal: a control that silently lands somewhere
  // other than what it promised is worse than one that says why it can't.
  const jumpResolution = resolveCtx !== undefined ? resolveLocation(entryLocation, resolveCtx) : null;
  const jumpUnreachableReason: UnreachableReason | null =
    jumpResolution === null || jumpResolution.kind === "reachable" ? null : jumpResolution.reason;

  // Activating the jump. `returnTo` is the trail location itself (contract
  // §5, FR-034): the ONE thing FR-032/FR-033 need is that a revision made
  // after this jump can find its way back here, and StepHost is the runner
  // that honours it — this row's job ends at handing the request off.
  const handleJumpClick = (): void => {
    jumpToLocation(entryLocation, { returnTo: { route: "trail" } });
  };

  // A question's display name for interpolation. `known: false` selects the
  // FR-014 fallback — readable prose, never the raw questionId and never blank.
  const questionText = (question: QuestionName): string =>
    question.known
      ? question.label
      : t({
          id: "trail.entry.headline.question.unknown",
          message: "a question this build no longer has",
        });

  // The editor stage as author-facing prose. `stage` is a code (FR-008); it is
  // never rendered raw. Shared with DecisionTrailView's stage roll-ups via
  // stageText.ts, so an entry and the stage heading above it cannot end up
  // calling the same stage two different things (SC-007).
  const stageLabel = (stage: EditorActionType): string => stageActionLabel(stage, i18n);

  // ---------------------------------------------------------------------------
  // Meta line (decisions-page enrichment): provenance in words + the recorded
  // time, visible on the COLLAPSED row for every payload kind.
  //
  // Before this line, provenance reached the author only as the survey
  // headline's verb ("Chose" / "Accepted suggested" / "Carried") — a `decision`
  // entry's provenance was rendered nowhere at all, so an extracted value and
  // a hand-set one were indistinguishable on the one surface whose subject is
  // provenance — and `recordedAt` was carried by every entry and rendered by
  // no surface. Both facts are read straight off the entry: stating them
  // computes nothing, so the collapsed row stays as cheap as FR-010 requires.
  const provenanceText = (): string => {
    const provenance = entry.provenance;
    switch (provenance.agency) {
      case "hand-set":
        return t({ id: "trail.entry.meta.provenance.handSet", message: "Your own choice" });
      case "base-derived":
        return t({
          id: "trail.entry.meta.provenance.fromBase",
          message: "Carried from the base keyboard",
        });
      case "tool-proposed": {
        if (provenance.source !== undefined) {
          // `source` is author-facing content here exactly as it is in the
          // acceptedSuggested headline (the identifier guard's exemption).
          const source = provenance.source;
          return t({
            id: "trail.entry.meta.provenance.suggestedFrom",
            message: `Suggested by the tool, from ${source}`,
          });
        }
        return t({
          id: "trail.entry.meta.provenance.suggested",
          message: "Suggested by the tool",
        });
      }
      default: {
        const _exhaustive: never = provenance.agency;
        return String(_exhaustive);
      }
    }
  };

  const recordedText = (): string => {
    const when = i18n.date(new Date(entry.recordedAt), {
      dateStyle: "medium",
      timeStyle: "short",
    });
    return t({ id: "trail.entry.meta.recorded", message: `Recorded ${when}` });
  };

  // A `decision` entry's module label, resolved live through the decision
  // lookup (lookupQuestionLabel.ts's bridge over the registry's
  // decisionIndex) rather than read out of the summary string — the summary
  // was composed at record time, in the recording locale, and falls back
  // to the raw decisionId when the module does not resolve; the FR-014
  // prose fallback below never does.
  const decisionLabel = (decisionId: string): string => {
    const label = lookupDecisionLabel(decisionId);
    return label !== undefined
      ? label
      : t({
          id: "trail.entry.detail.decisionUnknown",
          message: "a decision this build no longer has",
        });
  };

  // One line of a decision value's outline (decisionValueText.ts) as text.
  // The framing words are the catalogue's; the content lines are the value's
  // own (see that module's header for what may and may not appear in them).
  const valueLineText = (line: DecisionValueLine): string => {
    switch (line.kind) {
      case "text":
        return line.text;
      case "empty": {
        if (line.label !== undefined) {
          const label = line.label;
          const detail = t({ id: "trail.entry.detail.value.none", message: "none" });
          return t({
            id: "trail.entry.detail.value.labelled",
            message: `${label}: ${detail}`,
          });
        }
        return t({
          id: "trail.entry.detail.value.empty",
          message: "Nothing was recorded for this decision.",
        });
      }
      case "count": {
        const { count } = line;
        const detail = t({
          id: "trail.entry.detail.value.count",
          message: plural(count, { one: "# item", other: "# items" }),
        });
        if (line.label !== undefined) {
          const label = line.label;
          return t({
            id: "trail.entry.detail.value.labelled",
            message: `${label}: ${detail}`,
          });
        }
        return detail;
      }
      case "more": {
        const count = line.count;
        return t({
          id: "trail.entry.detail.value.more",
          message: `… and ${count} more`,
        });
      }
      default: {
        const _exhaustive: never = line;
        return String(_exhaustive);
      }
    }
  };

  // One dimension's ICU-pluralized text (FR-011/FR-012). `count` is destructured
  // to a plain local so the Lingui macro derives the named placeholder `count`
  // rather than a positional one.
  const dimensionLabel = (dimension: HeadlineDimension): string => {
    const { count } = dimension;
    switch (dimension.kind) {
      case "keysRemoved":
        return t({
          id: "trail.entry.headline.dimension.keysRemoved",
          message: plural(count, { one: "# key removed", other: "# keys removed" }),
        });
      case "keysAdded":
        return t({
          id: "trail.entry.headline.dimension.keysAdded",
          message: plural(count, { one: "# key added", other: "# keys added" }),
        });
      case "mechanismsAssigned":
        return t({
          id: "trail.entry.headline.dimension.mechanismsAssigned",
          message: plural(count, {
            one: "# mechanism assigned",
            other: "# mechanisms assigned",
          }),
        });
      case "touchKeysAffected":
        return t({
          id: "trail.entry.headline.dimension.touchKeysAffected",
          message: plural(count, {
            one: "# touch key affected",
            other: "# touch keys affected",
          }),
        });
      default: {
        const _exhaustive: never = dimension.kind;
        return _exhaustive;
      }
    }
  };

  // A derived-axis id, as author-facing prose (FR-008). The ids are the
  // `DiscoveryAxisVector` keys `recordBaseContribution.ts` reads off the
  // working copy; an id this build does not name still degrades to prose,
  // never the raw code and never blank (FR-014).
  const axisLabel = (axisId: string): string => {
    switch (axisId) {
      case "scale":
        return t({ id: "trail.entry.headline.axis.scale", message: "size" });
      case "scriptClass":
        return t({ id: "trail.entry.headline.axis.scriptClass", message: "script type" });
      case "clusterSensitivity":
        return t({
          id: "trail.entry.headline.axis.clusterSensitivity",
          message: "cluster handling",
        });
      case "phoneticIntuition":
        return t({
          id: "trail.entry.headline.axis.phoneticIntuition",
          message: "phonetic intuition",
        });
      case "markInputOrder":
        return t({ id: "trail.entry.headline.axis.markInputOrder", message: "mark input order" });
      case "diacriticBehavior":
        return t({
          id: "trail.entry.headline.axis.diacriticBehavior",
          message: "diacritic behavior",
        });
      case "multiMode":
        return t({
          id: "trail.entry.headline.axis.multiMode",
          message: "multi-orthography mode",
        });
      case "constraintEnforcement":
        return t({
          id: "trail.entry.headline.axis.constraintEnforcement",
          message: "constraint enforcement",
        });
      case "spareKeyAvailability":
        return t({
          id: "trail.entry.headline.axis.spareKeyAvailability",
          message: "spare key availability",
        });
      case "remapPosture":
        return t({ id: "trail.entry.headline.axis.remapPosture", message: "remap posture" });
      default:
        return t({
          id: "trail.entry.headline.axis.unknown",
          message: "a property this build does not name",
        });
    }
  };

  // A metadata field code, as author-facing prose (FR-008). The codes are
  // the `inheritedMetadataOf` keys `recordBaseContribution.ts` writes; an
  // unknown code degrades the same way as an unknown axis id (FR-014).
  const fieldLabel = (field: string): string => {
    switch (field) {
      case "script":
        return t({ id: "trail.entry.headline.field.script", message: "script" });
      case "targets":
        return t({ id: "trail.entry.headline.field.targets", message: "supported platforms" });
      case "version":
        return t({ id: "trail.entry.headline.field.version", message: "keyboard version" });
      default:
        return t({
          id: "trail.entry.headline.field.unknown",
          message: "a detail this build does not name",
        });
    }
  };

  // FR-017/FR-018: one changed file, identified by its path. Called once per
  // entry in `impact.files` (contracts/record-shape.contract.md §3) — the
  // direct fix for D-3, where an identity decision that only touched the
  // package's metadata file used to report "no isolable change" because the
  // old single-path comparison only ever looked at the `.kmn`. `path` is
  // author-facing content (the same exemption `DecisionFileChange.path` gets
  // in the identifier guard, DecisionEntryRow.identifiers.test.tsx's module
  // header §1), not an internal code, so it renders as-is.
  const filePathLabel = (path: string): string =>
    t({ id: "trail.entry.impact.file.path", message: `File changed: ${path}` });

  // FR-019: where a stage's one captured change is attributed to several
  // decisions, `sharedWith` carries the co-decisions' `entryId`s — internal
  // identifiers FR-008 forbids putting in front of the author. This component
  // is handed one `entry` at a time by design (FR-021: expanding one entry
  // must not touch, let alone resolve, any OTHER entry's data), so there is no
  // lookup here from an id to another entry's headline, and building one would
  // mean reaching outside the row for exactly the data FR-021 says an expand
  // must not need. So the note states the fact of sharing and its COUNT rather
  // than naming co-decisions by id or by headline; the co-decisions themselves
  // are the sibling rows the author is already looking at (DecisionTrailView
  // groups entries by the stage they were made in), so "shared with N other
  // decisions in this step" points at them without a lookup this row was never
  // given and without ever printing an entryId.
  const sharedNote = (count: number): string =>
    t({
      id: "trail.entry.impact.shared",
      message: plural(count, {
        one: "This change is shared with # other decision made in this step — expand it to see the same change.",
        other:
          "This change is shared with # other decisions made in this step — expand any of them to see the same change.",
      }),
    });

  // Joins exactly two already-resolved clauses. A named function rather than
  // an inline template at each call site so `a`/`b` are plain parameters —
  // the Lingui macro derives NAMED placeholders from a bare identifier, not
  // from a member expression (see the comment above the headline `let`
  // below).
  const joinTwoClauses = (a: string, b: string): string =>
    t({
      id: "trail.entry.headline.baseContribution.joinTwo",
      message: `${a} and ${b}`,
    });

  // One already-resolved inherited-metadata item ("field: value"). `value` is
  // base-supplied content (the same exemption `payload.value` gets in the
  // identifier guard), not an internal code, so it renders as-is.
  const metadataItemLabel = (item: { field: string; value: string }): string => {
    const field = fieldLabel(item.field);
    const value = item.value;
    return t({
      id: "trail.entry.impact.baseContribution.metadataItem",
      message: `${field}: ${value}`,
    });
  };

  // The headline. Locals rather than member expressions in the template so the
  // Lingui macro derives NAMED placeholders ({value}, {question}, {stage},
  // {dimensions}) instead of positional ones — a translator has to be able to
  // reorder them.
  let headline: string;
  if (spec.id === "chose") {
    const value = spec.value;
    const question = questionText(spec.question);
    headline = t({
      id: "trail.entry.headline.chose",
      message: `Chose ${value} for ${question}`,
    });
  } else if (spec.id === "acceptedSuggested") {
    const value = spec.value;
    const question = questionText(spec.question);
    const source = spec.source;
    headline = t({
      id: "trail.entry.headline.acceptedSuggested",
      message: `Accepted suggested ${value} for ${question}, from ${source}`,
    });
  } else if (spec.id === "fromBase") {
    const value = spec.value;
    const question = questionText(spec.question);
    headline = t({
      id: "trail.entry.headline.fromBase",
      message: `Carried ${value} for ${question} from the base keyboard`,
    });
  } else if (spec.id === "galleryDecision") {
    // spec 090 US5: the recording host's summary, verbatim — author-facing
    // content composed at record time (the identifier guard's payload.value
    // exemption), not a code to resolve through the catalogue.
    headline = spec.summary;
  } else if (spec.id === "editorStep") {
    // At least one dimension is present and non-zero (FR-011) — the composed
    // sentence names only what happened, never a row of zeros.
    const stage = stageLabel(spec.stage);
    // `formatClauseList`, not `join(", ")`: the separator is part of the
    // sentence a reader sees, and it is being inserted AFTER each clause has
    // been through the catalog — so a hardcoded ", " would be an English list
    // convention no translator has a seam to change. Same reasoning as
    // `joinTwoClauses` above, generalized past two items.
    const dimensions = formatClauseList(spec.dimensions.map(dimensionLabel), i18n);
    headline = t({
      id: "trail.entry.headline.editorStep.composed",
      message: `${stage} (${dimensions})`,
    });
  } else if (spec.id === "editorStepNoChange") {
    // Measured, and every count was zero — a statement, not a suppressed list
    // (US1 scenario 5, FR-011).
    const stage = stageLabel(spec.stage);
    headline = t({
      id: "trail.entry.headline.editorStep.noChange",
      message: `${stage} (changed nothing)`,
    });
  } else if (spec.id === "baseContribution") {
    // FR-030/FR-031: names the base and, per FR-011's "only what happened"
    // rule, states only the counts the variant actually carries — a count
    // T021 OMITTED (never a fabricated zero) contributes no clause at all.
    const baseName = spec.baseName;

    // Locals rather than repeated `spec.*` property reads — the Lingui macro
    // needs a bare identifier to derive a named placeholder (see the
    // headline `let` comment above), and building each clause via `if`
    // rather than a nested closure keeps the `!== undefined` narrowing in
    // the same function scope it was established in.
    let startingClause: string | undefined;
    if (spec.startingKeyCount !== undefined) {
      const count = spec.startingKeyCount;
      startingClause = t({
        id: "trail.entry.headline.baseContribution.clause.startingKeyCount",
        message: plural(count, { one: "started with # key", other: "started with # keys" }),
      });
    }
    let derivedClause: string | undefined;
    if (spec.derivedAxisCount !== undefined) {
      const count = spec.derivedAxisCount;
      derivedClause = t({
        id: "trail.entry.headline.baseContribution.clause.derivedAxisCount",
        message: plural(count, { one: "deriving # property", other: "deriving # properties" }),
      });
    }
    let inheritedClause: string | undefined;
    if (spec.inheritedFieldCount !== undefined) {
      const count = spec.inheritedFieldCount;
      inheritedClause = t({
        id: "trail.entry.headline.baseContribution.clause.inheritedFieldCount",
        message: plural(count, {
          one: "inheriting # detail from it",
          other: "inheriting # details from it",
        }),
      });
    }

    if (
      spec.startingKeyCount !== undefined &&
      spec.derivedAxisCount !== undefined &&
      spec.inheritedFieldCount !== undefined
    ) {
      // All three present: the exact sentence the contract names
      // (trail.entry.headline.baseContribution), rendered verbatim rather
      // than re-composed from the clauses above.
      const startingKeyCount = spec.startingKeyCount;
      const derivedAxisCount = spec.derivedAxisCount;
      const inheritedFieldCount = spec.inheritedFieldCount;
      headline = t({
        id: "trail.entry.headline.baseContribution",
        message: `Chose ${baseName} as the base keyboard — started with ${plural(startingKeyCount, { one: "# key", other: "# keys" })}, deriving ${plural(derivedAxisCount, { one: "# property", other: "# properties" })} and inheriting ${plural(inheritedFieldCount, { one: "# detail", other: "# details" })} from it`,
      });
    } else if (
      startingClause === undefined &&
      derivedClause === undefined &&
      inheritedClause === undefined
    ) {
      // No count was present at all — the base itself is still named; never
      // a blank line and never a sentence with nothing in it.
      headline = t({
        id: "trail.entry.headline.baseContribution.base",
        message: `Chose ${baseName} as the base keyboard`,
      });
    } else {
      // One or two of the three present. Named rather than indexed so the
      // three cases stay type-safe under `noUncheckedIndexedAccess` without
      // a non-null assertion.
      let detail: string;
      if (startingClause !== undefined && derivedClause !== undefined) {
        detail = joinTwoClauses(startingClause, derivedClause);
      } else if (startingClause !== undefined && inheritedClause !== undefined) {
        detail = joinTwoClauses(startingClause, inheritedClause);
      } else if (derivedClause !== undefined && inheritedClause !== undefined) {
        detail = joinTwoClauses(derivedClause, inheritedClause);
      } else {
        // Exactly one of the three is present.
        detail = startingClause ?? derivedClause ?? inheritedClause ?? "";
      }
      headline = t({
        id: "trail.entry.headline.baseContribution.withDetail",
        message: `Chose ${baseName} as the base keyboard — ${detail}`,
      });
    }
  } else {
    // Not measured at all — genuinely different from "measured and zero"
    // (FR-005a) and must read as a different sentence, not the same one.
    const stage = stageLabel(spec.stage);
    headline = t({
      id: "trail.entry.headline.editorStep.unmeasured",
      message: `${stage} (what this stage did was not recorded)`,
    });
  }

  // ---------------------------------------------------------------------------
  // Expanded detail (decisions-page enrichment): what the entry RECORDED,
  // rendered above what it CHANGED (the impact below). Rendered only while
  // expanded, like the impact — the collapsed row carries the headline and
  // the meta line, and mounting computes none of this into the DOM.
  //
  // Per kind, this surfaces the record fields the audit found carried but
  // unshown (docs/decisions-page-audit.md):
  //   decision       -> the module label, resolved live, and the stored
  //                     value's outline — the recorder's design always
  //                     intended the value to ride in the payload "for
  //                     anyone who expands the entry"; this is that reader.
  //   survey-answer  -> the offer the author overrode, when the record kept
  //                     one (`provenance.proposed`, spec 078): what the tool
  //                     suggested, and how many sites the suggestion named.
  //   editor-action  -> the bounded sample of affected identifiers the
  //                     summary keeps, with the truncation stated when the
  //                     sample is only the first few.
  // A kind with nothing extra to state gets `null`, never an empty block.
  let detailBlock: React.ReactNode | null = null;
  if (entry.payload.kind === "decision") {
    const payload = entry.payload;
    detailBlock = (
      <div data-testid="decision-entry-detail" style={{ marginBottom: 4 }}>
        <p style={detailLabelStyle}>{decisionLabel(payload.decisionId)}</p>
        {decisionValueLines(payload.value).map((line, index) => (
          <p key={index} style={noticeStyle}>
            {valueLineText(line)}
          </p>
        ))}
      </div>
    );
  } else if (entry.payload.kind === "survey-answer" && entry.provenance.proposed !== undefined) {
    const proposed = entry.provenance.proposed;
    const offered = formatAnswerValue(proposed.value);
    const siteCount = proposed.siteIds?.length ?? 0;
    detailBlock = (
      <div data-testid="decision-entry-detail" style={{ marginBottom: 4 }}>
        <p style={noticeStyle}>
          {t({
            id: "trail.entry.detail.proposedNote",
            message: `The tool suggested ${offered}, and a different value was chosen.`,
          })}
        </p>
        {siteCount > 0 && (
          <p style={noticeStyle}>
            {t({
              id: "trail.entry.detail.proposedSites",
              message: plural(siteCount, {
                one: "The suggestion named # site.",
                other: "The suggestion named # sites.",
              }),
            })}
          </p>
        )}
      </div>
    );
  } else if (entry.payload.kind === "editor-action" && entry.payload.summary.sample.length > 0) {
    const summary = entry.payload.summary;
    const items = formatClauseList(summary.sample, i18n);
    detailBlock = (
      <div data-testid="decision-entry-detail" style={{ marginBottom: 4 }}>
        <p style={noticeStyle}>
          {t({
            id: "trail.entry.detail.editorSample",
            message: `Affected items include: ${items}`,
          })}
        </p>
        {summary.sampleTruncated && (
          <p style={noticeStyle}>
            {t({
              id: "trail.entry.detail.editorSampleTruncated",
              message: "Only the first few are shown.",
            })}
          </p>
        )}
      </div>
    );
  }

  // A base-contribution entry has no single source change to isolate against
  // — it names what the base itself is (FR-030/FR-031), not a diff — so its
  // expanded region lists the base's own derived axes / inherited metadata,
  // each resolved through the catalog, rather than routing through
  // `resolveImpact` (which has nothing to diff here). `null` when this entry
  // is not a base-contribution at all, so the existing four-state impact
  // rendering below is untouched for every other kind (T030's scope).
  const isBaseContribution = entry.payload.kind === "base-contribution";
  let baseContributionDetail: React.ReactNode | null = null;
  if (isBaseContribution) {
    const payload = entry.payload;
    if (payload.kind !== "base-contribution") {
      // Unreachable by construction — `isBaseContribution` is this same
      // check — but keeps the block below narrowed without an assertion.
      throw new Error("unreachable: isBaseContribution without a base-contribution payload");
    }
    // Locale-formatted lists, for the reason given at the `dimensions` join
    // above: both are lists of already-localized clauses.
    const derivedList = formatClauseList(payload.derivedAxes.map(axisLabel), i18n);
    const inheritedList = formatClauseList(
      payload.inheritedMetadata.map(metadataItemLabel),
      i18n,
    );
    const hasDerived = payload.derivedAxes.length > 0;
    const hasInherited = payload.inheritedMetadata.length > 0;

    // The instantiation mode — copied-from vs updated-existing — is carried
    // on the payload and, before the enrichment, rendered nowhere, though
    // it changes what every clause below means (decisions-page audit). One
    // arm per literal the contracts type allows; anything else (a record
    // from a build with a third mode) renders no line rather than a wrong
    // one.
    const modeText =
      payload.instantiationMode === "new-from-base"
        ? t({
            id: "trail.entry.detail.baseMode.newFromBase",
            message: "Started as a new keyboard copied from this base.",
          })
        : payload.instantiationMode === "adapt-existing"
          ? t({
              id: "trail.entry.detail.baseMode.adaptExisting",
              message: "Updated the existing keyboard built on this base.",
            })
          : null;
    const modeLine = modeText !== null ? <p style={noticeStyle}>{modeText}</p> : null;

    baseContributionDetail = (
      <>
        {modeLine}
        {!hasDerived && !hasInherited ? (
          <p style={noticeStyle}>
            {t({
              id: "trail.entry.impact.baseContribution.empty",
              message: "Nothing else was derived or inherited from this base.",
            })}
          </p>
        ) : (
          <>
            {hasDerived && (
              <p style={noticeStyle}>
                {t({
                  id: "trail.entry.impact.baseContribution.derived",
                  message: `Properties derived from the base: ${derivedList}`,
                })}
              </p>
            )}
            {hasInherited && (
              <p style={noticeStyle}>
                {t({
                  id: "trail.entry.impact.baseContribution.inherited",
                  message: `Details inherited from the base: ${inheritedList}`,
                })}
              </p>
            )}
          </>
        )}
      </>
    );
  }

  // Resolved lazily, and only while expanded. Deliberately NOT memoised across
  // collapse/expand: the working copy may have moved on, and a re-derived
  // counterfactual should reflect the IR as it is now rather than as it was the
  // first time this row happened to be opened. Never called for a
  // base-contribution entry — see `baseContributionDetail` above.
  //
  // `useEntryImpact` must be called unconditionally (hooks rule), so the gating
  // lives in its arguments: with `expanded` false, or with no async resolver, it
  // runs nothing. When an async resolver IS supplied it owns resolution entirely,
  // including the synchronous stored-capture case — routing that through the sync
  // resolver as well would ask the same question twice.
  const asyncEnabled = resolveImpactAsync !== undefined && !isBaseContribution;
  const asyncResolution = useEntryImpact(
    entry,
    expanded && asyncEnabled,
    resolveImpactAsync ?? NEVER_RESOLVES,
  );
  const impact = asyncEnabled
    ? asyncResolution.impact
    : expanded && !isBaseContribution
      ? resolveImpact(entry)
      : null;
  const impactPending = asyncEnabled && asyncResolution.pending;

  // Derived from the entry's own id (unique per row), never rendered as text —
  // an `id` attribute is not author-facing content, so this is FR-008-clean
  // the way `data-entry-id` already is below. Wires the expand button's
  // `aria-controls` to the region it reveals (ARIA APG disclosure pattern;
  // trail-ui a11y review P2).
  const impactRegionId = `decision-entry-impact-${entry.entryId}`;

  return (
    <li
      style={
        highlighted
          ? { ...rowStyle, outline: `2px solid ${ACCENT}`, outlineOffset: -2 }
          : rowStyle
      }
      hidden={hidden}
      id={`decision-entry-${entry.entryId}`}
      data-testid="decision-entry"
      data-entry-id={entry.entryId}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span
          data-testid="decision-entry-headline"
          style={{ flex: 1, minWidth: 0, color: superseded ? TEXT_DIM : undefined }}
        >
          {headline}
        </span>
        {superseded && (
          <span
            data-testid="decision-entry-superseded"
            style={{ fontSize: 11, color: TEXT_DIM, whiteSpace: "nowrap" }}
          >
            {t({
              id: "trail.entry.superseded.label",
              message: "Replaced by a later decision",
            })}
          </span>
        )}
        {jumpUnreachableReason !== null ? (
          // FR-035: the reason renders IN PLACE of a link — never a link that
          // would fail, or that would silently land somewhere other than the
          // decision point it names, and never a dead control with no text.
          <span data-testid="decision-entry-jump-unreachable" style={jumpUnreachableStyle}>
            {unreachableReasonLabel(jumpUnreachableReason, i18n)}
          </span>
        ) : (
          <button
            type="button"
            data-testid="decision-entry-jump"
            style={jumpButtonStyle}
            onClick={handleJumpClick}
          >
            {t({ id: "trail.jump.label", message: "Jump to this decision point" })}
          </button>
        )}
        <button
          type="button"
          data-testid="decision-entry-expand"
          style={expandButtonStyle}
          aria-expanded={expanded}
          aria-controls={impactRegionId}
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded
            ? t({ id: "trail.entry.impact.collapse", message: "Hide change" })
            : t({ id: "trail.entry.impact.expand", message: "Show change" })}
        </button>
      </div>

      {/* Meta line: provenance in words + when this was recorded, for every
          kind (see provenanceText above). The supersede links live here too:
          each names the OTHER entry and asks the view to reveal it — the
          badge in the headline row above still carries the bare fact, per
          the contract testid it has always had. */}
      <div data-testid="decision-entry-meta" style={metaStyle}>
        <span>{provenanceText()}</span>
        <span aria-hidden="true">·</span>
        <span>{recordedText()}</span>
        {superseded && replacementEntryId !== undefined && onRevealEntry !== undefined && (
          <button
            type="button"
            data-testid="decision-entry-show-replacement"
            style={expandButtonStyle}
            onClick={() => onRevealEntry(replacementEntryId)}
          >
            {t({
              id: "trail.entry.supersede.showReplacement",
              message: "Show the decision that replaced this one",
            })}
          </button>
        )}
        {entry.supersedes !== null && onRevealEntry !== undefined && (
          <button
            type="button"
            data-testid="decision-entry-show-replaced"
            style={expandButtonStyle}
            onClick={() => {
              const replacedId = entry.supersedes;
              if (replacedId !== null) onRevealEntry(replacedId);
            }}
          >
            {t({
              id: "trail.entry.supersede.showReplaced",
              message: "Show the earlier decision this replaced",
            })}
          </button>
        )}
      </div>

      {expanded && (
        <div data-testid="decision-entry-impact" id={impactRegionId} style={{ marginTop: 4 }}>
          {detailBlock}
          {baseContributionDetail !== null ? (
            baseContributionDetail
          ) : impactPending ? (
            // The one transient state. Only ever reached for an entry whose effect
            // has to be re-derived by projecting (spec 059); a stored capture
            // resolves on the first render and never passes through here.
            <p style={noticeStyle} data-testid="decision-entry-impact-pending">
              {t({
                id: "trail.entry.impact.pending",
                message: "Working out what this decision changed…",
              })}
            </p>
          ) : impact === null ? (
            // `resolveImpact` returns null only for a shed entry — the detail was
            // captured once and then dropped, which is a different statement from
            // "there was nothing to capture".
            <p style={noticeStyle}>
              {t({
                id: "trail.entry.impact.shed",
                message:
                  "The detail for this decision was dropped to stay within the save limit.",
              })}
            </p>
          ) : impact.state === "captured" ? (
            // FR-017: each changed file renders in its OWN block, identified
            // by path, rather than merged into one diff blob — the fix for
            // D-3 (an identity decision used to report "no isolable change"
            // because the old comparison only ever looked at the `.kmn`).
            // FR-019: when the change is jointly attributed, the shared note
            // renders ONCE, above the per-file blocks, so it reads as a
            // statement about the whole captured change rather than being
            // repeated per file. Absent `sharedWith` means this entry claims
            // the change outright (053's default), so nothing extra renders.
            <>
              {impact.sharedWith !== undefined && impact.sharedWith.length > 0 && (
                <p style={noticeStyle} data-testid="decision-entry-impact-shared">
                  {sharedNote(impact.sharedWith.length)}
                </p>
              )}
              {impact.files.map((file) => (
                <div key={file.path} data-testid="decision-entry-impact-file" data-file-path={file.path}>
                  <p style={noticeStyle}>{filePathLabel(file.path)}</p>
                  <DiffHunkList hunks={file.hunks} />
                </div>
              ))}
            </>
          ) : impact.state === "none" ? (
            <p style={noticeStyle}>
              {t({
                id: "trail.entry.impact.none",
                message: "This decision changed nothing in the keyboard source.",
              })}
            </p>
          ) : impact.reason === "lock-gate-dependency" ? (
            <p style={noticeStyle}>
              {t({
                id: "trail.entry.impact.unavailable.lockGate",
                message:
                  "This decision sits behind a step that has since been locked, so its effect can no longer be shown on its own.",
              })}
            </p>
          ) : impact.reason === "no-working-copy-yet" ? (
            // FR-012's whole requirement: its OWN words, distinct from both other
            // unavailability messages AND from "changed nothing". This decision has a
            // write path and did reach the artifact — there is simply no keyboard yet
            // to project, and the author can fix that by choosing a base. Falling into
            // the trailing branch below would tell them the opposite.
            <p style={noticeStyle}>
              {t({
                id: "trail.entry.impact.unavailable.noWorkingCopyYet",
                message:
                  "This decision was made before a keyboard existed to change, so its effect cannot be shown yet. Choose a base keyboard and it will appear here.",
              })}
            </p>
          ) : (
            <p style={noticeStyle}>
              {t({
                id: "trail.entry.impact.unavailable.noWritePath",
                message:
                  "This question has no re-derivable write path in this build, so its effect cannot be shown on its own.",
              })}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
