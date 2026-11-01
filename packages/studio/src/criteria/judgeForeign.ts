// judgeForeign — the foreign-mode criteria assembly as a pure-ish,
// React-free module.
//
// Moved verbatim out of hooks/useCompareCriteria.ts so the SAME assembly
// can run inside a Web Worker (the /review Health Check judges untrusted
// PR snapshots; the battery must not be able to hang the page's main
// thread). useCompareCriteria re-exports these symbols, so the Compare tab
// and its verification tests keep importing from the hook module.
//
// Assembly: doc findings from runDocChecks(collectDocLintInputFromVfs(...))
// over the real shipped files, merged doc-first (mergeLintFindings) with
// the engine findings from KeyboardLintEngine.lintWithContext over
// assembleLintContext's context — NO inventory (a foreign keyboard has
// no linguist inventory in the studio, so §18.6 resolves Not yet
// checkable via contextMissing, never Met), the empty record (no
// attestations or confirmations exist for a keyboard the author does
// not own), and foreign mode. No authoring store is imported here
// (FR-023).
//
// FACTS (plan D7, conservative): fontBundled is read from the VFS with
// the same extension test as deriveCriteriaFacts, plus fonts the .kps
// lists from outside the keyboard folder (the shared fonts directory,
// which a /review VFS does not hold). `deprecated` (and the
// deprecationInPlay lint flag) follow a named predicate, see
// isDeprecationInPlay: `legacy/` placement, a DEPRECATED.md under the
// keyboard folder, or a .kps RelatedPackage Relationship="deprecates".
// Partner-organization status has no signal in a snapshot, so the §16
// rows stay applicable: an absent signal is not a Not applicable verdict
// (spec 084 D7).

import { ALL_CRITERIA } from "@keyboard-studio/contracts";
import type {
  CompileResult,
  CriteriaPlacement,
  LintFinding,
  ReviewContext,
  VirtualFS,
} from "@keyboard-studio/contracts";
import { outputScriptProfile } from "@keyboard-studio/engine";
import {
  KeyboardLintEngine,
  deprecatedRelatedPackageIds,
  runDocChecks,
} from "@keymanapp/keyboard-lint";

import {
  assembleLintContext,
  sharedFontRefsMissingFromVfs,
} from "./assembleLintContext.ts";
import { deriveCriteriaFacts } from "./deriveCriteriaFacts.ts";
import { licenseTextHints } from "./fontLicense.ts";
import { resolveCriteria } from "./resolveCriteria.ts";
import {
  EMPTY_CRITERIA_RECORD,
  type CriteriaResult,
} from "./criteriaTypes.ts";
import { collectDocLintInputFromVfs } from "../lib/collectDocLintInputFromVfs.ts";
import { readVfsText } from "../lib/vfsText.ts";
import { mergeLintFindings } from "./mergeFindings.ts";
import {
  buildReviewerSource,
  type LangtagsLookup,
} from "./reviewerSource.ts";
import {
  analyzeLanguageTags,
  languageTagFacts,
  languageTagVerdicts,
  type ConlangLookup,
  type LangtagsTagLookup,
} from "./languageTags.ts";

/** Options the host supplies (Compare artifact, /review target). */
export interface JudgeForeignOptions {
  /**
   * The pipeline's compile result for this keyboard (the §§7.6/7.21
   * severity mapping). Omitted when no compile ran — the compile rows
   * then resolve Not yet checkable, never Met.
   */
  compileResult?: CompileResult | null;
  /**
   * Repository placement from the keyboard's repo path (§13.1).
   * Defaults to "release" when the path is unknown.
   */
  placement?: CriteriaPlacement;
  /**
   * Repository context for the /review-only checks (Batch 5 + Group C):
   * repo path, tree/PR file list, PR body, HISTORY.md. The /review host
   * sets this; other foreign hosts (Compare) never do.
   */
  reviewContext?: ReviewContext;
  /**
   * The keyboard's HISTORY.md at the PR base commit (criterion 3.4), set
   * by the /review host only when it had to fetch it (the PR changes
   * HISTORY.md on an upgrade). "failed" is a fetch that errored: 3.4 then
   * resolves Not yet checkable, never Met. "absent" is a clean 404: the
   * base had no HISTORY.md, so nothing is there to preserve.
   */
  baseHistory?:
    | { kind: "text"; text: string }
    | { kind: "absent" }
    | { kind: "failed" };
}

const HISTORY_TRUNCATED_CODE = "KM_LINT_HISTORY_TRUNCATED";

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * Whether the PR's changed paths include the keyboard's HISTORY.md, or
 * undefined when the path list is unknown.
 */
export function historyChangedInPr(
  repoPath: string,
  treePaths: readonly string[] | undefined,
): boolean | undefined {
  if (treePaths === undefined) return undefined;
  const want = `${repoPath}/history.md`.toLowerCase();
  return treePaths.some((p) => p.toLowerCase() === want);
}

/**
 * Stamp each finding with whether its file is part of the PR (`prDelta`).
 * A finding is "changed" when `repoPath/file` is among the PR's paths,
 * "unchanged" when the file exists in the judged VFS but is not, and left
 * unstamped when its file is empty, synthetic ("package"), or absent (a
 * missing file is not "already there"). Statuses are never touched.
 */
export function stampPrDelta(
  findings: readonly LintFinding[],
  reviewContext: ReviewContext | undefined,
  vfs: VirtualFS,
): LintFinding[] {
  if (
    reviewContext === undefined ||
    !reviewContext.isPr ||
    reviewContext.treePaths === undefined
  ) {
    return [...findings];
  }
  const changed = new Set(reviewContext.treePaths.map((p) => p.toLowerCase()));
  const present = new Set(vfs.list().map((p) => p.toLowerCase()));
  return findings.map((f) => {
    const file = f.location?.file;
    if (file === undefined || file === "") return f;
    const key = file.toLowerCase();
    if (changed.has(`${reviewContext.repoPath}/${file}`.toLowerCase())) {
      return { ...f, prDelta: "changed" as const };
    }
    if (present.has(key)) return { ...f, prDelta: "unchanged" as const };
    return f;
  });
}

/**
 * The langtags lookups — bare-subtag name/script/region and the full-tag
 * resolution — or undefined when unavailable.
 */
async function loadLangtagsLookup(): Promise<
  { defaults: LangtagsLookup; tags: LangtagsTagLookup } | undefined
> {
  try {
    const mod = await import("@keyboard-studio/engine/langtags");
    return {
      defaults: (subtag) => {
        const d = mod.getLanguageDefaults(subtag);
        if (d === null) return null;
        return {
          ...(d.englishName !== undefined ? { name: d.englishName } : {}),
          ...(d.defaultScript !== undefined ? { script: d.defaultScript } : {}),
          ...(d.defaultRegion !== undefined ? { region: d.defaultRegion } : {}),
        };
      },
      tags: {
        resolve: mod.resolveLangtag,
        scripts: mod.langtagsScripts,
        iso639_3: (lang) => mod.getLanguageDefaults(lang)?.iso639_3,
        members: mod.macrolanguageMembers,
      },
    };
  } catch {
    return undefined;
  }
}

/** Glottolog's "Artificial Language" pseudo-family. */
export const ARTIFICIAL_LANGUAGE_FAMILY = "arti1236";

/** Glottolog's constructed/natural answer per ISO 639-3, or undefined. */
async function loadConlangLookup(): Promise<ConlangLookup | undefined> {
  try {
    const mod = await import("@keyboard-studio/glottolog");
    return (iso) => {
      const hits = mod.byIso639p3(iso);
      if (hits.length === 0) return null;
      return hits.some((l) => l.familyId === ARTIFICIAL_LANGUAGE_FAMILY)
        ? "constructed"
        : "natural";
    };
  } catch {
    return undefined;
  }
}

/**
 * Whether a deprecation is in play for the judged keyboard: placement is
 * `legacy/`; a DEPRECATED.md sits in the VFS or under the keyboard's repo
 * folder in the tree/PR paths; or the .kps lists a RelatedPackage with
 * Relationship="deprecates".
 */
export function isDeprecationInPlay(
  vfs: VirtualFS,
  placement: CriteriaPlacement,
  reviewContext: ReviewContext | undefined,
): boolean {
  if (placement === "legacy") return true;
  const isMarker = (p: string): boolean =>
    baseName(p).toLowerCase() === "deprecated.md";
  const paths = vfs.list();
  if (paths.some(isMarker)) return true;
  if (reviewContext !== undefined) {
    const prefix = `${reviewContext.repoPath}/`.toLowerCase();
    if (
      (reviewContext.treePaths ?? []).some(
        (p) => p.toLowerCase().startsWith(prefix) && isMarker(p),
      )
    ) {
      return true;
    }
  }
  return paths
    .filter((p) => p.toLowerCase().endsWith(".kps"))
    .some((p) => {
      const text = readVfsText(vfs, p);
      return text !== undefined && deprecatedRelatedPackageIds(text).length > 0;
    });
}

/**
 * The repository placement a keyboard's repo path states:
 * `release/…`, `experimental/…`, or `legacy/…` — the first segment is
 * the keyboards repo's tier folder. Anything else is "unknown".
 */
export function placementFromRepoPath(
  path: string | undefined,
): CriteriaPlacement {
  const tier = path?.split("/")[0];
  if (tier === "release" || tier === "experimental" || tier === "legacy") {
    return tier;
  }
  return "unknown";
}

/**
 * Whether the review context carries an adaptation signal (§19): the PR
 * body or HISTORY.md mentions "adapted from". Without it the §19
 * attribution rows resolve Not applicable.
 */
function isAdaptationSignal(
  reviewContext: ReviewContext | undefined,
): boolean {
  if (reviewContext === undefined) return false;
  const haystacks = [
    reviewContext.prBody ?? "",
    reviewContext.historyMd ?? "",
  ];
  return haystacks.some((t) => /adapted\s+from/i.test(t));
}

/**
 * Judge one foreign keyboard VFS: doc + engine findings, merged, run
 * through the pure resolver in foreign mode. A failed engine run does
 * not discard the judgment: the doc findings still stand, and the
 * contextMissing map keeps the checks that could not run resolving
 * Not yet checkable rather than Met.
 *
 * The assembly runs with the foreign flags — scratchScan on (1.13's
 * CHECK-NOW arm; authored mode precertifies instead and never scans) and
 * deprecationInPlay following the isDeprecationInPlay predicate (§15 applicable only
 * when a deprecation is detected). No precertified set is ever passed here.
 */
export async function judgeForeignKeyboard(
  vfs: VirtualFS,
  keyboardId: string,
  displayName: string,
  options: JudgeForeignOptions = {},
): Promise<CriteriaResult> {
  const placement = options.placement ?? "release";
  const deprecationInPlay = isDeprecationInPlay(
    vfs,
    placement,
    options.reviewContext,
  );
  const assembled = assembleLintContext({
    vfs,
    keyboardId,
    placement,
    scratchScan: true,
    deprecationInPlay,
    ...(options.reviewContext !== undefined
      ? { reviewContext: options.reviewContext }
      : {}),
  });
  const { ctx } = assembled;
  const contextMissing: Record<string, string> = {
    ...assembled.contextMissing,
  };

  // 11.7 expects the .kps <Info><Name> (or .kmn &NAME) display name; a PR
  // target's displayName is just its id, which would make the check expect
  // "ibibio_tonal Keyboard Help".
  const effectiveDisplayName =
    displayName === keyboardId
      ? ([ctx.criteriaInput?.kpsDisplayName, ctx.keyboardIR?.header.name]
          .map((n) => n?.trim() ?? "")
          .find((n) => n !== "") ?? displayName)
      : displayName;

  // 3.4 (PR targets): decide what the base HISTORY.md comparison can claim.
  let historyVerified: string | undefined;
  let startHistoryMdText: string | undefined;
  const rc = options.reviewContext;
  // The keyboard's folder exists in no tier at the PR's base commit.
  const newKeyboardAtBase =
    rc !== undefined && rc.isPr && rc.idConflictAtBase?.existingTiers.length === 0;
  if (rc !== undefined && rc.isPr) {
    const changed = historyChangedInPr(rc.repoPath, rc.treePaths);
    if (changed === false) {
      historyVerified = "HISTORY.md unchanged by this PR";
    } else if (changed === true) {
      if (rc.idConflictAtBase === undefined) {
        contextMissing[HISTORY_TRUNCATED_CODE] =
          "the PR base-commit keyboard-folder lookup";
      } else if (newKeyboardAtBase) {
        // Not applicable via the newKeyboardAtBase fact.
      } else if (options.baseHistory?.kind === "text") {
        startHistoryMdText = options.baseHistory.text;
      } else if (options.baseHistory?.kind === "absent") {
        historyVerified =
          "The base commit has no HISTORY.md, so no entries need preserving";
      } else {
        contextMissing[HISTORY_TRUNCATED_CODE] = "the base-commit HISTORY.md";
      }
    }
  }

  const docInput = collectDocLintInputFromVfs(
    vfs,
    keyboardId,
    effectiveDisplayName,
  );
  const { findings: docFindings, verifiedByCode: docVerified } = runDocChecks(
    startHistoryMdText !== undefined
      ? { ...docInput, startHistoryMdText }
      : docInput,
  );
  let engineFindings: LintFinding[] = [];
  const verifiedByCode = new Map<string, string[]>(docVerified);
  try {
    const engine = await new KeyboardLintEngine().lintWithContext(
      vfs,
      keyboardId,
      ctx,
    );
    engineFindings = engine.findings;
    for (const [k, v] of engine.verifiedByCode) verifiedByCode.set(k, v);
  } catch {
    engineFindings = [];
  }
  if (historyVerified !== undefined) {
    verifiedByCode.set(HISTORY_TRUNCATED_CODE, [historyVerified]);
  }

  const base = deriveCriteriaFacts(vfs);
  // Fonts the .kps lists from the shared fonts directory are outside the
  // keyboard folder, so the VFS cannot hold them; they still count as
  // bundled for §9.
  const sharedFonts = sharedFontRefsMissingFromVfs(
    vfs,
    ctx.criteriaInput?.kpsText,
  );
  const bundledFonts = [
    ...new Set([...(base.bundledFonts ?? []), ...sharedFonts.map(baseName)]),
  ].sort();
  const facts = {
    ...base,
    fontBundled: bundledFonts.length > 0,
    bundledFonts,
    deprecated: deprecationInPlay,
    // No partner signal exists in a snapshot: §16 stays applicable (D7).
    partnerPackage: true,
    helpPhpAbsent: !vfs.list().some((p) => p.toLowerCase().endsWith(".php")),
    newKeyboardAtBase,
    // §19 adaptation signal: the PR body or HISTORY.md mentions an
    // adaptation. Without it the §19 rows resolve Not applicable.
    isAdaptation: isAdaptationSignal(options.reviewContext),
  };
  const kpsLanguages = ctx.criteriaInput?.kpsLanguages ?? [];
  const [langtags, conlang] = await Promise.all([
    loadLangtagsLookup(),
    kpsLanguages.length > 0 ? loadConlangLookup() : Promise.resolve(undefined),
  ]);
  // 10.3/10.4/10.5/12.1/12.5/12.6: the tags against langtags, Glottolog
  // and the output script. No langtags, no analysis — the rows stay with
  // the reviewer.
  const languageTags =
    langtags !== undefined && kpsLanguages.length > 0
      ? analyzeLanguageTags(
          kpsLanguages,
          langtags.tags,
          conlang,
          ctx.keyboardIR !== undefined
            ? outputScriptProfile(ctx.keyboardIR)
            : undefined,
        )
      : undefined;
  const reviewerSource = buildReviewerSource({
    vfs,
    kpsText: ctx.criteriaInput?.kpsText,
    kpsLanguages,
    keyboardIR: ctx.keyboardIR,
    reviewContext: options.reviewContext,
    isUpgradePr: (rc?.idConflictAtBase?.existingTiers.length ?? 0) > 0,
    ...(langtags !== undefined ? { langtags: langtags.defaults } : {}),
    ...(languageTags !== undefined ? { languageTags } : {}),
  });
  const prComments = rc?.prCommentCounts;
  return resolveCriteria({
    criteria: ALL_CRITERIA,
    mode: "foreign",
    lintFindings: stampPrDelta(
      mergeLintFindings(docFindings, engineFindings),
      options.reviewContext,
      vfs,
    ),
    verifiedByCode,
    record: EMPTY_CRITERIA_RECORD,
    facts: {
      ...facts,
      ...languageTagFacts(languageTags),
      // 17.1: nothing to resolve on a PR with no comments, or off a PR.
      noPrComments:
        rc?.isPr === true &&
        prComments !== undefined &&
        prComments.review === 0 &&
        prComments.conversation === 0,
      notAPullRequest: rc !== undefined && !rc.isPr,
    },
    reviewerVerdicts: languageTagVerdicts(languageTags),
    contextMissing,
    compileResult: options.compileResult ?? null,
    // §9.2 supporting evidence only (never decides the row).
    licenseTextHints: licenseTextHints(readVfsText(vfs, "LICENSE.md")),
    reviewerSource,
  });
}
