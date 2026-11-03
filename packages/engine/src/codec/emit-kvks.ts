/**
 * .kvks (Keyman Visual Keyboard) XML emitter.
 *
 * Inverts `parse-kvks.ts`: renders a KvksIR back to .kvks XML text.
 * Round-trip guarantee: parseKvks(emitKvks(ir)) deep-equals ir
 * (modulo nodeIds, which are re-minted on parse).
 *
 * XML shape (from TIKE's VisualKeyboardSaverXML.pas and real .kvks files):
 *   <?xml version="1.0" encoding="utf-8"?>
 *   <visualkeyboard>
 *     <header>
 *       <version>10.0</version>
 *       <kbdname>...</kbdname>
 *       <flags>
 *         <key102/>
 *         <displayunderlying/>
 *         <usealtgr/>
 *       </flags>
 *     </header>
 *     <encoding name="unicode" fontname="...">
 *       <layer shift="">
 *         <key vkey="K_A" chars="a">a</key>
 *       </layer>
 *     </encoding>
 *   </visualkeyboard>
 */

import type { KvksIR } from "@keyboard-studio/contracts";

/** Escape the five standard XML entities. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Render a KvksIR to .kvks XML text.
 *
 * @param ir  The parsed visual keyboard to serialize.
 */
export function emitKvks(ir: KvksIR): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="utf-8"?>');
  lines.push("<visualkeyboard>");
  lines.push("  <header>");

  if (ir.kvksVersion) {
    lines.push(`    <version>${escapeXml(ir.kvksVersion)}</version>`);
  }
  if (ir.kbdname) {
    lines.push(`    <kbdname>${escapeXml(ir.kbdname)}</kbdname>`);
  }

  const flags: string[] = [];
  if (ir.key102) flags.push("      <key102/>");
  if (ir.displayUnderlying) flags.push("      <displayunderlying/>");
  if (ir.usealtgr) flags.push("      <usealtgr/>");
  if (flags.length > 0) {
    lines.push("    <flags>");
    lines.push(...flags);
    lines.push("    </flags>");
  }

  lines.push("  </header>");

  const fontAttr = ir.fontFamily ? ` fontname="${escapeXml(ir.fontFamily)}"` : "";
  lines.push(`  <encoding name="unicode"${fontAttr}>`);

  for (const layer of ir.layers) {
    lines.push(`    <layer shift="${escapeXml(layer.shift)}">`);
    for (const key of layer.keys) {
      const charsAttr = key.chars ? ` chars="${escapeXml(key.chars)}"` : "";
      lines.push(
        `      <key vkey="${escapeXml(key.vkey)}"${charsAttr}>${escapeXml(key.label)}</key>`,
      );
    }
    lines.push("    </layer>");
  }

  lines.push("  </encoding>");
  lines.push("</visualkeyboard>");
  return lines.join("\n") + "\n";
}
