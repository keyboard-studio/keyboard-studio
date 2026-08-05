// Shared jsdom shim for `<dialog>` — jsdom does not implement
// `HTMLDialogElement.prototype.showModal()`/`close()`, so any test that
// renders a native `<dialog>` (ConfirmDialog and everything that mounts it —
// MechanismGallery/TouchGallery's leave-warning, PhaseFGate's block banner)
// needs this installed before render or `showModal()` throws.
//
// `??=` only ever installs once per jsdom global — calling this from more
// than one test file's `beforeAll` (as several do) is harmless.
//
// Centralizes what used to be pasted verbatim into each test file; see
// MechanismGallery.test.tsx / TouchGallery.test.tsx / PhaseFGate.test.tsx for
// the call sites. (ConfirmDialog.test.tsx and CarveGallery.test.tsx carry
// their own pre-existing copies of this shim, outside this cleanup's scope.)
export function installDialogShim(): void {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}
