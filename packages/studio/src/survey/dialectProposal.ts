// dialectProposal — the dialect question's proposal (spec 115 US2, FR-008).
//
// proposeDialect(choice, searchMatch) picks the dialect subtag in the FR-008
// preference order: a registered IANA variant whose description matches the
// dialect name and whose prefixes allow the choice; the langtags `-x-` or
// variant tagset for that dialect; a private-use subtag made from the name
// (FR-011). Nothing is written until the author confirms (Article X).
//
// The environment (engine lookups + minimalTag) is injectable so the rule is
// testable without the lazy langtags chunk; the default reads the
// already-loaded module, and returns no proposal until it has loaded.

import { parseBcp47, type DialectTagset, type SearchMatch } from "@keyboard-studio/contracts";
import { getLoadedLangtags } from "../lib/langtagsDefaults.ts";
import { normalizeTargetScript } from "../lib/scriptAxes.ts";
import { fold } from "../lib/foldName.ts";
import { privateUseSlug } from "./privateUseSlug.ts";

/** Where a proposed dialect subtag came from (data-model.md § DialectProposal). */
export type DialectSource = "registered-variant" | "langtags" | "from-name" | "typed";

/** The language choice the proposal is built against. `script` is the raw
 * `il_target_script` answer ("fonipa", "romanization-Latn", "other"), not a
 * normalised ISO 15924 code. */
export interface DialectChoice {
  language: string;
  script?: string;
  region?: string;
}

/** The proposal the dialect question shows, pending until confirmed. */
export interface DialectProposal {
  /** A variant ("gascon") or private use ("x-rabinal"). */
  subtag: string;
  source: DialectSource;
  /** The minimal tag the choice carries with this subtag. */
  fullTag: string;
  /** The dialect's Glottolog code, when the match carries one. */
  glottocode?: string;
}

/** The data the rule reads, injectable for tests. The variant rows are the
 * engine's shape (readonly description/prefix arrays); a plain test object
 * with mutable arrays satisfies it. */
export interface DialectEnvironment {
  variantEntry(subtag: string): DialectVariantEntry | undefined;
  variantsFor(tag: string): readonly DialectVariantEntry[];
  variantAllowed(tag: string, variant: string): boolean;
  dialectTagsetsFor(language: string): readonly DialectTagset[];
  minimalTag(choice: {
    language: string;
    script?: string;
    region?: string;
    variants?: string[];
    privateUse?: string[];
  }): string;
}

/** One row of the IANA registry's variant subtags, as the engine returns it. */
export interface DialectVariantEntry {
  subtag: string;
  descriptions: readonly string[];
  prefixes: readonly string[];
  deprecated: boolean;
}

/**
 * The environment over the loaded langtags module, or null until it loads.
 * Null too when the loaded module predates — or, in tests, mocks — the
 * dialect surface (variantsFor, dialectTagsetsFor, minimalTag): the
 * proposal then waits rather than crashing on a partial module.
 */
export function defaultDialectEnvironment(): DialectEnvironment | null {
  const mod = getLoadedLangtags();
  if (mod === null) return null;
  if (
    typeof mod.variantEntry !== "function" ||
    typeof mod.variantsFor !== "function" ||
    typeof mod.variantAllowed !== "function" ||
    typeof mod.dialectTagsetsFor !== "function" ||
    typeof mod.minimalTag !== "function"
  ) {
    return null;
  }
  return {
    variantEntry: (subtag) => mod.variantEntry(subtag),
    variantsFor: (tag) => mod.variantsFor(tag),
    variantAllowed: (tag, variant) => mod.variantAllowed(tag, variant),
    dialectTagsetsFor: (language) => mod.dialectTagsetsFor(language),
    minimalTag: (choice) => mod.minimalTag(choice),
  };
}

/** The full tag for a choice carrying this subtag, in minimal form. */
function fullTagOf(
  env: DialectEnvironment,
  choice: DialectChoice,
  subtag: string,
): string {
  // The choice's script is the RAW target-script answer ("fonipa",
  // "romanization-Latn", "other"): normalise it the way buildTargetBcp47
  // does, so the proposal's tag is the tag the step will actually emit.
  const { script, extraVariants } = scriptParts(choice.script);
  const region = choice.region !== undefined && choice.region !== "" ? choice.region : undefined;
  if (subtag.startsWith("x-")) {
    return env.minimalTag({
      language: choice.language,
      ...(script !== undefined ? { script } : {}),
      ...(region !== undefined ? { region } : {}),
      variants: extraVariants,
      privateUse: subtag.slice(2).split("-"),
    });
  }
  return env.minimalTag({
    language: choice.language,
    ...(script !== undefined ? { script } : {}),
    ...(region !== undefined ? { region } : {}),
    variants: [...extraVariants, ...subtag.split("-")],
  });
}

/**
 * A raw `il_target_script` answer as a minimalTag script part: "fonipa"
 * contributes the fonipa variant and no script (its Latn is implied, never
 * spelled out for a non-Latin language); "romanization-Latn" is Latn;
 * "other" and blank carry no script.
 */
function scriptParts(raw: string | undefined): { script?: string; extraVariants: string[] } {
  if (raw === undefined || raw === "" || raw === "other") return { extraVariants: [] };
  if (raw === "fonipa") return { extraVariants: ["fonipa"] };
  const { script } = normalizeTargetScript(raw);
  return { script, extraVariants: [] };
}

function proposal(
  env: DialectEnvironment,
  choice: DialectChoice,
  subtag: string,
  source: DialectSource,
  glottocode?: string,
): DialectProposal {
  return {
    subtag,
    source,
    fullTag: fullTagOf(env, choice, subtag),
    ...(glottocode !== undefined && glottocode !== "" ? { glottocode } : {}),
  };
}

/** The tag (language + script + region) the choice's variants are checked against. */
function choiceTag(choice: DialectChoice): string {
  return [choice.language, choice.script, choice.region]
    .filter((p) => p !== undefined && p !== "")
    .join("-");
}

/** The dialect subtag a parsed tag carries: its variants, or its private use. */
function dialectSubtagOf(parts: { variants: string[]; privateUse: string[] }): string | undefined {
  if (parts.privateUse.length > 0) return `x-${parts.privateUse.join("-")}`;
  if (parts.variants.length > 0) return parts.variants.join("-");
  return undefined;
}

export function proposeDialect(
  choice: DialectChoice,
  searchMatch: SearchMatch | null | undefined,
  env: DialectEnvironment | null = defaultDialectEnvironment(),
): DialectProposal | null {
  if (searchMatch === null || searchMatch === undefined || env === null) return null;
  const name = searchMatch.name.trim();
  if (name === "") return null;
  const foldedName = fold(name);
  const glottocode = searchMatch.glottocode;
  const tag = choiceTag(choice);

  // 1. The match already carries a tag (langtags, the registry, or the
  // unlisted panel's proposed qaa tag): use its dialect subtag. A registered
  // variant wins over the langtags tagset carrying the same tag (FR-008's
  // order); a typed tag keeps its source.
  if (searchMatch.dialectTag !== undefined && searchMatch.dialectTag !== "") {
    const parsed = parseBcp47(searchMatch.dialectTag);
    if (parsed.ok) {
      const subtag = dialectSubtagOf(parsed.parts);
      if (subtag !== undefined) {
        if (searchMatch.source === "typed") {
          return proposal(env, choice, subtag, "typed", glottocode);
        }
        const variants = parsed.parts.variants;
        if (variants.length > 0) {
          const last = variants[variants.length - 1]!;
          const earlier = variants.slice(0, -1);
          const prefixTag = [choice.language, ...earlier].join("-");
          if (env.variantAllowed(prefixTag, last)) {
            return proposal(env, choice, subtag, "registered-variant", glottocode);
          }
        }
        return proposal(env, choice, subtag, "langtags", glottocode);
      }
    }
  }

  // 2. A registered variant whose description matches the dialect name
  // (folded) and whose prefixes allow the choice.
  for (const variant of env.variantsFor(tag)) {
    if (variant.descriptions.some((d) => fold(d) === foldedName)) {
      return proposal(env, choice, variant.subtag, "registered-variant", glottocode);
    }
  }

  // 3. A langtags dialect tagset for the dialect: one of its names, or its
  // own subtag slug ("rabinal" for acr-x-rabinal).
  for (const tagset of env.dialectTagsetsFor(choice.language)) {
    const slugWords = tagset.dialectSubtag.replace(/^x-/, "").replace(/-/g, " ");
    if (
      tagset.names.some((n) => fold(n) === foldedName) ||
      fold(slugWords) === foldedName
    ) {
      return proposal(env, choice, tagset.dialectSubtag, "langtags", glottocode);
    }
  }

  // 4. A private-use subtag made from the name (FR-011). On collision with
  // another langtags `-x-` subtag of the same language, the last character
  // becomes a disambiguating digit (2-9).
  let slug = privateUseSlug(name, "dialect");
  const existing = new Set(
    env
      .dialectTagsetsFor(choice.language)
      .map((t) => t.dialectSubtag)
      .filter((s) => s.startsWith("x-")),
  );
  if (existing.has(`x-${slug}`)) {
    for (let digit = 2; digit <= 9; digit += 1) {
      const candidate = `${slug.slice(0, -1)}${digit}`;
      if (!existing.has(`x-${candidate}`)) {
        slug = candidate;
        break;
      }
      if (digit === 9) slug = candidate;
    }
  }
  return proposal(
    env,
    choice,
    `x-${slug}`,
    searchMatch.source === "typed" ? "typed" : "from-name",
    glottocode,
  );
}

/**
 * Validate an edited dialect subtag (the question's Edit field, per
 * keystroke). The edit sits in the dialect position of a real tag, so the
 * probe places it there — a 4-letter edit reads as a variant, not a script,
 * and the failure carries the parser's reason.
 */
export function validateDialectSubtag(edit: string): { ok: true } | { ok: false; reason: string } {
  const value = edit.trim();
  if (value === "") return { ok: false, reason: "empty" };
  const probe = parseBcp47(`und-Latn-${value}`);
  if (probe.ok) return { ok: true };
  return { ok: false, reason: probe.reason };
}
