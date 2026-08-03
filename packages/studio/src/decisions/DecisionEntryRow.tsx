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
    const derivedList = payload.derivedAxes.map(axisLabel).join(", ");
    const inheritedList = payload.inheritedMetadata.map(metadataItemLabel).join(", ");
    const hasDerived = payload.derivedAxes.length > 0;
    const hasInherited = payload.inheritedMetadata.length > 0;

    baseContributionDetail =
      !hasDerived && !hasInherited ? (
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
      );
  }

  // Resolved lazily, and only while expanded. Deliberately NOT memoised across
  // collapse/expand: the working copy may have moved on, and a re-derived
  // counterfactual should reflect the IR as it is now rather than as it was the
  // first time this row happened to be opened. Never called for a
  // base-contribution entry — see `baseContributionDetail` above.
  const impact = expanded && !isBaseContribution ? resolveImpact(entry) : null;

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
          {baseContributionDetail !== null ? (
            baseContributionDetail
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
