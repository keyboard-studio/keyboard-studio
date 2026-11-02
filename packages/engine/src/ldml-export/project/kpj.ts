// Keyman project file for the LDML export (spec 108 FR-040; task T036).
//
// `@keymanapp/kmc-generate` is not an engine dependency, so this writes the same layout its
// `ldml-keyboard` template produces (and the corpus's `khmer_ldml.kpj` uses): a Keyman
// project v2.0 file with no per-file listing, since Keyman Developer finds the sources by folder.

export function renderKpj(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<KeymanDeveloperProject>
  <Options>
    <Version>2.0</Version>
    <CompilerWarningsAsErrors>True</CompilerWarningsAsErrors>
    <CheckFilenameConventions>True</CheckFilenameConventions>
  </Options>
</KeymanDeveloperProject>
`;
}
