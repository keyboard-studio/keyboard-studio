// Compile a spec 117 corpus-set keyboard in Node (T011, T027). Test-only.
//
// The minimal VirtualFS holds no &LAYOUTFILE / &BITMAP / &VISUALKEYBOARD files,
// and kmcmplib emits nothing when a store names a file it cannot open, so the
// asset stores are dropped first (the same strip facet-transform/verify.ts and
// the normalisation parity corpus suite use). Assets never affect rule
// behaviour, which is all these suites look at.
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { CompileResult, KeyboardIR } from "@keyboard-studio/contracts";
import { parse } from "../../codec/parse.js";
import { compile } from "../../compiler/index.js";
import { stripDanglingAssetStores } from "../../compiler/stripDanglingAssetStores.js";
import { loadCorpusKmn } from "./corpusSet.js";

export interface CorpusKeyboardBuild {
  id: string;
  /** The asset-stripped source the IR was parsed from and the compile used. */
  kmn: string;
  ir: KeyboardIR;
  compiled: CompileResult;
}

/** Drop asset stores, including the ones some keyboards declare inside a group. */
export function stripAssetStores(raw: string): string {
  const stripped = stripDanglingAssetStores(raw, createVirtualFS([])).kmn;
  return stripped.replace(/^[ \t]*store\(&(?:LAYOUTFILE|VISUALKEYBOARD|BITMAP|KMW_HELPFILE|KMW_EMBEDJS)\).*$/gim, "c");
}

/** Parse and compile one corpus keyboard; throws when it is missing from the checkout. */
export async function buildCorpusKeyboard(id: string): Promise<CorpusKeyboardBuild> {
  const raw = loadCorpusKmn(id);
  if (raw === undefined) throw new Error(`${id} is not in the corpus checkout`);
  const kmn = stripAssetStores(raw);
  const ir = parse(kmn, id).ir;
  const compiled = await compile(
    createVirtualFS([{ path: `source/${id}.kmn`, content: kmn, isBinary: false }]),
    id,
  );
  return { id, kmn, ir, compiled };
}
