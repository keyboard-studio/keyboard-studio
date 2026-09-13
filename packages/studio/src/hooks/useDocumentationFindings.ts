// useDocumentationFindings — the Layer C documentation checks, run inside the
// existing render/validation cycle (spec 076 US7 / FR-019, research R7), with
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
import { bumpKeyboardVersion, renderHistoryMd } from "@keyboard-studio/engine";
import { runDocChecks } from "@keymanapp/keyboard-lint";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDocsPreview } from "./useDocsPreview.ts";
import { useDocMemberStates } from "./useDocMemberStates.ts";
import { collectDocLintInput, docMemberForPath } from "../lib/collectDocLintInput.ts";
import { resolveOutputKeyboardId } from "../lib/outputKeyboardId.ts";
import { findKmnPath } from "../lib/findKmnPath.ts";
import { findTouchLayoutPath } from "../lib/findTouchLayoutPath.ts";
import { readVfsText } from "../lib/vfsText.ts";

const EMPTY: LintFinding[] = [];

export function useDocumentationFindings(): LintFinding[] {
  const baseVfs = useWorkingCopyStore((s) => s.baseVfs);
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const baseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);
  const identity = useWorkingCopyStore((s) => s.identity);
  const instantiationMode = useWorkingCopyStore((s) => s.instantiationMode);
  const historyEntryState = useWorkingCopyStore((s) => s.historyEntryState);
  const baseHistoryMdText = useWorkingCopyStore((s) => s.baseHistoryMdText);
  const baseLicenseText = useWorkingCopyStore((s) => s.baseLicenseText);
  const touchLayoutJson = useWorkingCopyStore((s) => s.touchLayoutJson);
  const baselineDocFindings = useWorkingCopyStore((s) => s.baselineDocFindings);
  const docs = useDocsPreview();
  const memberStates = useDocMemberStates();

  return useMemo(() => {
    if (baseVfs === null || baseIr === null || baseKeyboard === null) return EMPTY;
    const isAdaptation = instantiationMode === "adapt-existing";
    const keyboardId = resolveOutputKeyboardId(identity, baseKeyboard);
    const rawVersion = baseIr.header.version?.trim() || "1.0";
    const keyboardVersion = isAdaptation ? bumpKeyboardVersion(rawVersion) : rawVersion;

    const kmnPath = findKmnPath(baseVfs);
    const kmnText = kmnPath ? (readVfsText(baseVfs, kmnPath) ?? null) : null;
    const kpsPath = baseVfs.list("source/").find((p) => p.toLowerCase().endsWith(".kps"));
    const kpsText = kpsPath !== undefined ? (readVfsText(baseVfs, kpsPath) ?? null) : null;
    const kvksText = readVfsText(baseVfs, `source/${baseKeyboard.id}.kvks`) ?? null;
    const touchPath = findTouchLayoutPath(baseVfs);
    const touchJson = touchLayoutJson ?? (touchPath ? (readVfsText(baseVfs, touchPath) ?? null) : null);
    const licenseText = readVfsText(baseVfs, "LICENSE.md") ?? baseLicenseText;

    const historyMd = renderHistoryMd(historyEntryState, {
      version: keyboardVersion,
      dateIso: new Date().toISOString().slice(0, 10),
      adaptedFrom: isAdaptation ? { id: baseKeyboard.id, version: rawVersion } : null,
      baseHistoryText: isAdaptation ? (baseHistoryMdText ?? readVfsText(baseVfs, "HISTORY.md") ?? null) : null,
    });

    const members: Partial<Record<DocMemberId, string>> = {
      "readme-md": docs.readmeMd,
      "readme-htm": docs.readmeHtm,
      "welcome-htm": docs.welcomeHtm,
      "help-php": docs.helpPhp,
      "history-md": historyMd,
      ...(licenseText !== null ? { "license-md": licenseText } : {}),
    };

    const findings = runDocChecks(
      collectDocLintInput({
        keyboardId,
        displayName: identity?.displayName ?? baseKeyboard.displayName,
        keyboardVersion,
        kmnText,
        kpsText,
        kvksText,
        touchLayoutJson: touchJson,
        members,
        ...(isAdaptation ? { baseHistoryMdText } : {}),
      }),
    );
    if (findings.length === 0) return EMPTY;

    const tierOf = new Map(memberStates.map((s) => [s.member, s.tier]));
    const baselineCodes = new Set(
      (baselineDocFindings ?? []).map((b) => `${docMemberForPath(b.location?.file, baseKeyboard.id) ?? ""}:${b.code}`),
    );
    return findings.map((f) => {
      const member = docMemberForPath(f.location?.file, keyboardId);
      if (member === undefined || tierOf.get(member) !== "inherited") return f;
      return baselineCodes.has(`${member}:${f.code}`) ? { ...f, origin: "upstream" as const } : f;
    });
  }, [
    baseVfs,
    baseIr,
    baseKeyboard,
    identity,
    instantiationMode,
    historyEntryState,
    baseHistoryMdText,
    baseLicenseText,
    touchLayoutJson,
    baselineDocFindings,
    docs,
    memberStates,
  ]);
}
