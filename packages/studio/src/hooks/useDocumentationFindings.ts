// useDocumentationFindings — the Layer C documentation checks, run inside the
// existing render/validation cycle (spec 080 US7 / FR-019, research R7), with
// the FR-020 upstream classification applied (research R8).
//
// A `useMemo` over the same store slices the docs preview consumes — the
// `useTouchKeyDiagnostics` precedent (hooks/useValidatorFindings.ts): a pure
// synchronous compute, NO new timer, NO second debounce, NO store write.
// Constitution Article IV / decision D3 reserve the studio's one 300 ms cycle
// for the TS-check / WASM-oracle pair; these checks have no async step, so
// they recompute when their inputs change, within whichever render that
// cycle already schedules. StudioShell concatenates the result into the one
// findings array it already renders and publishes.
//
// Upstream classification (FR-020): a finding is `origin: "upstream"` iff the
// same code appeared in the base's own baseline for that member
// (`baselineDocFindings`, computed once at instantiation) AND the member's
// tier from `useDocMemberStates` is still `inherited` — the author has not
// touched it. Both facts come from their single sources of truth; nothing
// here re-derives tier logic (FR-022).
//
// Never blocks (FR-018): every finding is warning-severity by the Layer C
// ceiling, and warnings never enter `canDownload`, `submitEnabled`, or the
// completeness blocking predicate.

import { useMemo } from "react";
import type { DocMemberId, LintFinding } from "@keyboard-studio/contracts";
import { renderHistoryMd, resolvePublishVersion } from "@keyboard-studio/engine";
import { runDocChecks } from "@keymanapp/keyboard-lint";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useHasTestBuilds } from "../stores/testingStore.ts";
import { useDocsPreview } from "./useDocsPreview.ts";
import { useDocMemberStates } from "./useDocMemberStates.ts";
import { collectDocLintInput, docMemberForPath } from "../lib/collectDocLintInput.ts";
import { resolveOutputKeyboardId } from "../lib/outputKeyboardId.ts";
import { findKmnPath } from "../lib/findKmnPath.ts";
import { findTouchLayoutPath } from "../lib/findTouchLayoutPath.ts";
import { readVfsText } from "../lib/vfsText.ts";

const EMPTY: LintFinding[] = [];

export function useDocumentationFindings(): LintFinding[] {
  const startVfs = useWorkingCopyStore((s) => s.startVfs);
  const startIr = useWorkingCopyStore((s) => s.startIr);
  const startKeyboard = useWorkingCopyStore((s) => s.startKeyboard);
  const identity = useWorkingCopyStore((s) => s.identity);
  const instantiationMode = useWorkingCopyStore((s) => s.instantiationMode);
  const historyEntryState = useWorkingCopyStore((s) => s.historyEntryState);
  const startHistoryMdText = useWorkingCopyStore((s) => s.startHistoryMdText);
  const startDocCssTexts = useWorkingCopyStore((s) => s.startDocCssTexts);
  const startLicenseText = useWorkingCopyStore((s) => s.startLicenseText);
  const touchLayoutJson = useWorkingCopyStore((s) => s.touchLayoutJson);
  const baselineDocFindings = useWorkingCopyStore((s) => s.baselineDocFindings);
  // Issue #1908: the recorded documentation-fix proposals (adapt track only).
  const docFixProposals = useWorkingCopyStore((s) =>
    s.instantiationMode === "adapt-existing" ? s.docFixProposals : null,
  );
  const docs = useDocsPreview();
  const memberStates = useDocMemberStates();
  // spec 094: a tested three-part adapt base publishes at a.(b+1).0.
  const testBuildsExist = useHasTestBuilds();

  return useMemo(() => {
    if (startVfs === null || startIr === null || startKeyboard === null) return EMPTY;
    const isAdaptation = instantiationMode === "adapt-existing";
    const keyboardId = resolveOutputKeyboardId(identity, startKeyboard);
    const rawVersion = startIr.header.version?.trim() || "1.0";
    const keyboardVersion = resolvePublishVersion({
      mode: isAdaptation ? "adapt-existing" : "new-from-base",
      rawVersion,
      hasTestBuilds: testBuildsExist,
    });

    const kmnPath = findKmnPath(startVfs);
    const kmnText = kmnPath ? (readVfsText(startVfs, kmnPath) ?? null) : null;
    const kpsPath = startVfs.list("source/").find((p) => p.toLowerCase().endsWith(".kps"));
    const kpsText = kpsPath !== undefined ? (readVfsText(startVfs, kpsPath) ?? null) : null;
    const kvksText = readVfsText(startVfs, `source/${startKeyboard.id}.kvks`) ?? null;
    const touchPath = findTouchLayoutPath(startVfs);
    const touchJson = touchLayoutJson ?? (touchPath ? (readVfsText(startVfs, touchPath) ?? null) : null);
    const licenseText = readVfsText(startVfs, "LICENSE.md") ?? startLicenseText;

    const historyMd = renderHistoryMd(historyEntryState, {
      version: keyboardVersion,
      dateIso: new Date().toISOString().slice(0, 10),
      lineage: { kind: isAdaptation ? "adapted" : "created", id: startKeyboard.id, version: rawVersion },
      startHistoryText: isAdaptation ? (startHistoryMdText ?? readVfsText(startVfs, "HISTORY.md") ?? null) : null,
    });

    const members: Partial<Record<DocMemberId, string>> = {
      "readme-md": docs.readmeMd,
      "readme-htm": docs.readmeHtm,
      "welcome-htm": docs.welcomeHtm,
      "help-php": docs.helpPhp,
      "history-md": historyMd,
      ...(licenseText !== null ? { "license-md": licenseText } : {}),
    };

    // Criterion 11.8: the base package's bundled stylesheets (image
    // width constraints may live in their class rules). The VFS carries
    // the KMW stylesheet; the welcome/help pages' own stylesheets
    // (kb.css) are fetch-don't-write and ride the startDocCssTexts slice
    // (issue 2139) — without them, class-constrained help images are
    // false positives.
    const cssTexts = [
      ...startVfs
        .list("source/")
        .filter((p) => p.toLowerCase().endsWith(".css"))
        .map((p) => readVfsText(startVfs, p))
        .filter((t): t is string => t !== undefined),
      ...(startDocCssTexts ?? []).map((entry) => entry.text),
    ];
    // Issue 1908: an ACCEPTED image-width proposal amends the shipped
    // kb.css (serializeWorkingCopy step 5c), so the check sees the same
    // stylesheet the output will carry — the finding clears here exactly
    // when it clears in the shipped package. Only when a kb.css is
    // actually in the working copy: resident in the VFS, or carried by
    // the startDocCssTexts slice (the loader's fetch-don't-write path,
    // issue 2139) at a kb.css path.
    if (
      isAdaptation &&
      docFixProposals?.imageWidth === "accepted" &&
      (startVfs.list("source/").some((p) => /^source\/(?:help|welcome)\/kb\.css$/i.test(p)) ||
        (startDocCssTexts ?? []).some((entry) => /^source\/(?:help|welcome)\/kb\.css$/i.test(entry.path)))
    ) {
      cssTexts.push("img { max-width: 100%; }");
    }

    const findings = runDocChecks(
      collectDocLintInput({
        keyboardId,
        displayName: identity?.displayName ?? startKeyboard.displayName,
        keyboardVersion,
        kmnText,
        kpsText,
        kvksText,
        touchLayoutJson: touchJson,
        members,
        cssTexts,
        ...(isAdaptation ? { startHistoryMdText } : {}),
      }),
    ).findings;
    if (findings.length === 0) return EMPTY;

    const tierOf = new Map(memberStates.map((s) => [s.member, s.tier]));
    const baselineCodes = new Set(
      (baselineDocFindings ?? []).map((b) => `${docMemberForPath(b.location?.file, startKeyboard.id) ?? ""}:${b.code}`),
    );
    return findings.map((f) => {
      const member = docMemberForPath(f.location?.file, keyboardId);
      if (member === undefined || tierOf.get(member) !== "inherited") return f;
      return baselineCodes.has(`${member}:${f.code}`) ? { ...f, origin: "upstream" as const } : f;
    });
  }, [
    startVfs,
    startIr,
    startKeyboard,
    identity,
    instantiationMode,
    historyEntryState,
    startHistoryMdText,
    startDocCssTexts,
    startLicenseText,
    touchLayoutJson,
    baselineDocFindings,
    docFixProposals,
    docs,
    memberStates,
    testBuildsExist,
  ]);
}
