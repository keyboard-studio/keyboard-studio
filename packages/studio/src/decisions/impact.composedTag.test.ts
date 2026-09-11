// The trail's counterfactual for the COMPOSED `bcp47` field, through the REAL
// projection (spec 059 FR-010, SC-005).
//
// WHY THIS IS A SEPARATE FILE FROM impact.test.ts
//
// That file drives `project` with a hand-built VFS — correct there, because what
// it pins is the precedence table. It cannot pin THIS, because the defect guarded
// here lived in the VALUE handed to the projection, not in the diffing: the
// resolver substituted ONE identity answer as the WHOLE `bcp47` overlay, so the
// script row reported `und` -> `Latn` and the language row `und` -> `ewo` — tags
// no projection ever writes. A double that renders the descriptor from the
// override cannot tell those apart from the real thing, which is the same trap
// FR-017 names for the descriptor tests. So the working-copy store is real,
// `projectWorkingCopyForOutput` is real, and the assertions read the descriptor
// a download would actually carry.
//
// LANGTAGS IS LOADED HERE ON PURPOSE
//
// The suppress-script elision in `buildTargetBcp47` only fires on a resolved
// module, and Ewondo is exactly the case the composed tag has to get right:
// Latin is Ewondo's default script, so the script answer must report NO change,
// while an Arabic Ewondo keyboard must report the real `ewo` -> `ewo-Arab`.

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { createVirtualFS, makeBaseKeyboard } from "@keyboard-studio/contracts";
import type {
  BaseKeyboard,
  DecisionEntry,
  DecisionImpact,
  DecisionRecord,
  SurveyAnswer,
} from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { projectWorkingCopyForOutput } from "../lib/serializeWorkingCopy.ts";
import { loadLangtags } from "../lib/langtagsDefaults.ts";
import { extractIdentityLite } from "../survey/IdentityLite.tsx";
import { resolveImpactAsync, type ResolveImpactAsyncDeps } from "./impact.ts";

// ---------------------------------------------------------------------------
// Fixture — a base whose descriptor declares SOMEONE ELSE's language
// ---------------------------------------------------------------------------

const BASE_ID = "test_base";

const KMN = [
  "store(&NAME) 'Test Base'",
  "store(&KEYBOARDVERSION) '1.0'",
  "store(&TARGETS) 'any'",
  "",
  "begin Unicode > use(main)",
  "",
  "group(main) using keys",
  "",
  "+ [K_A] > 'a'",
  "",
].join("\n");

const KPS = [
  '<?xml version="1.0" encoding="utf-8"?>',
  "<Package>",
  '  <Info>\n    <Name URL="">Test Base</Name>\n  </Info>',
  "  <Keyboards>",
  "    <Keyboard>",
  "      <Name>Test Base</Name>",
  `      <ID>${BASE_ID}</ID>`,
  "      <Version>1.0</Version>",
  "      <Languages>",
  '        <Language ID="en">en</Language>',
  "      </Languages>",
  "    </Keyboard>",
  "  </Keyboards>",
  "</Package>",
  "",
].join("\n");

const BASE: BaseKeyboard = makeBaseKeyboard({
  id: BASE_ID,
  path: `release/t/${BASE_ID}`,
  script: "Latn",
  targets: ["windows", "web"],
  displayName: "Test Base",
  version: "1.0",
});

/** The identity answers, as the identity-lite series records them. */
function answers(languageCode: string, targetScript: string): SurveyAnswer[] {
  return [
    { questionId: "il_language_autonym", answerType: "text", value: "Ewondo" },
    { questionId: "il_language_english", answerType: "text", value: "Ewondo" },
    { questionId: "il_language_code", answerType: "text", value: languageCode },
    { questionId: "il_target_script", answerType: "select", value: targetScript },
  ];
}

/**
 * Instantiate the working copy and apply the identity the SHIPPED composer
 * derives from those answers — never a hand-written tag. If the elision were to
 * regress, this seeding is the first thing that would carry `ewo-Latn`.
 */
function seedSession(languageCode: string, targetScript: string): string {
  const vfs = createVirtualFS([
    { path: `source/${BASE_ID}.kmn`, content: KMN, isBinary: false },
    { path: `source/${BASE_ID}.kps`, content: KPS, isBinary: false },
  ]);
  const { ir } = parseKmn(KMN, `${BASE_ID}.kmn`);
  useWorkingCopyStore.getState().instantiateFromBase(BASE, { vfs, ir });
  const identity = extractIdentityLite({ phase: "A", answers: answers(languageCode, targetScript) });
  useWorkingCopyStore.getState().setIdentity({
    displayName: identity.english,
    languageName: identity.english,
    bcp47: identity.bcp47,
  });
  return identity.bcp47;
}

// ---------------------------------------------------------------------------
// The record and the resolver's deps
// ---------------------------------------------------------------------------

function answerEntry(entryId: string, questionId: string, value: string): DecisionEntry {
  return {
    entryId,
    stepId: "identity",
    payload: {
      kind: "survey-answer",
      questionId,
      answerType: questionId === "il_target_script" ? "select" : "text",
      value,
    },
    provenance: { agency: "hand-set" },
    recordedAt: 1,
    supersedes: null,
  };
}

function recordOf(entries: DecisionEntry[]): DecisionRecord {
  return { keyboardId: BASE_ID, entries } as DecisionRecord;
}

/** The resolver wired the way StudioShell wires it: the projection is the real one. */
function asyncDeps(record: DecisionRecord): ResolveImpactAsyncDeps {
  return {
    getWorkingIR: () => useWorkingCopyStore.getState().baseIr,
    isDesktopLocked: () => false,
    isTouchLocked: () => false,
    hasWorkingCopy: () => useWorkingCopyStore.getState().baseIr !== null,
    getRecord: () => record,
    project: (opts) => projectWorkingCopyForOutput(opts),
  };
}

// ---------------------------------------------------------------------------
// Reading an impact
// ---------------------------------------------------------------------------

/** Every line the impact ADDS, across every file it names, as one string. */
function addedText(impact: DecisionImpact | null): string {
  if (impact === null || impact.state !== "captured") return "";
  return impact.files
    .flatMap((f) => f.hunks.flatMap((h) => h.lines))
    .filter((l) => l.startsWith("+"))
    .join("\n");
}

/** Every line the impact REMOVES, across every file it names, as one string. */
function removedText(impact: DecisionImpact | null): string {
  if (impact === null || impact.state !== "captured") return "";
  return impact.files
    .flatMap((f) => f.hunks.flatMap((h) => h.lines))
    .filter((l) => l.startsWith("-"))
    .join("\n");
}

beforeAll(async () => {
  // The real slim index, not a double: the elision is a claim about langtags data
  // ("Latn" is Ewondo's default script), so a fixture could make it true by fiat.
  await loadLangtags();
});

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
});

afterEach(() => {
  useWorkingCopyStore.getState().reset();
});

// ---------------------------------------------------------------------------
// The default script changes nothing — the row Matt reported
// ---------------------------------------------------------------------------

describe("script answer whose script IS the language's default", () => {
  it("reports no change, and names no `Latn` anywhere", async () => {
    seedSession("ewo", "Latn");
    const code = answerEntry("d-code", "il_language_code", "ewo");
    const script = answerEntry("d-script", "il_target_script", "Latn");

    const impact = await resolveImpactAsync(script, asyncDeps(recordOf([code, script])));

    // Not an empty capture and not "unavailable": the decision genuinely changed
    // nothing about the declared language, and the trail says so in words.
    expect(impact).toEqual({ state: "none" });
    expect(addedText(impact)).not.toContain("Latn");
    expect(removedText(impact)).not.toContain("Latn");
  });

  it("declares `ewo` in the shipped descriptor, never `ewo-Latn`", async () => {
    const bcp47 = seedSession("ewo", "Latn");
    // The composer's own output first — this is the value the artifact is built
    // from, and the tag Matt's .kps must carry.
    expect(bcp47).toBe("ewo");

    const projected = await projectWorkingCopyForOutput();
    expect(projected).not.toBeNull();
    const kps = projected!.vfs.get(`source/${BASE_ID}.kps`)?.content as string;
    expect(kps).toContain('<Language ID="ewo">');
    expect(kps).not.toContain("ewo-Latn");
    // And the base's own language is gone, so this is not passing by inertia.
    expect(kps).not.toContain('<Language ID="en">');
  });
});

// ---------------------------------------------------------------------------
// A non-default script is a real change, and is reported as one
// ---------------------------------------------------------------------------

describe("script answer whose script is NOT the language's default", () => {
  it("reports the composed `ewo` -> `ewo-Arab`, not `und` -> `Arab`", async () => {
    seedSession("ewo", "Arab");
    const code = answerEntry("d-code", "il_language_code", "ewo");
    const script = answerEntry("d-script", "il_target_script", "Arab");

    const impact = await resolveImpactAsync(script, asyncDeps(recordOf([code, script])));

    expect(impact).not.toBeNull();
    expect(impact!.state).toBe("captured");
    if (impact!.state !== "captured") return;
    // The alternative side is the tag WITHOUT this answer — `ewo`, composed from
    // the live sibling — not the `und` a deleted overlay field falls back to.
    expect(removedText(impact)).toContain('<Language ID="ewo">');
    expect(removedText(impact)).not.toContain("und");
    expect(addedText(impact)).toContain('<Language ID="ewo-Arab">');
    // Jointly attributed: the language code composes the same tag.
    expect(impact!.sharedWith).toEqual(["d-code"]);
  });
});

// ---------------------------------------------------------------------------
// The language row reports the composed tag, not its own raw answer
// ---------------------------------------------------------------------------

describe("language-code answer with a script answer also present", () => {
  it("reports the tag the artifact carries, not the bare subtag", async () => {
    seedSession("ewo", "Arab");
    const code = answerEntry("d-code", "il_language_code", "ewo");
    const script = answerEntry("d-script", "il_target_script", "Arab");

    const impact = await resolveImpactAsync(code, asyncDeps(recordOf([code, script])));

    expect(impact).not.toBeNull();
    expect(impact!.state).toBe("captured");
    // Was `und` -> `ewo`: the raw answer substituted as the whole tag, which the
    // shipped descriptor never declares while the script answer stands.
    expect(addedText(impact)).toContain('<Language ID="ewo-Arab">');
    expect(addedText(impact)).not.toContain('<Language ID="ewo">');
    if (impact!.state !== "captured") return;
    expect(impact!.sharedWith).toEqual(["d-script"]);
  });

  it("still reports the whole tag when the script is the default one", async () => {
    seedSession("ewo", "Latn");
    const code = answerEntry("d-code", "il_language_code", "ewo");
    const script = answerEntry("d-script", "il_target_script", "Latn");

    const impact = await resolveImpactAsync(code, asyncDeps(recordOf([code, script])));

    // Without a language there is no tag at all, so this one IS the change —
    // and the tag it produces is the canonical `ewo`, never `ewo-Latn`.
    expect(impact!.state).toBe("captured");
    expect(addedText(impact)).toContain('<Language ID="ewo">');
    expect(addedText(impact)).not.toContain("ewo-Latn");
  });
});

// ---------------------------------------------------------------------------
// Every other overlay field is unchanged: a whole value, substituted
// ---------------------------------------------------------------------------

describe("a whole-value overlay field", () => {
  it("still varies by substituting the recorded answer", async () => {
    seedSession("ewo", "Latn");
    // il_language_english declares `field: "languageName"` — one answer IS the
    // whole value, so it must keep taking the raw answer verbatim.
    const english = answerEntry("d-english", "il_language_english", "Ewondo");

    const impact = await resolveImpactAsync(english, asyncDeps(recordOf([english])));

    expect(impact).not.toBeNull();
    expect(impact!.state).toBe("captured");
    expect(addedText(impact)).toContain("Ewondo");
  });
});
