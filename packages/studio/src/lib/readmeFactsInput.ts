// The store-reading half of the README facts (spec 110): the recorded
// decisions and working-copy fields buildReadmeFacts needs, gathered in one
// place so the output projection and the live docs preview pass identical
// input (FR-012).

import type { FallbackPolicy, HelpDocsAnswers, KeyboardIR, MarkInputOrder, OutputForm, TouchLayoutIR, VirtualFS } from "@keyboard-studio/contracts";
import { extractReadmeDescription, parseKpsPackageDetails } from "@keyboard-studio/engine";
import type { DecisionId, DecisionSet } from "../decisions/decisionTypes.ts";
import { getLayoutFamilyAnswer } from "./layoutFamily.ts";
import type { ReadmeFactsInput } from "./readmeFacts.ts";
import { readVfsText } from "./vfsText.ts";

export interface ReadmeFactsSources {
  ir: KeyboardIR | null;
  touchLayout: TouchLayoutIR | null;
  decisions: DecisionSet;
  isAdaptation: boolean;
  startKeyboard: { id: string; displayName: string; script: string } | null;
  /** The keyboard's primary tag and the author-confirmed English language name. */
  primaryBcp47?: string;
  languageName?: string;
  /** The recorded S4 whole-keyboard output-form answer (`session.marksOutputForm`). */
  outputForm?: OutputForm;
  carveChars: ReadonlySet<string>;
  fallbackPolicy: FallbackPolicy;
  helpDocs: HelpDocsAnswers | null;
  /** Track 2 description sources: the starting point's VFS (its `.kps`) and its own README. */
  startVfs: VirtualFS | null;
  startReadmeMdText: string | null;
}

function decisionString(decisions: DecisionSet, id: DecisionId): string | undefined {
  const value = decisions[id]?.value;
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * The recorded `mark-input-order` decision, narrowed to the two valid
 * answers. Undefined when the question was never answered (or the stored
 * value is not a valid answer) — callers fall back to the produced-set
 * sniff instead of inventing an order.
 */
export function markInputOrderFromDecisions(decisions: DecisionSet): MarkInputOrder | undefined {
  const value = decisionString(decisions, "mark-input-order");
  return value === "prefix" || value === "postfix" ? value : undefined;
}

/** Track 2: the starting point's own description — its `.kps` first, then its README. */
function inheritedDescription(sources: ReadmeFactsSources): string | undefined {
  if (!sources.isAdaptation) return undefined;
  const kpsPath = sources.startKeyboard !== null ? `source/${sources.startKeyboard.id}.kps` : undefined;
  const kps = sources.startVfs !== null && kpsPath !== undefined ? readVfsText(sources.startVfs, kpsPath) : undefined;
  const fromKps = kps !== undefined ? parseKpsPackageDetails(kps).description.trim() : "";
  if (fromKps !== "") return fromKps;
  return sources.startReadmeMdText !== null ? extractReadmeDescription(sources.startReadmeMdText) : undefined;
}

export function readmeFactsInputFrom(sources: ReadmeFactsSources): ReadmeFactsInput {
  const { decisions } = sources;
  const tag = sources.primaryBcp47?.trim();
  const name = sources.languageName?.trim();
  const autonym = decisionString(decisions, "language-autonym");
  const useCase = decisionString(decisions, "use-case");
  const markInputOrder = decisionString(decisions, "mark-input-order");
  const touchSeedSource = decisionString(decisions, "touch-seed-source");
  const layoutFamily = getLayoutFamilyAnswer();
  const designRationale = sources.helpDocs?.designRationale;
  const fallbackDescription = inheritedDescription(sources);
  return {
    ir: sources.ir,
    touchLayout: sources.touchLayout,
    // The README names a language only when the author confirmed its name.
    languages:
      tag !== undefined && tag !== "" && name !== undefined && name !== ""
        ? [{ tag, name, ...(autonym !== undefined ? { autonym } : {}) }]
        : [],
    ...(sources.startKeyboard !== null ? { script: sources.startKeyboard.script } : {}),
    isAdaptation: sources.isAdaptation,
    startKeyboard:
      sources.startKeyboard !== null
        ? { displayName: sources.startKeyboard.displayName }
        : null,
    ...(layoutFamily !== undefined ? { layoutFamily } : {}),
    ...(useCase !== undefined ? { useCase } : {}),
    ...(markInputOrder !== undefined ? { markInputOrder } : {}),
    ...(sources.outputForm !== undefined ? { outputForm: sources.outputForm } : {}),
    fallbackPolicy: sources.fallbackPolicy,
    ...(touchSeedSource !== undefined ? { touchSeedSource } : {}),
    carveChars: sources.carveChars,
    ...(designRationale !== undefined ? { designRationale } : {}),
    ...(fallbackDescription !== undefined ? { fallbackDescription } : {}),
  };
}
