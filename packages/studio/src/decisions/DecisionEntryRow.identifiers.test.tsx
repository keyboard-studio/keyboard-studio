// FR-028's mechanical guard (specs/055-legible-decision-trail T019, research
// D-12): renders one entry of EVERY kind through the REAL DecisionEntryRow
// component, wrapped in the REAL, compiled English catalog (`../test/renderWithI18n.tsx`
// loads `../locales/en/messages.json?lingui` and activates it — the same
// artifact production activates, not a stub `t()`), and asserts the rendered
// text carries no snake_case / camelCase identifier drawn from the payload.
//
// D-12 rejected asserting on `HeadlineSpec` alone: the spec only names WHICH
// catalog message is chosen, not what that message's INTERPOLATED text reads
// like once rendered — a catalog message could itself embed `{stage}` or
// `{dimensions}` and no spec-level assertion would see it. Only a render can
// prove FR-008.
//
// SCOPING RULE (how this avoids false positives on legitimate author-facing
// values — a chosen keyboard id, a language tag like `bm-Latn`, a character
// list):
//
//   1. The explicit, per-fixture "forbidden" tokens below are pulled ONLY from
//      fields whose TYPE is a closed, internal code union: `questionId`,
//      `stepId`, `EditorActionType` (`actionType`), and the
//      `EditorActionSummary` COUNT FIELD NAMES the fixture has present
//      (`keysRemoved` etc. — the field name, not its numeric value). Every
//      forbidden token is read off the SAME local variable used to build the
//      fixture's payload, not a separately maintained string — change the
//      fixture and the forbidden list changes with it, so it cannot rot the
//      way a hand-copied list would.
//
//      Deliberately EXCLUDED from this scope: `payload.value`,
//      `provenance.source`, `DecisionFileChange.path`, and any other
//      author/base-supplied content. Those are exactly the fields FR-008
//      exempts — a keyboard id, a script tag, a character the author typed are
//      legitimate rendered content, not "internal identifiers", and asserting
//      their absence would be asserting the feature is broken.
//
//   2. A second, cheaper-to-maintain net: `identifierShapedTokens` scans the
//      WHOLE rendered row for any substring SHAPED like snake_case or
//      camelCase, with no knowledge of which field it came from. This is what
//      catches a future bug the field-scoped list does not anticipate (e.g. a
//      new dimension kind, or a direct interpolation the field-scoped list
//      never named). It is safe against false positives ONLY because every
//      fixture below chooses author-facing VALUES that are plain words or
//      hyphenated tags (`Latn`, `Bambara`, `bm`) — never themselves
//      snake_case/camelCase-shaped. `bm-Latn`-style hyphenated tags do not
//      match either shape (a hyphen is not a word character in the camelCase
//      alternative, and there is no underscore), which is why the regex is
//      safe to run over real prose rather than a curated token list.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import type {
  DecisionEntry,
  DecisionImpact,
  EditorActionSummary,
  EditorActionType,
} from "@keyboard-studio/contracts";
import { DecisionEntryRow } from "./DecisionEntryRow.tsx";

afterEach(cleanup);

/**
 * Matches a snake_case identifier (`gallery_edit`, `il_language_english`) or a
 * camelCase identifier (`keysRemoved`, `editorStep`) — never a hyphenated tag
 * (`bm-Latn`) or a capitalized word (`Latn`, `Bambara`), since a hyphen breaks
 * the run and a capital first letter fails the lowercase-start requirement.
 * See the module header's scoping rule §2.
 */
const IDENTIFIER_SHAPE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b|\b[a-z][a-z0-9]*[A-Z][a-zA-Z0-9]*\b/g;

function identifierShapedTokens(text: string): string[] {
  return [...text.matchAll(IDENTIFIER_SHAPE)].map((match) => match[0]);
}

/**
 * Text of each named region, joined with an explicit space.
 *
 * NOT `row.textContent` directly: sibling elements with no whitespace between
 * them in the DOM (the headline `<span>` immediately followed by the expand
 * `<button>`) concatenate into one word on `.textContent` — e.g. "Keyboard
 * script" + "Show change" reads back as "...scriptShow change", which the
 * camelCase regex below (correctly) flags as identifier-shaped even though no
 * identifier leaked. Joining the regions with a space is what keeps that a
 * DOM-serialization artifact rather than a false positive on real content.
 */
function collectRowText(): string {
  const parts: string[] = [];
  for (const testId of [
    "decision-entry-headline",
    "decision-entry-superseded",
    "decision-entry-expand",
    "decision-entry-impact",
  ]) {
    const el = screen.queryByTestId(testId);
    if (el) parts.push(el.textContent ?? "");
  }
  return parts.join(" ");
}

/** Render one row (optionally expanded) and return its own rendered text, scoped to that row. */
function renderRow(
  entry: DecisionEntry,
  options: { resolveImpact?: (e: DecisionEntry) => DecisionImpact | null; expand?: boolean } = {},
): string {
  const resolveImpact = options.resolveImpact ?? (() => null);
  render(
    <ul>
      <DecisionEntryRow entry={entry} superseded={false} resolveImpact={resolveImpact} />
    </ul>,
  );
  if (options.expand) {
    fireEvent.click(screen.getByTestId("decision-entry-expand"));
  }
  return collectRowText();
}

/** Assert `text` contains none of `forbidden` and no identifier-shaped token at all. */
function assertNoIdentifierLeak(text: string, forbidden: readonly string[]): void {
  for (const token of forbidden) {
    expect(text).not.toContain(token);
  }
  expect(identifierShapedTokens(text)).toEqual([]);
}

describe("survey agencies (FR-008/FR-009) — questionId never renders raw", () => {
  it("hand-set (\"chose\") names the question by its audit label, not its id", () => {
    const questionId = "il_target_script";
    const stepId = "identity_lite";
    const entry: DecisionEntry = {
      entryId: "e-hand-set",
      stepId,
      payload: { kind: "survey-answer", questionId, answerType: "select", value: "Latn" },
      provenance: { agency: "hand-set" },
      recordedAt: 1,
      supersedes: null,
    };
    const text = renderRow(entry);
    assertNoIdentifierLeak(text, [questionId, stepId]);
    // Sanity: the row still says something legible — a guard that can only
    // ever pass on silence is not a guard on FR-008 at all.
    expect(text).toMatch(/Keyboard script/);
    expect(text).toMatch(/Latn/);
  });

  it("tool-proposed (\"acceptedSuggested\") falls back to the prompt when no audit label is authored", () => {
    const questionId = "il_language_code"; // no audit_label on this question
    const stepId = "identity_lite";
    const entry: DecisionEntry = {
      entryId: "e-tool-proposed",
      stepId,
      payload: { kind: "survey-answer", questionId, answerType: "select", value: "bm" },
      provenance: { agency: "tool-proposed", source: "langtags" },
      recordedAt: 1,
      supersedes: null,
    };
    const text = renderRow(entry);
    assertNoIdentifierLeak(text, [questionId, stepId]);
    expect(text).toMatch(/Confirm your language's code/);
  });

  it("base-derived (\"fromBase\") marks the value as carried from the base, not author-set", () => {
    const questionId = "il_language_english";
    const stepId = "identity_lite";
    const entry: DecisionEntry = {
      entryId: "e-base-derived",
      stepId,
      payload: { kind: "survey-answer", questionId, answerType: "select", value: "Bambara" },
      provenance: { agency: "base-derived", source: "base" },
      recordedAt: 1,
      supersedes: null,
    };
    const text = renderRow(entry);
    assertNoIdentifierLeak(text, [questionId, stepId]);
    expect(text).toMatch(/Language name \(English\)/);
    expect(text).toMatch(/from the base keyboard/i);
  });

  it("a question absent from the catalog (FR-014) degrades to prose, never the raw id and never blank", () => {
    const questionId = "il_this_question_does_not_exist_v9";
    const stepId = "identity_lite";
    const entry: DecisionEntry = {
      entryId: "e-unknown-question",
      stepId,
      payload: { kind: "survey-answer", questionId, answerType: "select", value: "Latn" },
      provenance: { agency: "hand-set" },
      recordedAt: 1,
      supersedes: null,
    };
    const text = renderRow(entry);
    assertNoIdentifierLeak(text, [questionId, stepId]);
    expect(text.trim().length).toBeGreaterThan(0);
    expect(text).toMatch(/question/i);
  });
});

describe("editor action types and the three editor outcomes (FR-008/FR-010/FR-011)", () => {
  it("gallery_edit / editorStep names the stage and every present dimension in words, not codes", () => {
    const actionType: EditorActionType = "gallery_edit";
    const stepId = "carve_gallery";
    const summary: EditorActionSummary = {
      keysRemoved: 172,
      keysAdded: 3,
      mechanismsAssigned: 5,
      touchKeysAffected: 50,
      sample: [],
      sampleTruncated: false,
    };
    const entry: DecisionEntry = {
      entryId: "e-gallery-edit",
      stepId,
      payload: { kind: "editor-action", actionType, summary },
      provenance: { agency: "hand-set" },
      recordedAt: 1,
      supersedes: null,
    };
    const text = renderRow(entry);
    assertNoIdentifierLeak(text, [
      actionType,
      stepId,
      "keysRemoved",
      "keysAdded",
      "mechanismsAssigned",
      "touchKeysAffected",
    ]);
    expect(text).toMatch(/character gallery/i);
    expect(text).toMatch(/172 keys removed/);
    expect(text).toMatch(/3 keys added/);
    expect(text).toMatch(/5 mechanisms assigned/);
    expect(text).toMatch(/50 touch keys affected/);
  });

  it("mechanism_edit / editorStepNoChange states the stage made no change, as a sentence", () => {
    const actionType: EditorActionType = "mechanism_edit";
    const stepId = "assign_mechanisms";
    const summary: EditorActionSummary = {
      keysRemoved: 0,
      keysAdded: 0,
      mechanismsAssigned: 0,
      touchKeysAffected: 0,
      sample: [],
      sampleTruncated: false,
    };
    const entry: DecisionEntry = {
      entryId: "e-mechanism-edit-no-change",
      stepId,
      payload: { kind: "editor-action", actionType, summary },
      provenance: { agency: "hand-set" },
      recordedAt: 1,
      supersedes: null,
    };
    const text = renderRow(entry);
    assertNoIdentifierLeak(text, [
      actionType,
      stepId,
      "keysRemoved",
      "keysAdded",
      "mechanismsAssigned",
      "touchKeysAffected",
    ]);
    expect(text).toMatch(/key mechanisms/i);
    expect(text).toMatch(/changed nothing/i);
  });

  it("touch_edit / editorStepUnmeasured states the effect was not recorded, distinctly from zero", () => {
    const actionType: EditorActionType = "touch_edit";
    const stepId = "touch_layout";
    const summary: EditorActionSummary = {
      sample: [],
      sampleTruncated: false,
    };
    const entry: DecisionEntry = {
      entryId: "e-touch-edit-unmeasured",
      stepId,
      payload: { kind: "editor-action", actionType, summary },
      provenance: { agency: "hand-set" },
      recordedAt: 1,
      supersedes: null,
    };
    const text = renderRow(entry);
    assertNoIdentifierLeak(text, [
      actionType,
      stepId,
      "keysRemoved",
      "keysAdded",
      "mechanismsAssigned",
      "touchKeysAffected",
    ]);
    expect(text).toMatch(/touch layout/i);
    expect(text).toMatch(/not recorded/i);
  });
});

describe("the shed and impact-unavailable states (FR-008 over the expanded region)", () => {
  const carrier: DecisionEntry = {
    entryId: "e-impact-carrier",
    stepId: "identity_lite",
    payload: {
      kind: "survey-answer",
      questionId: "il_target_script",
      answerType: "select",
      value: "Latn",
    },
    provenance: { agency: "hand-set" },
    recordedAt: 1,
    supersedes: null,
  };

  it("shed — a null impact reads as dropped detail, not an identifier or a blank", () => {
    const text = renderRow(
      { ...carrier, impact: null },
      { resolveImpact: () => null, expand: true },
    );
    assertNoIdentifierLeak(text, [carrier.payload.kind === "survey-answer" ? carrier.payload.questionId : ""]);
    expect(text).toMatch(/dropped/i);
  });

  it("unavailable / lock-gate-dependency reads as prose, not the reason code", () => {
    const text = renderRow(carrier, {
      resolveImpact: () => ({ state: "unavailable", reason: "lock-gate-dependency" }),
      expand: true,
    });
    assertNoIdentifierLeak(text, ["lock-gate-dependency"]);
    expect(text).toMatch(/locked/i);
  });

  it("unavailable / no-rederivable-write-path reads as prose, not the reason code", () => {
    const text = renderRow(carrier, {
      resolveImpact: () => ({ state: "unavailable", reason: "no-rederivable-write-path" }),
      expand: true,
    });
    assertNoIdentifierLeak(text, ["no-rederivable-write-path"]);
    expect(text).toMatch(/write path/i);
  });

  it("none — a captured-nothing impact reads as a positive statement, not an identifier", () => {
    const text = renderRow(carrier, {
      resolveImpact: () => ({ state: "none" }),
      expand: true,
    });
    assertNoIdentifierLeak(text, []);
    expect(text).toMatch(/changed nothing/i);
  });
});
