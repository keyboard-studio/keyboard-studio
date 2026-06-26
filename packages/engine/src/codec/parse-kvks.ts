/**
 * .kvks (Keyman Visual Keyboard) XML parser.
 *
 * The package has no XML parser dependency, so we use a minimal hand-rolled
 * regex tokenizer. This is intentionally limited to the KVKS schema subset we
 * need; anything outside that subset is silently ignored.
 *
 * Limitation: the regex approach does not handle CDATA sections, processing
 * instructions, or deeply nested structures outside the KVKS schema. This is
 * acceptable for v1 (spec §16 CJK/Ethiopic out of scope); file a follow-up
 * if a richer XML library is later added to the package.
 *
 * Schema extract (from basic_kbdfr.kvks):
 *   <visualkeyboard>
 *     <header>
 *       <flags>
 *         <usealtgr/>           -- optional flag
 *       </flags>
 *     </header>
 *     <encoding name="unicode" ...>
 *       <layer shift="S">       -- shift state (empty string = unshifted)
 *         <key vkey="K_A">a</key>
 *       </layer>
 *     </encoding>
 *   </visualkeyboard>
 */

import type { KvksIR, IRNodeRef } from "@keyboard-studio/contracts";
import { NodeIdMinter } from "./node-ids.js";

/** Unescape the five standard XML entities. */
function unescapeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// Pre-compiled attribute extractors for the three attributes we care about.
const RE_SHIFT = /\bshift\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const RE_VKEY  = /\bvkey\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const RE_CHARS = /\bchars\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

function matchAttr(tag: string, re: RegExp): string {
  const m = re.exec(tag);
  if (!m) return "";
  return unescapeXml((m[1] ?? m[2]) ?? "");
}

/**
 * Parse a .kvks XML string and return a KvksIR.
 *
 * @param xml  Contents of a .kvks file.
 */
export function parseKvks(xml: string): KvksIR {
  const minter = new NodeIdMinter();

  const layers: KvksIR["layers"] = [];
  const nodeIds: Array<[string, IRNodeRef]> = [];

  // Extract optional header fields from <header> element.
  const kvksVersionMatch = /<version\b[^>]*>([\s\S]*?)<\/version>/i.exec(xml);
  const kvksVersion = kvksVersionMatch ? unescapeXml(kvksVersionMatch[1]?.trim() ?? "") : undefined;
  const kbdnameMatch = /<kbdname\b[^>]*>([\s\S]*?)<\/kbdname>/i.exec(xml);
  const kbdname = kbdnameMatch ? unescapeXml(kbdnameMatch[1]?.trim() ?? "") : undefined;
  // OSK font family from the <encoding fontname="..."> attribute (the CSS
  // font-family the studio uses when injecting @font-face for the OSK preview).
  const fontnameMatch = /<encoding\b[^>]*\bfontname\s*=\s*"([^"]*)"/i.exec(xml);
  const fontFamily = fontnameMatch ? unescapeXml((fontnameMatch[1] ?? "").trim()) : undefined;

  // Detect <usealtgr/> in header flags.
  const usealtgr = /<usealtgr\s*\/?>/i.test(xml);

  // Extract <layer shift="..."> blocks.
  // Match from <layer to the closing </layer>.
  const layerRe = /<layer\b([^>]*)>([\s\S]*?)<\/layer>/gi;
  let layerMatch: RegExpExecArray | null;

  while ((layerMatch = layerRe.exec(xml)) !== null) {
    const layerAttrs = layerMatch[1] ?? "";
    const layerBody = layerMatch[2] ?? "";
    const shift = matchAttr(layerAttrs, RE_SHIFT);

    const keys: Array<{ vkey: string; label: string; chars?: string }> = [];

    // Extract <key vkey="...">TEXT</key> inside this layer.
    const keyRe = /<key\b([^>]*)>([\s\S]*?)<\/key>/gi;
    let keyMatch: RegExpExecArray | null;

    while ((keyMatch = keyRe.exec(layerBody)) !== null) {
      const keyAttrs = keyMatch[1] ?? "";
      const keyText = unescapeXml((keyMatch[2] ?? "").trim());
      const vkey = matchAttr(keyAttrs, RE_VKEY);
      if (!vkey) continue;

      const chars = matchAttr(keyAttrs, RE_CHARS) || undefined;
      const nodeId = minter.mint("kvksKey");
      keys.push(chars ? { vkey, label: keyText, chars } : { vkey, label: keyText });
      nodeIds.push([`${shift}:${vkey}`, { kind: "kvksKey", nodeId }]);
    }

    layers.push({ shift, keys });
  }

  const result: KvksIR = { layers, usealtgr, nodeIds };
  if (kvksVersion) result.kvksVersion = kvksVersion;
  if (kbdname) result.kbdname = kbdname;
  if (fontFamily) result.fontFamily = fontFamily;
  return result;
}
