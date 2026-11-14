// variants — the IANA registered variant subtags (spec 115 R5, FR-021).
//
// Pure lookups over the pinned registry (`generated/variants.ts`): one row per
// registered variant, with the descriptions and the tags it may follow.
// The prefix rule (data-model.md § VariantEntry): a variant is allowed when
// some prefix's subtags are all present in the tag's language, script, region
// and earlier variants. A variant with no prefixes is allowed anywhere.

import { parseBcp47, type VariantEntry } from "@keyboard-studio/contracts";
import { registeredVariants } from "./generated/variants.js";
import { canonicalLanguage } from "./minimalTag.js";

function toEntry(row: (typeof registeredVariants)[number]): VariantEntry {
  return {
    subtag: row.subtag,
    descriptions: [...row.descriptions],
    prefixes: [...row.prefixes],
    deprecated: row.deprecated,
  };
}

/** The registry row for a variant subtag, or undefined when unregistered. */
export function variantEntry(subtag: string): VariantEntry | undefined {
  const key = subtag.toLowerCase();
  const row = registeredVariants.find((r) => r.subtag === key);
  return row === undefined ? undefined : toEntry(row);
}

/**
 * Whether a registered variant may follow a tag: one of its recorded
 * prefixes must be present in the tag (language, script, region and earlier
 * variants all match), or it carries no prefixes. A variant already in the
 * tag is never allowed again (BCP 47 forbids duplicate variants).
 */
export function variantAllowed(tag: string, variant: string): boolean {
  const entry = variantEntry(variant);
  if (entry === undefined) return false;
  const parsed = parseBcp47(tag.trim());
  if (!parsed.ok) return false;
  const parts = parsed.parts;
  const wanted = variant.toLowerCase();
  if (parts.variants.some((v) => v.toLowerCase() === wanted)) return false;
  if (entry.prefixes.length === 0) return true;
  const language = canonicalLanguage(parts.language);
  const script = parts.script?.toLowerCase();
  const region = parts.region?.toUpperCase();
  const variants = parts.variants.map((v) => v.toLowerCase());
  for (const prefix of entry.prefixes) {
    const p = parseBcp47(prefix);
    if (!p.ok) continue;
    const pp = p.parts;
    if (canonicalLanguage(pp.language) !== language) continue;
    if (pp.script !== undefined && pp.script.toLowerCase() !== script) continue;
    if (pp.region !== undefined && pp.region.toUpperCase() !== region) continue;
    if (!pp.variants.every((v) => variants.includes(v.toLowerCase()))) continue;
    return true;
  }
  return false;
}

/**
 * The registered variants allowed after a tag, in registry order.
 * Deprecated variants are withdrawn: they stay allowed in a tag that
 * already carries one (`variantAllowed`), but the question never offers one.
 */
export function variantsFor(tag: string): VariantEntry[] {
  return registeredVariants
    .filter((row) => !row.deprecated && variantAllowed(tag, row.subtag))
    .map(toEntry);
}
