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
  checkVersionBumpRequired,
  checkVersionNotIncremented,
  checkSpuriousVersionBump,
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
import {
  checkAttribution,
  checkRepoContext,
} from "./checks/criteria/check-repo-context.js";
import { kmnPath, type CheckResult } from "./checks/criteria/_shared.js";

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
 * 8.6b input: whether the welcome page references an image. Omitted when
 * the welcome page cannot be read (the check then keeps requiring graphics).
 */
function welcomeImageFact(
  fs: VirtualFS,
  filePaths: readonly string[],
): { welcomeHasImages?: boolean } {
  const path =
    findPath(filePaths, "source/welcome.htm") ??
    findPath(filePaths, "source/welcome/welcome.htm");
  const text = path === undefined ? undefined : readText(fs, path);
  return text === undefined ? {} : { welcomeHasImages: /<img/i.test(text) };
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
  // Helper: read a text file, returning undefined when absent/unreadable.
  // The spread below only includes defined values, satisfying
  // exactOptionalPropertyTypes (a present property must be `string`, not
  // `string | undefined`).
  const textAt = (path: string | undefined): string | undefined =>
    path === undefined ? undefined : readText(fs, path);

  const licenseMd = textAt(findPath(filePaths, "LICENSE.md"));
  const kmn = textAt(kmnPath(keyboardId));
  const readmeMd = textAt(findPath(filePaths, "README.md"));
  const readmeHtm = textAt(findPath(filePaths, "source/readme.htm"));
  const welcomePath =
    findPath(filePaths, "source/welcome.htm") ??
    findPath(filePaths, "source/welcome/welcome.htm");
  const welcomeHtm = textAt(welcomePath);
  const phpPath = filePaths.find((p) => p.toLowerCase().endsWith(".php"));
  const php = textAt(phpPath);
  const primaryBcp47 =
    keyboardIR?.header.bcp47[0] ?? input.kpsLanguages[0] ?? undefined;
  return {
    keyboardId,
    ...(licenseMd !== undefined ? { licenseMd } : {}),
    ...(kmn !== undefined ? { kmn } : {}),
    ...(input.kpsText !== undefined ? { kps: input.kpsText } : {}),
    ...(readmeMd !== undefined ? { readmeMd } : {}),
    ...(readmeHtm !== undefined ? { readmeHtm } : {}),
    ...(welcomeHtm !== undefined && welcomePath !== undefined
      ? { welcomeHtm, welcomePath }
      : {}),
    ...(php !== undefined && phpPath !== undefined ? { php, phpPath } : {}),
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
): {
  findings: LintFinding[];
  verifiedByCode: Map<string, string[]>;
} {
  const findings: LintFinding[] = [];
  const verifiedByCode = new Map<string, string[]>();
  /**
   * Fold one check result (or an aggregate's merged { findings,
   * verifiedByCode }) into the run.
   */
  const collect = (
    r:
      | CheckResult
      | {
          findings: LintFinding[];
          verifiedByCode: Map<string, string[]>;
        },
  ) => {
    findings.push(...r.findings);
    if ("code" in r) {
      if (r.verified.length > 0) verifiedByCode.set(r.code, r.verified);
    } else {
      for (const [code, lines] of r.verifiedByCode) {
        verifiedByCode.set(code, lines);
      }
    }
  };
  const filePaths = fs.list();
  const kpsPath = filePaths.find((p) => p.toLowerCase().endsWith(".kps")) ?? "";
  const touchLayout = parseTouchLayout(fs, keyboardId);
  const hasTouchLayout =
    touchLayout !== undefined || keyboardIR?.touchLayout !== undefined;

  // 1.13 foreign arm — authored mode precertifies this and never scans.
  if (input.scratchScan) {
    collect(checkStrayScratchFiles(filePaths));
  }

  // 1.9 — duplicate source files (same basename, identical content)
  // anywhere in the judged folder.
  collect(checkDuplicateSourceFiles(fs));

  // 7.10 — raw .kmn text scan; runs even when the IR failed to parse.
  const kmnText = readText(fs, kmnPath(keyboardId));
  if (kmnText !== undefined) {
    collect(checkStoreSyntax(kmnText, kmnPath(keyboardId)));
  }

  // 7.16 — a present .kvks that parses to nothing (the absent case is
  // the assembly's contextMissing, not a finding).
  if (input.kvksPath !== undefined) {
    collect(checkKvksBlank(input.kvks, input.kvksPath));
  }

  // 7.20 — phone vs tablet font, from this package's touch-layout parse.
  // 7.19 — phone vs tablet layouts identical (same parse).
  if (touchLayout !== undefined) {
    collect(checkTouchLayoutFontMismatch(touchLayout, touchLayoutPath(keyboardId)));
    collect(checkRedundantTouchLayouts(touchLayout, touchLayoutPath(keyboardId)));
  }

  // 8.12 / 9.6 — package font scans over .kps facts + the VFS inventory.
  collect(
    checkIndustryFonts({
      kpsFileNames: input.kpsFileNames,
      kpsFontRefs: input.kpsFontRefs,
      kpsPath,
    }),
  );
  collect(checkWoffInPackage(filePaths, input.kpsFileNames, kpsPath));

  // 15.3 — the judged keyboard's own .kps Related packages linkage
  // (gated inside the check on deprecationInPlay).
  collect(
    checkDeprecatedKpsLinkage(
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
    collect(checkKpjFormatOutdated(kpjFacts));
    collect(checkKpjVersionBumped(kpjFacts));
  }

  // 1.7b / 1.8b / 1.11b / 1.12b / 3.1b / 6.1b / 6.3b — the file-inventory
  // twins: pure VFS path-list checks, no parsing. They run in both modes;
  // for a studio-built keyboard the scaffolder guarantees them, so the
  // twins double-verify rather than newly constrain.
  collect(checkFileInventory(filePaths));

  // 8.1b–8.6b / 8.8b–8.11b — the .kps-listing twins: pure functions of the
  // .kps <File> names. An absent .kps never reaches here — the assembly
  // names it in contextMissing for all ten codes.
  // 10.1b / 10.2b / 10.7b / 10.8b / 10.9b — the .kps-metadata twins: pure
  // functions of the pre-parsed package-tab details. Same absent-.kps
  // gate via the assembly's contextMissing.
  if (kpsPath !== "") {
    collect(
      checkKpsListing({
        fileNames: input.kpsFileNames,
        hasTouchLayout,
        kpsPath,
        ...welcomeImageFact(fs, filePaths),
      }),
    );
    const normNames = input.kpsFileNames.map((n) =>
      n.trim().replace(/\\/g, "/").toLowerCase(),
    );
    collect(
      checkKpsMetadata({
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
  collect(
    checkTextContent(
      resolveTextFacts(fs, filePaths, keyboardId, keyboardIR, input),
    ),
  );

  // 1.2b / 1.3b / 1.4b / 19.1b / 19.2b + Group C — the /review-only
  // repo-context checks: pure functions of the ReviewContext. Absent on
  // the authored and Compare surfaces (those never see the repo); the
  // assembly names the missing context for the four repo codes.
  if (input.reviewContext !== undefined) {
    const repoFacts = { keyboardId, review: input.reviewContext };
    collect(checkRepoContext(repoFacts));
    collect(checkAttribution(repoFacts));
  }

  if (keyboardIR !== undefined) {
    // §§2/1/7 identity, version, targets — IR header facts.
    collect(checkVersionFormat(keyboardIR));
    collect(checkVersionLeadingZero(keyboardIR));
    collect(checkVersionVPrefix(keyboardIR));
    // 2.1/2.2/2.6 — foreign-only: the PR against its base commit. The
    // authored host judges these from instantiation state (assembly
    // verdicts); the resolver defers to these checks in foreign mode.
    collect(
      checkVersionNotIncremented(keyboardIR, input.reviewContext, input.kpsFileNames),
    );
    collect(
      checkVersionBumpRequired(keyboardIR, input.reviewContext, input.kpsFileNames),
    );
    collect(
      checkSpuriousVersionBump(keyboardIR, input.reviewContext, input.kpsFileNames),
    );
    collect(checkIdContainsKeyboard(keyboardIR, input.kpsDisplayName));
    collect(
      checkDisplayNameUnderscore(keyboardIR, input.kpsDisplayName),
    );
    collect(checkTargetsAnyAlone(keyboardIR));
    collect(
      checkTargetsMobileWithoutTouch(keyboardIR, hasTouchLayout),
    );

    // 7.5 — RALT chords vs the .kvks usealtgr flag.
    collect(
      checkRaltMissingUsealtgr(keyboardIR, input.kvks, input.kvksPath),
    );

    // 7.9 — &BITMAP reference vs placeholder / package inventory.
    collect(checkBitmapPlaceholder(keyboardIR, filePaths));

    // 12.4 — region 001 across IR tags + the .kps language list.
    collect(
      checkRegion001(
        [...keyboardIR.header.bcp47, ...input.kpsLanguages],
        keyboardId,
      ),
    );

    // 10.6 — any 3-digit M.49 region subtag across the same tag set.
    collect(
      checkNumericRegionTag(
        [...keyboardIR.header.bcp47, ...input.kpsLanguages],
        keyboardId,
      ),
    );

    // 12.2 — ISO 639-5 collective code as a tag's language subtag.
    collect(
      checkIso6395Collective(
        [...keyboardIR.header.bcp47, ...input.kpsLanguages],
        keyboardId,
      ),
    );

    // 12.3 — numeric region without the contrastive attestation.
    collect(
      checkNumericRegionContrastive(
        [...keyboardIR.header.bcp47, ...input.kpsLanguages],
        keyboardId,
        input.contrastiveRegionAttested,
      ),
    );

    // 8.7 — a font family the keyboard uses with no bundled font of
    // that family (bundled families extracted at assembly time).
    collect(
      checkKpsFontMissing({
        ...(input.kvks !== undefined ? { kvks: input.kvks } : {}),
        ...(touchLayout !== undefined ? { touchLayout } : {}),
        bundledFamilies: input.kpsFontFamilies,
        keyboardId,
      }),
    );

    // 18.7 — mandated currency characters for the tags' regions must
    // be producible (regions without CLDR data are named
    // context-missing by the assembly, never guessed here).
    collect(
      checkMandatedCurrencyChars(
        keyboardIR,
        [...keyboardIR.header.bcp47, ...input.kpsLanguages],
        keyboardId,
      ),
    );

    // 7.4 — modifier-name consistency across .kmn / .kvks / touch.
    collect(
      checkModifierNamesConsistent({
        ir: keyboardIR,
        ...(input.kvks !== undefined ? { kvks: input.kvks } : {}),
        ...(touchLayout !== undefined ? { touchLayout } : {}),
      }),
    );

    // 8.13 — .kmn targets vs .kps targets vs shipped compiled files.
    // Runs whenever the .kmn IR exists. An undeclared <Targets> list
    // reaches the check as [] (parseKps defaults it to ["windows"], the
    // assembly passes []), and the check then skips only the
    // declared-set comparison — an undeclared list is not a disagreement.
    collect(
      checkKpsTargetsMatch({
        ir: keyboardIR,
        kpsTargets: input.kpsTargets,
        kpsFileNames: input.kpsFileNames,
        kpsPath,
      }),
    );

    // 13.1 / 13.4 / 7.12 / 7.14 — one produced-set scan, all four checks.
    const ranges = scanProducedRanges(keyboardIR);
    collect(checkPuaPlacement(keyboardIR, input.placement, ranges));
    collect(checkMathLatinLookalikes(keyboardIR, ranges));
    collect(checkPuaNotInExperimental(keyboardIR, input.placement, ranges));
    const hasBundledFont =
      input.kpsFontRefs.length > 0 ||
      filePaths.some((p) => /\.(ttf|otf)$/i.test(p));
    collect(checkPuaFontDisplayMap(keyboardIR, { hasBundledFont }, ranges));
  }

  return { findings, verifiedByCode };
}
