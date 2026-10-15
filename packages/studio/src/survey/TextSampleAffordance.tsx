// TextSampleAffordance — the text-sample fill affordance's surface (spec 050).
//
// Moved here from PhaseB.tsx (#1784): the bare-marks text-sample prompt
// reuses the same paste/upload/harvest surface, and PhaseB must not be
// imported by the prompt's module graph (CharactersStep <-> PhaseB cycle,
// depcruise no-circular — see CharactersStep.tsx's module comment).

import { useState, useRef, type ChangeEvent } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { useInventoryDraft } from "./useInventoryDraft.ts";
import { getCharacterDiscoveryService } from "../lib/services.ts";
import {
  BG_PAGE,
  BORDER,
  TEXT_DIM,
  TEXT_MAIN,
  FONT,
  ERROR_RED,
  mutedParaFlush,
  sectionHeading,
  primaryButton,
} from "./surveyStyles.ts";

// ---------------------------------------------------------------------------
// TextSampleAffordance — the third fill affordance's surface (spec 050)
//
// Paste a paragraph or upload a .txt file; either converges on the same
// harvestFromText() extraction, and each resulting character is proposed via
// addProposed(char, "text") (FR-004/FR-005/FR-006). No second extraction path,
// no store/engine change (research R1-R6) — this is a UI + adapter only.
//
// Unlike ExemplarApplyAffordance, this affordance never hides itself once
// used: a second paste/upload is a legitimate re-run, not a one-shot offer
// (research R6).
// ---------------------------------------------------------------------------

// harvestFromText's `base` parameter is unused by its implementation today
// (see CharacterDiscoveryServiceImpl.ts's TODO(#141-followup) — an ASCII
// proxy stands in for the real base-keyboard output-set lookup), so a
// minimal fixture stands in, mirroring the "exact values do not matter"
// fixture already used by the engine's own harvestFromText tests.
const TEXT_SAMPLE_BASE: StartKeyboard = {
  id: "basic_kbdus",
  path: "release/b/basic_kbdus",
  // ISO-15924 script code, not user-facing text; falls outside the rule's
  // ALL-CAPS/lowercase ignore patterns because it's Title-case.
  // eslint-disable-next-line lingui/no-unlocalized-strings
  script: "Latn",
  targets: ["windows"],
  displayName: "US English",
  version: "1.0",
};

export function TextSampleAffordance() {
  const { t } = useLingui();
  const addProposed = useInventoryDraft("characters").ops.addProposed;
  const [rawInput, setRawInput] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [emptyMessage, setEmptyMessage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Shared by both paste (submit) and upload (file selection) — the one
  // extraction call FR-004 requires. Deferred to submit/selection time, never
  // on keystroke, so a large paste cannot block first paint (Performance
  // Goals).
  async function extractAndPropose(sample: string): Promise<void> {
    setUploadError(null);
    if (sample.trim() === "") {
      setEmptyMessage(true);
      return;
    }
    setEmptyMessage(false);
    setIsExtracting(true);
    try {
      const service = await getCharacterDiscoveryService();
      const harvested = await service.harvestFromText(sample, TEXT_SAMPLE_BASE);
      for (const { char } of harvested) {
        addProposed(char, "text");
      }
    } catch {
      // getCharacterDiscoveryService() does a real dynamic import() in
      // production — a chunk-load/network failure must surface to the user,
      // not vanish as an unhandled rejection behind handleSubmit's `void`.
      setUploadError(
        t({
          id: "survey.phaseB.buildList.textSampleExtractError",
          message: "Something went wrong reading that text — try again.",
        }),
      );
    } finally {
      setIsExtracting(false);
    }
  }

  function handleSubmit(): void {
    void extractAndPropose(rawInput);
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    // Reset the input so the SAME file can be re-selected later (a browser
    // does not fire onChange for an unchanged file list otherwise).
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (file === undefined) return;
    setUploadError(null);
    let decoded: string;
    try {
      decoded = await file.text();
    } catch {
      // A genuine FileReader failure (test-setup.ts's Blob.text() polyfill's
      // reader.onerror path, or a native rejection) — surface it rather than
      // let handleFileChange's `void` caller swallow an unhandled rejection.
      setEmptyMessage(false);
      setUploadError(
        t({
          id: "survey.phaseB.buildList.textSampleUploadError",
          message: "This file could not be read as plain text — try pasting the text instead.",
        }),
      );
      return;
    }
    // File.text() does not throw on invalid UTF-8 — it substitutes U+FFFD
    // REPLACEMENT CHARACTER instead. Detecting that heuristic (research R4)
    // is the only signal available for "this file did not decode as text".
    if (decoded.includes("�")) {
      setEmptyMessage(false);
      setUploadError(
        t({
          id: "survey.phaseB.buildList.textSampleUploadError",
          message: "This file could not be read as plain text — try pasting the text instead.",
        }),
      );
      return;
    }
    await extractAndPropose(decoded);
  }

  return (
    <section
      data-testid="text-sample-placeholder"
      aria-label={t({
        id: "survey.phaseB.buildList.textSampleAriaLabel",
        message: "Let us find them in a sample",
      })}
    >
      <h3 style={sectionHeading}>
        <Trans id="survey.phaseB.buildList.textSampleHeading">Let us find them in a sample</Trans>
      </h3>
      <p style={mutedParaFlush}>
        <Trans id="survey.phaseB.buildList.textSampleHelp">
          Paste a paragraph of your language, or upload a plain-text (.txt)
          file — every distinct character in it will be proposed, alongside
          anything already in your alphabet.
        </Trans>
      </p>
      <textarea
        data-testid="text-sample-textarea"
        value={rawInput}
        onChange={(e) => setRawInput(e.target.value)}
        rows={5}
        placeholder={t({
          id: "survey.phaseB.buildList.textSampleTextareaPlaceholder",
          message: "Paste a paragraph of your language here…",
        })}
        aria-label={t({
          id: "survey.phaseB.buildList.textSampleTextareaAriaLabel",
          message: "Text sample",
        })}
        style={{
          width: "100%",
          background: BG_PAGE,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          color: TEXT_MAIN,
          fontSize: 15,
          fontFamily: FONT,
          padding: "8px 12px",
          boxSizing: "border-box",
          resize: "vertical",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          data-testid="text-sample-submit"
          disabled={isExtracting}
          onClick={handleSubmit}
          style={primaryButton(isExtracting)}
        >
          <Trans id="survey.phaseB.buildList.textSampleSubmitButton">Add these characters</Trans>
        </button>
        <label style={{ fontSize: 13, color: TEXT_DIM, display: "flex", alignItems: "center", gap: 6 }}>
          <Trans id="survey.phaseB.buildList.textSampleUploadLabel">or upload a .txt file</Trans>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            data-testid="text-sample-file-input"
            aria-label={t({
              id: "survey.phaseB.buildList.textSampleUploadAriaLabel",
              message: "Upload a text sample file",
            })}
            onChange={(e) => void handleFileChange(e)}
          />
        </label>
      </div>
      {emptyMessage && (
        <p data-testid="text-sample-empty-message" style={{ ...mutedParaFlush, marginTop: 8 }}>
          <Trans id="survey.phaseB.buildList.textSampleEmptyMessage">
            Nothing to add — paste or upload some text first.
          </Trans>
        </p>
      )}
      {uploadError !== null && (
        <p
          data-testid="text-sample-upload-error"
          role="alert"
          style={{ fontSize: 12, color: ERROR_RED, marginTop: 8 }}
        >
          {uploadError}
        </p>
      )}
    </section>
  );

}
