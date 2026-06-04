// Extract a subset of Keyman project-file (.kpj) compiler flags as a
// {compilerWarningsAsErrors, warnDeprecatedCode} pair. Per km-keyman
// (#39 cycle 3) these two flags are the ones whose absence causes
// behavioural divergence between an in-browser compile and the prebuilt
// release-tree .js artifact.
//
// .kpj is small XML; a regex extract suffices.

export interface CompilerOptions {
  /** From <CompilerWarningsAsErrors>. Default false. */
  compilerWarningsAsErrors?: boolean;
  /** From <WarnDeprecatedCode>. Default true. */
  warnDeprecatedCode?: boolean;
}

function extractBool(xml: string, tag: string): boolean | undefined {
  const re = new RegExp(`<${tag}\\s*>\\s*(True|False)\\s*<\\/${tag}>`, "i");
  const m = re.exec(xml);
  if (m === null) return undefined;
  return (m[1] ?? "").toLowerCase() === "true";
}

/**
 * Parse a Keyman project file (.kpj) XML and return a CompilerOptions
 * object. Defaults match the .kpj schema (CompilerWarningsAsErrors: false,
 * WarnDeprecatedCode: true). Empty input returns defaults.
 */
export function parseKpjFlags(kpjXml: string): Required<CompilerOptions> {
  return {
    compilerWarningsAsErrors:
      extractBool(kpjXml, "CompilerWarningsAsErrors") ?? false,
    warnDeprecatedCode: extractBool(kpjXml, "WarnDeprecatedCode") ?? true,
  };
}
