// Language-tag facts for the /review rows 10.3, 10.4, 10.5, 12.1, 12.5 and
// 12.6, read from the .kps language tags against langtags (what each tag
// means and which scripts it records), Glottolog (constructed or natural)
// and the keyboard's output script profile.
//
// Pure: the lookups are injected (judgeForeign loads them lazily), so this
// module imports no engine or Glottolog data. It decides only what the
// data settles; anything it cannot settle stays with the reviewer:
//   - 10.3 Met/Not met: a tag is not minimal when `minimalTagOf` names a
//     shorter form, or when two tags share a minimal form (FR-020/FR-022).
//     A tag langtags does not know is not judged.
//   - 12.8 Met/Not met: every tag well-formed BCP 47, or the ill-formed
//     ones named (FR-019).
//   - 12.9 Met/Not met: every registered variant used with a language or
//     script its registry prefixes allow, or the disallowed ones named
//     (FR-021).
//   - 12.1 Not met only: the tag's script is absent from output that is
//     confidently in another script. Agreement is not Met — a matching
//     script does not show the language is right.
//   - 10.4, 10.5, 12.5/12.6 Not applicable only, via positive facts. 10.4 also
//     flags a private-use language code (`qaa`-`qtz`, spec 115 FR-032): such a
//     tag is never "unremarkable", and the line points at the ISO 639-3 request.
//     CONTENT REVIEW (Article VI): the 10.4 wording below is review text owned by
//     the content team.

import { formatBcp47, isWellFormedBcp47, parseBcp47, scriptSubtagOf } from "@keyboard-studio/contracts";
import type { CriteriaAssemblyVerdict, CriteriaFacts } from "./criteriaTypes.ts";
import type { VariantEntry } from "@keyboard-studio/contracts";

/** The langtags lookups (engine `@keyboard-studio/engine/langtags`). */
export interface LangtagsTagLookup {
  /** The full tag langtags says `tag` is equivalent to, or null. */
  resolve(tag: string): { full: string; script: string } | null;
  /** Every script langtags records for a language subtag. */
  scripts(lang: string): readonly string[];
  /** The ISO 639-3 code for a language subtag, when langtags has one. */
  iso639_3(lang: string): string | undefined;
  /** A macrolanguage's member language subtags; [] for any other language. */
  members(lang: string): readonly string[];
  /** The minimal form of a well-formed tag, or null when it is not well-formed. */
  minimalTagOf(tag: string): string | null;
  /** Whether a registered variant may follow a tag (its prefixes allow it). */
  variantAllowed(tag: string, variant: string): boolean;
  /** The registry row for a variant subtag, or undefined when unregistered. */
  variantEntry(subtag: string): VariantEntry | undefined;
}

/** Glottolog on an ISO 639-3 code; null when Glottolog does not have it. */
export type ConlangLookup = (iso: string) => "constructed" | "natural" | null;

/** The keyboard's output script profile (engine `outputScriptProfile`). */
export interface ScriptProfile {
  distribution: Readonly<Record<string, number>>;
  dominant?: string;
  dominantShare: number;
  evidenceSize: number;
}

export interface LanguageTagFacts {
  tag: string;
  /** langtags' full equivalent; absent when langtags does not know the tag. */
  full?: string;
  /** The script the tag denotes: its own subtag, else langtags'. */
  script?: string;
  /** Scripts langtags records for the tag's language. */
  recordedScripts: readonly string[];
  /** The language subtag is in the private-use range `qaa`-`qtz` (FR-032). */
  privateUseLanguage?: boolean;
  /** Glottolog's classification; null when Glottolog does not have it. */
  conlang: "constructed" | "natural" | null;
  /**
   * Set when the language is a macrolanguage Glottolog does not list, and
   * `conlang` was read from its members: how many there are.
   */
  macrolanguageMembers?: number;
}

export interface LanguageTagAnalysis {
  tags: readonly LanguageTagFacts[];
  /** Per-tag findings (FR-019 to FR-022), in tag order. */
  findings: readonly LanguageTagFinding[];
  /** Absent when the output has no scripted characters. */
  output?: { dominant: string; share: number; evidence: number };
  /** Script -> share of the output, for the per-tag share lines. */
  distribution: Readonly<Record<string, number>>;
  /** The Glottolog code of a language with no ISO 639-3 code (`language-glottocode`), shown beside the 10.4 flag (FR-045). */
  languageGlottocode?: string;
}

/** Where an author asks for an ISO 639-3 code (the pointer 10.4 shows, FR-032). */
export const ISO_639_3_REQUEST_POINTER = "https://iso639-3.sil.org/code_changes/submitting_change_requests";

/** A language subtag in the private-use range `qaa`-`qtz`. */
export function isPrivateUseLanguage(lang: string): boolean {
  return /^q[a-t][a-z]$/.test(lang.toLowerCase());
}

/** The facet-index classifier's `confident` share (engine CONFIDENT_SCRIPT_SHARE). */
const CONFIDENT_SHARE = 0.8;
/** Fewer scripted output characters than this is too little to judge from. */
export const MIN_SCRIPT_EVIDENCE = 5;

/** Tag scripts that name a combination or variant of Unicode scripts. */
const SCRIPT_COVERS: Readonly<Record<string, readonly string[]>> = {
  Jpan: ["Hira", "Kana", "Hani"],
  Hrkt: ["Hira", "Kana"],
  Kore: ["Hang", "Hani"],
  Hans: ["Hani"],
  Hant: ["Hani"],
  Hanb: ["Hani", "Bopo"],
  Latf: ["Latn"],
  Latg: ["Latn"],
  Cyrs: ["Cyrl"],
  Aran: ["Arab"],
  Syre: ["Syrc"],
  Syrj: ["Syrc"],
  Syrn: ["Syrc"],
};

/** Tag scripts that are not a writing system the output can be checked for. */
const UNCHECKABLE_SCRIPTS = new Set(["Zyyy", "Zinh", "Zxxx", "Zzzz", "Zsym", "Zsye", "Zmth"]);

function covers(script: string): readonly string[] {
  return SCRIPT_COVERS[script] ?? [script];
}


/** One thing wrong (or worth fixing) about one tag. */
export type LanguageTagFindingKind = "error" | "hint" | "warning";
export interface LanguageTagFinding {
  tag: string;
  kind: LanguageTagFindingKind;
  message: string;
  /** The minimal replacement, for a non-minimal hint. */
  replacement?: string;
  /** The first tag sharing this minimal form, for a duplicate hint. */
  duplicateOf?: string;
}

/** The tag with one variant removed, for the prefix check (FR-021). */
function tagWithoutVariant(tag: string, variant: string): string | null {
  const parsed = parseBcp47(tag);
  if (!parsed.ok) return null;
  const p = parsed.parts;
  return formatBcp47({
    ...p,
    variants: p.variants.filter((v) => v.toLowerCase() !== variant.toLowerCase()),
  });
}

/**
 * Per-tag findings (spec 115 FR-019 to FR-022), in tag order: an ill-formed
 * tag is an error and nothing else is checked for it; a well-formed
 * non-minimal tag is a hint naming its minimal form; a registered variant
 * its tag's prefixes do not allow is a warning; a second tag with the same
 * minimal form is a duplicate hint on the later tag.
 *
 * The variant check tests the variant against the tag with that variant
 * removed: `variantAllowed` refuses a variant already in the tag (BCP 47
 * forbids duplicate variants), so testing the tag as written would warn
 * about every variant it carries.
 */
export function languageTagFindings(
  tags: readonly string[],
  lookup: LangtagsTagLookup,
): LanguageTagFinding[] {
  const findings: LanguageTagFinding[] = [];
  const seenMinimal = new Map<string, string>();
  for (const tag of tags) {
    if (!isWellFormedBcp47(tag)) {
      findings.push({ tag, kind: "error", message: `${tag} is not a well-formed BCP 47 tag.` });
      continue;
    }
    const minimal = lookup.minimalTagOf(tag);
    if (minimal !== null && minimal !== tag) {
      findings.push({
        tag,
        kind: "hint",
        message: `${tag} is not minimal: use ${minimal}.`,
        replacement: minimal,
      });
    }
    const parsed = parseBcp47(tag);
    if (parsed.ok) {
      for (const variant of parsed.parts.variants) {
        const entry = lookup.variantEntry(variant);
        // An unregistered variant shape (e.g. `en-gasco`) is grammatically
        // valid; FR-021 covers registered variants only.
        if (entry === undefined) continue;
        const stripped = tagWithoutVariant(tag, variant);
        if (stripped !== null && !lookup.variantAllowed(stripped, variant)) {
          findings.push({
            tag,
            kind: "warning",
            message: `${tag}: the registered variant ${variant} is allowed after ${entry.prefixes.join(", ")}, not after ${stripped}.`,
          });
        }
      }
    }
    if (minimal !== null) {
      const key = minimal.toLowerCase();
      const first = seenMinimal.get(key);
      if (first !== undefined) {
        findings.push({
          tag,
          kind: "hint",
          message: `${tag} has the same minimal form (${minimal}) as ${first}.`,
          duplicateOf: first,
        });
      } else {
        seenMinimal.set(key, tag);
      }
    }
  }
  return findings;
}

/**
 * Glottolog's classification of a language subtag. Glottolog lists
 * individual languages only, so a macrolanguage (`qu`, `sw`, `ar`) is read
 * from its members: natural when every member is, constructed when any is.
 */
function classify(
  lang: string,
  lookup: LangtagsTagLookup,
  conlang: ConlangLookup,
): { conlang: LanguageTagFacts["conlang"]; members?: number } {
  // A three-letter subtag is itself an ISO 639-3 code; langtags' alias is
  // the fallback (and the only route for a two-letter subtag).
  const of = (l: string) => {
    for (const iso of new Set([l.length === 3 ? l : undefined, lookup.iso639_3(l)])) {
      const c = iso !== undefined ? conlang(iso) : null;
      if (c !== null) return c;
    }
    return null;
  };
  const direct = of(lang);
  if (direct !== null) return { conlang: direct };
  const members = lookup.members(lang).filter((m) => m !== lang);
  if (members.length === 0) return { conlang: null };
  const classes = members.map(of);
  if (classes.includes("constructed")) return { conlang: "constructed", members: members.length };
  return classes.every((c) => c === "natural")
    ? { conlang: "natural", members: members.length }
    : { conlang: null };
}

export function analyzeLanguageTags(
  kpsTags: readonly string[],
  lookup: LangtagsTagLookup,
  conlang: ConlangLookup | undefined,
  profile: ScriptProfile | undefined,
  languageGlottocode?: string,
): LanguageTagAnalysis {
  const tags = kpsTags.map((tag): LanguageTagFacts => {
    const lang = (tag.split("-")[0] ?? "").toLowerCase();
    const resolved = lookup.resolve(tag);
    const script = scriptSubtagOf(tag) ?? resolved?.script;
    // A deprecated code langtags folds into another (ajp -> apc) records
    // its scripts under the language it resolves to.
    const resolvedLang = resolved?.full.split("-")[0]?.toLowerCase();
    const cls = conlang !== undefined ? classify(lang, lookup, conlang) : { conlang: null };
    return {
      tag,
      ...(resolved !== null ? { full: resolved.full } : {}),
      ...(script !== undefined ? { script } : {}),
      recordedScripts: lookup.scripts(resolvedLang ?? lang),
      ...(isPrivateUseLanguage(lang) ? { privateUseLanguage: true } : {}),
      conlang: cls.conlang,
      ...(cls.members !== undefined ? { macrolanguageMembers: cls.members } : {}),
    };
  });
  return {
    tags,
    findings: languageTagFindings(kpsTags, lookup),
    ...(profile?.dominant !== undefined && profile.evidenceSize > 0
      ? {
          output: {
            dominant: profile.dominant,
            share: profile.dominantShare,
            evidence: profile.evidenceSize,
          },
        }
      : {}),
    distribution: profile?.distribution ?? {},
    ...(languageGlottocode !== undefined && languageGlottocode !== "" ? { languageGlottocode } : {}),
  };
}

/** The share of the output in the scripts a tag script covers. */
export function scriptShare(analysis: LanguageTagAnalysis, script: string): number {
  return covers(script).reduce((sum, s) => sum + (analysis.distribution[s] ?? 0), 0);
}

/** Output confidently in one script, with enough characters to judge from. */
function confidentOutput(
  analysis: LanguageTagAnalysis,
): { dominant: string; share: number; evidence: number } | undefined {
  const o = analysis.output;
  return o !== undefined && o.share >= CONFIDENT_SHARE && o.evidence >= MIN_SCRIPT_EVIDENCE
    ? o
    : undefined;
}

/** A tag whose script is absent from output confidently in another script. */
function scriptContradicted(analysis: LanguageTagAnalysis, t: LanguageTagFacts): boolean {
  return (
    confidentOutput(analysis) !== undefined &&
    t.script !== undefined &&
    !UNCHECKABLE_SCRIPTS.has(t.script) &&
    scriptShare(analysis, t.script) === 0
  );
}

/** The keyboard's dominant script is one langtags records for the tag's language. */
function dominantRecorded(analysis: LanguageTagAnalysis, t: LanguageTagFacts): boolean | undefined {
  const o = confidentOutput(analysis);
  if (o === undefined || t.recordedScripts.length === 0) return undefined;
  return t.recordedScripts.some((s) => covers(s).includes(o.dominant));
}

const pct = (share: number): string => `${Math.round(share * 100)}%`;

/** The named Not applicable facts the analysis supports (positive only). */
export function languageTagFacts(
  analysis: LanguageTagAnalysis | undefined,
): Partial<CriteriaFacts> {
  if (analysis === undefined || analysis.tags.length === 0) return {};
  const facts: Partial<CriteriaFacts> = {};
  if (analysis.tags.every((t) => t.full !== undefined && t.privateUseLanguage !== true)) facts.kpsTagsAllInLangtags = true;
  if (analysis.tags.every((t) => t.conlang === "natural")) facts.kpsTagsNoConstructed = true;
  if (analysis.tags.every((t) => dominantRecorded(analysis, t) === true)) {
    facts.outputScriptRecordedByLangtags = true;
  }
  return facts;
}

/** 10.3 Met/Not met, 12.8 Met/Not met, 12.9 Met/Not met and 12.1 Not met, keyed by criterion id. */
export function languageTagVerdicts(
  analysis: LanguageTagAnalysis | undefined,
): Map<string, CriteriaAssemblyVerdict> {
  const verdicts = new Map<string, CriteriaAssemblyVerdict>();
  if (analysis === undefined || analysis.tags.length === 0) return verdicts;
  const findings = analysis.findings ?? [];

  const fullOf = (tag: string): string | undefined =>
    analysis.tags.find((t) => t.tag === tag)?.full;
  const notMinimal = findings.filter(
    (f): f is LanguageTagFinding & { replacement: string } =>
      f.kind === "hint" && f.replacement !== undefined,
  );
  const duplicates = findings.filter((f) => f.kind === "hint" && f.duplicateOf !== undefined);
  if (notMinimal.length > 0 || duplicates.length > 0) {
    verdicts.set("10.3-kps-tags-minimal", {
      status: "not-met",
      lines: capped(
        [
          ...notMinimal.map((f) => {
            const full = fullOf(f.tag);
            const line =
              full !== undefined
                ? `${f.tag} is not minimal: langtags reads ${f.replacement} as the same tag (${full}).`
                : f.message;
            // A deprecated code: the shorter tag still uses it.
            const tagLang = (f.tag.split("-")[0] ?? "").toLowerCase();
            const fullLang = full?.split("-")[0]?.toLowerCase();
            return full !== undefined && fullLang !== undefined && tagLang !== fullLang
              ? `${line} langtags folds ${tagLang} into ${fullLang}.`
              : line;
          }),
          ...duplicates.map((f) => f.message),
        ],
        MAX_NOT_MET_LINES,
        "non-minimal tags",
      ),
    });
  } else if (analysis.tags.every((t) => t.full !== undefined)) {
    verdicts.set("10.3-kps-tags-minimal", {
      status: "met",
      lines: [
        `No script or region subtag in the ${analysis.tags.length} .kps language tag(s) can be dropped without changing what langtags reads the tag as:`,
        ...capped(
          analysis.tags.map((t) => `${t.tag} (${t.full})`),
          MAX_CONTEXT_LINES,
          "tags",
        ),
      ],
    });
  }

  const illFormed = findings.filter((f) => f.kind === "error");
  if (illFormed.length > 0) {
    verdicts.set("12.8-bcp47-tag-well-formed", {
      status: "not-met",
      lines: capped(
        illFormed.map((f) => f.message),
        MAX_NOT_MET_LINES,
        "ill-formed tags",
      ),
    });
  } else {
    verdicts.set("12.8-bcp47-tag-well-formed", {
      status: "met",
      lines: [
        `All ${analysis.tags.length} .kps language tag(s) are well-formed BCP 47 tags:`,
        ...capped(
          analysis.tags.map((t) => t.tag),
          MAX_CONTEXT_LINES,
          "tags",
        ),
      ],
    });
  }

  const disallowed = findings.filter((f) => f.kind === "warning");
  if (disallowed.length > 0) {
    verdicts.set("12.9-bcp47-variant-prefix", {
      status: "not-met",
      lines: capped(
        disallowed.map((f) => f.message),
        MAX_NOT_MET_LINES,
        "disallowed variants",
      ),
    });
  } else {
    const withVariants = analysis.tags.filter((t) => {
      const parsed = parseBcp47(t.tag);
      return parsed.ok && parsed.parts.variants.length > 0;
    });
    verdicts.set("12.9-bcp47-variant-prefix", {
      status: "met",
      lines:
        withVariants.length > 0
          ? [
              "Every registered variant in the .kps language tags is used with a language its registry prefixes allow:",
              ...capped(
                withVariants.map((t) => t.tag),
                MAX_CONTEXT_LINES,
                "tags",
              ),
            ]
          : ["No .kps language tag carries a registered variant."],
    });
  }

  const contradicted = analysis.tags.filter((t) => scriptContradicted(analysis, t));
  const o = confidentOutput(analysis);
  if (contradicted.length > 0 && o !== undefined) {
    verdicts.set("12.1-bcp47-tag-correct", {
      status: "not-met",
      lines: [
        `The keyboard's output is ${pct(o.share)} ${o.dominant} (${o.evidence} characters).`,
        ...capped(
          contradicted.map((t) =>
            scriptSubtagOf(t.tag) !== undefined
              ? `${t.tag} names the ${t.script} script, which the output does not use.`
              : `${t.tag} means ${t.script} script to langtags (${t.full}), which the output does not use; a script subtag may be missing.`,
          ),
          MAX_NOT_MET_LINES,
          "tags",
        ),
      ],
    });
  }
  return verdicts;
}

/** Lines a row's reviewer context or Met evidence shows before "and N more". */
const MAX_CONTEXT_LINES = 6;
/** Not met evidence names more of the offending tags. */
const MAX_NOT_MET_LINES = 10;

function capped(lines: readonly string[], max: number, noun: string): string[] {
  return lines.length > max
    ? [...lines.slice(0, max), `...and ${lines.length - max} more ${noun}.`]
    : [...lines];
}

/**
 * Per-tag lines with the ones that need the reviewer first, capped; the
 * tags left out are summarised with what they have in common.
 */
function problemsFirst(
  rows: readonly { problem: boolean; line: string }[],
  restSummary: string,
): string[] {
  const problems = rows.filter((r) => r.problem).map((r) => r.line);
  const rest = rows.filter((r) => !r.problem).map((r) => r.line);
  const shown = [...problems, ...rest].slice(0, MAX_CONTEXT_LINES);
  const hiddenProblems = Math.max(0, problems.length - MAX_CONTEXT_LINES);
  const hiddenRest = rest.length - Math.max(0, MAX_CONTEXT_LINES - problems.length);
  if (hiddenProblems > 0) shown.push(`...and ${hiddenProblems} more like these.`);
  if (hiddenRest > 0) shown.push(`...and ${hiddenRest} more tags ${restSummary}.`);
  return shown;
}

/** Reviewer-context lines for the language-tag rows, from the analysis. */
export function languageTagContextLines(
  criterionId: string,
  analysis: LanguageTagAnalysis | undefined,
): string[] {
  if (analysis === undefined || analysis.tags.length === 0) return [];
  const { tags } = analysis;
  const outputLine =
    analysis.output !== undefined
      ? `Keyboard output: ${pct(analysis.output.share)} ${analysis.output.dominant} (${analysis.output.evidence} scripted characters).`
      : "Keyboard output: no scripted characters to judge from.";
  if (criterionId.startsWith("10.3")) {
    return capped(
      tags
        .filter((t) => t.full === undefined)
        .map((t) => `${t.tag}: not in langtags, so minimality cannot be checked.`),
      MAX_CONTEXT_LINES,
      "tags not in langtags",
    );
  }
  if (criterionId.startsWith("10.4")) {
    return [
      ...problemsFirst(
        tags.map((t) => ({
          problem: t.full === undefined || t.privateUseLanguage === true,
          line:
            t.privateUseLanguage === true
              ? `${t.tag}: a private-use language code (qaa to qtz), standing in for a language with no ISO 639-3 code. Ask for a code: ${ISO_639_3_REQUEST_POINTER}`
              : t.full !== undefined
                ? `${t.tag}: in langtags (${t.full}).`
                : `${t.tag}: not in langtags.`,
        })),
        "in langtags",
      ),
      ...(analysis.languageGlottocode !== undefined
        ? [`Glottolog code of the language: ${analysis.languageGlottocode}.`]
        : []),
    ];
  }
  if (criterionId.startsWith("10.5")) {
    return problemsFirst(
      tags.map((t) => ({
        problem: t.conlang !== "natural",
        line:
          t.conlang === "constructed"
            ? `${t.tag}: a constructed language (Glottolog: Artificial Language).`
            : t.conlang === null
              ? `${t.tag}: not in Glottolog, so this cannot be checked.`
              : t.macrolanguageMembers !== undefined
                ? `${t.tag}: a macrolanguage; Glottolog classifies all ${t.macrolanguageMembers} of its member languages as natural.`
                : `${t.tag}: not a constructed language (Glottolog).`,
      })),
      "natural languages (Glottolog)",
    );
  }
  if (criterionId.startsWith("12.1")) {
    return [
      outputLine,
      ...problemsFirst(
        tags.map((t) => ({
          problem: t.script === undefined || scriptShare(analysis, t.script) === 0,
          line:
            t.script !== undefined
              ? `${t.tag}: ${t.script} script, ${pct(scriptShare(analysis, t.script))} of the output.`
              : `${t.tag}: script unknown (not in langtags, no script subtag).`,
        })),
        "in a script the output uses",
      ),
    ];
  }
  if (criterionId.startsWith("12.8")) {
    return problemsFirst(
      tags.map((t) => {
        const error = (analysis.findings ?? []).find(
          (f) => f.tag === t.tag && f.kind === "error",
        );
        return {
          problem: error !== undefined,
          line: error !== undefined ? error.message : `${t.tag}: well-formed.`,
        };
      }),
      "well-formed",
    );
  }
  if (criterionId.startsWith("12.9")) {
    return problemsFirst(
      tags.map((t) => {
        const warning = (analysis.findings ?? []).find(
          (f) => f.tag === t.tag && f.kind === "warning",
        );
        const parsed = parseBcp47(t.tag);
        const line =
          warning !== undefined
            ? warning.message
            : parsed.ok && parsed.parts.variants.length > 0
              ? `${t.tag}: its registered variants are allowed here.`
              : `${t.tag}: no registered variant.`;
        return { problem: warning !== undefined, line };
      }),
      "whose variants are allowed here",
    );
  }
  if (criterionId.startsWith("12.5") || criterionId.startsWith("12.6")) {
    return [
      outputLine,
      ...problemsFirst(
        tags.map((t) => {
          const recorded =
            t.recordedScripts.length > 0 ? t.recordedScripts.join(", ") : "nothing";
          const hit = dominantRecorded(analysis, t);
          return {
            problem: hit !== true,
            line:
              hit === false
                ? `${t.tag}: langtags records ${recorded}, not the output's ${analysis.output!.dominant}.`
                : `${t.tag}: langtags records ${recorded}.`,
          };
        }),
        "whose language langtags records in the output's script",
      ),
    ];
  }
  return [];
}
