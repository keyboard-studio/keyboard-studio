// marksTextSample — the text-sample prompt's rules as plain functions, so the
// UI and a headless caller (spec 107's scripted author) take the same path.
//
// Two halves, mirroring what the author sees:
//
//   PROMPT   `proposeTextSample(alphabet)` decides whether the prompt opens and
//            with what (the marks lacking pairing evidence, and whether a text
//            sample was already harvested). `textSampleSkipAnswer` /
//            `isTextSamplePromptDismissed` are the "continue without" record
//            and its read-back, keyed by alphabet content so a changed
//            alphabet re-arms the prompt.
//
//   HARVEST  `proposeTextSampleInventory(sample)` runs the one extraction
//            (CharacterDiscoveryService.harvestFromText) and builds the
//            "text"-attributed proposal; `confirmTextSample(proposal, seed)`
//            hands it to the inventory draft's `seedFromProposal`.
//
// Headless flow: `proposeTextSample(alphabet)` -> when non-null,
// `proposeTextSampleInventory(case.sampleText)` -> on "proposal",
// `confirmTextSample(proposal, ops.seedFromProposal)` -> re-run
// `proposeTextSample` on the new alphabet; null means the prompt is satisfied.
// When there is no sample, record `textSampleSkipAnswer(alphabet)` instead.

import type {
  ConfirmedAlphabet,
  InventoryChar,
  StartKeyboard,
} from "@keyboard-studio/contracts";
import { confirmedAlphabetKey } from "@keyboard-studio/contracts";
import { marksLackingPairingEvidence, type SourcedInventory } from "@keyboard-studio/engine";
import { getCharacterDiscoveryService } from "../lib/services.ts";
import { displayChar } from "../lib/irToCarveNodes.ts";
import type { SavedAnswer } from "../steps/answerTypes.ts";

/** The survey-answer id recording a prompt dismissal (characters step). */
export const TEXT_SAMPLE_PROMPT_ANSWER_ID = "characters.textSamplePrompt";

/** What the prompt is opened with. */
export interface TextSampleProposal {
  /** Marks with zero attested bases, first-appearance order. */
  lackingMarks: string[];
  /** A text sample was already harvested but still doesn't cover the marks. */
  hadTextSample: boolean;
}

/**
 * The prompt's content for this alphabet, or null when every mark already has
 * pairing evidence (no prompt). Does not consider a prior dismissal; pair it
 * with {@link isTextSamplePromptDismissed}.
 */
export function proposeTextSample(alphabet: ConfirmedAlphabet): TextSampleProposal | null {
  const lackingMarks = marksLackingPairingEvidence(alphabet);
  if (lackingMarks.length === 0) return null;
  return {
    lackingMarks,
    hadTextSample: alphabet.attestedStacks.some((s) => s.source === "text"),
  };
}

/** The lacking marks as the prompt shows them: dotted-circle carriers, space-joined. */
export function textSampleMarksLabel(lackingMarks: readonly string[]): string {
  return lackingMarks.map((m) => displayChar(m)).join(" ");
}

/** The answer a "continue without a text sample" records, for the characters step. */
export function textSampleSkipAnswer(
  alphabet: ConfirmedAlphabet,
): { answerId: string; answer: Omit<SavedAnswer, "savedAt"> } {
  const key = confirmedAlphabetKey(alphabet);
  return {
    answerId: TEXT_SAMPLE_PROMPT_ANSWER_ID,
    answer: {
      value: `skipped:${key}`,
      answerType: "select",
      origin: "confirmed",
      stage: "confirmed",
      evidenceKey: key,
      screenId: "text-sample-prompt",
    },
  };
}

/** True when the saved prompt answer is a dismissal for exactly this alphabet. */
export function isTextSamplePromptDismissed(
  saved: Pick<SavedAnswer, "value"> | undefined,
  alphabet: ConfirmedAlphabet,
): boolean {
  return saved?.value === `skipped:${confirmedAlphabetKey(alphabet)}`;
}

// harvestFromText's `base` parameter is unused by its implementation today (an
// ASCII proxy stands in for the real base-keyboard output-set lookup), so a
// minimal fixture stands in.
const TEXT_SAMPLE_BASE: StartKeyboard = {
  id: "basic_kbdus",
  path: "release/b/basic_kbdus",
  // ISO-15924 script code, not user-facing text.
  script: "Latn",
  targets: ["windows"],
  displayName: "US English",
  version: "1.0",
};

/**
 * Build a `SourcedInventory` from a text harvest: the author's own corpus as a
 * first-class proposal source. Confidence is "approved" — the author
 * demonstrably uses these characters, the strongest attestation available.
 */
export function buildTextSampleInventory(harvested: readonly InventoryChar[]): SourcedInventory {
  return {
    resolvedTag: "text-sample",
    source: "text",
    confidence: "approved",
    characters: harvested.map(({ char }) => ({
      char,
      tier: "main" as const,
      source: "text" as const,
      confidence: "approved" as const,
    })),
    digraphs: [],
  };
}

/** The outcome of proposing from a sample. */
export type TextSampleOutcome =
  | { status: "proposal"; proposal: SourcedInventory }
  | { status: "empty" }
  | { status: "error" };

/**
 * Run the one extraction over `sample` and build the proposal. A blank sample
 * or a harvest with no characters is "empty"; a failure to load or run the
 * discovery service is "error" (the UI shows its retry message). The draft is
 * untouched until {@link confirmTextSample}.
 */
export async function proposeTextSampleInventory(sample: string): Promise<TextSampleOutcome> {
  if (sample.trim() === "") return { status: "empty" };
  try {
    const service = await getCharacterDiscoveryService();
    const harvested = await service.harvestFromText(sample, TEXT_SAMPLE_BASE);
    if (harvested.length === 0) return { status: "empty" };
    return { status: "proposal", proposal: buildTextSampleInventory(harvested) };
  } catch {
    return { status: "error" };
  }
}

/**
 * Confirm a proposal: union it into the draft with per-character "text"
 * attribution, respecting sticky rejection (`seedFromProposal`'s contract).
 */
export function confirmTextSample(
  proposal: SourcedInventory,
  seedFromProposal: (proposal: SourcedInventory) => void,
): void {
  seedFromProposal(proposal);
}
