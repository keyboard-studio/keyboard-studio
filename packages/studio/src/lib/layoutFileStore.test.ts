// The shared layout-file helpers (`layoutFileStore.ts`), used by the Open
// reseed change (`openApply/touchReseed.ts`, spec 111 T087b) and the Copy
// projection (`projectWorkingCopyVfs` step 4d, issue #2924). These pin the
// helpers' own contract at their shared home; the call sites' tests pin the
// wiring (the reseed change's synthetic cases, the Copy projection's corpus
// cases in `copyLayoutFileStore.test.ts`).

import { describe, expect, it } from "vitest";
import { withLayoutFileStore, withScriptFileEntry } from "./layoutFileStore.ts";

const SID = "tiny";
const SKMN = (extra: string): string =>
  ["store(&VERSION) '10.0'", "store(&NAME) 'Tiny'", "store(&TARGETS) 'any'", ...(extra === "" ? [] : [extra]), "begin Unicode > use(main)", "group(main) using keys", "+ [K_A] > 'a'", ""].join("\r\n");
const SKPS = (withJs: boolean): string =>
  [
    "<Package>",
    "  <Files>",
    "    <File>",
    `      <Name>..\\build\\${SID}.kmx</Name>`,
    "      <FileType>.kmx</FileType>",
    "    </File>",
    ...(withJs ? ["    <File>", `      <Name>..\\build\\${SID}.js</Name>`, "      <FileType>.js</FileType>", "    </File>"] : []),
    "    <File>",
    "      <Name>readme.htm</Name>",
    "      <FileType>.htm</FileType>",
    "    </File>",
    "  </Files>",
    "</Package>",
    "",
  ].join("\r\n");

describe("withLayoutFileStore", () => {
  it("adds the store after the last header store; only that line is new", () => {
    const kmn = SKMN("");
    const named = withLayoutFileStore(kmn, `${SID}.keyman-touch-layout`, SID);
    expect(named).toContain(`store(&TARGETS) 'any'\r\nstore(&LAYOUTFILE) '${SID}.keyman-touch-layout'\r\n`);
    expect(named!.replace(`store(&LAYOUTFILE) '${SID}.keyman-touch-layout'\r\n`, "")).toBe(kmn);
  });

  it("is a no-op when the layout is already named, whatever the case or spacing", () => {
    expect(withLayoutFileStore(SKMN(`store(&LAYOUTFILE) '${SID}.keyman-touch-layout'`), `${SID}.keyman-touch-layout`, SID)).toBeUndefined();
    expect(withLayoutFileStore(SKMN("store( &layoutfile ) 'other.keyman-touch-layout'"), `${SID}.keyman-touch-layout`, SID)).toBeUndefined();
  });

  it("is a no-op when no header store gives a place for it", () => {
    const bare = ["begin Unicode > use(main)", "group(main) using keys", "+ [K_A] > 'a'", ""].join("\r\n");
    expect(withLayoutFileStore(bare, `${SID}.keyman-touch-layout`, SID)).toBeUndefined();
  });
});

describe("withScriptFileEntry", () => {
  it("lists the compiled .js after the .kmx entry; only that entry is new", () => {
    const kps = SKPS(false);
    const listed = withScriptFileEntry(kps, SKMN(""), SID);
    expect(listed).toContain(`${SID}.js</Name>`);
    expect(listed!.replace(/    <File>\r\n      <Name>[^<]*\.js<\/Name>[\s\S]*?<\/File>\r\n/, "")).toBe(kps);
  });

  it("is a no-op when the .js is already listed", () => {
    expect(withScriptFileEntry(SKPS(true), SKMN(""), SID)).toBeUndefined();
  });

  it("adds no .js entry for a desktop-only keyboard", () => {
    expect(withScriptFileEntry(SKPS(false), SKMN("").replace("'any'", "'windows'"), SID)).toBeUndefined();
  });
});
