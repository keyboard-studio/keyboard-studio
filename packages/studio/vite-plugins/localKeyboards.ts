// Dev-only Vite plugin that exposes the sibling keymanapp/keyboards
// clone (default ../../keyboards relative to repo root) directly via the
// dev server. Two endpoints:
//
//   GET /local-kbd-api/list
//     -> JSON BaseKeyboard[]; one entry per <vendor>/<id> directory in
//        release/ that contains source/<id>.kmn.
//
//   /local-kbd-proxy/<release-tree-path>
//     -> serves the file at <repoRoot>/<release-tree-path>. Used by
//        fetchKeyboardSourceToVfs in local-mode the same way it uses
//        /kbd-proxy in API/GitHub mode.
//
// The scan parses each keyboard's source/<id>.kmn header for
// store(&NAME) and store(&VERSION) so the picker can show real
// display names. script defaults to "Latn"; full detection is a
// follow-up (would need to read .kpj or .keyman-touch-layout for the
// BCP-47 BaseLanguage tag).

import type { Plugin } from "vite";
import * as fs from "node:fs";
import * as path from "node:path";

export interface LocalKeyboardsOptions {
  /** Absolute path to the keymanapp/keyboards clone root. */
  keyboardsRepoRoot: string;
}

interface BaseKeyboardLite {
  id: string;
  path: string;
  script: string;
  targets: string[];
  displayName: string;
  version: string;
  sourceUrl?: string;
}

const STORE_NAME_RE = /^\s*store\s*\(\s*&NAME\s*\)\s*'([^']*)'/im;
const STORE_VERSION_RE = /^\s*store\s*\(\s*&VERSION\s*\)\s*'([^']*)'/im;

function parseKmnMetadata(kmnPath: string): { name: string; version: string } {
  try {
    // .kmn files start ASCII; first 4 KB is enough for the header.
    const fd = fs.openSync(kmnPath, "r");
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, 4096, 0);
    fs.closeSync(fd);
    const head = buf.slice(0, n).toString("utf8");
    const nameMatch = STORE_NAME_RE.exec(head);
    const versionMatch = STORE_VERSION_RE.exec(head);
    return {
      name: nameMatch?.[1] ?? "",
      version: versionMatch?.[1] ?? "1.0",
    };
  } catch {
    return { name: "", version: "1.0" };
  }
}

function scan(keyboardsRepoRoot: string): BaseKeyboardLite[] {
  const releaseDir = path.join(keyboardsRepoRoot, "release");
  if (!fs.existsSync(releaseDir)) return [];
  const out: BaseKeyboardLite[] = [];
  for (const vendor of fs.readdirSync(releaseDir)) {
    const vendorDir = path.join(releaseDir, vendor);
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
      const kmnPath = path.join(kbDir, "source", `${id}.kmn`);
      if (!fs.existsSync(kmnPath)) continue;
      const meta = parseKmnMetadata(kmnPath);
      out.push({
        id,
        path: `release/${vendor}/${id}`,
        script: "Latn", // TODO: derive from .kpj BaseLanguage; default for POC
        targets: ["windows", "macosx", "linux", "web"],
        displayName: meta.name !== "" ? meta.name : id,
        version: meta.version,
        sourceUrl: `https://github.com/keymanapp/keyboards/tree/master/release/${vendor}/${id}`,
      });
    }
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

export function localKeyboardsPlugin(opts: LocalKeyboardsOptions): Plugin {
  let catalogCache: BaseKeyboardLite[] | null = null;
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

      // GET /local-kbd-api/list — return the catalog as JSON.
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
          catalogCache = scan(root);
          // eslint-disable-next-line no-console
          console.info(
            `[local-keyboards] scanned ${catalogCache.length} keyboards from ${root}`,
          );
        }
        res.setHeader("content-type", "application/json");
        res.setHeader("cache-control", "no-cache");
        res.end(JSON.stringify(catalogCache));
      });

      // /local-kbd-proxy/release/<vendor>/<id>/source/<file>
      //   -> <root>/release/<vendor>/<id>/source/<file>
      server.middlewares.use("/local-kbd-proxy", (req, res, next) => {
        const url = (req.url ?? "").split("?")[0] ?? "";
        if (url === "" || url === "/") {
          res.statusCode = 400;
          res.end("local-kbd-proxy: bare path");
          return;
        }
        const decoded = decodeURIComponent(url);
        const fsPath = path.normalize(path.join(root, decoded));
        // Path-traversal guard.
        if (!fsPath.startsWith(path.normalize(root))) {
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
          next();
          return;
        }
        const ext = path.extname(fsPath).toLowerCase();
        const mime =
          ext === ".kmn" || ext === ".keyman-touch-layout" ||
          ext === ".kvks" || ext === ".kpj" || ext === ".xml" ||
          ext === ".txt" || ext === ".js" || ext === ".html" ||
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
