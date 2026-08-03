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
//   captured    -> the hunks
//   none        -> "this changed nothing in the source", in words. NOT an empty
//                  diff region, which reads as a failure (spec Edge Cases).
//   unavailable -> the localized reason. The studio cannot isolate this change and
//                  says so, rather than implying the decision did nothing.
//   shed        -> `impact` is null: the detail existed and was dropped to fit the
//                  save budget. Distinct from "never captured" because the author
//                  can act on it (a shorter session keeps its detail).
//
// The `data-testid` values here are the contract (trail-ui.contract.md §2);
// renaming one breaks tests.

import { useMemo, useState } from "react";
import type { DecisionEntry, DecisionImpact, EditorActionType } from "@keyboard-studio/contracts";
import { useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { headlineFor, type HeadlineDimension, type QuestionName } from "./headline.ts";
import { createLookupQuestionLabel } from "./lookupQuestionLabel.ts";
import { DiffHunkList } from "../ui/DiffHunkList.tsx";
import { ACCENT, BORDER, FONT, TEXT_DIM } from "../ui/theme.ts";

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

export function DecisionEntryRow({
  entry,
  superseded,
  hidden = false,
  resolveImpact,
}: DecisionEntryRowProps) {
  const { t, i18n } = useLingui();
  const [expanded, setExpanded] = useState(false);

  // The production `lookupQuestionLabel` (specs/055 contracts/headline-spec.contract.md
  // §1) — resolved once per locale rather than reconstructed on every render.
  const lookupQuestionLabel = useMemo(() => createLookupQuestionLabel(i18n), [i18n]);
  const spec = headlineFor(entry, { lookupQuestionLabel });

  // A question's display name for interpolation. `known: false` selects the
  // FR-014 fallback — readable prose, never the raw questionId and never blank.
  const questionText = (question: QuestionName): string =>
    question.known
      ? question.label
      : t({
          id: "trail.entry.headline.question.unknown",
          message: "a question this build no longer has",
        });

  // The editor stage as author-facing prose. `stage` is a code (FR-008); this
  // is the one place it is ever mapped to text, and it is never rendered raw.
  const stageLabel = (stage: EditorActionType): string => {
    switch (stage) {
      case "gallery_edit":
        return t({
          id: "trail.entry.headline.stage.galleryEdit",
          message: "Edited the character gallery",
        });
      case "mechanism_edit":
        return t({
          id: "trail.entry.headline.stage.mechanismEdit",
          message: "Assigned key mechanisms",
        });
      case "touch_edit":
        return t({
          id: "trail.entry.headline.stage.touchEdit",
          message: "Edited the touch layout",
        });
      default: {
        const _exhaustive: never = stage;
        return _exhaustive;
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
  } else if (spec.id === "editorStep") {
    // At least one dimension is present and non-zero (FR-011) — the composed
    // sentence names only what happened, never a row of zeros.
    const stage = stageLabel(spec.stage);
    const dimensions = spec.dimensions.map(dimensionLabel).join(", ");
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
  } else {
    // Not measured at all — genuinely different from "measured and zero"
    // (FR-005a) and must read as a different sentence, not the same one.
    const stage = stageLabel(spec.stage);
    headline = t({
      id: "trail.entry.headline.editorStep.unmeasured",
      message: `${stage} (what this stage did was not recorded)`,
    });
  }

  // Resolved lazily, and only while expanded. Deliberately NOT memoised across
  // collapse/expand: the working copy may have moved on, and a re-derived
  // counterfactual should reflect the IR as it is now rather than as it was the
  // first time this row happened to be opened.
  const impact = expanded ? resolveImpact(entry) : null;

  return (
    <li
      style={rowStyle}
      hidden={hidden}
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
        <button
          type="button"
          data-testid="decision-entry-expand"
          style={expandButtonStyle}
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded
            ? t({ id: "trail.entry.impact.collapse", message: "Hide change" })
            : t({ id: "trail.entry.impact.expand", message: "Show change" })}
        </button>
      </div>

      {expanded && (
        <div data-testid="decision-entry-impact" style={{ marginTop: 4 }}>
          {impact === null ? (
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
            // One entry per changed file (specs/055-legible-decision-trail
            // FR-016/FR-018); today's producers only ever attach one, so this
            // renders the same as before. T027 widens the file set.
            impact.files.map((file) => <DiffHunkList key={file.path} hunks={file.hunks} />)
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
