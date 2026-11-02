// buildLdmlExport (contracts/exporter-api.md; task T037): resolve the profile, classify, lower,
// serialise, render the report, and assemble the minimal Keyman project package.
//
// Deterministic: the zip is written with a fixed modification time, no clock, locale or
// random source is read, and entries are inserted in a fixed order.

import { createVirtualFS } from "@keyboard-studio/contracts";
import { toZip } from "../output/zip.js";
import { classifyDetailed } from "./classify/classify.js";
import { isMnemonicLayout } from "./classify/header.js";
import { lowerDocument, minimalLocale, normaliseVersion } from "./lower/document.js";
import { resolveLdmlProfile } from "./profiles/resolve.js";
import { renderKpj } from "./project/kpj.js";
import { renderKps } from "./project/kps.js";
import { renderReport } from "./report.js";
import type { LdmlExportInput, LdmlExportResult } from "./types.js";
import { writeKeyboard3 } from "./xml/writeKeyboard3.js";

const PROJECT_ID = /^[a-z_][a-z0-9_]*$/;

export async function buildLdmlExport(input: LdmlExportInput): Promise<LdmlExportResult> {
  const profile = resolveLdmlProfile(input.profileId);
  const meta = input.metadata;
  if (!PROJECT_ID.test(meta.projectId)) {
    throw new Error(`LDML export: project id "${meta.projectId}" does not match ${PROJECT_ID.source}`);
  }
  const detail = classifyDetailed(input, profile, {
    languages: meta.languages,
    attribution: meta.attributionText !== "",
    provenanceRecord: true,
  });
  if (detail.classification.ansiOnly) {
    return { ok: false, reason: "ansi-only", classification: detail.classification };
  }

  const lowered = lowerDocument(input, profile, detail);
  const xml = writeKeyboard3(lowered.doc);
  const version = normaliseVersion(meta.version || input.ir.header.version);
  const id = meta.projectId;
  const report = renderReport(detail.classification, profile, {
    keyboardName: meta.name || input.ir.header.name,
    keyboardId: input.keyboardId,
    version: meta.version || input.ir.header.version,
    mnemonic: isMnemonicLayout(input.ir),
    provenance: lowered.provenance,
  });

  const files = new Map<string, string | Uint8Array>();
  files.set(`${id}.kpj`, renderKpj());
  files.set(`source/${id}.xml`, xml);
  files.set(
    `source/${id}.kps`,
    renderKps({ id, version, metadata: meta, languages: meta.languages.map(minimalLocale) }),
  );
  files.set("LDML-EXPORT-REPORT.md", report);

  const vfs = createVirtualFS();
  for (const [path, content] of files) vfs.set(path, content, typeof content !== "string");
  const zip = await toZip(vfs, { nextSteps: false, fixedMtime: new Date(1980, 0, 1) });

  return {
    ok: true,
    zip,
    filename: `${input.keyboardId}_ldml-${version}.zip`,
    files,
    classification: detail.classification,
  };
}
