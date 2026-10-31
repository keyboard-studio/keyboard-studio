// CriteriaLintInput — the extra inputs the spec 084 Batch 1 Layer C checks
// consume (criteria §§1/2/7/8/9/12/13/15), assembled by the studio's
// criteria assembly (assembleLintContext) and carried on LintContext.
//
// Why this shape: keyboard-lint may import contracts only — it must NOT
// import the engine (spec §10) — but two of its inputs are produced by
// engine parsers (parseKvks for the .kvks, parseKps* for the .kps). The
// studio assembly runs those parsers and hands the results over in this
// contracts-level shape, exactly as LintContext.docLintInput carries the
// documentation checks' inputs. Facts read back from the judged files
// are CHECK-NOW inputs (spec 084 triage), never precertification.

import type { KvksIR } from "./keyboard-ir.js";

/** Where the judged keyboard sits in the keyboards repository tree. */
export type CriteriaPlacement =
  | "release"
  | "experimental"
  | "legacy"
  | "unknown";

export interface CriteriaLintInput {
  /**
   * The parsed .kvks visual keyboard (engine parseKvks), when a .kvks
   * file exists in the judged VFS and parses. Absent when there is no
   * .kvks or it failed to parse — `kvksPath` distinguishes the two.
   */
  kvks?: KvksIR;
  /**
   * VFS path of the judged .kvks, present iff a .kvks file exists in the
   * VFS at all. Criterion 7.16 (kvks not blank) turns on this: an absent
   * file is not a blank file, and the two must not share a verdict.
   */
  kvksPath?: string;
  /** Raw text of the judged .kps package file, when one exists. */
  kpsText?: string;
  /** `<File><Name>` entries of the .kps (engine parseKpsFiles), raw. */
  kpsFileNames: readonly string[];
  /**
   * Font file references of the .kps (engine parseKpsFontRefs: OSK /
   * display fonts plus .ttf/.otf `<File>` entries), raw paths.
   */
  kpsFontRefs: readonly string[];
  /** BCP47 language tags declared by the .kps (engine parseKps). */
  kpsLanguages: readonly string[];
  /**
   * Platform targets declared by the .kps (engine parseKps), e.g.
   * ["windows", "web"]. Batch 2 (criterion 8.13): compared against the
   * .kmn IR header targets and the compiled members in the .kps file
   * list. Empty when the .kps is absent or unparseable.
   */
  kpsTargets: readonly string[];
  /**
   * Font family names extracted from the name tables (IDs 16, else 1)
   * of the .kps-listed font files that are present in the judged VFS
   * (Batch 3, criterion 8.7). The extraction runs in the studio
   * assembly (fontFamilyNames.ts) because it reads raw VFS binaries;
   * only the resulting family names cross into keyboard-lint. A font
   * file the .kps lists but the VFS does not carry contributes no
   * family — its absence is itself the 8.7 finding's substance.
   */
  kpsFontFamilies: readonly string[];
  /**
   * The author has attested that this keyboard's numeric region subtag
   * is explicitly contrastive (Batch 3, criterion 12.3's exception
   * clause). Authored host only, sourced from criteriaRecordStore;
   * the foreign host passes false — no attestation exists for a
   * keyboard the author does not own.
   */
  contrastiveRegionAttested: boolean;
  /** Display name declared by the .kps (engine parseKps), when present. */
  kpsDisplayName?: string;
  /**
   * Repository placement of the judged keyboard (criterion 13.1). The
   * authored host passes "release" — the generator and the managed-PR
   * pipeline only ever place a studio-built keyboard under `release/`.
   * The foreign host derives it from the catalog keyboard's repo path.
   */
  placement: CriteriaPlacement;
  /**
   * A deprecation is in play for the judged keyboard, so criterion 15.3
   * (legacy listed as deprecated in the .kps) may fire. The resolver's
   * applicability gate (§15 resolves Not applicable otherwise) is the
   * outer guard; this flag is the check-level gate for the same fact.
   * The foreign host passes true (§§15–16 are applicable by default
   * there — see useCompareCriteria); the authored host passes the
   * derived package fact (false until a deprecation flow exists).
   */
  deprecationInPlay: boolean;
  /**
   * Run the foreign-mode stray-scratch-file scan (criterion 1.13). The
   * foreign host sets this; the authored host never does — in authored
   * mode 1.13 is precertified by generation and is never scanned for.
   */
  scratchScan: boolean;
  /**
   * VFS path of the judged .kpj project file (`<keyboardId>.kpj` at the
   * VFS root), present iff a .kpj file exists in the judged VFS at all
   * (KPJ pair, criteria 1.10b / 2.7). Like `kvksPath`, presence is the
   * signal: an absent .kpj is a named missing input in the assembly,
   * never a verdict; a present one is judged on its text.
   */
  kpjPath?: string;
  /**
   * Raw text of the judged .kpj project file, when one exists. The
   * KPJ-pair checks in keyboard-lint read the `<Options><Version>`
   * element from it (the parseKpjFlags regex style) — the same raw-text
   * handoff as `kpsText` for criterion 15.3.
   */
  kpjText?: string;
  /**
   * .kps Keyboards-tab font selection (engine parseKpsPackageDetails):
   * the first non-empty `<OSKFont>` / `<DisplayFont>`. Empty when no
   * font is selected (Group A2, criterion 10.1b).
   */
  kpsFontSelected: string;
  /**
   * .kps Details-tab selections (engine parseKpsPackageDetails): the
   * `<Options>` ReadMeFile / WelcomeFile / LicenseFile texts. Empty
   * when unselected (Group A2, criterion 10.7b).
   */
  kpsDetailsReadme: string;
  kpsDetailsWelcome: string;
  kpsDetailsLicense: string;
  /**
   * A `<FollowKeyboardVersion>` element is present under the .kps
   * `<Options>` (engine parseKpsPackageDetails; Group A2, 10.8b).
   */
  kpsFollowKeyboardVersion: boolean;
  /**
   * The .kps `<Info><Description>` text (engine parseKpsPackageDetails).
   * Empty when absent (Group A2, criterion 10.9b).
   */
  kpsDescription: string;
  /**
   * Repository context for the /review Group A2 repo/PR twins (Batch 5)
   * and the Group C extraneous-files check. Set by the /review assembly
   * only; absent on the authored and Compare surfaces (those never see
   * the repo, only a folder).
   */
  reviewContext?: ReviewContext;
}

/**
 * Repository context for /review-only checks (Batch 5 + Group C).
 * All paths are repo-relative POSIX paths.
 */
export interface ReviewContext {
  /** The keyboard's folder in the repo, e.g. "release/gff/gff_amharic". */
  repoPath: string;
  /**
   * File list for the extraneous-file checks: the full repo tree at the
   * pinned sha (published keyboards) or the PR's changed files (PRs).
   */
  treePaths?: readonly string[];
  /** The PR description (PR sources only). */
  prBody?: string;
  /** True when the judged target is a pull request. */
  isPr: boolean;
  /** HISTORY.md text, when the file exists in the judged VFS. */
  historyMd?: string;
  /**
   * Criterion 1.5 (PR targets only): the PR's base commit sha and the
   * tiers (of experimental/legacy/release) where the keyboard's folder
   * already exists at that commit. Absent when the target is not a PR,
   * or when the base-commit lookup failed — the assembly then names
   * the missing input rather than letting the row pass or fail
   * undecided.
   */
  idConflictAtBase?: {
    baseSha: string;
    existingTiers: readonly string[];
  };
  /**
   * Criterion 2.6 (PR targets only): the judged .kmn's declared version
   * at the PR's base commit, for the "strictly greater" comparison.
   * Absent when the target is not a PR or when the base .kmn cannot be
   * fetched (API error — the assembly names the missing input). A
   * present entry with no version means the base declares none (or the
   * .kmn is new): nothing to increment from.
   */
  baseKmnVersion?: {
    baseSha: string;
    version?: string;
  };
}
