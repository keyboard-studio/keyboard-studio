/**
 * The assets the Documentation step's "as installed" preview needs: the
 * working copy projected exactly as the download projects it (the shell
 * supplies `projectWorkingCopyForOutput` through DocPreviewProjectionContext —
 * see that module for why it cannot be imported here), so generated layout
 * charts and the welcome folder's files match what ships. Projected once per
 * mount — editing the docs changes only the document text, never these files.
 *
 * Display only: reads the store through the projection, writes nothing.
 */

import { useContext, useEffect, useState } from "react";
import type { VirtualFS } from "@keyboard-studio/contracts";
import { DocPreviewProjectionContext } from "../lib/docPreviewProjection.ts";
import { rewriteCssUrls, type AssetLookup } from "../lib/docPreviewDocument.ts";
import { FLAT_WELCOME_PATH, WELCOME_PAGE_PATH } from "../lib/welcomeFolder.ts";

export interface DocPreviewAssets {
  lookup: AssetLookup;
  welcomePath: string | null;
  helpCssPaths: string[];
  ready: boolean;
}

const NONE: AssetLookup = () => undefined;
const EMPTY: DocPreviewAssets = { lookup: NONE, welcomePath: null, helpCssPaths: [], ready: false };

/** Sources and documents, never fetched by a page as a subresource. */
const SKIPPED_EXT = new Set(["kmn", "kps", "kpj", "htm", "html", "php", "md"]);

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  webp: "image/webp",
  css: "text/css",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
};

function extOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot < 0 ? "" : path.slice(dot + 1).toLowerCase();
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function dataUrl(mime: string, content: Uint8Array | string): string {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  return `data:${mime};base64,${toBase64(bytes)}`;
}

/**
 * Build the lookup from a projected VFS. Encoding is lazy and cached: a file
 * becomes a `data:` URL only when a page first references it, so a keyboard
 * that ships large fonts or other files the page never loads pays nothing for
 * them. A stylesheet's own `url()` refs are resolved (against its folder)
 * when it is first looked up.
 */
export function docPreviewAssetsFrom(vfs: VirtualFS): DocPreviewAssets {
  const raw = new Map<string, Uint8Array | string>();
  for (const entry of vfs.entries()) {
    if (!SKIPPED_EXT.has(extOf(entry.path))) raw.set(entry.path, entry.content);
  }
  const urls = new Map<string, string | undefined>();
  const lookup: AssetLookup = (path) => {
    if (urls.has(path)) return urls.get(path);
    const content = raw.get(path);
    if (content === undefined) return undefined;
    const ext = extOf(path);
    if (ext !== "css") {
      const url = dataUrl(MIME[ext] ?? "application/octet-stream", content);
      urls.set(path, url);
      return url;
    }
    urls.set(path, undefined); // a stylesheet that refers back to itself resolves to nothing
    const text = typeof content === "string" ? content : new TextDecoder().decode(content);
    const url = dataUrl("text/css", rewriteCssUrls(text, path.slice(0, path.lastIndexOf("/") + 1), lookup));
    urls.set(path, url);
    return url;
  };
  const welcomePath = vfs.get(WELCOME_PAGE_PATH) !== undefined
    ? WELCOME_PAGE_PATH
    : vfs.get(FLAT_WELCOME_PATH) !== undefined
      ? FLAT_WELCOME_PATH
      : null;
  const helpCssPaths = vfs
    .list("source/help/")
    .filter((p) => extOf(p) === "css" && !p.slice("source/help/".length).includes("/"))
    .sort();
  return { lookup, welcomePath, helpCssPaths, ready: true };
}

export function useDocPreviewAssets(): DocPreviewAssets {
  const project = useContext(DocPreviewProjectionContext);
  const [assets, setAssets] = useState<DocPreviewAssets>(EMPTY);
  useEffect(() => {
    if (project === null) return;
    let live = true;
    void project()
      .then((projected) => {
        if (live && projected !== null) setAssets(docPreviewAssetsFrom(projected.vfs));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [project]);
  return assets;
}
