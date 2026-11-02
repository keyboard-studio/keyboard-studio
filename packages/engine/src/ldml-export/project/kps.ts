// Minimal Keyman package file for the LDML export (spec 108 FR-040; task T036).
// Name, version and copyright `<Info>`, `<Keyboards>` with the languages, and `<Files>`
// listing the compiled `.kmx` and `.kvk`. The full metadata, documents, icon and fonts
// are added with the package files (user story 3).

import type { LdmlExportMetadata } from "../types.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function file(name: string, type: string): string {
  return `    <File>
      <Name>${esc(name)}</Name>
      <Description></Description>
      <CopyLocation>0</CopyLocation>
      <FileType>${type}</FileType>
    </File>`;
}

export interface KpsInput {
  /** `<kmnid>_ldml`. */
  id: string;
  /** Normalised semver. */
  version: string;
  metadata: LdmlExportMetadata;
  /** Minimal language tags. */
  languages: readonly string[];
}

export function renderKps(i: KpsInput): string {
  const m = i.metadata;
  const langs = i.languages.map((l) => `        <Language ID="${esc(l)}">${esc(l)}</Language>`).join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<Package>
  <System>
    <KeymanDeveloperVersion>19.0.0.0</KeymanDeveloperVersion>
    <FileVersion>7.0</FileVersion>
  </System>
  <Options>
    <ExecuteProgram></ExecuteProgram>
    <MSIFileName></MSIFileName>
    <MSIOptions></MSIOptions>
    <FollowKeyboardVersion/>
  </Options>
  <StartMenu>
    <Folder></Folder>
    <Items/>
  </StartMenu>
  <Info>
    <Name URL="">${esc(m.name)}</Name>
    <Copyright URL="">${esc(m.copyright)}</Copyright>
    <Author URL="${esc(m.authorEmail ? `mailto:${m.authorEmail}` : "")}">${esc(m.author)}</Author>
    <Version URL="">${esc(i.version)}</Version>
  </Info>
  <Files>
${file(`..\\build\\${i.id}.kmx`, ".kmx")}
${file(`..\\build\\${i.id}.kvk`, ".kvk")}
  </Files>
  <Keyboards>
    <Keyboard>
      <Name>${esc(m.name)}</Name>
      <ID>${esc(i.id)}</ID>
      <Version>${esc(i.version)}</Version>
      <Languages>
${langs}
      </Languages>
    </Keyboard>
  </Keyboards>
  <Strings/>
</Package>
`;
}
