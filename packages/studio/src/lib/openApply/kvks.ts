// openApply kvks -- the on-screen keyboard's writes to an opened keyboard's
// `.kvks` (spec 111 FR-041/FR-045), as precomputed `files` changes (one undo
// record each). This module only BUILDS the change; the editors apply it through
// the apply host (`lib/kvksOpenCommit.ts`).
//
// A Visual edit is written into the file's own text: only the changed keys'
// elements are touched and the rest of the file stays byte-identical. When an
// element cannot be placed that way (a self-closing key, a duplicated layer or
// key, markup inside the element) the change carries the whole re-emitted file
// and is marked `askReformat`, so the author agrees before anything is written.
// Code Apply writes the author's text as it is. No timers.

import type { KvksIR } from "@keyboard-studio/contracts";
import { emitKvks, parseKvks, unescapeXml } from "@keyboard-studio/engine";
import type { OpenChange } from "./types.ts";

/** Plain label of the undo step an on-screen keyboard apply records on Open. */
export const OSK_EDIT_LABEL = "On-screen keyboard change";

const escapeText = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function attrOf(tagAttrs: string, name: string): string {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tagAttrs);
  return m === null ? "" : unescapeXml(m[1] ?? m[2] ?? "");
}

/** True when `at` lies inside an XML comment (the parser reads markup there too, so a patch would be ambiguous). */
function inComment(xml: string, at: number): boolean {
  const re = /<!--[\s\S]*?(?:-->|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (at >= m.index && at < m.index + m[0].length) return true;
  }
  return false;
}

/**
 * `xml` with the label of key `vkey` in layer `shift` set to `label`, touching
 * only that element's text; null when the element cannot be placed precisely.
 */
export function patchKvksKeyLabel(xml: string, shift: string, vkey: string, label: string): string | null {
  const layerRe = /<layer\b([^>]*)>([\s\S]*?)<\/layer>/gi;
  const layers: { bodyStart: number; body: string }[] = [];
  let lm: RegExpExecArray | null;
  while ((lm = layerRe.exec(xml)) !== null) {
    if (inComment(xml, lm.index)) return null;
    if (attrOf(lm[1] ?? "", "shift") !== shift) continue;
    const body = lm[2] ?? "";
    layers.push({ bodyStart: lm.index + lm[0].length - "</layer>".length - body.length, body });
  }
  if (layers.length !== 1 || layers[0] === undefined) return null;
  const { bodyStart, body } = layers[0];
  const keyRe = /<key\b([^>]*?)(\/>|>([\s\S]*?)<\/key>)/gi;
  const hits: { contentStart: number; content: string }[] = [];
  let km: RegExpExecArray | null;
  while ((km = keyRe.exec(body)) !== null) {
    if (inComment(xml, bodyStart + km.index)) return null;
    if (attrOf(km[1] ?? "", "vkey") !== vkey) continue;
    if (km[2] === "/>" || km[3] === undefined) return null;
    hits.push({ contentStart: km.index + (km[0].length - km[3].length - "</key>".length), content: km[3] });
  }
  if (hits.length !== 1 || hits[0] === undefined) return null;
  const { contentStart, content } = hits[0];
  if (content.includes("<")) return null;
  const at = bodyStart + contentStart;
  return xml.slice(0, at) + escapeText(label) + xml.slice(at + content.length);
}

type FlagName = "key102" | "displayunderlying" | "usealtgr";

/** `xml` with the header flag element present or absent; null when that cannot be done in place. */
export function patchKvksFlag(xml: string, flag: FlagName, on: boolean): string | null {
  const re = new RegExp(`<${flag}\\s*/?>`, "gi");
  const found: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) found.push(m);
  if (found.some((f) => inComment(xml, f.index))) return null;
  if (found.length > 1) return null;
  const has = found.length === 1;
  if (has === on) return xml;
  const eol = xml.includes("\r\n") ? "\r\n" : "\n";
  if (has) {
    const f = found[0];
    if (f === undefined) return null;
    return xml.slice(0, f.index) + xml.slice(f.index + f[0].length);
  }
  const element = `<${flag}/>`;
  // A self-closing flags element has no body to add to; a second block would be a duplicate.
  const flagsSelf = /<flags\b[^>]*\/>/i.exec(xml);
  if (flagsSelf !== null) return null;
  const flagsClose = /<\/flags>/i.exec(xml);
  if (flagsClose !== null) {
    if (inComment(xml, flagsClose.index)) return null;
    const lineStart = xml.lastIndexOf("\n", flagsClose.index - 1) + 1;
    const closeIndent = xml.slice(lineStart, flagsClose.index);
    if (/^[ \t]*$/.test(closeIndent)) {
      // The closing tag is on its own line: the new flag gets its own line, at the siblings' indent.
      const prev = /^([ \t]*)<[a-z0-9]+\s*\/?>[ \t]*\r?$/im.exec(xml.slice(0, lineStart).split(/\r?\n/).slice(-2)[0] ?? "");
      const indent = prev?.[1] ?? closeIndent + "  ";
      return xml.slice(0, lineStart) + indent + element + eol + xml.slice(lineStart);
    }
    return xml.slice(0, flagsClose.index) + element + xml.slice(flagsClose.index);
  }
  const headerClose = /<\/header>/i.exec(xml);
  if (headerClose === null || inComment(xml, headerClose.index)) return null;
  return xml.slice(0, headerClose.index) + `<flags>${element}</flags>${eol}` + xml.slice(headerClose.index);
}

/** Everything the editor can change, in a fixed order (node ids are not content). */
function canonical(ir: KvksIR): string {
  return JSON.stringify({
    layers: ir.layers,
    usealtgr: ir.usealtgr === true,
    key102: ir.key102 === true,
    displayUnderlying: ir.displayUnderlying === true,
    kvksVersion: ir.kvksVersion ?? null,
    kbdname: ir.kbdname ?? null,
    fontFamily: ir.fontFamily ?? null,
  });
}

/**
 * The text that holds `next`, written into `before`'s own text: key labels and the
 * header flags are placed in place. Null when something changed cannot be placed
 * precisely (other header fields, the layer or key set, a duplicate or ambiguous
 * element), or when the result does not read back as `next`.
 */
export function patchKvksLabels(before: string, next: KvksIR): string | null {
  const start = parseKvks(before);
  if (start.layers.length !== next.layers.length) return null;
  if ((start.kvksVersion ?? null) !== (next.kvksVersion ?? null)) return null;
  if ((start.kbdname ?? null) !== (next.kbdname ?? null)) return null;
  if ((start.fontFamily ?? null) !== (next.fontFamily ?? null)) return null;
  let text = before;
  for (const [li, layer] of next.layers.entries()) {
    const was = start.layers[li];
    if (was === undefined || was.shift !== layer.shift || was.keys.length !== layer.keys.length) return null;
    for (const [ki, key] of layer.keys.entries()) {
      const w = was.keys[ki];
      if (w === undefined || w.vkey !== key.vkey || w.chars !== key.chars) return null;
      if (w.label === key.label) continue;
      const patched = patchKvksKeyLabel(text, layer.shift, key.vkey, key.label);
      if (patched === null) return null;
      text = patched;
    }
  }
  const flags: [FlagName, boolean, boolean][] = [
    ["key102", start.key102 === true, next.key102 === true],
    ["displayunderlying", start.displayUnderlying === true, next.displayUnderlying === true],
    ["usealtgr", start.usealtgr === true, next.usealtgr === true],
  ];
  for (const [flag, was, now] of flags) {
    if (was === now) continue;
    const patched = patchKvksFlag(text, flag, now);
    if (patched === null) return null;
    text = patched;
  }
  return canonical(parseKvks(text)) === canonical(next) ? text : null;
}

/**
 * The change for a Visual edit: `next` against the file's text `before`. Placed
 * into the text when it can be; otherwise the re-emitted file, asked first.
 */
export function buildOskVisualChange(path: string, before: string, next: KvksIR): OpenChange {
  const patched = patchKvksLabels(before, next);
  if (patched !== null) {
    return { kind: "files", files: { [path]: patched }, label: OSK_EDIT_LABEL, labelKey: "osk" };
  }
  return { kind: "files", files: { [path]: emitKvks(next) }, label: OSK_EDIT_LABEL, labelKey: "osk", askReformat: true };
}

/** The change for Code Apply: the author's text, as typed. */
export function buildOskCodeChange(path: string, text: string): OpenChange {
  return { kind: "files", files: { [path]: text }, label: OSK_EDIT_LABEL, labelKey: "osk" };
}
