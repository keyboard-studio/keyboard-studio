# KeymanWeb vendored runtime

`#22` scaffolds the directory layout. The actual `keymanweb.js` bundle is **not**
checked in by the shell PR — it lands as part of `#39` (preview pane) so the
vendor step is tied to the first PR that needs it.

## Expected layout (#39 will populate)

```
public/kmw/
  18.0/
    keymanweb.js           # KeymanWeb engine, pinned to 18.0.x
    osk/                   # OSK theme assets if needed
    LICENSE                # Apache-2.0 from keymanapp/keyman
```

## How to vendor

1. Download the KeymanWeb 18.0.x release from
   https://github.com/keymanapp/keyman/releases (look for the `keymanweb`
   bundle in the assets), or fetch from the npm package
   `@keymanapp/keyman-engine-web@18.0.x` via jsDelivr.
2. Extract `keymanweb.js` into `public/kmw/18.0/`.
3. Verify the SHA-256 against the upstream release notes.
4. Copy the upstream `LICENSE` (Apache-2.0) alongside.

## Why pin 18.0.x

Per km-keyman (issue #39 cycle 1): KMW engine internal stub schema and API
surface change between minor versions. A keyboard compiled against
kmcmplib 19.0.240-alpha (our pinned compiler) was designed for the
matching engine series. Bumping the engine in lockstep with kmcmplib is
tracked as a follow-up.

## Why not load from CDN

CSP + offline reliability + sandboxed iframes. The studio is designed to
run on a developer's machine with the dev-server proxy; in production it
will eventually serve from a controlled origin. Loading the engine from
`s.keyman.com` at runtime is rejected.
