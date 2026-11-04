// ldmlExportInputs — the studio-side inputs shared by every caller of the LDML exporter and
// classifier (spec 108). One builder, so the authoring-time findings and the download classify
// with identical options and report the same site keys (SC-005).

import type { ClassifyOptions, LdmlExportMetadata } from "@keyboard-studio/engine";
import packageJson from "../../package.json";

/** The studio build the export comment names. Read from the package, never the clock. */
export const LDML_STUDIO_VERSION: string = packageJson.version;

/**
 * The classify options the download path hands the engine: `buildLdmlExport` derives exactly
 * these from the metadata. Any studio caller of `classifyForLdml` must use this, not its own
 * literal, so rows 4.10, 4.16 and 4.17 cannot diverge between the findings and the report.
 */
export function ldmlClassifyOptions(
  metadata: Pick<LdmlExportMetadata, "languages" | "attributionText">,
): ClassifyOptions {
  return {
    languages: metadata.languages,
    attribution: metadata.attributionText !== "",
    provenanceRecord: true,
  };
}
