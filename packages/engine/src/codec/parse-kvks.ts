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

/**
 * Extract the value of an XML attribute from a tag string.
 * Returns empty string if not found.
 */
function attr(tag: string, name: string): string {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
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

  // Detect <usealtgr/> in header flags.
  const usealtgr = /<usealtgr\s*\/?>/i.test(xml);

  // Extract <layer shift="..."> blocks.
  // Match from <layer to the closing </layer>.
  const layerRe = /<layer\b([^>]*)>([\s\S]*?)<\/layer>/gi;
  let layerMatch: RegExpExecArray | null;

  while ((layerMatch = layerRe.exec(xml)) !== null) {
    const layerAttrs = layerMatch[1] ?? "";
    const layerBody = layerMatch[2] ?? "";
    const shift = attr(layerAttrs, "shift");

    const keys: Array<{ vkey: string; output: string }> = [];

    // Extract <key vkey="...">TEXT</key> inside this layer.
    const keyRe = /<key\b([^>]*)>([\s\S]*?)<\/key>/gi;
    let keyMatch: RegExpExecArray | null;

    while ((keyMatch = keyRe.exec(layerBody)) !== null) {
      const keyAttrs = keyMatch[1] ?? "";
      const keyText = unescapeXml((keyMatch[2] ?? "").trim());
      const vkey = attr(keyAttrs, "vkey");
      if (!vkey) continue;

      const nodeId = minter.mint("kvksKey");
      keys.push({ vkey, output: keyText });
      nodeIds.push([`${shift}:${vkey}`, { kind: "kvksKey", nodeId }]);
    }

    layers.push({ shift, keys });
  }

  return { layers, usealtgr, nodeIds };
}
