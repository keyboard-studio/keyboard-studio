// Language-tag facts for the /review rows 10.3, 10.4, 10.5, 12.1, 12.5 and
// 12.6, read from the .kps language tags against langtags (what each tag
// means and which scripts it records), Glottolog (constructed or natural)
// and the keyboard's output script profile.
//
// Pure: the lookups are injected (judgeForeign loads them lazily), so this
// module imports no engine or Glottolog data. It decides only what the
// data settles; anything it cannot settle stays with the reviewer:
//   - 10.3 Met/Not met: a script or region subtag is unnecessary when
//     dropping it leaves a tag langtags resolves to the same full tag
//     (`fr-FR` -> `fr`). A tag langtags does not know is not judged.
//   - 12.1 Not met only: the tag's script is absent from output that is
//     confidently in another script. Agreement is not Met — a matching
//     script does not show the language is right.
//   - 10.4, 10.5, 12.5/12.6 Not applicable only, via positive facts.

import { parseBcp47, scriptSubtagOf } from "@keyboard-studio/contracts";
import type { CriteriaAssemblyVerdict, CriteriaFacts } from "./criteriaTypes.ts";

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
  /** The shortest equivalent tags, when the tag carries an unnecessary subtag. */
  shorterEquivalents?: readonly string[];
  /** The script the tag denotes: its own subtag, else langtags'. */
  script?: string;
  /** Scripts langtags records for the tag's language. */
  recordedScripts: readonly string[];
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
  /** Absent when the output has no scripted characters. */
  output?: { dominant: string; share: number; evidence: number };
  /** Script -> share of the output, for the per-tag share lines. */
  distribution: Readonly<Record<string, number>>;
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


/** The shortest tags formed by dropping the script and/or region that still mean `full`. */
function shorterEquivalents(
  tag: string,
  full: string,
  lookup: LangtagsTagLookup,
): string[] {
  const parts = tag.split("-");
  // Only the grammatical script and region slots are droppable, never a
  // subtag past a variant, extension or private-use singleton.
  const parsed = parseBcp47(tag);
  const droppable: number[] = [];
  if (parsed.ok) {
    const slot = 1 + parsed.parts.extlang.length;
    if (parsed.parts.script !== undefined) droppable.push(slot);
    if (parsed.parts.region !== undefined) {
      droppable.push(slot + (parsed.parts.script !== undefined ? 1 : 0));
    }
  }
  const found: string[][] = [];
  // Every non-empty subset of the droppable subtags.
  for (let mask = 1; mask < 1 << droppable.length; mask++) {
    const drop = new Set(droppable.filter((_, b) => (mask >> b) & 1));
    const candidate = parts.filter((_, i) => !drop.has(i));
    if (lookup.resolve(candidate.join("-"))?.full.toLowerCase() === full.toLowerCase()) {
      found.push(candidate);
    }
  }
  if (found.length === 0) return [];
  const min = Math.min(...found.map((c) => c.length));
  return found.filter((c) => c.length === min).map((c) => c.join("-"));
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
): LanguageTagAnalysis {
  const tags = kpsTags.map((tag): LanguageTagFacts => {
    const lang = (tag.split("-")[0] ?? "").toLowerCase();
    const resolved = lookup.resolve(tag);
    const script = scriptSubtagOf(tag) ?? resolved?.script;
    const shorter = resolved !== null ? shorterEquivalents(tag, resolved.full, lookup) : [];
    // A deprecated code langtags folds into another (ajp -> apc) records
    // its scripts under the language it resolves to.
    const resolvedLang = resolved?.full.split("-")[0]?.toLowerCase();
    const cls = conlang !== undefined ? classify(lang, lookup, conlang) : { conlang: null };
    return {
      tag,
      ...(resolved !== null ? { full: resolved.full } : {}),
      ...(shorter.length > 0 ? { shorterEquivalents: shorter } : {}),
      ...(script !== undefined ? { script } : {}),
      recordedScripts: lookup.scripts(resolvedLang ?? lang),
      conlang: cls.conlang,
      ...(cls.members !== undefined ? { macrolanguageMembers: cls.members } : {}),
    };
  });
  return {
    tags,
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
  if (analysis.tags.every((t) => t.full !== undefined)) facts.kpsTagsAllInLangtags = true;
  if (analysis.tags.every((t) => t.conlang === "natural")) facts.kpsTagsNoConstructed = true;
  if (analysis.tags.every((t) => dominantRecorded(analysis, t) === true)) {
    facts.outputScriptRecordedByLangtags = true;
  }
  return facts;
}

/** 10.3 Met/Not met and 12.1 Not met, keyed by criterion id. */
export function languageTagVerdicts(
  analysis: LanguageTagAnalysis | undefined,
): Map<string, CriteriaAssemblyVerdict> {
  const verdicts = new Map<string, CriteriaAssemblyVerdict>();
  if (analysis === undefined || analysis.tags.length === 0) return verdicts;

  const notMinimal = analysis.tags.filter((t) => t.shorterEquivalents !== undefined);
  if (notMinimal.length > 0) {
    verdicts.set("10.3-kps-tags-minimal", {
      status: "not-met",
      lines: capped(
        notMinimal.map((t) => {
          const eq = t.shorterEquivalents!;
          const line =
            eq.length === 1
              ? `${t.tag} is not minimal: langtags reads ${eq[0]} as the same tag (${t.full}).`
              : `${t.tag} is not minimal: langtags reads each of ${eq.join(", ")} as the same tag (${t.full}).`;
          // A deprecated code: the shorter tag still uses it.
          const tagLang = (t.tag.split("-")[0] ?? "").toLowerCase();
          const fullLang = (t.full!.split("-")[0] ?? "").toLowerCase();
          return tagLang !== fullLang
            ? `${line} langtags folds ${tagLang} into ${fullLang}.`
            : line;
        }),
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
    return problemsFirst(
      tags.map((t) => ({
        problem: t.full === undefined,
        line:
          t.full !== undefined
            ? `${t.tag}: in langtags (${t.full}).`
            : `${t.tag}: not in langtags.`,
      })),
      "in langtags",
    );
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
