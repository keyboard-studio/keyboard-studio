# Keyboard Studio: landing page copy

<!-- Source copy for the root index.html (GitHub Pages). [Brackets] are facts to confirm before the page is merged. -->

---

## Hero

**Keyboard Studio**

### You know your language. We hope that can be enough to build its keyboard.

Keyboard Studio is an experimental, browser-based way to make a Keyman keyboard by answering
questions about your language instead of writing code. It began as a hackathon project, built by
people who use Keyman, teach it, and share its goal of every language being typeable. The
keyboards it makes go through the same review as every other keyboard in the Keyman library.

[Try the studio](https://kbstudio.langtech.cloud)  [Read how it works]  [View on GitHub]

---

## Built on Keyman

Keyboard Studio would not exist without Keyman.

Since 1992, Keyman has let people type their own languages on Windows, Mac,
Linux, iOS, Android, and the web, free of charge. For many communities it was the first time
their language could be typed at all.

Behind those keyboards is Keyman Developer and the
[keymanapp/keyboards](https://github.com/keymanapp/keyboards) repository: more than 900 keyboards, each
built, reviewed, and maintained by people who cared about getting them right. Much of the Bible
translation, literacy, and language development work we have been part of depends on the foundation that Keyman provides.

That repository is also a remarkable record of how the world's scripts are typed. Keyboard Studio
leans on it heavily, along with the rest of what the Keyman team has built:

- **Keyman's own compiler** checks every keyboard the studio makes, running in your browser.
- **The keyboards in the repository** are where every studio keyboard starts.
- **The repository's review checklist** shapes what the studio asks and checks.
- **Keyman itself** is what people install to use the keyboard you make.

---

## Where this came from

Keyboard Studio started at a hackathon in summer 2026. We are staff and summer associates in SIL's Language Technology Use department, who work with language communities and have relied on Keyman for
years.

Our first idea was small: a helper that would let AI coding assistants work with Keyman keyboards,
so that people already using Keyman Developer could write keyboard code faster. As we worked, a
bigger question kept coming up: what would it take for someone who has never built a keyboard to
finish one?

It has grown since then, but it is still far younger and less tested than the Keyman Developer
pipeline, and it is not an official Keyman project.

Many of us have spent years teaching keyboard development in workshops around the world. Again and
again, the people who knew their language best were the ones who struggled most to finish a
keyboard. They weren't struggling with their language. They were struggling with everything
around it: the code, the files that must stay in step, the packaging, and the details a reviewer
will rightly ask about.

Keyman Developer is most fruitful for a skilled keyboard author: someone at home with code,
packaging, and the review process, who can use the complete control it offers. Many first-time
authors we've met needed something different: fewer choices at once, a working example to start
from, and a suggestion for each answer.

Keyboard Studio is our attempt to offer that path. It is still an experiment, and it is one
more way into the Keyman ecosystem, not a way around it. The work still flows into
the same repository and the same review.

---

## How it tries to help

### You start from a keyboard that already works

Very few keyboards are built from nothing. In the Keyman repository, most keyboards for a given
script cluster around a handful of layouts. For example, [380 of 484] Latin-script keyboards sit
on a QWERTY layout ([see how all 920 keyboards group](keyboard-grouping.html)).

The studio makes that the starting point on purpose. Every keyboard begins as a copy of one
existing keyboard, and you change what your language needs. When your script has only one or
two keyboards in the repository, or none, the studio starts from a basic layout or US QWERTY
instead, and you will do more of the work.

### Every question comes with a suggested answer

When the studio can make a reasonable guess, from the keyboard you started with, your language's
code, or keyboards for related languages, it offers that guess and tells you where it came from.
You confirm it or change it. Where a guess could be wrong in a way that matters, such as who holds
the copyright, it asks instead of guessing.

### You see the keyboard as you build it

A live keyboard on screen lets you type with your changes after every edit, on desktop and on
touch layouts.

### Problems show up while you work

The studio checks your keyboard as you go, using Keyman's compiler and the repository's review
checklist, so you can fix many problems before anyone else sees them.

---

## Two kinds of work

**Make a new keyboard.** Start from an existing keyboard and turn it into a new one for your
language, with its own name.

**Make a new version of an existing keyboard.** Start from the current release of a keyboard and
update it, keeping its name and history.

When you're finished, you can download a keyboard package to install, download the source files,
or open a draft pull request to the Keyman keyboards repository.

---

## Who it is for, and who it isn't

**It is for** linguists, community members, teachers, and literacy workers who know a language
well and have not built a keyboard before.

**It isn't a replacement for Keyman Developer.** If you already write keyboards in Keyman
Developer, it is still the most powerful tool. It can do far more than the studio, and the studio does
not try to match it. We have deliberately kept the studio to a narrower set of well-understood
keyboard designs.

---

## What it can't do yet

We would rather you hear this from us:

- It is **experimental**. Expect rough edges, and expect reviewers to sometimes ask for changes.
- It does not support [Chinese, Japanese, Korean, or Ethiopic] input methods yet.
- Some things can't be checked by software: whether you have the right to publish under a given
  copyright, whether the keyboard suits its community, and [eight] other checks. The studio asks
  you to confirm these, and the Keyman reviewers still make the final call.
- A keyboard that passes the studio's checks is not guaranteed to be accepted. Review is still
  review.

---

## Working alongside the Keyman team

Every keyboard submitted from the studio goes through the Keyman team's normal review. If the
studio produces something that makes reviewers' work harder, that is our bug, and we want to
hear about it. [Open an issue](LINK) or [contact us](LINK).

Everything here is open source. If any idea or piece of code is useful to Keyman, we would be glad
to see it there.

---

<!-- Footer -->
Keyboard Studio is a project of SIL's Language Technology Use department that began at a
hackathon. It is not an official
Keyman project. Keyman began in 1992 and is now developed by [the Keyman team at SIL Global]. [Open source, MIT licensed.]
