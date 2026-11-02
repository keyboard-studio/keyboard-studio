// Test helpers shared by the LDML export suites (spec 108 T020).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "../../codec/index.js";
import { buildLdmlExport } from "../package.js";
import { classifyDetailed, classifyForLdml } from "../classify/classify.js";
import { lowerDocument } from "../lower/document.js";
import { writeKeyboard3 } from "../xml/writeKeyboard3.js";
import { resolveLdmlProfile } from "../profiles/resolve.js";
import type {
  LdmlBaseLayout,
  LdmlClassification,
  LdmlExportInput,
  LdmlExportMetadata,
  LdmlExportResult,
  LdmlProfileId,
} from "../types.js";
import { US_BASE } from "./us-base.js";

const here = dirname(fileURLToPath(import.meta.url));

export function fixtureText(name: string): string {
  return readFileSync(join(here, name), "utf8");
}

export function fixtureIr(name: string, id?: string) {
  const keyboardId = id ?? name.replace(/\.kmn$/, "").replace(/[^a-z0-9_]/gi, "_");
  return parse(fixtureText(name), keyboardId).ir;
}

export function metaFor(id: string, over: Partial<LdmlExportMetadata> = {}): LdmlExportMetadata {
  return {
    projectId: `${id}_ldml`,
    name: id,
    version: "1.0",
    languages: ["en"],
    author: "Test Author",
    authorEmail: "",
    copyright: "(c) Test",
    licenceName: "MIT",
    description: "",
    homePage: "",
    attributionText: "",
    indicator: null,
    ...over,
  };
}

const NO_FILES = { readmeHtm: "", welcomeHtm: "", licenseMd: "", readmeMd: "", historyMd: "", icon: null, fonts: [] };

export function exportInput(
  name: string,
  profileId: LdmlProfileId = "46",
  base: LdmlBaseLayout = US_BASE,
  over: Partial<LdmlExportMetadata> = {},
): LdmlExportInput {
  const id = name.replace(/\.kmn$/, "").replace(/[^a-z0-9_]/gi, "_").toLowerCase();
  return {
    ir: fixtureIr(name, id),
    touchLayout: null,
    visualKeyboard: null,
    baseLayout: base,
    profileId,
    keyboardId: id,
    metadata: metaFor(id, over),
    packageFiles: NO_FILES,
    studioVersion: "test",
  };
}

export function exportFixture(
  name: string,
  profileId: LdmlProfileId = "46",
  base: LdmlBaseLayout = US_BASE,
): Promise<LdmlExportResult> {
  return buildLdmlExport(exportInput(name, profileId, base));
}

export function classifyFixture(
  name: string,
  profileId: LdmlProfileId = "46",
  base: LdmlBaseLayout = US_BASE,
): LdmlClassification {
  const input = exportInput(name, profileId, base);
  return classifyForLdml(input, resolveLdmlProfile(profileId), { languages: ["en"] });
}

/** The keyboard3 XML of a successful export. */
export async function xmlOf(name: string, profileId: LdmlProfileId = "46", base: LdmlBaseLayout = US_BASE): Promise<string> {
  const r = await exportFixture(name, profileId, base);
  if (!r.ok) throw new Error(`export refused: ${r.reason}`);
  const key = [...r.files.keys()].find((k) => k.endsWith(".xml"));
  return r.files.get(key as string) as string;
}

const KMN_HEAD = `store(&NAME) 'T'
store(&KEYBOARDVERSION) '1.0'
store(&TARGETS) 'any'
begin Unicode > use(main)
store(vowels) 'aeiou'
store(accented) 'áéíóú'
store(keys) [K_A] [K_B]
store(out) 'xy'
group(main) using keys
`;

/** An export input from KMN rule text appended to a fixed header (id `t`). */
export function inputFromRules(rules: string, base: LdmlBaseLayout = US_BASE, extra = ""): LdmlExportInput {
  const ir = parse(extra + KMN_HEAD + rules, "t").ir;
  return {
    ir,
    touchLayout: null,
    visualKeyboard: null,
    baseLayout: base,
    profileId: "46",
    keyboardId: "t",
    metadata: metaFor("t"),
    packageFiles: NO_FILES,
    studioVersion: "test",
  };
}

/** The lowered document for KMN rule text. */
export function lowerRules(rules: string, base: LdmlBaseLayout = US_BASE, extra = "") {
  const input = inputFromRules(rules, base, extra);
  const profile = resolveLdmlProfile("46");
  const detail = classifyDetailed(input, profile, { languages: ["en"] });
  return { input, detail, low: lowerDocument(input, profile, detail), xml: writeKeyboard3(lowerDocument(input, profile, detail).doc) };
}
