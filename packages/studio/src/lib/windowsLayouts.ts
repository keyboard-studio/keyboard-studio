// windowsLayouts — the Windows-layout catalog behind the community-layout step
// (spec 076 FR-023, amendment A4).
//
// One entry per Keyman `basic_kbd*` keyboard (each mirrors a Windows layout).
// The data is GENERATED — scripts/codegen-windows-layouts.mjs — and committed
// (CI has no keyboards corpus); it is validated with zod at load so a
// malformed regeneration fails loudly. This module owns the pure logic around
// it: search, the propose-then-confirm proposal from a BCP 47 tag, and the
// pick -> reference-host / family derivation the FR-023 resolver consumes.

import { z } from "zod";
import generated from "./generated/windowsLayouts.generated.json";
import { likelyHostLayouts } from "./referenceHostLayouts.ts";
import type { HostLayoutId, LayoutFamilyAnswer } from "./referenceHostLayouts.ts";

export type WindowsLayoutFamily = LayoutFamilyAnswer | "other";

const HostIdSchema = z.enum(["us", "us-intl", "azerty", "qwertz", "uk"]);

const WindowsLayoutSchema = z.object({
  id: z.string().regex(/^basic_kbd/),
  name: z.string().min(1),
  languages: z.array(z.object({ id: z.string(), name: z.string() })),
  family: z.enum(["qwerty", "qwertz", "azerty", "non-roman", "other"]),
  host: HostIdSchema.optional(),
});

const CatalogSchema = z.object({
  layouts: z.array(WindowsLayoutSchema).min(1),
});

export interface WindowsLayout {
  id: string;
  name: string;
  languages: readonly { id: string; name: string }[];
  family: WindowsLayoutFamily;
  /** Present when this layout IS one of the five reference hosts. */
  host?: HostLayoutId;
}

const parsed = CatalogSchema.parse(generated);

export const WINDOWS_LAYOUTS: readonly WindowsLayout[] = parsed.layouts.map((l) => ({
  id: l.id,
  name: l.name,
  languages: l.languages,
  family: l.family,
  ...(l.host !== undefined ? { host: l.host } : {}),
}));

const BY_ID = new Map(WINDOWS_LAYOUTS.map((l) => [l.id, l]));

export function windowsLayoutById(id: string | undefined): WindowsLayout | undefined {
  return id === undefined ? undefined : BY_ID.get(id);
}

/** The catalog entry for a reference host (e.g. "azerty" -> basic_kbdfr). */
export function windowsLayoutForHost(host: HostLayoutId): WindowsLayout | undefined {
  return WINDOWS_LAYOUTS.find((l) => l.host === host);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
}

/**
 * Filter by name, id, and language tag / language name. Every whitespace
 * separated token must match somewhere. Ranking: name prefix, name substring,
 * id, exact language tag, language substring; ties keep catalog (id) order
 * via a stable sort. An empty query returns everything, sorted by name.
 */
export function searchWindowsLayouts(
  query: string,
  layouts: readonly WindowsLayout[] = WINDOWS_LAYOUTS,
): WindowsLayout[] {
  const tokens = fold(query).split(/\s+/).filter((t) => t !== "");
  if (tokens.length === 0) {
    return [...layouts].sort((a, b) => a.name.localeCompare(b.name));
  }
  const scored: { layout: WindowsLayout; score: number }[] = [];
  for (const layout of layouts) {
    const name = fold(layout.name);
    const id = fold(layout.id);
    let total = 0;
    let ok = true;
    for (const tok of tokens) {
      let best = Infinity;
      if (name.startsWith(tok)) best = Math.min(best, 0);
      if (name.includes(tok)) best = Math.min(best, 1);
      if (id.includes(tok)) best = Math.min(best, 2);
      for (const lang of layout.languages) {
        if (fold(lang.id) === tok) best = Math.min(best, 3);
        else if (fold(lang.id).includes(tok) || fold(lang.name).includes(tok)) best = Math.min(best, 4);
      }
      if (best === Infinity) {
        ok = false;
        break;
      }
      total += best;
    }
    if (ok) scored.push({ layout, score: total });
  }
  return scored.sort((a, b) => a.score - b.score).map((s) => s.layout);
}

// ---------------------------------------------------------------------------
// Proposal (propose-then-confirm; spec 3c "defaults are the product")
// ---------------------------------------------------------------------------

export type LayoutProposalBasis = "region" | "language" | "default";

export interface LayoutProposal {
  layout: WindowsLayout;
  /** Why the studio suggests it; drives the "why" line under the picker. */
  basis: LayoutProposalBasis;
}

/** The studio's fallback suggestion when no signal exists: the most widely used layout. */
export const DEFAULT_PROPOSED_LAYOUT_ID = "basic_kbdus";

/**
 * Propose a layout from the identity language tag — never blank.
 *  1. region: the existing region -> reference-host mapping (en-GB -> UK ...),
 *     when it names exactly one host (no signal returns all five).
 *  2. language: catalog layouts listing the tag (exact) or its language
 *     subtag; exact tag beats subtag, then the layout listing FEWEST languages
 *     wins (the more specific one).
 *  3. default: the US layout.
 */
export function proposeWindowsLayout(bcp47: string | undefined): LayoutProposal {
  const fallback = (): LayoutProposal => ({
    layout: BY_ID.get(DEFAULT_PROPOSED_LAYOUT_ID) ?? WINDOWS_LAYOUTS[0]!,
    basis: "default",
  });
  const tag = (bcp47 ?? "").trim();
  if (tag === "") return fallback();

  const hosts = likelyHostLayouts([tag]);
  if (hosts.length === 1) {
    const layout = windowsLayoutForHost(hosts[0]!);
    if (layout !== undefined) return { layout, basis: "region" };
  }

  const lower = tag.toLowerCase();
  const primary = lower.split("-")[0] ?? lower;
  let best: { layout: WindowsLayout; rank: number; size: number } | undefined;
  for (const layout of WINDOWS_LAYOUTS) {
    let rank = Infinity;
    for (const lang of layout.languages) {
      const id = lang.id.toLowerCase();
      if (id === lower) rank = Math.min(rank, 0);
      else if (id.split("-")[0] === primary) rank = Math.min(rank, 1);
    }
    if (rank === Infinity) continue;
    const size = layout.languages.length;
    if (best === undefined || rank < best.rank || (rank === best.rank && size < best.size)) {
      best = { layout, rank, size };
    }
  }
  if (best !== undefined) return { layout: best.layout, basis: "language" };
  return fallback();
}
