// Places the KMN package's documents, icon and fonts into the LDML project (spec 108 FR-040;
// export-package.md). The content is the projected working copy's own, unchanged; empty text
// means the keyboard has no such document and nothing is written.

import type { LdmlPackageFiles } from "../types.js";

/** What the package descriptor can list, relative to `source/`. */
export interface PackageMembers {
  readme: boolean;
  welcome: boolean;
  license: boolean;
  /** Bare file name under `source/`, or null. */
  icon: string | null;
  /** Bare file names under `source/`, sorted. */
  fonts: readonly string[];
}

/** The bare file name of a path: the project keeps these flat under `source/`. */
function bare(name: string): string {
  return name.replace(/\\/g, "/").split("/").pop() ?? name;
}

/**
 * Adds the document entries to `files`, in path order (the `toZip` order is the insertion order
 * within a group), and reports which of them the descriptor may list.
 */
export function placePackageDocs(
  files: Map<string, string | Uint8Array>,
  pf: LdmlPackageFiles,
): PackageMembers {
  const readme = pf.readmeHtm !== "";
  const welcome = pf.welcomeHtm !== "";
  const icon = pf.icon === null ? null : bare(pf.icon.name);
  const fontEntries = [...pf.fonts].map((f) => ({ name: bare(f.name), bytes: f.bytes }));
  fontEntries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const fonts: string[] = [];
  for (const f of fontEntries) if (!fonts.includes(f.name) && f.name !== icon) fonts.push(f.name);

  const source: Array<[string, string | Uint8Array]> = [];
  if (readme) source.push(["source/readme.htm", pf.readmeHtm]);
  if (welcome) source.push(["source/welcome.htm", pf.welcomeHtm]);
  if (pf.icon !== null && icon !== null) source.push([`source/${icon}`, pf.icon.bytes]);
  for (const f of fonts) source.push([`source/${f}`, fontEntries.find((e) => e.name === f)!.bytes]);
  source.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [path, content] of source) files.set(path, content);

  return { readme, welcome, license: pf.licenseMd !== "", icon, fonts };
}

/** The root-level texts (`LICENSE.md`, `README.md`, `HISTORY.md`), when present. */
export function placeRootTexts(files: Map<string, string | Uint8Array>, pf: LdmlPackageFiles): void {
  if (pf.historyMd !== "") files.set("HISTORY.md", pf.historyMd);
  if (pf.licenseMd !== "") files.set("LICENSE.md", pf.licenseMd);
  if (pf.readmeMd !== "") files.set("README.md", pf.readmeMd);
}
