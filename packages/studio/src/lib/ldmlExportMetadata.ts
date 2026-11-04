// ldmlExportMetadata: the metadata and package files the LDML export carries (spec 108 US3).
//
// Every value is read from the same sources the KMN package descriptor reads (identity,
// attribution, help-docs answers, the inherited holders, the projected tree), so the two exports
// cannot disagree about who made the keyboard. Pure: no store access and no clock.

import { effectiveHolder } from "@keyboard-studio/contracts";
import type { Attribution, HelpDocsAnswers, VirtualFS } from "@keyboard-studio/contracts";
import { resolveInheritedHolders } from "@keyboard-studio/engine";
import type { LdmlExportMetadata, LdmlPackageBinaryFile, LdmlPackageFiles } from "@keyboard-studio/engine";
import type { WorkingCopyState } from "../stores/workingCopyStore.ts";
import { WELCOME_PAGE_PATH, FLAT_WELCOME_PATH } from "./welcomeFolder.ts";
import { readVfsText } from "./vfsText.ts";

/** The working-copy slices the metadata reads. */
export type LdmlMetadataState = Pick<
  WorkingCopyState,
  | "identity"
  | "attribution"
  | "helpDocs"
  | "startKeyboard"
  | "startIr"
  | "startLicenseText"
  | "startHolderOverride"
  | "instantiationMode"
>;

/** What the projection says about the output: the id, display name and release version. */
export interface LdmlProjectedIdentity {
  keyboardId: string;
  displayName: string;
  version: string;
  vfs: VirtualFS;
}

/** The language tags the export declares: the identity's, else the start keyboard's. */
export function ldmlMetadataLanguages(state: Pick<LdmlMetadataState, "identity" | "startKeyboard">): string[] {
  const bcp47 = state.identity?.bcp47;
  if (bcp47 !== undefined && bcp47 !== "") return [bcp47];
  return (state.startKeyboard?.languages ?? []).filter((l) => l !== "");
}

/**
 * The holders line (`attributionText`): the copyright holders inherited from the copied
 * keyboard, resolved by the same helper the package writer uses. A copy keeps them; an
 * adaptation's own licence already names them, so nothing is added there.
 */
export function ldmlAttributionText(
  state: Pick<LdmlMetadataState, "instantiationMode" | "startLicenseText" | "startHolderOverride">,
): string {
  if (state.instantiationMode !== "new-from-base") return "";
  const { inherited } = resolveInheritedHolders(
    state.startLicenseText ?? undefined,
    state.startHolderOverride ?? undefined,
  );
  return inherited.map((h) => h.name.trim()).filter((n) => n !== "").join(", ");
}

function licenceNameOf(licenseMd: string | undefined): string {
  if (licenseMd === undefined) return "";
  return /\bMIT License\b/i.test(licenseMd) ? "MIT" : "";
}

function copyrightOf(attribution: Attribution | null, headerCopyright: string): string {
  const holder = attribution === null ? "" : effectiveHolder(attribution);
  return holder !== "" ? holder : headerCopyright.trim();
}

export function buildLdmlExportMetadata(
  state: LdmlMetadataState,
  projected: LdmlProjectedIdentity,
): LdmlExportMetadata {
  const attribution = state.attribution;
  const help: HelpDocsAnswers | null = state.helpDocs;
  return {
    projectId: `${projected.keyboardId}_ldml`,
    name: projected.displayName,
    version: projected.version,
    languages: ldmlMetadataLanguages(state),
    author: attribution?.authorName.trim() ?? "",
    authorEmail: attribution?.authorEmail?.trim() ?? "",
    copyright: copyrightOf(attribution, state.startIr?.header.copyright ?? ""),
    licenceName: licenceNameOf(readVfsText(projected.vfs, "LICENSE.md")),
    description: help?.description.trim() ?? "",
    homePage: help?.projectHomeUrl?.trim() ?? "",
    attributionText: ldmlAttributionText(state),
    indicator: null,
  };
}

const ICON_EXT = /\.ico$/i;
const FONT_EXT = /\.(ttf|otf|woff2?)$/i;

/** The `<Name>` members of the KMN descriptor's `<Files>`, unescaped, in listed order. */
function listedMembers(kps: string): string[] {
  const files = /<Files>([\s\S]*?)<\/Files>/i.exec(kps)?.[1] ?? "";
  const out: string[] = [];
  for (const m of files.matchAll(/<Name>([^<]*)<\/Name>/gi)) {
    out.push(
      (m[1] ?? "")
        .trim()
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&"),
    );
  }
  return out;
}

/** A descriptor member (relative to `source/`) as a tree path. */
function memberPath(ref: string): string {
  const parts: string[] = ["source"];
  for (const seg of ref.replace(/\\/g, "/").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      // The descriptor climbs to the keyboards-repo root (`..\..\..\shared`), which is the tree
      // root here, so a climb past the root stays at the root.
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join("/");
}

function binaryAt(vfs: VirtualFS, path: string): LdmlPackageBinaryFile | null {
  const entry = vfs.get(path);
  if (entry === undefined) return null;
  const bytes = typeof entry.content === "string" ? new TextEncoder().encode(entry.content) : entry.content;
  return { name: path.split("/").pop() ?? path, bytes };
}

/**
 * The documents, icon and fonts of the projected tree. The icon and fonts are the files the KMN
 * descriptor lists; a listed file the tree does not hold is left out.
 */
export function collectLdmlPackageFiles(projectedVfs: VirtualFS, keyboardId: string): LdmlPackageFiles {
  const kps = readVfsText(projectedVfs, `source/${keyboardId}.kps`) ?? "";
  let icon: LdmlPackageBinaryFile | null = null;
  const fonts: LdmlPackageBinaryFile[] = [];
  for (const ref of listedMembers(kps)) {
    const path = memberPath(ref);
    if (icon === null && ICON_EXT.test(path)) icon = binaryAt(projectedVfs, path);
    else if (FONT_EXT.test(path)) {
      const f = binaryAt(projectedVfs, path);
      if (f !== null) fonts.push(f);
    }
  }
  return {
    readmeHtm: readVfsText(projectedVfs, "source/readme.htm") ?? "",
    welcomeHtm: readVfsText(projectedVfs, WELCOME_PAGE_PATH) ?? readVfsText(projectedVfs, FLAT_WELCOME_PATH) ?? "",
    licenseMd: readVfsText(projectedVfs, "LICENSE.md") ?? "",
    readmeMd: readVfsText(projectedVfs, "README.md") ?? "",
    historyMd: readVfsText(projectedVfs, "HISTORY.md") ?? "",
    icon,
    fonts,
  };
}
