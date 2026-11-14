// Spec 115 T072: the `language-glottocode` decision (the Glottolog code of a
// language with no ISO 639-3 code, FR-045) is declared by il_language_english and
// survives a snapshot round trip.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useDecisionStore, getDecisionSnapshot } from "../stores/decisionStore.ts";
import { captureRevisionSnapshot, restoreRevisionSnapshot } from "../lib/draftPersistence.ts";
import { questionRegistry } from "../survey/questions/registry.ts";
import { decisionIRPaths } from "./decisionTypes.ts";

describe("language-glottocode decision", () => {
  beforeEach(() => {
    localStorage.clear();
    useDecisionStore.getState().reset();
  });
  afterEach(() => {
    localStorage.clear();
    useDecisionStore.getState().reset();
  });

  it("is provided by il_language_english, written by its renderer, and maps to no IR path", () => {
    const english = questionRegistry["il_language_english"]!;
    expect(english.provides).toContain("language-glottocode");
    expect(english.rendererWrites).toContain("language-glottocode");
    expect(decisionIRPaths["language-glottocode"]).toEqual([]);
  });

  it("persists through a revision snapshot round trip (JSON, as stored)", () => {
    useDecisionStore.getState().record({
      id: "language-glottocode",
      value: "mans1260",
      provenance: "derived",
      source: "il_language_english",
    });
    const stored = JSON.stringify(captureRevisionSnapshot());
    useDecisionStore.getState().reset();
    expect(getDecisionSnapshot()["language-glottocode"]).toBeUndefined();

    restoreRevisionSnapshot(JSON.parse(stored));
    expect(getDecisionSnapshot()["language-glottocode"]).toMatchObject({
      value: "mans1260",
      provenance: "derived",
      source: "il_language_english",
    });
  });
});
