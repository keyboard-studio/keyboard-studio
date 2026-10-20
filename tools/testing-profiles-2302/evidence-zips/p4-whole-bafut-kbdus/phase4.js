// ZIP PASS phase 4 — from the post-gallery state, go to the Output tab and
// download the keyboard package .zip. Reading + clicking only; the download
// is saved by the driver-visible path /home/hatch/workspace/ks-2302-zips/tools/testing-profiles-2302/zips/p4-whole-bafut-kbdus.zip (absolute).
// Emits WALKJSON:{downloaded, suggestedFilename, sizeBytes, blockedText, errors}
async (page) => {
  const P = {"id":"p4-whole-bafut-kbdus","profile":4,"backspace":"whole","backspaceOnDiagonal":false,"inputOrder":"prefix","outputForm":"base-plus-mark","lang":"bafut","base":"basic_kbdus","english":"Bafut","autonym":"Bafut","code":"bfd","overwriteChar":"ŋ","overwriteKey":"K_X","sampleText":"Àà Áá Ââ Èè Éé Êê Ìì Íí Îî Òò Óó Ôô Ùù Úú Ûû ə̀ ə́ ɛ́ ɛ̂ ɔ́ ɔ̂ ŋ̂ à â ǎ è ê ě ì î ò ô ù û ə̀ ə̂ ɛ́ ɛ̂ ɔ́ ɔ̂ ŋ̂ ɨ̀"};
  const out = { phase: 4, downloaded: false, suggestedFilename: null, errors: [] };
  const bodyText = async () => (await page.locator("body").innerText().catch(() => "")) || "";
  try {
    // If the touch-layout seed confirm is still up, confirm it first so the
    // flow is past the gallery tail before switching tabs.
    const seed = page.getByTestId("seed-source-confirm");
    if (await seed.isVisible().catch(() => false)) {
      await seed.click().catch(() => {});
      await page.waitForTimeout(1500);
    }
    // Navigate to Output the way an author does (nav link), per e2e helper.
    await page.click('a[href="#output"]', { timeout: 30000 });
    await page.waitForSelector('[data-testid="output-screen-root"]', { timeout: 30000 });
    out.outputReached = true;
    const btn = page.getByTestId("emit-download");
    await btn.waitFor({ state: "visible", timeout: 60000 });
    // Compile can take a while; poll the disabled state up to ~3 minutes.
    let enabled = false;
    for (let i = 0; i < 36; i++) {
      if (!(await btn.isDisabled().catch(() => true))) { enabled = true; break; }
      await page.waitForTimeout(5000);
    }
    out.downloadEnabled = enabled;
    if (!enabled) {
      out.blockedText = (await bodyText()).slice(0, 1200);
      out.errors.push("emit-download stayed disabled");
    } else {
      const [dl] = await Promise.all([
        page.waitForEvent("download", { timeout: 120000 }),
        btn.click(),
      ]);
      out.suggestedFilename = dl.suggestedFilename();
      await dl.saveAs("/home/hatch/workspace/ks-2302-zips/tools/testing-profiles-2302/zips/p4-whole-bafut-kbdus.zip");
      out.downloaded = true;
    }
  } catch (e) {
    out.errors.push(String(e && e.message ? e.message : e).slice(0, 800));
    try { out.bodyExcerpt = (await bodyText()).slice(0, 1500); } catch {}
  }
  return "WALKJSON:" + encodeURIComponent(JSON.stringify(out));
}
