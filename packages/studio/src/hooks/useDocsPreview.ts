// useDocsPreview — spec 061 Story 2: a synchronous, pure derivation of the
// four shipped documentation files' rendered content from current store
// state.
//
// No `useEffect`, no timer — Constitution Article IV reserves the studio's
// one 300ms debounce cycle for the TS-check/WASM-oracle validation pair
// (decision D3); docs rendering has no async step to debounce, so it
// recomputes on every store change exactly like any other derived-state
// selector (research D-08). Renders through the SAME `helpDocsRender`
// functions `projectWorkingCopyForOutput` calls at output time, so the
// preview cannot visibly disagree with what a produced package would contain
// (FR-005/FR-010/SC-006).

import { useMemo } from "react";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import {
  renderReadmeMd,
  renderReadmeHtm,
  renderWelcomeHtm,
  renderHelpPhp,
  type HelpDocsRenderInput,
} from "@keyboard-studio/engine";
import { buildDocContent, parseTouchLayoutOrNull } from "../lib/docContent.ts";
import { buildReadmeFacts } from "../lib/readmeFacts.ts";
import { readmeFactsInputFrom } from "../lib/readmeFactsInput.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { resolveOutputKeyboardId } from "../lib/outputKeyboardId.ts";
import { applyCarveMutate } from "../steps/editorMutate.ts";
import { resolveDocMemberText, type AuthoredDocs } from "../lib/authoredDocs.ts";

export interface DocsPreview {
  readmeMd: string;
  readmeHtm: string;
  welcomeHtm: string;
  helpPhp: string;
  /** spec 102 FR-034: the generated typing guide was left out because the inherited docs already hold one. */
  typingGuideSuppressed: boolean;
}

export function useDocsPreview(): DocsPreview {
  const helpDocs = useWorkingCopyStore((s) => s.helpDocs);
  const identity = useWorkingCopyStore((s) => s.identity);
  const startKeyboard = useWorkingCopyStore((s) => s.startKeyboard);
  const startIr = useWorkingCopyStore((s) => s.startIr);
  // spec 102 FR-032: the start prose is inherited on an adaptation only. The
  // slices are session state another screen's artifact run can refill, so a
  // copy is guarded by its track, never by the slices being null.
  const startWelcomeHtmText = useWorkingCopyStore((s) =>
    s.instantiationMode === "adapt-existing" ? s.startWelcomeHtmText : null,
  );
  const startHelpPhpText = useWorkingCopyStore((s) =>
    s.instantiationMode === "adapt-existing" ? s.startHelpPhpText : null,
  );
  // spec 102 US2: the derived sections come from the working-copy IR as built.
  const workingIr = useWorkingCopyStore((s) => s.ir);
  const touchLayoutJson = useWorkingCopyStore((s) => s.touchLayoutJson);
  // Spec 110: an adaptation's README keeps only the inherited description; the
  // slice is null on Track 1 by construction, and the track guard keeps it so.
  const startReadmeMdText = useWorkingCopyStore((s) =>
    s.instantiationMode === "adapt-existing" ? s.startReadmeMdText : null,
  );
  // Spec 110: the README facts' other sources, read the way the output
  // projection reads them (readmeFactsInputFrom).
  const isAdaptation = useWorkingCopyStore((s) => s.instantiationMode === "adapt-existing");
  const startVfs = useWorkingCopyStore((s) => s.startVfs);
  const carveChars = useWorkingCopyStore((s) => s.carveChars);
  const deletedNodeIds = useWorkingCopyStore((s) => s.deletedNodeIds);
  const deletedItemIds = useWorkingCopyStore((s) => s.deletedItemIds);
  const fallbackPolicy = useWorkingCopyStore((s) => s.fallbackPolicy);
  const decisions = useDecisionStore((s) => s.decisions);
  // Issue #1908: the recorded documentation-fix proposals. Read under the
  // same adapt guard as the README inheritance — the copy track never
  // carries inherited prose, so its fixes can never engage there.
  const docFixProposals = useWorkingCopyStore((s) =>
    s.instantiationMode === "adapt-existing" ? s.docFixProposals : null,
  );
  // Documentation-step overrides (specs/html-editor): a touched member's
  // authored text replaces the rendered preview, so preview cannot disagree
  // with the produced package (spec 061 FR-005/FR-010).
  const authoredWelcomeHtm = useWorkingCopyStore((s) => s.authoredWelcomeHtm);
  const authoredReadmeHtm = useWorkingCopyStore((s) => s.authoredReadmeHtm);
  const authoredReadmeMd = useWorkingCopyStore((s) => s.authoredReadmeMd);
  const authoredHelpPhp = useWorkingCopyStore((s) => s.authoredHelpPhp);

  return useMemo(() => {
    const displayName = identity?.displayName ?? startKeyboard?.displayName ?? "";
    // The base IR's own header.targets — a synchronous approximation of the
    // final projected .kmn's store(&TARGETS) (which projectWorkingCopyForOutput
    // reads instead, after carve/identity/rename have run). Good enough for a
    // live preview; not claimed byte-identical to the eventual output list.
    const platforms = startIr?.header.targets.map((t) => t.toLowerCase()) ?? [];
    // Same input the output projection passes (serializeWorkingCopy step 5c):
    // the start prose is non-null on Track 2 only.
    // Removals are applied at projection, never to the store's working IR, so
    // the guide documents the carved IR — the same applyCarveMutate the
    // projection runs (as deriveDesktopModifications does for its preview).
    // The output path re-reads the projected .kmn itself; this synchronous
    // approximation omits projection-only steps such as touch-key rule
    // deletion, which can only remove more.
    const uncarvedIr = workingIr ?? startIr;
    const ir =
      uncarvedIr !== null && (deletedNodeIds.size > 0 || deletedItemIds.size > 0 || carveChars.size > 0)
        ? applyCarveMutate(uncarvedIr, deletedNodeIds, deletedItemIds, carveChars, {
            ...(fallbackPolicy !== undefined ? { fallbackPolicy } : {}),
          })
        : uncarvedIr;
    const docContent =
      ir !== null
        ? buildDocContent({
            ir,
            touchLayout: parseTouchLayoutOrNull(touchLayoutJson),
            inheritedProse: startWelcomeHtmText ?? startHelpPhpText,
          })
        : null;
    // Only ACCEPTED proposals become render fixes; a declined or unanswered
    // proposal leaves the inherited pages byte-identical (issue #1908).
    const inheritedFixes = {
      ...(docFixProposals?.pagename === "accepted" ? { pagename: true } : {}),
      ...(docFixProposals?.bodySync === "welcome" || docFixProposals?.bodySync === "help"
        ? { bodySync: docFixProposals.bodySync }
        : {}),
    };
    const input: HelpDocsRenderInput = {
      answers: helpDocs,
      displayName,
      ...(identity?.bcp47 !== undefined && identity.bcp47 !== "" ? { primaryBcp47: identity.bcp47 } : {}),
      ...(identity?.languageName !== undefined && identity.languageName !== ""
        ? { languageName: identity.languageName }
        : {}),
      ...(startKeyboard !== null ? { keyboardId: resolveOutputKeyboardId(identity, startKeyboard) } : {}),
      platforms,
      ...(docContent !== null ? { generated: docContent.slots } : {}),
      readme: buildReadmeFacts(
        readmeFactsInputFrom({
          ir,
          touchLayout: parseTouchLayoutOrNull(touchLayoutJson),
          decisions,
          isAdaptation,
          startKeyboard,
          ...(identity?.bcp47 !== undefined && identity.bcp47 !== "" ? { primaryBcp47: identity.bcp47 } : {}),
          ...(identity?.languageName !== undefined ? { languageName: identity.languageName } : {}),
          carveChars,
          fallbackPolicy,
          helpDocs,
          startVfs,
          startReadmeMdText,
        }),
      ),
      ...(Object.keys(inheritedFixes).length > 0 ? { inheritedFixes } : {}),
    };
    const authored: AuthoredDocs = {
      authoredWelcomeHtm,
      authoredReadmeHtm,
      authoredReadmeMd,
      authoredHelpPhp,
    };
    return {
      readmeMd: resolveDocMemberText("readme-md", renderReadmeMd(input), authored),
      readmeHtm: resolveDocMemberText("readme-htm", renderReadmeHtm(input), authored),
      welcomeHtm: resolveDocMemberText(
        "welcome-htm",
        renderWelcomeHtm(input, startWelcomeHtmText, [], startHelpPhpText),
        authored,
      ),
      helpPhp: resolveDocMemberText(
        "help-php",
        renderHelpPhp(input, startHelpPhpText, startWelcomeHtmText),
        authored,
      ),
      typingGuideSuppressed: docContent?.typingGuideSuppressed ?? false,
    };
  }, [helpDocs, identity, startKeyboard, startIr, workingIr, touchLayoutJson, startWelcomeHtmText, startHelpPhpText, startReadmeMdText, docFixProposals, isAdaptation, startVfs, carveChars, deletedNodeIds, deletedItemIds, fallbackPolicy, decisions, authoredWelcomeHtm, authoredReadmeHtm, authoredReadmeMd, authoredHelpPhp]);
}
