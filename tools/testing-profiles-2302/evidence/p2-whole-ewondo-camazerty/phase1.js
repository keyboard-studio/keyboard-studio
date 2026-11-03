async page => {
  const P = {"id":"p2-whole-ewondo-camazerty","profile":2,"backspace":"whole","backspaceOnDiagonal":true,"inputOrder":"prefix","outputForm":"ready-made","lang":"ewondo","base":"sil_cameroon_azerty","english":"Ewondo","autonym":"Ewondo","code":"ewo","overwriteChar":"ŋ","overwriteKey":"K_X","sampleText":"Àà Áá Ââ Èè Éé Êê Ìì Íí Îî Òò Óó Ôô Ùù Úú Ûû ə̀ ə́ ɛ́ ɛ̂ ɔ́ ɔ̂ ŋ̂ à â ǎ è ê ě ì î ò ô ù û ə̀ ə̂ ɛ́ ɛ̂ ɔ́ ɔ̂ ŋ̂ ɨ̀"};
  const out = { phase: 1, steps: [], errors: [] };
  const step = (name, ok, extra) => out.steps.push({ name, ok, ...(extra || {}) });
  const vis = async (loc, ms) => loc.waitFor({ state: "visible", timeout: ms }).then(() => true).catch(() => false);
  const adv = () => page.getByTestId("survey-advance");
  const go = async () => { await adv().click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(500); };
  const advEnabled = async (ms) => page.waitForFunction(() => { const b = document.querySelector('[data-testid="survey-advance"]'); return !!b && !b.disabled; }, null, { timeout: ms }).then(() => true).catch(() => false);
  async function fillCombo(sel, value) {
    await page.waitForSelector(sel, { timeout: 150000 });
    await page.fill(sel, value);
    await page.press(sel, "Escape");
  }
  async function selectMenu(trigger, value) {
    await trigger.waitFor({ timeout: 15000 });
    await trigger.click();
    await page.locator('ul[role="listbox"] li[data-value="' + value + '"]').click({ timeout: 15000 });
  }
  try {
    // identity-lite
    await fillCombo("#il_language_english", P.english); step("il_language_english", true);
    if (await advEnabled(10000)) await go();
    if (await vis(page.locator("#il_language_region"), 2500)) { if (await advEnabled(5000)) await go(); step("il_language_region", true, { note: "present, left blank" }); }
    await fillCombo("#il_language_autonym", P.autonym); step("il_language_autonym", true);
    if (await advEnabled(10000)) await go();
    await page.waitForSelector("#il_language_code", { timeout: 60000 });
    await fillCombo("#il_language_code", P.code); step("il_language_code", true);
    if (await advEnabled(10000)) await go();
    await selectMenu(page.locator("#il_target_script"), "Latn"); step("il_target_script", true);
    if (await advEnabled(10000)) await go();
    // layout step
    await page.waitForSelector('[data-testid="layout-step"]', { timeout: 60000 }); step("layout-step", true);
    await page.getByTestId("layout-continue").click();
    await page.getByTestId("base-picker").waitFor({ state: "visible", timeout: 90000 }); step("base-picker", true);
    // pick base
    const card = page.getByTestId("base-card-" + P.base);
    if (await vis(card, 6000)) {
      await card.click();
      const conf = page.getByTestId("base-confirm");
      if (await vis(conf, 6000)) {
        // Preview preparation can take a while under load; wait for the
        // confirm button to arm before clicking it.
        await page.waitForFunction(() => { const b = document.querySelector('[data-testid="base-confirm"]'); return !!b && !b.disabled; }, null, { timeout: 120000 }).catch(() => {});
        await conf.click({ timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(800);
      }
      // Verify the pick actually advanced; retry once if still on the picker.
      const copyProbe = page.getByRole("radio", { name: /^Copy/i });
      if (!(await vis(copyProbe, 15000))) {
        await card.click().catch(() => {});
        const conf2 = page.getByTestId("base-confirm");
        await page.waitForFunction(() => { const b = document.querySelector('[data-testid="base-confirm"]'); return !!b && !b.disabled; }, null, { timeout: 120000 }).catch(() => {});
        await conf2.click({ timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(800);
      }
      step("pick-base", true, { via: "card" });
    } else {
      await page.getByTestId("search-scope-all").click();
      const search = page.getByPlaceholder(/Type to search by name/i);
      await search.fill(P.base);
      await page.locator('[id$="-opt-' + P.base + '"]').first().click({ timeout: 60000 });
      const conf = page.getByTestId("base-confirm");
      await conf.waitFor({ state: "visible", timeout: 10000 });
      await page.waitForFunction(() => { const b = document.querySelector('[data-testid="base-confirm"]'); return !!b && !b.disabled; }, null, { timeout: 120000 }).catch(() => {});
      await conf.click({ timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(800);
      step("pick-base", true, { via: "search" });
    }
    // track copy
    const copyRadio = page.getByRole("radio", { name: /^Copy/i });
    await copyRadio.waitFor({ state: "visible", timeout: 60000 });
    await copyRadio.check(); step("track-copy", true);
    if (await advEnabled(10000)) await go();
    // attribution
    const nameField = page.locator("#il_author_name");
    if (!(await vis(nameField, 15000))) { await go(); }
    await nameField.waitFor({ state: "visible", timeout: 60000 });
    if ((await nameField.inputValue()) === "") await nameField.fill("Walk Author");
    if (await advEnabled(10000)) await go();
    await page.locator("#il_author_email").waitFor({ state: "visible", timeout: 60000 });
    if (await advEnabled(10000)) await go();
    await page.locator("#il_copyright_holder").waitFor({ state: "visible", timeout: 60000 });
    if (await advEnabled(10000)) await go();
    step("attribution", true);
    // project name (1-2 sub-steps)
    await page.waitForSelector('[data-testid="survey-advance"]', { timeout: 60000 });
    if (await advEnabled(15000)) await go();
    const onStep2 = await vis(page.getByText(/Step 2 of/i), 8000);
    if (onStep2) { if (await advEnabled(10000)) await go(); }
    step("project-name", true);
    // prefill
    await page.waitForSelector('[data-testid="prefill-continue"]', { timeout: 60000 });
    const prefillText = await page.locator("body").innerText().then(t => t.slice(0, 4000)).catch(() => "");
    out.prefillExcerpt = prefillText;
    await page.click('[data-testid="prefill-continue"]'); step("prefill", true);
    // characters discovery: exemplars pre-selected?
    const ex = page.locator("#discovery_method-exemplars");
    const exPresent = await vis(ex, 15000);
    let exChecked = false;
    if (exPresent) {
      exChecked = await page.waitForFunction(() => { const el = document.querySelector("#discovery_method-exemplars"); return !!el && el.checked; }, null, { timeout: 30000 }).then(() => true).catch(() => false);
    }
    out.exemplars = { present: exPresent, checked: exChecked };
    const checkedMethod = await page.evaluate(() => {
      const el = document.querySelector('input[name="discovery_method"]:checked') || document.querySelector('[id^="discovery_method-"]:checked');
      return el ? el.id : null;
    }).catch(() => null);
    out.discoveryCheckedId = checkedMethod;
    await page.waitForSelector('[data-testid="charlist-continue"]', { timeout: 15000 });
    await page.locator('[data-testid="charlist-continue"]').click({ timeout: 10000 }).catch(() => {}); await page.waitForTimeout(600); step("charlist-continue", true);
    const heading = page.getByTestId("phase-b-heading");
    const hOk = await vis(heading, 20000);
    out.alphabetHeading = hOk ? (await heading.innerText().catch(() => "")) : null;
    step("alphabet-screen", hOk);
    const alphaText = await page.locator("body").innerText().catch(() => "");
    out.alphabetExcerpt = alphaText.slice(0, 5000);
    const done = page.getByTestId("charlist-done");
    out.charlistDoneEnabled = await done.isEnabled().catch(() => null);
  } catch (e) {
    out.errors.push(String(e && e.message ? e.message : e).slice(0, 800));
    out.failedAt = out.steps.length ? out.steps[out.steps.length - 1].name : "start";
    out.bodyExcerpt = await page.locator("body").innerText().then(t => t.slice(0, 3000)).catch(() => "");
  }
  return "WALKJSON:" + encodeURIComponent(JSON.stringify(out));
}
