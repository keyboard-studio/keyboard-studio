// phaseFSeeds — text proposals for Phase F (help documentation) questions,
// derived from the keyboard the working copy started from.
//
// Each function returns the text to pre-fill, or undefined when there is
// nothing to derive, in which case the question opens blank as before. The
// author sees the proposal in the field and keeps, edits, or clears it; the
// survey records a kept one as the studio's suggestion, not the author's own
// words.
//
// Only questions whose answer the starting point actually states are seeded.
// Font guidance is not (bundled fonts are already listed automatically, per the
// question's own help), and nor is anything that would need guessing about the
// author's community or intentions.

import type { BaseKeyboard, VirtualFS } from "@keyboard-studio/contracts";
import { readVfsText } from "./vfsText.ts";

/** The working-copy slices the Phase F text proposals read. */
export interface PhaseFSeedContext {
  instantiationMode: "new-from-base" | "adapt-existing" | null;
  baseKeyboard: BaseKeyboard | null;
  baseVfs: VirtualFS | null;
}

const XML_ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
};

function decodeXmlText(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|apos|#39);/g, (m) => XML_ENTITIES[m] ?? m);
}

/**
 * The `<Info><WebSite>` link of a `.kps`: the `URL` attribute when present
 * (the form the descriptor writer emits), else the element text.
 */
export function kpsWebSite(kpsText: string | null | undefined): string | undefined {
  if (kpsText === undefined || kpsText === null) return undefined;
  const m = /<WebSite\b([^>]*)>([^<]*)<\/WebSite\s*>/i.exec(kpsText);
  if (m === null) return undefined;
  const attr = /\bURL\s*=\s*"([^"]*)"/i.exec(m[1] ?? "")?.[1]?.trim() ?? "";
  const value = attr !== "" ? attr : (m[2]?.trim() ?? "");
  return value === "" ? undefined : decodeXmlText(value);
}

/**
 * `pf_project_url` on an update: the website the released package already
 * names. Without it a blank answer removes the existing `<WebSite>` from the
 * updated package, so proposing it keeps the link unless the author clears it.
 * A copy (Track 1) is a different keyboard, so the original's site is not
 * proposed for it.
 */
export function proposeProjectUrl(ctx: PhaseFSeedContext): string | undefined {
  if (ctx.instantiationMode !== "adapt-existing" || ctx.baseVfs === null) return undefined;
  const kpsPath = ctx.baseVfs.list("source/").find((p) => p.toLowerCase().endsWith(".kps"));
  if (kpsPath === undefined) return undefined;
  return kpsWebSite(readVfsText(ctx.baseVfs, kpsPath));
}

/**
 * `pf_provenance_basis` on a copy (Track 1): the keyboard it started from. An
 * update's provenance is the keyboard's own history, which the studio does not
 * know, so nothing is proposed there.
 */
export function proposeProvenanceBasis(ctx: PhaseFSeedContext): string | undefined {
  if (ctx.instantiationMode !== "new-from-base" || ctx.baseKeyboard === null) return undefined;
  const name = ctx.baseKeyboard.displayName.trim();
  if (name === "") return undefined;
  return `This keyboard started as a copy of the ${name} keyboard (${ctx.baseKeyboard.id}).`;
}
