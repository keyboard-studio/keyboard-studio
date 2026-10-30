// runCriteriaChecks — the spec 084 criteria checks (Batch 1:
// §§1/2/7/8/9/12/13/15; Batch 2: cross-file reconciliation — 1.9, 7.4,
// 7.12, 7.14, 7.19, 8.13; Batch 3 wiring; the KPJ pair — 1.10b, 2.7),
// run as one gated group.
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
//   - 11.8 is NOT here either: like 11.2 it is a documentation check
//     and lives in runDocChecks (checks/docs/check-11-8-osk-image.ts);
//     its inputs (help-php text + bundled CSS texts) are DocLintInput.

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
import {
  checkIso6395Collective,
  checkNumericRegionContrastive,
  checkNumericRegionTag,
  checkRegion001,
} from "./checks/criteria/check-bcp47.js";
import { checkMandatedCurrencyChars } from "./checks/criteria/check-currency.js";
import { checkKpsFontMissing } from "./checks/criteria/check-kps-fonts.js";
import { checkBitmapPlaceholder } from "./checks/criteria/check-bitmap.js";
import { checkDuplicateSourceFiles } from "./checks/criteria/check-duplicate-files.js";
import {
  checkDisplayNameUnderscore,
  checkIdContainsKeyboard,
} from "./checks/criteria/check-identity.js";
import { checkKpsTargetsMatch } from "./checks/criteria/check-kps-targets.js";
import {
  checkKvksBlank,
  checkRaltMissingUsealtgr,
} from "./checks/criteria/check-kvks.js";
import { checkModifierNamesConsistent } from "./checks/criteria/check-modifiers.js";
import {
  checkIndustryFonts,
  checkWoffInPackage,
} from "./checks/criteria/check-package-fonts.js";
import {
  checkMathLatinLookalikes,
  checkPuaFontDisplayMap,
  checkPuaNotInExperimental,
  checkPuaPlacement,
  scanProducedRanges,
} from "./checks/criteria/check-produced-set.js";
import { checkRedundantTouchLayouts } from "./checks/criteria/check-touch-layouts.js";
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
import {
  checkKpjFormatOutdated,
  checkKpjVersionBumped,
} from "./checks/criteria/check-kpj.js";
import { checkFileInventory } from "./checks/criteria/check-file-inventory.js";
import { checkKpsListing } from "./checks/criteria/check-kps-listing.js";
import { checkKpsMetadata } from "./checks/criteria/check-kps-metadata.js";
import {
  checkTextContent,
  type TextContentFacts,
} from "./checks/criteria/check-text-content.js";
import { kmnPath } from "./checks/criteria/_shared.js";

/** Read a VFS entry's text content, or undefined when absent/binary. */
function readText(fs: VirtualFS, path: string): string | undefined {
  const content = fs.get(path)?.content;
  return typeof content === "string" ? content : undefined;
}

/** Find a VFS path by case-insensitive exact match, or undefined. */
function findPath(
  filePaths: readonly string[],
  wanted: string,
): string | undefined {
  const lower = wanted.toLowerCase();
  return filePaths.find((p) => p.toLowerCase() === lower);
}

/**
 * Resolve the Group A2 text-content twin inputs (Batch 4) from the judged
 * VFS: the doc texts, the help .php, and the primary BCP47 tag (from the
 * parsed .kmn IR, falling back to the .kps language list).
 */
function resolveTextFacts(
  fs: VirtualFS,
  filePaths: readonly string[],
  keyboardId: string,
  keyboardIR: KeyboardIR | undefined,
  input: CriteriaLintInput,
): TextContentFacts {
  const licensePath = findPath(filePaths, "LICENSE.md");
  const readmeMdPath = findPath(filePaths, "README.md");
  const readmeHtmPath = findPath(filePaths, "source/readme.htm");
  const welcomeHtmPath =
    findPath(filePaths, "source/welcome.htm") ??
    findPath(filePaths, "source/welcome/welcome.htm");
  const phpPath = filePaths.find((p) => p.toLowerCase().endsWith(".php"));
  const kmnFilePath = kmnPath(keyboardId);
  const primaryBcp47 =
    keyboardIR?.header.bcp47[0] ?? input.kpsLanguages[0] ?? undefined;
  return {
    keyboardId,
    ...(licensePath !== undefined
      ? { licenseMd: readText(fs, licensePath) } : {}),
    ...(readText(fs, kmnFilePath) !== undefined
      ? { kmn: readText(fs, kmnFilePath) } : {}),
    ...(input.kpsText !== undefined ? { kps: input.kpsText } : {}),
    ...(readmeMdPath !== undefined
      ? { readmeMd: readText(fs, readmeMdPath) } : {}),
    ...(readmeHtmPath !== undefined
      ? { readmeHtm: readText(fs, readmeHtmPath) } : {}),
    ...(welcomeHtmPath !== undefined
      ? { welcomeHtm: readText(fs, welcomeHtmPath) } : {}),
    ...(phpPath !== undefined
      ? { php: readText(fs, phpPath), phpPath } : {}),
    ...(primaryBcp47 !== undefined ? { primaryBcp47 } : {}),
  };
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
    findings.push(...checkStrayScratchFiles(filePaths));
  }

  // 1.9 — duplicate source files (same basename, identical content)
  // anywhere in the judged folder.
  findings.push(...checkDuplicateSourceFiles(fs));

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
  // 7.19 — phone vs tablet layouts identical (same parse).
  if (touchLayout !== undefined) {
    findings.push(
      ...checkTouchLayoutFontMismatch(touchLayout, touchLayoutPath(keyboardId)),
    );
    findings.push(
      ...checkRedundantTouchLayouts(touchLayout, touchLayoutPath(keyboardId)),
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

  // 1.10b / 2.7 — the KPJ pair: the root .kpj's <Options><Version>
  // against criterion 1.10's pinned current format (2.0). Runs only
  // when a .kpj is present; the absent case is the assembly's
  // contextMissing, not a finding.
  if (input.kpjPath !== undefined) {
    const kpjFacts = {
      ...(input.kpjText !== undefined ? { kpjText: input.kpjText } : {}),
      kpjPath: input.kpjPath,
    };
    findings.push(...checkKpjFormatOutdated(kpjFacts));
    findings.push(...checkKpjVersionBumped(kpjFacts));
  }

  // 1.7b / 1.8b / 1.11b / 1.12b / 3.1b / 6.1b / 6.3b — the file-inventory
  // twins: pure VFS path-list checks, no parsing. They run in both modes;
  // for a studio-built keyboard the scaffolder guarantees them, so the
  // twins double-verify rather than newly constrain.
  findings.push(...checkFileInventory(filePaths));

  // 8.1b–8.6b / 8.8b–8.11b — the .kps-listing twins: pure functions of the
  // .kps <File> names. An absent .kps never reaches here — the assembly
  // names it in contextMissing for all ten codes.
  // 10.1b / 10.2b / 10.7b / 10.8b / 10.9b — the .kps-metadata twins: pure
  // functions of the pre-parsed package-tab details. Same absent-.kps
  // gate via the assembly's contextMissing.
  if (kpsPath !== "") {
    findings.push(
      ...checkKpsListing({
        fileNames: input.kpsFileNames,
        hasTouchLayout,
        kpsPath,
      }),
    );
    const normNames = input.kpsFileNames.map((n) =>
      n.trim().replace(/\\/g, "/").toLowerCase(),
    );
    findings.push(
      ...checkKpsMetadata({
        kpsPath,
        fontSelected: input.kpsFontSelected,
        fontsInFiles: normNames.some(
          (n) => n.endsWith(".ttf") || n.endsWith(".otf"),
        ),
        languages: input.kpsLanguages,
        detailsReadme: input.kpsDetailsReadme,
        detailsWelcome: input.kpsDetailsWelcome,
        detailsLicense: input.kpsDetailsLicense,
        followKeyboardVersion: input.kpsFollowKeyboardVersion,
        description: input.kpsDescription,
      }),
    );
  }

  // 4.1b / 4.5b / 4.6b / 5.2b / 5.3b / 5.5b / 5.6b / 6.6b / 7.11b /
  // 11.1b / 11.3b / 11.4b — the text-content twins: pure functions of the
  // judged texts. Missing source files are the assembly's contextMissing
  // (except 11.1b, where the .php's existence is the criterion).
  findings.push(
    ...checkTextContent(resolveTextFacts(fs, filePaths, keyboardId, keyboardIR, input)),
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

    // 10.6 — any 3-digit M.49 region subtag across the same tag set.
    findings.push(
      ...checkNumericRegionTag(
        [...keyboardIR.header.bcp47, ...input.kpsLanguages],
        keyboardId,
      ),
    );

    // 12.2 — ISO 639-5 collective code as a tag's language subtag.
    findings.push(
      ...checkIso6395Collective(
        [...keyboardIR.header.bcp47, ...input.kpsLanguages],
        keyboardId,
      ),
    );

    // 12.3 — numeric region without the contrastive attestation.
    findings.push(
      ...checkNumericRegionContrastive(
        [...keyboardIR.header.bcp47, ...input.kpsLanguages],
        keyboardId,
        input.contrastiveRegionAttested,
      ),
    );

    // 8.7 — a font family the keyboard uses with no bundled font of
    // that family (bundled families extracted at assembly time).
    findings.push(
      ...checkKpsFontMissing({
        ...(input.kvks !== undefined ? { kvks: input.kvks } : {}),
        ...(touchLayout !== undefined ? { touchLayout } : {}),
        bundledFamilies: input.kpsFontFamilies,
        keyboardId,
      }),
    );

    // 18.7 — mandated currency characters for the tags' regions must
    // be producible (regions without CLDR data are named
    // context-missing by the assembly, never guessed here).
    findings.push(
      ...checkMandatedCurrencyChars(
        keyboardIR,
        [...keyboardIR.header.bcp47, ...input.kpsLanguages],
        keyboardId,
      ),
    );

    // 7.4 — modifier-name consistency across .kmn / .kvks / touch.
    findings.push(
      ...checkModifierNamesConsistent({
        ir: keyboardIR,
        ...(input.kvks !== undefined ? { kvks: input.kvks } : {}),
        ...(touchLayout !== undefined ? { touchLayout } : {}),
      }),
    );

    // 8.13 — .kmn targets vs .kps targets vs shipped compiled files.
    // Only when the .kps actually declares targets: parseKps defaults
    // an absent <Targets> to ["windows"], and the assembly passes []
    // for that case — an undeclared list is not a disagreement (the
    // assembly names it context-missing instead).
    if (input.kpsTargets.length > 0) {
      findings.push(
        ...checkKpsTargetsMatch({
          ir: keyboardIR,
          kpsTargets: input.kpsTargets,
          kpsFileNames: input.kpsFileNames,
          kpsPath,
        }),
      );
    }

    // 13.1 / 13.4 / 7.12 / 7.14 — one produced-set scan, all four checks.
    const ranges = scanProducedRanges(keyboardIR);
    findings.push(...checkPuaPlacement(keyboardIR, input.placement, ranges));
    findings.push(...checkMathLatinLookalikes(keyboardIR, ranges));
    findings.push(
      ...checkPuaNotInExperimental(keyboardIR, input.placement, ranges),
    );
    const hasBundledFont =
      input.kpsFontRefs.length > 0 ||
      filePaths.some((p) => /\.(ttf|otf)$/i.test(p));
    findings.push(
      ...checkPuaFontDisplayMap(keyboardIR, { hasBundledFont }, ranges),
    );
  }

  return findings;
}
