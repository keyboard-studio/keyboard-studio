// Header classification (mapping rows 1.2, 2.15, 4.1-4.16; task T027).
// System stores are `IRStore{isSystem:true}`; each yields exactly one item.

import type { IRStore, KeyboardIR } from "@keyboard-studio/contracts";
import type { ItemSink } from "./items.js";

/** The text of a store: its char items joined (other item kinds contribute nothing). */
export function storeText(store: IRStore): string {
  let out = "";
  for (const it of store.items) if (it.kind === "char") out += it.value;
  return out;
}

/** The value of a system store by name (case-insensitive, without `&`), or undefined. */
export function systemStoreValue(ir: KeyboardIR, name: string): string | undefined {
  const want = name.toUpperCase();
  const s = ir.stores.find((x) => x.isSystem && x.name.replace(/^&/, "").toUpperCase() === want);
  return s === undefined ? undefined : storeText(s);
}

/** True for `begin ANSI` with no `begin Unicode` (row 1.2). */
export function isAnsiOnly(ir: KeyboardIR): boolean {
  return ir.header.encoding === "ANSI";
}

/** True when `&MNEMONICLAYOUT` is set to `1` (rows 2.7, 4.14). */
export function isMnemonicLayout(ir: KeyboardIR): boolean {
  return systemStoreValue(ir, "MNEMONICLAYOUT")?.trim() === "1";
}

const METADATA = new Set(["COPYRIGHT", "MESSAGE", "DESCRIPTION", "KEYBOARDDESCRIPTION"]);
const UNSUPPORTED = new Set([
  "HOTKEY", "WINDOWSLANGUAGES", "LANGUAGE", "ETHNOLOGUECODE", "DISPLAYMAP", "KMW_RTL", "KMW_EMBEDJS",
  "KMW_EMBEDCSS", "KMW_HELPFILE", "KMW_HELPTEXT", "INCLUDECODES", "VERSION",
]);
const CAPS_MODES = new Set(["CAPSALWAYSOFF", "CAPSONONLY", "SHIFTFREESCAPS"]);

export interface HeaderOptions {
  /** Language tags from the export metadata (row 4.16); defaults to `ir.header.bcp47`. */
  languages?: readonly string[] | undefined;
  /** The export carries attribution text (row 4.10). */
  attribution?: boolean | undefined;
  /** The export carries the provenance record (row 4.17). */
  provenanceRecord?: boolean | undefined;
}

/** Adds the header-level items. Returns nothing; the sink collects them. */
export function classifyHeader(ir: KeyboardIR, sink: ItemSink, opts: HeaderOptions): void {
  if (isAnsiOnly(ir)) {
    sink.add("1.2", { nodeKey: "header:encoding", side: "package" });
  }
  for (const s of ir.stores) {
    if (!s.isSystem) continue;
    const name = s.name.replace(/^&/, "").toUpperCase();
    const o = { nodeKey: `store:${name}`, line: s.sourceLine, side: "package" as const, params: { store: name } };
    if (name === "NAME") sink.add("4.1", o);
    else if (name === "KEYBOARDVERSION") sink.add("4.3", o);
    else if (name === "TARGETS") sink.add("4.6", o);
    else if (name === "LAYOUTFILE") sink.add("4.7", o);
    else if (name === "VISUALKEYBOARD") sink.add("4.8", o);
    else if (name === "CASEDKEYS") sink.add("4.13", { ...o, side: "hardware" });
    else if (name === "MNEMONICLAYOUT") {
      if (isMnemonicLayout(ir)) sink.add("4.14", { ...o, side: "hardware" });
      else sink.add("4.6", o);
    } else if (name === "BITMAP") sink.add("4.11", o);
    else if (METADATA.has(name)) sink.add("4.9", o);
    else if (UNSUPPORTED.has(name)) sink.add("4.12", o);
    else if (CAPS_MODES.has(name)) sink.add("2.15", o);
    else sink.add("6.2", { ...o, params: { ...o.params, reason: "unknown-system-store" } });
  }
  const languages = opts.languages ?? ir.header.bcp47;
  if (languages.length === 0) sink.add("4.16", { nodeKey: "header:locale", side: "package" });
  if (opts.attribution === true) sink.add("4.10", { nodeKey: "header:attribution", side: "package" });
  if (opts.provenanceRecord === true) sink.add("4.17", { nodeKey: "header:provenance", side: "package" });
}
