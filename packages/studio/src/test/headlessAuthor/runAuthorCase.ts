// runAuthorCase -- the headless scripted author (spec 107).
//
// Test-only. The author is the product with the React rendering layer removed:
// it bypasses the UI and nothing else (FR-013). Below the UI it runs the
// product's own unmodified code, at the seam the UI calls it from: step routing,
// proposals, ranking and pre-selection, store actions and provenance, the
// working-copy rebuild, projection, compile and output.
//
// Its own code is only:
//   1. case input (loadCases.ts);
//   2. the walk policy's choice among the options the product offered, applied
//      through the function the UI control's handler calls (walkPolicy.ts);
//   3. the `zzq` typing where nothing is offered (placeholder.ts);
//   4. reporting (runReport.ts).
//
// Anything the author cannot reach without the UI is lifted into product code
// the UI then calls (FR-040) or listed as Playwright-only below (FR-042). It is
// never re-stated here (FR-013): no copied rule, compensating branch, shim,
// mock, direct store write or second step list. boundary.test.ts and the
// depcruise rule `product-not-to-headless-author` enforce this.
//
// Playwright-only (FR-042): none yet.
export {};
