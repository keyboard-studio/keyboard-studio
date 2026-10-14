// PrivacyScreen — the published privacy notice (spec 095).
//
// The notice is organised the way authors actually think about it —
// what stays on your device, what sits on our servers, what becomes
// public — rather than as a legal article list, while carrying every
// element GDPR Art. 13 requires: controller + contact, purposes and
// lawful bases, recipients/processors, retention, rights and how to
// exercise them, and the supervisory-authority complaint route.
//
// The text is a claim about the code in Constitution Art. XI's sense:
// it is derived from docs/privacy/processing-record.md, and a change
// that alters processing updates the record and this page in the same
// change (Constitution Art. XII). "Last updated" below moves whenever
// the substance does.

import type { CSSProperties, ReactNode } from "react";
import { Trans } from "@lingui/react/macro";

import { navigateTo } from "../lib/navigate.ts";
import { BORDER, FONT, TEXT_DIM } from "../ui/theme.ts";

const containerStyle: CSSProperties = {
  padding: 24,
  fontFamily: FONT,
  color: "var(--app-text)",
  height: "100%",
  overflowY: "auto",
  boxSizing: "border-box",
  maxWidth: 860,
  margin: "0 auto",
  lineHeight: 1.6,
  fontSize: 14,
};

const h2Style: CSSProperties = { margin: "28px 0 8px", fontSize: "1.05rem" };
const pStyle: CSSProperties = { margin: "0 0 10px" };
const liStyle: CSSProperties = { marginBottom: 6 };

const linkStyle: CSSProperties = {
  color: "var(--app-accent-text)",
  background: "none",
  border: "none",
  padding: 0,
  font: "inherit",
  cursor: "pointer",
  textDecoration: "underline",
};

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--app-accent-text)" }}>
      {children}
    </a>
  );
}

const PVR_URL = "https://github.com/keyboard-studio/keyboard-studio/security/advisories/new";

/**
 * The one privacy-link control (spec 095 FR-003: a link wherever sign-in
 * is offered and at first save — the label and target never vary, so the
 * surfaces that offer sign-in share this rather than restyling their
 * own). `onBeforeNavigate` is for the welcome screen, whose first-visit
 * gate would otherwise rewrite the #privacy hash away before the route
 * renders (it marks the visit first).
 */
export function PrivacyLink({ onBeforeNavigate }: { onBeforeNavigate?: () => void }) {
  return (
    <button
      type="button"
      style={linkStyle}
      onClick={() => {
        onBeforeNavigate?.();
        navigateTo("privacy");
      }}
    >
      <Trans id="privacy.link">Privacy</Trans>
    </button>
  );
}

export function PrivacyScreen() {
  return (
    <div style={containerStyle} data-testid="privacy-screen">
      <button
        type="button"
        style={{ ...linkStyle, fontSize: 13 }}
        onClick={() => {
          if (window.history.length > 1) window.history.back();
          else navigateTo("survey");
        }}
      >
        <Trans id="privacy.back">← Back</Trans>
      </button>

      <h1 style={{ margin: "12px 0 4px", fontSize: "1.4rem" }}>
        <Trans id="privacy.title">Privacy</Trans>
      </h1>
      <p style={{ ...pStyle, color: TEXT_DIM, fontSize: 13 }}>
        <Trans id="privacy.updated">Last updated 2026-10-14.</Trans>
      </p>
      <p style={pStyle}>
        <Trans id="privacy.intro">
          Keyboard Studio is run by the Keyboard Studio project. This page explains what
          information the studio handles, why, where it sits, and the choices you have. It is
          written from our actual systems, not a template: if a kind of data is not mentioned
          here, we do not collect it.
        </Trans>
      </p>
      <p style={pStyle}>
        <Trans id="privacy.contact">
          Privacy contact: the private reporting route on our GitHub repository — see
          &ldquo;Your rights&rdquo; below for the exact steps. The same route reaches us for any
          privacy question, not just formal requests.
        </Trans>
      </p>

      <h2 style={h2Style}>
        <Trans id="privacy.device.heading">On your device</Trans>
      </h2>
      <p style={pStyle}>
        <Trans id="privacy.device.body">
          Used as a guest, the studio works entirely in your browser. Your draft keyboards —
          including the name, optional email address, and copyright holder you type into the
          attribution fields — are stored in your browser&rsquo;s local storage on this device
          only. We never receive them, cannot see them, and cannot delete them for you; they go
          away when you delete the draft or clear this site&rsquo;s data in your browser.
        </Trans>
      </p>

      <h2 style={h2Style}>
        <Trans id="privacy.servers.heading">On our servers</Trans>
      </h2>
      <p style={pStyle}>
        <Trans id="privacy.servers.signin">
          Signing in is optional. If you sign in with GitHub, GitHub tells us your GitHub user
          id and username so we know whose work is whose. If you sign in with Google, Google
          tells us your email address (your Gmail address), your name, your profile picture,
          and a Google account id. Sign-in details live only in your browser session — we keep
          no user-profile database — and connecting the Keyboard Studio GitHub App is what lets
          the studio open pull requests for you; that connection is recorded by GitHub, and
          only you can remove it (GitHub Settings → Applications).
        </Trans>
      </p>
      <p style={pStyle}>
        <Trans id="privacy.servers.drafts">
          If you are signed in and save, your draft is stored on our servers (hosted by Vercel:
          the draft content in private file storage, and an index row with your GitHub id and
          username, the draft&rsquo;s label, and timestamps in a database) so you can pick it
          up on another device. Server drafts stay until you delete them — delete one, or all
          of them at once, from Your data on the profile page. Our hosting provider also keeps
          ordinary server logs (such as IP address and browser type) to run and secure the
          service.
        </Trans>
      </p>
      <p style={pStyle}>
        <Trans id="privacy.servers.basis">
          We hold server drafts and sign-in details because you asked us to — they are how the
          signed-in features you chose work. We do not use them for anything else: no
          advertising, no selling or renting data, no profiling.
        </Trans>
      </p>

      <h2 style={h2Style}>
        <Trans id="privacy.public.heading">Public — only when you act</Trans>
      </h2>
      <p style={pStyle}>
        <Trans id="privacy.public.submit">
          Submitting a finished keyboard opens a public pull request on the public
          keymanapp/keyboards repository. Your name and email address are included in the
          submission as its author, and once a submission is merged they become part of that
          repository&rsquo;s permanent public history — neither we nor the Keyman team can
          rewrite merged history. The submit form says this again at the moment you submit,
          before anything is sent.
        </Trans>
      </p>
      <p style={pStyle}>
        <Trans id="privacy.public.crash">
          If the studio hits an error, it can file a crash report as a public issue in our
          crash-reports repository so the problem can be fixed. Reports contain the error and
          technical context only — your identity is removed by design before anything is sent —
          and a report can be retracted.
        </Trans>
      </p>

      <h2 style={h2Style}>
        <Trans id="privacy.never.heading">What we do not do</Trans>
      </h2>
      <ul style={{ margin: "0 0 10px", paddingLeft: 20 }}>
        <li style={liStyle}>
          <Trans id="privacy.never.cookies">We set no cookies.</Trans>
        </li>
        <li style={liStyle}>
          <Trans id="privacy.never.analytics">
            We run no analytics or tracking today. If we add privacy-preserving usage statistics
            later, this page will say so before they start.
          </Trans>
        </li>
        <li style={liStyle}>
          <Trans id="privacy.never.sale">
            We do not sell, rent, or share personal data for anyone else&rsquo;s marketing.
          </Trans>
        </li>
      </ul>

      <h2 style={h2Style}>
        <Trans id="privacy.rights.heading">Your rights</Trans>
      </h2>
      <p style={pStyle}>
        <Trans id="privacy.rights.body">
          You can ask us for a copy of the personal data we hold about you, ask us to correct
          or delete it, restrict or object to its use, or ask for it in a portable form. Most
          server data needs no request at all: the profile page&rsquo;s Your data section lets
          you download everything our servers hold for you, or delete all of it, immediately.
        </Trans>
      </p>
      <p style={pStyle}>
        <Trans id="privacy.rights.route">
          For anything else, contact us privately on GitHub: open the Keyboard Studio
          repository, go to the Security tab, choose &ldquo;Report a vulnerability&rdquo;, and
          title your message as a privacy request. A GitHub account is needed for that form;
          a request that reaches us any other way counts too — you do not need the right form,
          a fee, or legal wording. We reply within one month.
        </Trans>{" "}
        <ExternalLink href={PVR_URL}>
          <Trans id="privacy.rights.routeLink">Open the private reporting route</Trans>
        </ExternalLink>
      </p>
      <p style={{ ...pStyle, borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
        <Trans id="privacy.rights.complaint">
          If you are unhappy with how we handled your data or your request, you can complain to
          the UK Information Commissioner&rsquo;s Office (ico.org.uk). We would rather you told
          us first — most problems are ours to fix and we will.
        </Trans>
      </p>
    </div>
  );
}
