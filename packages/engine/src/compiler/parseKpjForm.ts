// Extract the structural form of a Keyman project file (.kpj): whether
// it is in the current (modern) project-file form or the legacy form.
//
// The structural definition (spec 084 KPJ pair, Matthew's ruling B,
// 2026-10-14 — the numeric version pin is deliberately NOT used):
//
//   MODERN — the project declares its format: an <Options><Version>
//   element is present. Upstream (keymanapp/keyman,
//   common/schemas/kpj/README.md): "KeymanDeveloperProject.Options.
//   Version is currently implicitly always '1.0'. It will be required
//   for version 2.0 and later of the format." The element's presence
//   is the format marker; the 2023-02-27 format-2.0 changelog adds
//   that 'Files' becomes optional (ignored, deleted on load and
//   populated from folder structure) and Options/SourcePath arrives.
//
//   LEGACY — no <Options><Version> element: the format version is the
//   implicit classical 1.0 and the project is Files-driven — a
//   <Files> element enumerates the project members and is load-
//   bearing. Holds whether an <Options> block exists without a
//   Version element or there is no <Options> block at all.
//
// Corpus corroboration (the cached Keyman keyboards corpus, 1,044
// .kpj files, structural scan 2026-10-14): 767 files carry an
// <Options><Version> element (every value "2.0") and NONE of them
// carries a <Files> element; 276 carry <Options> without <Version>
// and ALL of them carry <Files>; 1 carries no <Options> at all (a
// Keyman Developer 9-era file) and carries <Files>. The marker
// separates the corpus exactly.
//
// The value of the Version element is reported (versionElement) but
// never compared against a pinned constant here: criterion 1.10 once
// pinned "10.0", which is the .kvks header version, not any .kpj
// value that occurs (zero corpus files). Callers judging a format
// CHANGE (criterion 2.7) compare two files' states to each other,
// not to a constant.
//
// .kpj is small XML; a regex extract suffices (the parseKpjFlags
// precedent in this folder).

/** The structural facts of one .kpj project file. */
export interface KpjFormFacts {
  /**
   * Trimmed text of the <Options><Version> element, or null when the
   * element is absent — the implicit legacy form (upstream treats a
   * missing element as the classical 1.0 behaviour).
   */
  versionElement: string | null;
  /**
   * Whether the project carries a <Files> element. Load-bearing in
   * the legacy form; ignored/deleted on load in the modern form.
   */
  hasFilesList: boolean;
  /** "modern" when versionElement is present, otherwise "legacy". */
  form: "modern" | "legacy";
}

/**
 * Parse a Keyman project file (.kpj) XML and return its structural
 * form facts. Empty or unrecognisable input yields the legacy form
 * with no marker — absence of the marker is the finding's substance,
 * never an invented marker.
 */
export function parseKpjForm(kpjXml: string): KpjFormFacts {
  const optionsBlock = /<Options(?:\s[^>]*)?>([\s\S]*?)<\/Options>/.exec(
    kpjXml,
  )?.[1];
  let versionElement: string | null = null;
  if (optionsBlock !== undefined) {
    const raw = /<Version(?:\s[^>]*)?>([^<]*)<\/Version>/.exec(optionsBlock);
    if (raw !== null) versionElement = (raw[1] ?? "").trim();
  }
  const hasFilesList = /<Files(?:\s[^>]*)?>/.test(kpjXml);
  return {
    versionElement,
    hasFilesList,
    form: versionElement !== null ? "modern" : "legacy",
  };
}
