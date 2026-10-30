// TextSampleAffordance — the text-sample fill affordance's surface (spec 050).
//
// Moved here from PhaseB.tsx (#1784): the bare-marks text-sample prompt
// reuses the same paste/upload/harvest surface, and PhaseB must not be
// imported by the prompt's module graph (CharactersStep <-> PhaseB cycle,
// depcruise no-circular — see CharactersStep.tsx's module comment).
//
// #2063 (spec 050 FR-005/FR-006/FR-007): the harvest now goes through spec
// 044's propose-then-confirm contract. Submitting text builds a
// `SourcedInventory` with a `"text"` source (instead of adding characters
// directly); the proposal is shown with per-character attribution and only
// enters the draft when the author confirms, via `seedFromProposal` — the
// same path as the exemplar offer, so the two union with per-source
// attribution and sticky rejection.

import { useState, useRef, type ChangeEvent } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { SourcedInventory } from "@keyboard-studio/engine";
import { useInventoryDraft } from "./useInventoryDraft.ts";
import { confirmTextSample, proposeTextSampleInventory } from "./marksTextSample.ts";
import { codepointLabel } from "./codepointLabel.ts";
import { collateInventory } from "./collation.ts";
import { displayChar } from "../lib/irToCarveNodes.ts";
import { useGlyphFontStack } from "./useGlyphFontStack.ts";
import { CpLabel } from "./CpLabel.tsx";
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
  secondaryButton,
  charChip,
  chipGlyph,
} from "./surveyStyles.ts";

// ---------------------------------------------------------------------------
// TextSampleAffordance — the third fill affordance's surface (spec 050)
//
// Paste a paragraph or upload a .txt file; either converges on the same
// harvestFromText() extraction (FR-004), and the result is proposed through
// 044's contract (FR-005/FR-006/FR-007): a visible proposal with per-character
// "text" attribution, confirmed via seedFromProposal, unioned with any
// exemplar proposal. No second extraction path, no store/engine change —
// this is a UI + adapter task.
//
// Unlike ExemplarApplyAffordance, this affordance never hides itself once
// used: a second paste/upload is a legitimate re-run, not a one-shot offer.
// ---------------------------------------------------------------------------

// The harvest, the proposal it builds and the confirm live in
// marksTextSample.ts (spec 107 FR-040), shared with the headless author.

export function TextSampleAffordance() {
  const { t } = useLingui();
  const glyphFontStack = useGlyphFontStack();
  const seedFromProposal = useInventoryDraft("characters").ops.seedFromProposal;
  const [rawInput, setRawInput] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [emptyMessage, setEmptyMessage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // The harvested proposal awaiting the author's confirm (FR-005). Null
  // means no proposal is pending — nothing has been recorded.
  const [proposal, setProposal] = useState<SourcedInventory | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Shared by both paste (submit) and upload (file selection) — the one
  // extraction call FR-004 requires. Deferred to submit/selection time, never
  // on keystroke, so a large paste cannot block first paint (Performance
  // Goals). Builds the proposal; the draft is untouched until confirm.
  async function extractAndPropose(sample: string): Promise<void> {
    setUploadError(null);
    setProposal(null);
    if (sample.trim() === "") {
      setEmptyMessage(true);
      return;
    }
    setEmptyMessage(false);
    setIsExtracting(true);
    try {
      const outcome = await proposeTextSampleInventory(sample);
      if (outcome.status === "proposal") setProposal(outcome.proposal);
      else if (outcome.status === "empty") setEmptyMessage(true);
      // getCharacterDiscoveryService() does a real dynamic import() in
      // production — a chunk-load/network failure must surface to the user,
      // not vanish as an unhandled rejection behind handleSubmit's `void`.
      else
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

  function handleConfirm(): void {
    if (proposal === null) return;
    // 044's contract: union into the draft with per-character "text"
    // attribution, respecting sticky rejection (FR-005/FR-006/FR-007).
    confirmTextSample(proposal, seedFromProposal);
    setProposal(null);
    setRawInput("");
  }

  function handleCancel(): void {
    setProposal(null);
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
    // REPLACEMENT CHARACTER instead. Detecting that heuristic is the only
    // signal available for "this file did not decode as text".
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

  const proposalChars = proposal !== null ? collateInventory(proposal.characters.map((c) => c.char)) : [];

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
      {proposal === null ? (
        <>
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
              <Trans id="survey.phaseB.buildList.textSampleSubmitButton">Preview these characters</Trans>
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
        </>
      ) : (
        <div data-testid="text-sample-proposal" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM }}>
            <Trans id="survey.phaseB.buildList.textSampleProposalAttribution">
              from your text sample
            </Trans>{" "}
            <Trans id="survey.phaseB.buildList.textSampleProposalCount">
              {{ n: proposalChars.length }} characters
            </Trans>
          </p>
          <div
            data-testid="text-sample-proposal-preview"
            style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
          >
            {proposalChars.map((c) => {
              const { title } = codepointLabel(c);
              return (
                <span
                  key={c}
                  title={title}
                  aria-label={`${displayChar(c)} (${title})`}
                  style={{ ...charChip(false), cursor: "default" }}
                >
                  <span style={chipGlyph(true, glyphFontStack)}>{displayChar(c)}</span>
                  <CpLabel grapheme={c} />
                </span>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              data-testid="text-sample-confirm"
              onClick={handleConfirm}
              className="ks-focus-ring ks-hit-target"
              style={primaryButton(false)}
            >
              <Trans id="survey.phaseB.buildList.textSampleConfirmButton">
                Add these to my alphabet
              </Trans>
            </button>
            <button
              type="button"
              data-testid="text-sample-cancel"
              onClick={handleCancel}
              className="ks-focus-ring ks-hit-target"
              style={secondaryButton}
            >
              <Trans id="survey.phaseB.buildList.textSampleCancelButton">Cancel</Trans>
            </button>
          </div>
        </div>
      )}
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
