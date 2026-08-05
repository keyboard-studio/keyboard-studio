// The FR-016 repository check (spec 059 T038, contracts/question-output-reach.md).
//
// WHAT DEFECT CLASS THIS CLOSES
//
// `il_language_code` told the author, in its own help text, that their language code
// "goes on the finished keyboard". It did not. Nothing wrote it anywhere, and nothing
// in the repository could notice, because the only declaration a question had was
// `writes: IRPath[]` — and `writes: []` was CORRECT for an identity question, which
// writes no KeyboardIR. "Reaches an output file" had nowhere to be stated, so the
// promise and the code could drift apart silently and did, for as long as they did.
//
// Two assertions, both failing the build:
//
//   (a) DECLARATION INTEGRITY — a declared output reach must name a real target and
//       a field that target's writer actually consumes. This catches the E-1 shape
//       one level earlier: a question claiming to feed a field nobody reads.
//
//   (b) PROMISE INTEGRITY — a question whose prose promises the author their answer
//       ships must declare that it does. (a) alone would happily pass a question
//       that promises the world and declares `outputs: []`, which is precisely the
//       state `il_language_code` was in.
//
// WHY A VITEST AND NOT A utilities/ LINTER
//
// The declarations are TypeScript module exports. `content-i18n-lint` is plain JS and
// cannot re-derive `flowQuestions.json` from TS-module question definitions — which
// is exactly why spec 050 added the tsx-run `content-i18n-freshness` check beside it
// rather than extending it. A plain-node checker here would need its own TypeScript
// parser. Vitest imports `questionRegistry` directly, and `registry.test.ts` is the
// established home for registry-wide invariants (research D-07).

import { describe, it, expect } from "vitest";
import { DESCRIPTOR_CONSUMED_FIELDS } from "@keyboard-studio/engine";
import { questionRegistry } from "./registry.ts";
import type { OutputTargetId } from "../types.ts";

// ---------------------------------------------------------------------------
// The writer table
// ---------------------------------------------------------------------------

/**
 * Which fields each output target's writer actually consumes.
 *
 * Every entry is owned by the WRITER, never restated here: `package-descriptor` maps
 * to the engine module's own exported set. A table maintained in the test would be a
 * second source of truth, and the drift it permitted is the drift this check exists
 * to catch.
 */
const WRITER_CONSUMED_FIELDS: Record<OutputTargetId, ReadonlySet<string>> = {
  "package-descriptor": DESCRIPTOR_CONSUMED_FIELDS,
};

// ---------------------------------------------------------------------------
// (b) The promise phrase list
// ---------------------------------------------------------------------------

/**
 * Phrasings that promise the author their answer reaches the finished keyboard.
 *
 * Deliberately small and LITERAL. A broad heuristic that fired on ordinary wording
 * would train maintainers to reach for the allowlist below, which converts a check
 * into a formality. Expected to grow when a new promise phrasing actually appears —
 * adding a phrase here is cheap; a false positive costs a real maintainer's trust.
 */
const PROMISE_PHRASES: readonly string[] = [
  "goes on the finished keyboard",
  "on the finished keyboard",
  "ships with",
  "appears in the package",
  "included in the package",
  "in the downloaded",
];

/**
 * Questions whose matching prose is NOT a shipping promise, each with a one-line
 * justification.
 *
 * An entry is how a maintainer says so ON THE RECORD. Ships EMPTY: at the time this
 * check landed, every phrase-matching question's promise was true. An entry with an
 * empty justification is itself a failure — an unexplained exemption is how a check
 * stops meaning anything.
 */
const PROMISE_CHECK_EXEMPT: Record<string, string> = {};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const registryEntries = Object.entries(questionRegistry);

/** A question's author-facing prose, lowercased for matching. */
function proseOf(questionId: string): string {
  const definition = questionRegistry[questionId]?.definition;
  return [definition?.prompt ?? "", definition?.help_text ?? ""].join("\n").toLowerCase();
}

function matchedPhrase(questionId: string): string | undefined {
  const prose = proseOf(questionId);
  return PROMISE_PHRASES.find((phrase) => prose.includes(phrase));
}

// ---------------------------------------------------------------------------
// (a) Declaration integrity
// ---------------------------------------------------------------------------

describe("FR-016 (a) — every declared output reach is real", () => {
  it("names a target in the writer table", () => {
    const offenders: string[] = [];
    for (const [questionId, mod] of registryEntries) {
      for (const write of mod.outputs ?? []) {
        if (!(write.target in WRITER_CONSUMED_FIELDS)) {
          offenders.push(`${questionId} declares unknown output target "${write.target}"`);
        }
      }
    }
    expect(
      offenders,
      "A question declares an output target with no writer. Either register the " +
        "writer in WRITER_CONSUMED_FIELDS (sourcing its field set FROM the writer, " +
        "not restating it) or remove the declaration.",
    ).toEqual([]);
  });

  it("names a field that target's writer actually consumes", () => {
    const offenders: string[] = [];
    for (const [questionId, mod] of registryEntries) {
      for (const write of mod.outputs ?? []) {
        const consumed = WRITER_CONSUMED_FIELDS[write.target];
        if (consumed === undefined) continue; // reported by the test above
        if (!consumed.has(write.field)) {
          offenders.push(
            `${questionId} declares field "${write.field}" on target "${write.target}", ` +
              `which consumes only: ${[...consumed].sort().join(", ")}`,
          );
        }
      }
    }
    expect(
      offenders,
      "A question declares it feeds a field no writer reads — the E-1 shape, caught " +
        "one level earlier than reading the artifact. Either teach the writer to " +
        "consume the field or correct the declaration.",
    ).toEqual([]);
  });

  it("keeps the five identity-lite declarations exactly as the contract pins them", () => {
    // These five ids are pinned by the spec's governing documents. Pinned here too,
    // because a silent change to any of them is a silent change to what the trail can
    // attribute — the counterfactual looks up the overlay field to vary from exactly
    // this declaration.
    const declared = Object.fromEntries(
      ["il_language_english", "il_language_autonym", "il_language_code", "il_language_region", "il_target_script"].map(
        (id) => [id, (questionRegistry[id]?.outputs ?? []).map((w) => `${w.target}:${w.field}`)],
      ),
    );
    expect(declared).toEqual({
      il_language_english: ["package-descriptor:languageName"],
      // Collected for the display-name seed and the author's own recognition, not as
      // the descriptor's display text (spec Assumptions). The explicit `[]` states it.
      il_language_autonym: [],
      il_language_code: ["package-descriptor:bcp47"],
      il_language_region: ["package-descriptor:bcp47"],
      il_target_script: ["package-descriptor:bcp47"],
    });
  });

  it("leaves writes untouched on all five — different address space", () => {
    // `writes` is IRPath[] over KeyboardIR and governs mutate() containment. An
    // identity question writing no IR is correct and always was; `outputs` is not a
    // replacement for it and adding a fake IRPath to satisfy this feature would break
    // containment semantics (spec 030 FR-007).
    for (const id of [
      "il_language_english",
      "il_language_autonym",
      "il_language_code",
      "il_language_region",
      "il_target_script",
    ]) {
      expect(questionRegistry[id]?.writes, `${id}.writes`).toEqual([]);
      expect(questionRegistry[id]?.mutate, `${id}.mutate`).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// (b) Promise integrity
// ---------------------------------------------------------------------------

describe("FR-016 (b) — a question that promises the author it ships, does", () => {
  it("declares a non-empty outputs or writes for every promise-phrase match", () => {
    const offenders: string[] = [];
    for (const [questionId, mod] of registryEntries) {
      const phrase = matchedPhrase(questionId);
      if (phrase === undefined) continue;
      if (questionId in PROMISE_CHECK_EXEMPT) continue;

      const declaresOutput = (mod.outputs ?? []).length > 0;
      const declaresWrite = (mod.writes ?? []).length > 0;
      if (declaresOutput || declaresWrite) continue;

      offenders.push(
        `"${questionId}" tells the author "${phrase}" but declares neither an ` +
          `output reach nor an IR write.\n` +
          `    PREFERRED: make the promise true — write the answer somewhere and ` +
          `declare it (outputs: [{ target, field }] for an emitted artifact, or ` +
          `writes: [...] for KeyboardIR).\n` +
          `    FALLBACK: change the text so it no longer promises something that ` +
          `does not happen.\n` +
          `    LAST RESORT: add "${questionId}" to PROMISE_CHECK_EXEMPT with a ` +
          `one-line justification for why this phrasing is not a promise.`,
      );
    }
    expect(
      offenders,
      "A question promises the author their answer reaches the finished keyboard " +
        "while nothing carries it there (spec 059 FR-018 / E-4).",
    ).toEqual([]);
  });

  // FR-018's canonical instance, pinned by id rather than left to the sweep: this is
  // the question whose help text was false, and it is the one the check exists to hold
  // true from here on.
  it("holds il_language_code's shipping promise true", () => {
    const prose = proseOf("il_language_code");
    expect(prose, "the promise this feature was written to make true").toContain(
      "on the finished keyboard",
    );
    expect(questionRegistry["il_language_code"]?.outputs ?? []).toEqual([
      { target: "package-descriptor", field: "bcp47" },
    ]);
  });

  it("ships the allowlist empty, and every entry justified", () => {
    // Asserted, not merely looped over: with the map empty the per-entry loop below
    // executes zero times, so without this line the test would pass unconditionally
    // and prove nothing. The count is the live fact; the loop guards a future entry.
    expect(
      Object.keys(PROMISE_CHECK_EXEMPT),
      "the allowlist ships empty — every phrase-matching question's promise is true",
    ).toEqual([]);

    for (const [questionId, justification] of Object.entries(PROMISE_CHECK_EXEMPT)) {
      expect(
        justification.trim().length,
        `PROMISE_CHECK_EXEMPT["${questionId}"] needs a one-line justification`,
      ).toBeGreaterThan(0);
      expect(questionRegistry[questionId], `unknown question "${questionId}" exempted`).toBeDefined();
    }
  });

  it("has a phrase list that actually matches something (the check is live)", () => {
    // A check whose detector matches nothing passes forever and proves nothing. At
    // least one shipped question must trip the phrase list — today `il_language_code`
    // does, and it declares its output reach, which is the state this enforces.
    const matched = registryEntries.filter(([id]) => matchedPhrase(id) !== undefined);
    expect(matched.map(([id]) => id)).toContain("il_language_code");
  });
});
