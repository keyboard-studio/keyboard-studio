// runCriteriaChecks — the spec 084 Batch 1 criteria checks (§§1/2/7/8/
// 9/12/13/15), run as one gated group.
//
// Gating shape matches every other optional LintContext input: the
// checks run only when the caller assembled a CriteriaLintInput (the
// studio's criteria assembly does, for both the authored page and the
// Compare panel). The locked phase-gate lint() path never sets it, so
// no other surface's findings change.
//
// Placement decisions (spec 084 triage + Batch 1):
//   - IR/VFS scans live here because their inputs are contracts-level:
//     the parsed KeyboardIR (LintContext.keyboardIR), the VFS itself,
//     and this package's own touch-layout parser.
//   - The .kvks / .kps facts arrive pre-parsed in CriteriaLintInput:
//     parseKvks / parseKps* live in the engine, which this package must
//     not import — the studio assembly runs them (assembleLintContext).
//   - 11.2 is NOT here: it is a documentation check and lives in
//     runDocChecks (checks/docs/check-11-2-osk-layers.ts).
//   - 1.1 is NOT here: in authored mode it is precertified by
//     generation, and a foreign folder snapshot cannot settle it, so no
//     lint check emits KM_LINT_FILES_OUTSIDE_FOLDER anywhere.
//   - 7.6 / 7.21 are NOT here: they map the host's compile result in
//     the criteria resolver, not a lint finding.

import type {
  CriteriaLintInput,
  KeyboardIR,
  LintFinding,
  VirtualFS,
} from "@keyboard-studio/contracts";
import {
  parseTouchLayout,
  touchLayoutPath,
} from "./parsers/parseTouchLayout.js";
import { checkRegion001 } from "./checks/criteria/check-bcp47.js";
import { checkBitmapPlaceholder } from "./checks/criteria/check-bitmap.js";
import {
  checkDisplayNameUnderscore,
  checkIdContainsKeyboard,
} from "./checks/criteria/check-identity.js";
import {
  checkKvksBlank,
  checkRaltMissingUsealtgr,
} from "./checks/criteria/check-kvks.js";
import {
  checkIndustryFonts,
  checkWoffInPackage,
} from "./checks/criteria/check-package-fonts.js";
import {
  checkMathLatinLookalikes,
  checkPuaPlacement,
  scanProducedRanges,
} from "./checks/criteria/check-produced-set.js";
import { checkStrayScratchFiles } from "./checks/criteria/check-scratch-files.js";
import { checkStoreSyntax } from "./checks/criteria/check-store-syntax.js";
import {
  checkTargetsAnyAlone,
  checkTargetsMobileWithoutTouch,
} from "./checks/criteria/check-targets.js";
import { checkTouchLayoutFontMismatch } from "./checks/criteria/check-touch-font.js";
import {
  checkVersionFormat,
  checkVersionLeadingZero,
  checkVersionVPrefix,
} from "./checks/criteria/check-version.js";
import { checkDeprecatedKpsLinkage } from "./checks/criteria/check-deprecated-kps.js";
import { kmnPath } from "./checks/criteria/_shared.js";

/** Read a VFS entry's text content, or undefined when absent/binary. */
function readText(fs: VirtualFS, path: string): string | undefined {
  const content = fs.get(path)?.content;
  return typeof content === "string" ? content : undefined;
}

/**
 * Run the Batch 1 criteria checks over one judged keyboard.
 *
 * @param fs - The judged keyboard's VFS (output bundle or foreign folder).
 * @param keyboardId - The judged keyboard's ID.
 * @param keyboardIR - The parsed .kmn IR, when it parsed (the IR-driven
 *   checks are skipped without one — the criteria assembly names the
 *   missing IR in contextMissing so those rows resolve Not yet
 *   checkable, never a silent pass).
 * @param input - The assembly-supplied .kvks/.kps facts and mode flags.
 */
export function runCriteriaChecks(
  fs: VirtualFS,
  keyboardId: string,
  keyboardIR: KeyboardIR | undefined,
  input: CriteriaLintInput,
): LintFinding[] {
  const findings: LintFinding[] = [];
  const filePaths = fs.list();
  const kpsPath = filePaths.find((p) => p.toLowerCase().endsWith(".kps")) ?? "";
  const touchLayout = parseTouchLayout(fs, keyboardId);
  const hasTouchLayout =
    touchLayout !== undefined || keyboardIR?.touchLayout !== undefined;

  // 1.13 foreign arm — authored mode precertifies this and never scans.
  if (input.scratchScan) {
    findings.push(...checkStrayScratchFiles(filePaths, keyboardId));
  }

  // 7.10 — raw .kmn text scan; runs even when the IR failed to parse.
  const kmnText = readText(fs, kmnPath(keyboardId));
  if (kmnText !== undefined) {
    findings.push(...checkStoreSyntax(kmnText, kmnPath(keyboardId)));
  }

  // 7.16 — a present .kvks that parses to nothing (the absent case is
  // the assembly's contextMissing, not a finding).
  if (input.kvksPath !== undefined) {
    findings.push(...checkKvksBlank(input.kvks, input.kvksPath));
  }

  // 7.20 — phone vs tablet font, from this package's touch-layout parse.
  if (touchLayout !== undefined) {
    findings.push(
      ...checkTouchLayoutFontMismatch(touchLayout, touchLayoutPath(keyboardId)),
    );
  }

  // 8.12 / 9.6 — package font scans over .kps facts + the VFS inventory.
  const touchFonts = (touchLayout?.platforms ?? [])
    .map((p) => p.font)
    .filter((f): f is string => f !== undefined);
  findings.push(
    ...checkIndustryFonts({
      kpsFileNames: input.kpsFileNames,
      kpsFontRefs: input.kpsFontRefs,
      ...(input.kvks?.fontFamily !== undefined
        ? { kvksFontFamily: input.kvks.fontFamily }
        : {}),
      touchFonts,
      kpsPath,
    }),
  );
  findings.push(...checkWoffInPackage(filePaths, input.kpsFileNames, kpsPath));

  // 15.3 — the judged keyboard's own .kps Related packages linkage
  // (gated inside the check on deprecationInPlay).
  findings.push(
    ...checkDeprecatedKpsLinkage(
      input.kpsText,
      input.deprecationInPlay,
      kpsPath,
    ),
  );

  if (keyboardIR !== undefined) {
    // §§2/1/7 identity, version, targets — IR header facts.
    findings.push(...checkVersionFormat(keyboardIR));
    findings.push(...checkVersionLeadingZero(keyboardIR));
    findings.push(...checkVersionVPrefix(keyboardIR));
    findings.push(...checkIdContainsKeyboard(keyboardIR, input.kpsDisplayName));
    findings.push(
      ...checkDisplayNameUnderscore(keyboardIR, input.kpsDisplayName),
    );
    findings.push(...checkTargetsAnyAlone(keyboardIR));
    findings.push(
      ...checkTargetsMobileWithoutTouch(keyboardIR, hasTouchLayout),
    );

    // 7.5 — RALT chords vs the .kvks usealtgr flag.
    findings.push(
      ...checkRaltMissingUsealtgr(keyboardIR, input.kvks, input.kvksPath),
    );

    // 7.9 — &BITMAP reference vs placeholder / package inventory.
    findings.push(...checkBitmapPlaceholder(keyboardIR, filePaths));

    // 12.4 — region 001 across IR tags + the .kps language list.
    findings.push(
      ...checkRegion001(
        [...keyboardIR.header.bcp47, ...input.kpsLanguages],
        keyboardId,
      ),
    );

    // 13.1 / 13.4 — one produced-set scan, both range checks.
    const ranges = scanProducedRanges(keyboardIR);
    findings.push(...checkPuaPlacement(keyboardIR, input.placement, ranges));
    findings.push(...checkMathLatinLookalikes(keyboardIR, ranges));
  }

  return findings;
}
