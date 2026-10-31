// [SCAFFOLD] Dev-only Vite plugin — exposes the sibling keymanapp/keyboards
// clone directly via the dev server. Not used in production builds.
//
// Two endpoints:
//   GET /local-kbd-api/list
//     -> JSON StartKeyboard[]; one entry per <vendor>/<id> directory that
//        contains source/<id>.kmn.
//   /local-kbd-proxy/<release-tree-path>
//     -> serves the file at <repoRoot>/<release-tree-path>.
//
// The scan parses each keyboard's source/<id>.kmn header for
// store(&NAME) and store(&VERSION). Script comes from the committed facet
// index's content-derived `script` facet, falling back to the .kps declared
// BCP47 tags, then "Latn" (see scripts/facet-script-lookup.mjs).

import type { Plugin } from "vite";
import * as fs from "node:fs";
import * as path from "node:path";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { loadFacetScripts } from "../scripts/facet-script-lookup.mjs";
import { defaultFacetIndexPath, readCatalogEntry } from "./keyboardCatalog.ts";

export interface LocalKeyboardsOptions {
  /** Absolute path to the keymanapp/keyboards clone root. */
  keyboardsRepoRoot: string;
  /**
   * Absolute path to the committed keyboard facet index. Defaults to this
   * repo's docs/keyboard-facet-index.json.
   */
  facetIndexPath?: string;
}

/**
 * Repository tiers the catalog enumerates. Spec 084 Batch 3 (criterion
 * 1.5): the duplicate-ID verdict compares against EVERY catalogued
 * keyboard, and an ID taken in experimental/ or legacy/ is just as
 * taken as one in release/.
 */
const CATALOG_TIERS = ["release", "experimental", "legacy"] as const;

function scan(
  keyboardsRepoRoot: string,
  facetIndexPath: string,
): StartKeyboard[] {
  const facetScripts = loadFacetScripts(facetIndexPath);
  if (facetScripts.size === 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[local-keyboards] no script facets loaded from ${facetIndexPath} — ` +
        "falling back to .kps declared-tag script derivation",
    );
  }
  const out: StartKeyboard[] = [];
  for (const tier of CATALOG_TIERS) {
    const tierDir = path.join(keyboardsRepoRoot, tier);
    if (!fs.existsSync(tierDir)) continue;
    for (const vendor of fs.readdirSync(tierDir)) {
      const vendorDir = path.join(tierDir, vendor);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(vendorDir);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;
      let kbDirs: string[];
      try {
        kbDirs = fs.readdirSync(vendorDir);
      } catch {
        continue;
      }
      for (const id of kbDirs) {
        const kbDir = path.join(vendorDir, id);
        try {
          if (!fs.statSync(kbDir).isDirectory()) continue;
        } catch {
          continue;
        }
        const entry = readCatalogEntry(keyboardsRepoRoot, tier, vendor, id, facetScripts);
        if (entry === null) continue;
        out.push(entry);
      }
    }
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

export function localKeyboardsPlugin(opts: LocalKeyboardsOptions): Plugin {
  let catalogCache: StartKeyboard[] | null = null;
  return {
    name: "local-keyboards",
    configureServer(server) {
      const root = opts.keyboardsRepoRoot;
      const exists = fs.existsSync(root);
      if (!exists) {
        // eslint-disable-next-line no-console
        console.warn(
          `[local-keyboards] repo root ${root} not found — endpoints will return 404`,
        );
      }

      server.middlewares.use("/local-kbd-api/list", (_req, res) => {
        if (!exists) {
          res.statusCode = 404;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              error: `keyboards repo not found at ${root}`,
            }),
          );
          return;
        }
        if (catalogCache === null) {
          catalogCache = scan(
            root,
            opts.facetIndexPath ?? defaultFacetIndexPath(),
          );
          // eslint-disable-next-line no-console
          console.info(
            `[local-keyboards] scanned ${catalogCache.length} keyboards from ${root}`,
          );
        }
        res.setHeader("content-type", "application/json");
        res.setHeader("cache-control", "no-cache");
        res.end(JSON.stringify(catalogCache));
      });

      server.middlewares.use("/local-kbd-proxy", (req, res) => {
        const url = (req.url ?? "").split("?")[0] ?? "";
        if (url === "" || url === "/") {
          res.statusCode = 400;
          res.end("local-kbd-proxy: bare path");
          return;
        }
        const decoded = decodeURIComponent(url);
        const fsPath = path.normalize(path.join(root, decoded));
        // Path-traversal guard. Append a trailing separator so a sibling
        // directory whose name shares the root's prefix (e.g. `<root>-evil`)
        // cannot pass the check, while still allowing the root itself.
        const normalizedRoot = path.normalize(root);
        const rootWithSep = normalizedRoot.endsWith(path.sep)
          ? normalizedRoot
          : normalizedRoot + path.sep;
        if (fsPath !== normalizedRoot && !fsPath.startsWith(rootWithSep)) {
          res.statusCode = 403;
          res.end("forbidden");
          return;
        }
        if (!fs.existsSync(fsPath)) {
          res.statusCode = 404;
          res.end(`not found: ${decoded}`);
          return;
        }
        let s: fs.Stats;
        try {
          s = fs.statSync(fsPath);
        } catch (e) {
          res.statusCode = 500;
          res.end(String(e));
          return;
        }
        if (!s.isFile()) {
          // A directory (or other non-file) at this path. Respond explicitly
          // rather than calling next() — handing the request to Vite's middleware
          // chain can leave it without a terminal handler, hanging the fetch and
          // freezing the preview on "Loading keyboard source...".
          res.statusCode = 404;
          res.end(`not a file: ${decoded}`);
          return;
        }
        const ext = path.extname(fsPath).toLowerCase();
        const mime =
          ext === ".kmn" ||
          ext === ".keyman-touch-layout" ||
          ext === ".kvks" ||
          ext === ".kpj" ||
          ext === ".xml" ||
          ext === ".txt" ||
          ext === ".js" ||
          ext === ".html" ||
          ext === ".htm"
            ? "text/plain; charset=utf-8"
            : "application/octet-stream";
        res.setHeader("content-type", mime);
        res.setHeader("cache-control", "no-cache");
        fs.createReadStream(fsPath).pipe(res);
      });
    },
  };
}
