import { describe, expect, it } from "vitest";
import {
  combineTroubleshootingProposals,
  extractBaseHelpTroubleshootingLines,
} from "./baseHelpTroubleshooting.ts";

// Fixtures below are modelled verbatim on real corpus help pages in
// ~/workspace/keyboards-full (trimmed only for length):
//  - basic_kbdinben (release/basic/basic_kbdinben/source/help): the
//    Troubleshooting section carries an HTML comment naming the square-
//    boxes page, a "Fonts" subsection whose only paragraph is the stock
//    guide-link boilerplate, and a "Problem Solving" subsection with one
//    genuine keyboard-specific pair.
//  - gff_amharic (release/gff/gff_amharic/source/help): the section is
//    ONLY the stock guide link plus a contact tail — nothing may survive.
//  - korean_rr (release/k/korean_rr/source/help): symptom <h4>s, each
//    followed by its fix paragraph / checklist; the section ends with a
//    community-site contact tail.
//  - winchus (release/w/winchus/source/help): "Solucionar Problemas" with
//    Problema/Solución tables whose fixes name the base keyboard
//    ("Winchus") — the identity filter must drop those rows.

const KBDINBEN = `<?php
  $pagename = 'Bengali Inscript Keyboard Help';
  require_once('header.php');
?>
<div id="Troubleshooting">
		<!-- How to resolve common issues/difficulties using the keyboard; including link to Square Boxes help page -->

<h2>Troubleshooting</h2>
<h4> Fonts</h4>
<p class='keymanweb'>If you see squares when you type, or the Bengali characters do not appear correctly, please read the <a href="https://help.keyman.com/troubleshooting/#boxes">KeymanWeb troubleshooting guide</a>.</p>

<h4>Problem Solving</h4>
<p>If a vowel does not combine with a consonant, make sure you have typed the consonant first.  Also check that you have not typed another vowel already, or a standalone vowel, or the &#2509; mark.
</p>

</div>
<div id="Resources">
<h2>System Requirements</h2>
<p>It is recommended that you use an English QWERTY hardware keyboard with this keyboard.</p>
</div>`;

const GFF_AMHARIC = `<div id="Troubleshooting">
<h2>Troubleshooting</h2>
<p class='keymanweb'>If the characters you type or those on the On Screen Keyboard do not appear to display correctly, please read the <a target="_blank" href="/troubleshooting/#boxes">KeymanWeb troubleshooting guide</a>.</p>

<p>For any other questions, <a target="_blank" href="https://keyman.com/contact/">contact us</a>.</p>
</div>`;

const KOREAN_RR = `<div id="Troubleshooting">
<h3>Troubleshooting</h3>
<h4 id="no_IME">The IME window is not visible</h4>
<p>If the IME window does not appear when a letter key is typed, then either the site has not been configured to use the web input method, or else the input area cannot accept Korean <b>hanja</b>.</p>

<h4 id="disappeared">After I started typing, the IME window disappeared...</h4>
<p>If the IME window disappears after typing some letters, check:</p>
<ul>
<li>Was the space bar or a punctuation key pressed? If so, the <b>jamo</b> will have been composed as <b>hangeul</b>.</li>
<li>Has the focus been moved to another input area? Moving the focus also causes the IME window to leave the entered text as currently displayed and the pending syllable will stay uncommitted in the editing area below.</li>
</ul>

<p>For any other questions, check our <a target="_blank" href="https://community.example.org/c/keyman">community site</a>.</p>
</div>
<h2>Technical Information</h2>
<h3>System Requirements</h3>
<p>It is recommended that you use an English QWERTY hardware keyboard with this keyboard.</p>`;

const WINCHUS = `<h2 id="solucionar-problemas"><a href="#tabla-de-contenidos">Solucionar Problemas</a></h2>
<h3 id="problemas-celular">Problemas en el dispositivo móvil:</h3>
<table>
<thead><tr><th>Problema</th><th>Solución</th></tr></thead>
<tbody>
<tr>
<td>Las letras que salen no corresponden con las teclas que estoy presionando.</td>
<td>Se ha congelado la imagen del teclado. Cambia a otro teclado y regresa a Winchus. Reinicia el dispositivo.</td>
</tr>
<tr>
<td>Todo el área del teclado se ha puesto toda negra o gris.</td>
<td>Toca el área del teclado en cualquier lado. Asegúrate de que la aplicación del teclado esté actualizada a la versión más reciente disponible.</td>
</tr>
</tbody>
</table>`;

describe("extractBaseHelpTroubleshootingLines", () => {
  it("returns no lines for null / empty / sectionless help text", () => {
    expect(extractBaseHelpTroubleshootingLines(null, { id: "x" })).toEqual([]);
    expect(extractBaseHelpTroubleshootingLines("", { id: "x" })).toEqual([]);
    expect(
      extractBaseHelpTroubleshootingLines(
        "<h2>Welcome</h2><p>Some prose about typing that is comfortably long enough.</p>",
        { id: "x" },
      ),
    ).toEqual([]);
  });

  it("kbdinben: strips the HTML comment, excludes the Fonts subsection and the guide boilerplate, keeps the one real pair", () => {
    const lines = extractBaseHelpTroubleshootingLines(KBDINBEN, {
      id: "basic_kbdinben",
      displayName: "Bengali Inscript",
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("If a vowel does not combine with a consonant");
    expect(lines.join("\n")).not.toMatch(/square|boxes|troubleshooting guide/i);
  });

  it("gff_amharic: a section of pure boilerplate + contact tail yields nothing", () => {
    expect(
      extractBaseHelpTroubleshootingLines(GFF_AMHARIC, {
        id: "gff_amharic",
        displayName: "Amharic",
      }),
    ).toEqual([]);
  });

  it("korean_rr: symptom headings pair with their fix text; the contact tail is dropped; content after the section is excluded", () => {
    const lines = extractBaseHelpTroubleshootingLines(KOREAN_RR, {
      id: "korean_rr",
      displayName: "Korean RR",
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^The IME window is not visible - If the IME window does not appear/);
    expect(lines[1]).toMatch(/^After I started typing, the IME window disappeared/);
    expect(lines[1]).toContain("Was the space bar or a punctuation key pressed?");
    const all = lines.join("\n");
    expect(all).not.toMatch(/community site|System Requirements|QWERTY/i);
  });

  it("winchus: table rows naming the base keyboard are dropped by the identity filter", () => {
    const lines = extractBaseHelpTroubleshootingLines(WINCHUS, {
      id: "winchus",
      displayName: "Winchus",
    });
    // Row 1's fix names "Winchus" (identity) — dropped. Row 2 names no base
    // identity and survives as "symptom - fix".
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^Todo el área del teclado/);
    expect(lines[0]).not.toMatch(/Winchus/);
  });

  it("drops blocks carrying the base id, the base display name, or a stale app/version reference", () => {
    const html = `<h2>Troubleshooting</h2>
<p>The doubled vowel key types the wrong character in winchus phonetic mode - press the vowel once, then the modifier key, and the composed character will appear as expected on screen.</p>
<p>Accents appear one key late on the second row - type the base letter first and wait for the accent preview before continuing to type the rest of the word in the document you are writing.</p>
<p>For Keyman 14.2 users the deadkey preview never appears - upgrade instructions for that release are on the project download page for the older desktop application.</p>
<p>Version 2.0 changed the shift behaviour - hold shift a moment longer when you want the upper row symbols to appear in your text.</p>`;
    const lines = extractBaseHelpTroubleshootingLines(html, {
      id: "winchus",
      displayName: "Winchus",
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Accents appear one key late");
  });

  it("strips PHP blocks before parsing (a PHP block may contain heading-like strings)", () => {
    const html = `<?php $x = "<h2>Troubleshooting</h2><p>PhpOnly symptom text that is long enough to be a candidate line - this fix text lives inside the php block and must never be offered.</p>"; ?>
<h2>Troubleshooting</h2>
<p>The real symptom that authors of this keyboard report most often - the real fix that resolves it for them, written out in full so the line is a usable suggestion.</p>`;
    const lines = extractBaseHelpTroubleshootingLines(html, { id: "x_kbd" });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("The real symptom");
  });

  it("does not treat a table-of-contents link as the section heading", () => {
    const html = `<ul><li><a href="#troubleshooting">Troubleshooting</a></li></ul>
<h2>Welcome</h2>
<p>This welcome paragraph is long and descriptive and mentions common problems people have when they first start typing with an unfamiliar layout.</p>`;
    expect(extractBaseHelpTroubleshootingLines(html, { id: "x_kbd" })).toEqual([]);
  });

  it("caps and de-duplicates the offered lines", () => {
    const pair =
      "<p>The same recurring symptom that keeps being reported by every new user - the same documented fix that has resolved it each time it was reported.</p>";
    const html = `<h2>Troubleshooting</h2>${pair.repeat(12)}`;
    const lines = extractBaseHelpTroubleshootingLines(html, { id: "x_kbd" });
    expect(lines).toHaveLength(1);
  });
});

describe("combineTroubleshootingProposals", () => {
  it("joins facet lines before extracted lines, de-duplicated, undefined when both are empty", () => {
    expect(combineTroubleshootingProposals(undefined, [])).toBeUndefined();
    expect(combineTroubleshootingProposals("Facet line.", [])).toBe("Facet line.");
    expect(combineTroubleshootingProposals(undefined, ["Base line."])).toBe("Base line.");
    expect(
      combineTroubleshootingProposals("Facet line.\nShared line.", ["Shared line.", "Base line."]),
    ).toBe("Facet line.\nShared line.\nBase line.");
  });
});
