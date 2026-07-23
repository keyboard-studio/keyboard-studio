// Ambient type for the gitignored, prebuild-generated codepoint -> Unicode NAME
// table (charnames.generated.json, ~1.4 MB, produced by scripts/codegen-charnames.mjs).
// The JSON is deliberately kept out of git and out of the initial bundle (see the
// sibling .gitignore and charNames.ts), so `tsc --noEmit` would otherwise fail with
// TS2307 on a checkout where `prebuild` / `codegen-charnames` hasn't run. This
// checked-in declaration lets typecheck resolve the dynamic `import(...)` module
// shape without the artifact present; the real JSON is still required at runtime.
declare module "*/charnames.generated.json" {
  const data: Record<string, string>;
  export default data;
}
