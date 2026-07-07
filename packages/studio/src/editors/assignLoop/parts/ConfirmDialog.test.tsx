// Unit tests for ConfirmDialog.tsx (post-review cleanup, #886/#961).
//
// ConfirmDialog wraps the native <dialog> element:
//   - showModal()/close() are driven by the `open` prop
//   - the native "cancel" event (fired on Escape) is intercepted and routed
//     to `dismiss` (onSecondary if provided, else onPrimary)
//   - a click directly on the <dialog> element (the backdrop, since the
//     inner content is a nested <div>) also routes to `dismiss`
//   - a click inside the inner panel must NOT dismiss (event.target won't
//     be the <dialog> element itself)
//   - omitting `secondaryLabel` renders a single button and makes `dismiss`
//     fall back to `onPrimary`

import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog.tsx';

// jsdom does not implement HTMLDialogElement.showModal()/close() (only the
// reflected `open` IDL attribute exists) — see
// https://github.com/jsdom/jsdom/issues/3294. ConfirmDialog's mount effect
// calls showModal() unconditionally, so without this shim every render()
// with open=true throws "showModal is not a function". The shim mirrors the
// bit the component actually depends on: toggling the `open` attribute.
beforeAll(() => {
  if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  if (typeof HTMLDialogElement.prototype.close !== 'function') {
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  }
});

afterEach(() => {
  cleanup();
});

describe('ConfirmDialog — basic rendering', () => {
  it('renders the title and body text', () => {
    render(
      <ConfirmDialog
        open
        title="Remove everywhere?"
        body={<p>This affects several locations.</p>}
        primaryLabel="Yes, remove"
        onPrimary={vi.fn()}
      />,
    );
    expect(screen.getByText('Remove everywhere?')).not.toBeNull();
    expect(screen.getByText('This affects several locations.')).not.toBeNull();
  });

  it('renders the primary button with the given label', () => {
    render(
      <ConfirmDialog
        open
        title="t"
        body="b"
        primaryLabel="Yes, remove everywhere"
        onPrimary={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Yes, remove everywhere' })).not.toBeNull();
  });
});

describe('ConfirmDialog — two-button mode', () => {
  it('renders both primary and secondary buttons', () => {
    render(
      <ConfirmDialog
        open
        title="t"
        body="b"
        primaryLabel="Yes, remove everywhere"
        secondaryLabel="Cancel"
        onPrimary={vi.fn()}
        onSecondary={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Yes, remove everywhere' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel' })).not.toBeNull();
  });

  it('clicking the primary button calls onPrimary only', () => {
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();
    render(
      <ConfirmDialog
        open
        title="t"
        body="b"
        primaryLabel="Yes"
        secondaryLabel="Cancel"
        onPrimary={onPrimary}
        onSecondary={onSecondary}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(onSecondary).not.toHaveBeenCalled();
  });

  it('clicking the secondary button calls onSecondary only', () => {
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();
    render(
      <ConfirmDialog
        open
        title="t"
        body="b"
        primaryLabel="Yes"
        secondaryLabel="Cancel"
        onPrimary={onPrimary}
        onSecondary={onSecondary}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSecondary).toHaveBeenCalledTimes(1);
    expect(onPrimary).not.toHaveBeenCalled();
  });
});

describe('ConfirmDialog — single-button (info) mode', () => {
  it('renders exactly one button when secondaryLabel is omitted', () => {
    render(
      <ConfirmDialog
        open
        title="t"
        body="b"
        primaryLabel="OK"
        onPrimary={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'OK' })).not.toBeNull();
  });

  it('Escape falls back to onPrimary when onSecondary is omitted', () => {
    const onPrimary = vi.fn();
    const { container } = render(
      <ConfirmDialog
        open
        title="t"
        body="b"
        primaryLabel="OK"
        onPrimary={onPrimary}
      />,
    );
    const dialog = container.querySelector('dialog')!;
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it('backdrop click falls back to onPrimary when onSecondary is omitted', () => {
    const onPrimary = vi.fn();
    const { container } = render(
      <ConfirmDialog
        open
        title="t"
        body="b"
        primaryLabel="OK"
        onPrimary={onPrimary}
      />,
    );
    const dialog = container.querySelector('dialog')!;
    fireEvent.click(dialog);
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });
});

describe('ConfirmDialog — dismissal routing', () => {
  it('the native cancel event (Escape) calls onSecondary, not onPrimary, in two-button mode', () => {
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();
    const { container } = render(
      <ConfirmDialog
        open
        title="t"
        body="b"
        primaryLabel="Yes"
        secondaryLabel="Cancel"
        onPrimary={onPrimary}
        onSecondary={onSecondary}
      />,
    );
    const dialog = container.querySelector('dialog')!;
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onSecondary).toHaveBeenCalledTimes(1);
    expect(onPrimary).not.toHaveBeenCalled();
  });

  it('a click on the <dialog> element itself (backdrop) calls onSecondary', () => {
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();
    const { container } = render(
      <ConfirmDialog
        open
        title="t"
        body="b"
        primaryLabel="Yes"
        secondaryLabel="Cancel"
        onPrimary={onPrimary}
        onSecondary={onSecondary}
      />,
    );
    const dialog = container.querySelector('dialog')!;
    fireEvent.click(dialog);
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it('a click inside the inner panel does NOT dismiss', () => {
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Inner click test"
        body="b"
        primaryLabel="Yes"
        secondaryLabel="Cancel"
        onPrimary={onPrimary}
        onSecondary={onSecondary}
      />,
    );
    // The title heading lives inside the inner content div, not the <dialog>
    // element itself — clicking it must NOT trigger dismiss.
    fireEvent.click(screen.getByText('Inner click test'));
    expect(onPrimary).not.toHaveBeenCalled();
    expect(onSecondary).not.toHaveBeenCalled();
  });
});
