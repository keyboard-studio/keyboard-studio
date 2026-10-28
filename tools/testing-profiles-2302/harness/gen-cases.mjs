import { writeFileSync } from "node:fs";
const LANGS = {
  bafut: { english: "Bafut", autonym: "Bafut", code: "bfd" },
  ewondo: { english: "Ewondo", autonym: "Ewondo", code: "ewo" },
};
const BASES = [
  { lang: "bafut", base: "sil_cameroon_qwerty", tag: "bafut-camqwerty" },
  { lang: "ewondo", base: "sil_cameroon_azerty", tag: "ewondo-camqwerty".replace("qwerty", "azerty") },
  { lang: "bafut", base: "basic_kbdus", tag: "bafut-kbdus" },
  { lang: "ewondo", base: "basic_kbdfr", tag: "ewondo-kbdfr" },
];
const PROFILES = [
  { p: 1, inputOrder: "postfix", outputForm: "base-plus-mark", onDiagBackspace: "unwrap" },
  { p: 2, inputOrder: "prefix", outputForm: "ready-made", onDiagBackspace: "whole" },
  { p: 3, inputOrder: "postfix", outputForm: "ready-made", onDiagBackspace: "whole" },
  { p: 4, inputOrder: "prefix", outputForm: "base-plus-mark", onDiagBackspace: "unwrap" },
];
const SAMPLE = "Àà Áá Ââ Èè Éé Êê Ìì Íí Îî Òò Óó Ôô Ùù Úú Ûû ə̀ ə́ ɛ́ ɛ̂ ɔ́ ɔ̂ ŋ̂ "
  + "a\u0300 a\u0302 a\u030C e\u0300 e\u0302 e\u030C i\u0300 i\u0302 o\u0300 o\u0302 u\u0300 u\u0302 "
  + "\u0259\u0300 \u0259\u0302 \u025B\u0301 \u025B\u0302 \u0254\u0301 \u0254\u0302 \u014B\u0302 \u0268\u0300";
const cases = [];
for (const b of BASES) for (const pr of PROFILES) for (const bs of ["whole", "unwrap"]) {
  cases.push({
    id: `p${pr.p}-${bs}-${b.tag}`,
    profile: pr.p, backspace: bs, backspaceOnDiagonal: pr.onDiagBackspace === bs,
    inputOrder: pr.inputOrder, outputForm: pr.outputForm,
    lang: b.lang, base: b.base, ...LANGS[b.lang],
    overwriteChar: "ŋ", overwriteKey: "K_X", sampleText: SAMPLE,
  });
}
writeFileSync(new URL("./cases.json", import.meta.url), JSON.stringify(cases, null, 2));
console.log(cases.length + " cases");
