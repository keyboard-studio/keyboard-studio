// Test-only harness H3: validates an LDML keyboard document against the vendored CLDR
// ldmlKeyboard3.xsd. Never import this from product code.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateXML } from "xmllint-wasm";

export type CldrConformsTo = "46" | "49";

const HERE = dirname(fileURLToPath(import.meta.url));

const schemaCache = new Map<string, string>();

function loadSchema(conformsTo: CldrConformsTo): string {
  let xsd = schemaCache.get(conformsTo);
  if (xsd === undefined) {
    xsd = readFileSync(join(HERE, "cldr", conformsTo, "ldmlKeyboard3.xsd"), "utf8");
    schemaCache.set(conformsTo, xsd);
  }
  return xsd;
}

/** The vendored XSD has no targetNamespace, so the default xmlns must go first. */
export function stripDefaultNamespace(xml: string): string {
  return xml.replace(/(<keyboard3\b[^>]*?)\s+xmlns\s*=\s*("[^"]*"|'[^']*')/, "$1");
}

export interface XsdError {
  message: string;
  line?: number | undefined;
}

/** Returns the XSD validity errors; an empty array means the document is valid. */
export async function validateAgainstCldr(
  xml: string,
  conformsTo: CldrConformsTo,
): Promise<XsdError[]> {
  const result = await validateXML({
    xml: [{ fileName: "keyboard.xml", contents: stripDefaultNamespace(xml) }],
    schema: [{ fileName: "ldmlKeyboard3.xsd", contents: loadSchema(conformsTo) }],
  });
  if (result.valid) return [];
  return result.errors.map((e) => ({
    message: e.message,
    line: e.loc?.lineNumber,
  }));
}
