// LDML-EXPORT-REPORT.md (spec 108 FR-031, FR-062, FR-064; task T035; contracts/export-package.md).
//
// The report is always English and has no timestamp. Rows are sorted by section, then line, then
// code, so the order never depends on traversal. It is a projection of the same classification the
// findings view reads.

import { compareCodePoints } from "./lower/keyIds.js";
import { PHONE_MIN_DEVICE_WIDTH, TABLET_MIN_DEVICE_WIDTH } from "./lower/touchForms.js";
import type { ProvenanceRecord } from "./lower/provenance.js";
import { provenanceCounts } from "./lower/provenance.js";
import { resolveLdmlProfile } from "./profiles/resolve.js";
import type { TargetProfile } from "./profiles/types.js";
import type { ExpectedKeymanError } from "./compile/compareToKeymanGaps.js";
import type { KeymanMessage } from "./compile/loadLdmlCompiler.js";
import type { CompatibilityItem, LdmlBaseLayoutSource, LdmlClassification } from "./types.js";

export interface ReportContext {
  keyboardName: string;
  keyboardId: string;
  version: string;
  /** The row 2.7 caveat applies. */
  mnemonic: boolean;
  /** Per-position provenance (FR-028); null when the keyboard was refused. */
  provenance: ProvenanceRecord | null;
}

const SOURCE_TEXT: Record<LdmlBaseLayoutSource, string> = {
  author: "the author's pick on the Output page",
  "primary-pick": "the primary Windows layout pick",
  "likely-base": "the likely base keyboard for the language",
  "en-US": "the default (en-US)",
};

function cell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function location(item: CompatibilityItem, sourceName: string): string {
  if (item.line !== null) return `${sourceName}:${item.line}`;
  if (item.side === "touch") return item.nodeKey.replace(/^touch:/, "touch ");
  return item.owner !== null ? `${item.owner}` : item.nodeKey;
}

function compareItems(a: CompatibilityItem, b: CompatibilityItem): number {
  return (
    (a.line ?? Number.MAX_SAFE_INTEGER) - (b.line ?? Number.MAX_SAFE_INTEGER) ||
    compareCodePoints(a.code ?? "", b.code ?? "") ||
    compareCodePoints(a.siteKey, b.siteKey)
  );
}

function table(items: readonly CompatibilityItem[], sourceName: string): string[] {
  if (items.length === 0) return ["None.", ""];
  const lines = [
    "| Location | Construct | Code | Status | What LDML does instead |",
    "|---|---|---|---|---|",
  ];
  for (const i of [...items].sort(compareItems)) {
    lines.push(
      `| ${cell(location(i, sourceName))} | ${cell(i.construct)} | ${i.code ?? ""} | ${i.status} | ${cell(i.consequence)} |`,
    );
  }
  lines.push("");
  return lines;
}

const FORM_WIDTH: Record<string, number> = { phone: PHONE_MIN_DEVICE_WIDTH, tablet: TABLET_MIN_DEVICE_WIDTH };

/** What the touch half carried, before the table of what it did not (FR-031, Story 4 scenario 3). */
function touchSummary(c: LdmlClassification): string[] {
  const platforms = [...new Set(c.items.map((i) => /^touch:(phone|tablet)\//.exec(i.nodeKey)?.[1]).filter((p): p is string => p !== undefined))].sort();
  const lines: string[] = [];
  if (platforms.length > 0) {
    const forms = platforms.map((p) => `${p} (minDeviceWidth ${FORM_WIDTH[p]})`).join(", ");
    lines.push(`Touch forms written to TR35: ${forms}. Each touch key types the same output as the matching key in the rules above.`);
  }
  if (c.items.some((i) => i.rowId === "1.4a")) {
    lines.push("Automatic layer switching that depends only on the current layer and the key pressed was carried over as key layerId.");
  }
  if (lines.length > 0) lines.push("");
  return lines;
}

export function renderReport(c: LdmlClassification, profile: TargetProfile, ctx: ReportContext): string {
  const sourceName = `source/${ctx.keyboardId}.kmn`;
  const out: string[] = [];
  out.push(`# LDML export report: ${ctx.keyboardName} (${ctx.keyboardId}) version ${ctx.version}`, "");

  // 1. Title and authority
  out.push("## 1. Profile and authority", "");
  out.push(`- Profile: ${profile.id} (namespace ${profile.namespace}).`);
  out.push(`- TR35 revision this export was written against: ${profile.tr35Revision}.`);
  out.push(
    profile.keymanRelease === null
      ? "- Keyman: TR35-only (awaiting Keyman). No Keyman release compiles this profile yet."
      : `- Keyman: compiles with Keyman ${profile.keymanRelease}.`,
  );
  out.push(
    "- Authority: the KMN keyboard is the source of truth. This report lists what the LDML file does differently. It is generated from the same classification the authoring warnings use.",
    "",
  );

  // 2. Base keyboard
  out.push("## 2. Base keyboard", "");
  out.push(`The export filled every position the keyboard does not handle from ${c.baseLayout.label} (\`${c.baseLayout.id}\`), chosen by ${SOURCE_TEXT[c.baseLayout.source]}.`, "");
  if (ctx.provenance !== null) {
    out.push("| Layer | Authored | Filled | Suppressed |", "|---|---|---|---|");
    for (const r of provenanceCounts(ctx.provenance)) out.push(`| ${r.layer} | ${r.authored} | ${r.filled} | ${r.suppressed} |`);
    out.push("");
  }
  if (ctx.mnemonic) {
    out.push(
      "This keyboard is mnemonic. LDML is positional only, so its keys were resolved to positions through the base keyboard above. The exported layout matches the mnemonic keyboard only for people whose base keyboard is that one.",
      "",
    );
  }

  // 3. Summary
  out.push("## 3. Summary", "");
  out.push(`Mapped: ${c.counts.M}. Approximated: ${c.counts.A}. Not exported: ${c.counts.N}. Keyman gaps: ${c.counts.K}.`, "");
  if (c.counts.A === 0 && c.counts.N === 0) out.push("Nothing was lost.", "");

  // 4. Delivery note
  out.push("## 4. Delivery note", "");
  out.push("Keyman 19 delivers LDML keyboards to desktop only.");
  if (c.touchPresent) {
    out.push(
      "",
      "The touch layout is written to TR35 and is ready for Keyman's touch pipeline. No Keyman runs it yet, so touch devices do not use it today.",
    );
  }
  out.push("");

  const coded = c.items.filter((i) => i.code !== null);
  out.push("## 5. What did not carry over: physical keyboard", "");
  out.push(...table(coded.filter((i) => i.side === "hardware"), sourceName));
  out.push("## 6. What did not carry over: touch", "");
  if (c.touchPresent) out.push(...touchSummary(c));
  out.push(...table(coded.filter((i) => i.side === "touch"), sourceName));
  out.push("## 7. Other items", "");
  out.push(...table(coded.filter((i) => i.side === "package"), sourceName));

  // 8. Version change
  if (profile.id !== "46") {
    const base = resolveLdmlProfile("46");
    out.push("## 8. Version change from profile 46", "");
    const moved = profile.deltas.filter((d) => d.status !== undefined);
    if (moved.length === 0) out.push("No rows changed.", "");
    else {
      out.push("| Row | Profile 46 | This profile |", "|---|---|---|");
      for (const d of moved) out.push(`| ${d.id} | ${base.rows.get(d.id)?.status ?? ""} | ${d.status ?? ""} |`);
      out.push("");
    }
  }
  return out.join("\n");
}

export interface CompileReportInput {
  /** The pinned `@keymanapp/kmc-ldml` version (FR-075). */
  compilerVersion: string;
  /** The file version the compiler wrote into the `.kmx` header; 0 when none. */
  kmxPlusVersion: number;
  expected: readonly ExpectedKeymanError[];
  unexpected: readonly KeymanMessage[];
  warnings: readonly KeymanMessage[];
}

/** `0x1100` is KMX file version 17.0: major in the high byte, minor in the low byte. */
function kmxVersionText(v: number): string {
  return v === 0 ? "unknown" : `${v >> 8}.${v & 0xff} (0x${v.toString(16).padStart(4, "0")})`;
}

function messageLine(m: KeymanMessage): string {
  return `- ${m.code}${m.line === undefined ? "" : ` (line ${m.line})`}: ${m.text.replace(/\r?\n/g, " ")}`;
}

/**
 * LDML-COMPILE-REPORT.md (FR-072, FR-075): what Keyman's own compiler said about the export, with
 * the two versions that produced the `.kmx`. It ships in the `.kmp` download only; the source
 * export's `LDML-EXPORT-REPORT.md` is unchanged (FR-030). Always English, no timestamp.
 */
export function renderCompileReport(i: CompileReportInput): string {
  const out: string[] = ["# LDML compile report", ""];
  out.push(`- Compiler: Keyman kmc-ldml ${i.compilerVersion}.`);
  out.push(`- KMX+ file version written by the compiler: ${kmxVersionText(i.kmxPlusVersion)}.`);
  out.push("- Delivery: this package is desktop-only until Keyman can load LDML keyboards on web and mobile.", "");

  out.push("## Known Keyman limitations", "");
  if (i.expected.length === 0) out.push("None.", "");
  else {
    for (const e of i.expected) out.push(`- Row ${e.row.id} (${e.row.form}): ${messageLine(e.message).slice(2)}`);
    out.push("");
  }
  out.push("## Exporter defects", "");
  if (i.unexpected.length === 0) out.push("None.", "");
  else {
    out.push("Keyman raised these errors and no known Keyman limitation accounts for them. They are exporter defects.", "");
    for (const m of i.unexpected) out.push(messageLine(m));
    out.push("");
  }
  out.push("## Warnings and hints", "");
  if (i.warnings.length === 0) out.push("None.", "");
  else {
    for (const m of i.warnings) out.push(messageLine(m));
    out.push("");
  }
  return out.join("\n");
}
