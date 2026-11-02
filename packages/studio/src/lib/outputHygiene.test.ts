import { describe, expect, it } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";

import {
  applyOutputHygiene,
  stampKpjFormatVersion,
  stripCopyrightYearsFromKmn,
  stripCopyrightYearsFromKps,
} from "./outputHygiene.ts";
import { readVfsText } from "./vfsText.ts";

const KPJ_NO_VERSION =
  '<?xml version="1.0" encoding="utf-8"?>\n<KeymanDeveloperProject>\n  <Options>\n    <BuildPath>$PROJECTPATH\build</BuildPath>\n  </Options>\n</KeymanDeveloperProject>\n';

describe("stampKpjFormatVersion (criterion 1.10b)", () => {
  it("adds <Version>2.0</Version> to a project with none", () => {
    const out = stampKpjFormatVersion(KPJ_NO_VERSION);
    expect(out).toContain("<Options>\n    <Version>2.0</Version>\n    <BuildPath>");
  });

  it("leaves a project that declares a version byte-identical", () => {
    const kpj = KPJ_NO_VERSION.replace("<Options>", "<Options>\n    <Version>2.0</Version>");
    expect(stampKpjFormatVersion(kpj)).toBe(kpj);
    const older = KPJ_NO_VERSION.replace("<Options>", "<Options>\n    <Version>1.0</Version>");
    expect(stampKpjFormatVersion(older)).toBe(older);
  });

  it("replaces an empty <Version> instead of duplicating it", () => {
    const out = stampKpjFormatVersion(KPJ_NO_VERSION.replace("<Options>", "<Options><Version></Version>"));
    expect(out.match(/<Version>/g)).toHaveLength(1);
    expect(out).toContain("<Version>2.0</Version>");
  });

  it("keeps CRLF line endings", () => {
    const out = stampKpjFormatVersion(KPJ_NO_VERSION.replace(/\n/g, "\r\n"));
    expect(out).toContain("<Options>\r\n    <Version>2.0</Version>");
  });

  it("leaves a file with no <Options> block alone", () => {
    expect(stampKpjFormatVersion("<x/>")).toBe("<x/>");
  });
});

describe("copyright year stripping (criterion 4.6b)", () => {
  it("strips a year range from store(&COPYRIGHT)", () => {
    expect(stripCopyrightYearsFromKmn("store(&COPYRIGHT) '\u00a9 2017-2025 Prof. A B'\n")).toBe(
      "store(&COPYRIGHT) '\u00a9 Prof. A B'\n",
    );
    expect(stripCopyrightYearsFromKmn('store(&COPYRIGHT) "Copyright (C) 2021 Jo"\r\n')).toBe(
      'store(&COPYRIGHT) "Copyright (C) Jo"\r\n',
    );
  });

  it("leaves a year-free copyright and other lines alone", () => {
    const kmn = "c Copyright note\nstore(&COPYRIGHT) '\u00a9 Jo'\nstore(&NAME) 'Layout 2000'\n";
    expect(stripCopyrightYearsFromKmn(kmn)).toBe(kmn);
  });

  it("strips the year from the .kps <Copyright> element only", () => {
    const kps = "<Info><Copyright URL=\"\">\u00a9 2020, 2022 Jo</Copyright><Name>Kb 2020</Name></Info>";
    expect(stripCopyrightYearsFromKps(kps)).toBe(
      "<Info><Copyright URL=\"\">\u00a9 Jo</Copyright><Name>Kb 2020</Name></Info>",
    );
  });

  it("applyOutputHygiene rewrites the kpj, kmn and kps of the output id", () => {
    const vfs = createVirtualFS();
    vfs.set("k.kpj", KPJ_NO_VERSION, false);
    vfs.set("source/k.kmn", "store(&COPYRIGHT) '\u00a9 2017-2025 Jo'\n", false);
    vfs.set("source/k.kps", "<Copyright>\u00a9 2017 Jo</Copyright>", false);
    applyOutputHygiene(vfs, "k");
    expect(readVfsText(vfs, "k.kpj")).toContain("<Version>2.0</Version>");
    expect(readVfsText(vfs, "source/k.kmn")).toBe("store(&COPYRIGHT) '\u00a9 Jo'\n");
    expect(readVfsText(vfs, "source/k.kps")).toBe("<Copyright>\u00a9 Jo</Copyright>");
  });
});

describe("carried copyright (issue #2281)", () => {
  const CARRIED = "\u00a9 2008-2020 SIL International";

  it("stripCopyrightYearsFromKmn leaves the starting point's line byte-identical", () => {
    const kmn = `store(&COPYRIGHT) '${CARRIED}'\nstore(&NAME) 'US Basic'\n`;
    expect(stripCopyrightYearsFromKmn(kmn, CARRIED)).toBe(kmn);
  });

  it("still strips a session-authored line that differs from the carried one", () => {
    expect(stripCopyrightYearsFromKmn("store(&COPYRIGHT) '\u00a9 2017-2025 Prof. A B'\n", CARRIED)).toBe(
      "store(&COPYRIGHT) '\u00a9 Prof. A B'\n",
    );
  });

  it("applyOutputHygiene carries the start line but still stamps the kpj and kps", () => {
    const vfs = createVirtualFS();
    vfs.set("k.kpj", KPJ_NO_VERSION, false);
    vfs.set("source/k.kmn", `store(&COPYRIGHT) '${CARRIED}'\n`, false);
    vfs.set("source/k.kps", "<Copyright>\u00a9 2017 Jo</Copyright>", false);
    applyOutputHygiene(vfs, "k", { carriedCopyright: CARRIED });
    expect(readVfsText(vfs, "k.kpj")).toContain("<Version>2.0</Version>");
    expect(readVfsText(vfs, "source/k.kmn")).toBe(`store(&COPYRIGHT) '${CARRIED}'\n`);
    expect(readVfsText(vfs, "source/k.kps")).toBe("<Copyright>\u00a9 Jo</Copyright>");
  });
});
