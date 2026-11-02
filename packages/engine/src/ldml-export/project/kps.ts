// Keyman package file for the LDML export (spec 108 FR-040; tasks T036, T068).
// `<Info>` carries the name, copyright, author, description and web site from the same
// metadata the KMN package reads; `<Keyboards>` lists the languages; `<Files>` lists the
// compiled `.kmx` and `.kvk`, then the readme, welcome, licence, icon and fonts.

import type { LdmlExportMetadata } from "../types.js";
import type { PackageMembers } from "./docs.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** An `<Info>` child, left out when the value is empty (an empty copyright claims no holder). */
function info(tag: string, text: string, url = ""): string {
  return text === "" ? "" : `    <${tag} URL="${esc(url)}">${esc(text)}</${tag}>\n`;
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
  /** The documents, icon and fonts the project carries; absent means none. */
  members?: PackageMembers;
}

export function renderKps(i: KpsInput): string {
  const m = i.metadata;
  const mem = i.members;
  const options = [
    mem?.readme ? "    <ReadMeFile>readme.htm</ReadMeFile>\n" : "",
    mem?.license ? "    <LicenseFile>..\\LICENSE.md</LicenseFile>\n" : "",
    mem?.welcome ? "    <WelcomeFile>welcome.htm</WelcomeFile>\n" : "",
  ].join("");
  const extra: string[] = [];
  if (mem?.readme) extra.push(file("readme.htm", ".htm"));
  if (mem?.welcome) extra.push(file("welcome.htm", ".htm"));
  if (mem?.license) extra.push(file("..\\LICENSE.md", ".md"));
  if (mem?.icon != null) extra.push(file(mem.icon, mem.icon.slice(mem.icon.lastIndexOf(".")).toLowerCase()));
  for (const f of mem?.fonts ?? []) extra.push(file(f, f.slice(f.lastIndexOf(".")).toLowerCase()));
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
${options}    <FollowKeyboardVersion/>
  </Options>
  <StartMenu>
    <Folder></Folder>
    <Items/>
  </StartMenu>
  <Info>
    <Name URL="">${esc(m.name)}</Name>
${info("Copyright", m.copyright)}${info("Author", m.author, m.authorEmail ? `mailto:${m.authorEmail}` : "")}${info("Description", m.description)}${info("WebSite", m.homePage, m.homePage)}    <Version URL="">${esc(i.version)}</Version>
  </Info>
  <Files>
${file(`..\\build\\${i.id}.kmx`, ".kmx")}
${file(`..\\build\\${i.id}.kvk`, ".kvk")}${extra.map((e) => `\n${e}`).join("")}
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

/** FR-074: the compiled package is desktop-only until Keyman loads LDML keyboards on web and mobile. */
export const DESKTOP_ONLY_NOTE =
  "Desktop only: Keyman loads LDML keyboards on desktop only, not yet on web or mobile.";

/**
 * Appends the desktop-only sentence to the descriptor's `<Description>` (adding one when the
 * keyboard has none). Applied on the download path's clone only: the source export's descriptor is
 * unchanged (FR-030, FR-076).
 */
export function markKpsDesktopOnly(kps: string): string {
  const existing = /(<Description URL="[^"]*">)([^<]*)(<\/Description>)/.exec(kps);
  if (existing !== null) {
    const [whole, open, text, close] = existing as unknown as [string, string, string, string];
    return kps.replace(whole, `${open}${text} ${esc(DESKTOP_ONLY_NOTE)}${close}`);
  }
  const anchor = '    <Version URL="">';
  if (!kps.includes(anchor)) throw new Error("LDML descriptor has no <Info> version line");
  return kps.replace(anchor, () => `    <Description URL="">${esc(DESKTOP_ONLY_NOTE)}</Description>\n${anchor}`);
}

/**
 * Adds one documentation member (a file the package carries beside the keyboard) to a rendered
 * descriptor, after the last `<File>`. Used on the download path's clone only (FR-076).
 */
export function addKpsFile(kps: string, name: string, type: string): string {
  const marker = "\n  </Files>";
  const at = kps.indexOf(marker);
  if (at < 0) throw new Error("LDML descriptor has no <Files> list");
  return `${kps.slice(0, at)}\n${file(name, type)}${kps.slice(at)}`;
}
