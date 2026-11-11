/**
 * Corpus timing harness for a .kmn reader: reads every .kmn under the
 * corpus `release/` and `experimental/` trees (skipping node_modules and
 * build directories), times a caller-supplied reader per file, and returns
 * the total, the slowest file, and the per-file timings.
 */
import * as fs from "node:fs";
import * as path from "node:path";

export type ReaderFn = (text: string, keyboardId: string) => unknown;

export interface ReaderTiming {
  fileCount: number;
  totalMs: number;
  slowest: { file: string; ms: number };
  perFile: Array<{ file: string; ms: number }>;
}

const SKIP_DIRS = new Set(["node_modules", "build"]);
const CORPUS_TREES = ["release", "experimental"];

function* walkKmn(dir: string): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) yield* walkKmn(full);
    } else if (e.isFile() && e.name.toLowerCase().endsWith(".kmn")) {
      yield full;
    }
  }
}

/** Time `reader` over every .kmn under `<corpusRoot>/{release,experimental}`. */
export function timeReader(corpusRoot: string, reader: ReaderFn): ReaderTiming {
  const perFile: Array<{ file: string; ms: number }> = [];
  for (const tree of CORPUS_TREES) {
    for (const file of walkKmn(path.join(corpusRoot, tree))) {
      const text = fs.readFileSync(file, "utf8");
      const id = path.basename(file, path.extname(file));
      const start = performance.now();
      try {
        reader(text, id);
      } catch {
        // A throwing reader still costs time; the timing is what is measured.
      }
      perFile.push({ file: path.relative(corpusRoot, file).split(path.sep).join("/"), ms: performance.now() - start });
    }
  }
  let slowest = { file: "", ms: 0 };
  let totalMs = 0;
  for (const p of perFile) {
    totalMs += p.ms;
    if (p.ms > slowest.ms) slowest = p;
  }
  return { fileCount: perFile.length, totalMs, slowest: { ...slowest }, perFile };
}
