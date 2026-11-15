# randomizer

Generates passwords (4–128 characters, passphrases from the 7,776-word EFF list, PINs), fake-data tables, random picks from a pasted list, dice rolls and numbers, tokens and color palettes. Tables have 15 column types, including columns built from other columns, and export as TSV, CSV, JSON, Markdown or SQL. Passwords use the browser's cryptographic generator; a seeded table does not, so don't use one for secrets. A table generates up to 1,000 rows and previews the first 100. The interface is English only.

No network calls. Fonts and the word list are built into the file, so `dist/randomizer.html` opens from `file://`. Settings and the last 40 results are kept in `localStorage`, per browser and per device; password results are kept only if you turn that on. Not installable; no service worker.

## Build and check

```
npm install
npm run build      dist/randomizer.html
npm test           unit tests, Node only
npm run smoke      builds, then drives the real page in headless Chromium
npm run parity -- <baseline.html>
npm run check      npm test, then smoke
```

`parity` compares every visible element (computed styles, text, position) of a baseline build against `dist/` in both themes, at phone and desktop width, across all tabs, color mode and the history drawer. Run it before and after any change that should not alter the interface, such as moving CSS or splitting a module.

## Layout

```
src/
  index.html        shell and templates; /*CSS*/ and /*JS*/ are filled by the build
  main.js           wires everything; the only file that knows every feature
  app.js            tab navigation and keyboard shortcuts
  core/             no knowledge of features
    dom.js          $ and el
    rng.js          rnd, rf, pick, withSeed, isSeeded
    storage.js      get, set, loadJSON, saveJSON, restore
    clipboard.js    copy, scheduleClear
    history.js      hist(tab, text), the drawer, pushItem and cleanItems
    theme.js        system/light/dark, theme-aware favicon
  ui/
    controls.js     fld, txt, chip, dd, slider, spin
    paint.js        colors password characters by class
  features/
    password.js     genChars, genWords, genPin
    table.js        column types T and generators G, format, readSaved
    template.js     FX filters, compile, plan, fill, renameRefs
    pick.js         parseItems, draw, pickResult
    roll.js         parseDice, rollNumber
    tools.js        makeTokens, makePalette
  data/             words.js (EFF list), names.js, alphabets.js
  styles/           01-tokens … 06-responsive; file order is cascade order
assets/fonts/       woff2 files, embedded by the build
test/               unit.test.mjs, smoke.mjs, parity.mjs
```

## Rules

1. Dependencies point one way: `core` ← `ui` ← `features` ← `main`. A feature never imports another feature, except `table.js` using `template.js`.
2. Logic that decides a result is a top-level exported function that takes its state as an argument and touches no DOM. That is what the unit tests cover. DOM code lives inside the feature's `init()`.
3. `init()` builds the controls and returns `{refresh}`. `main.js` calls `refresh` once everything exists.
4. All randomness comes from `core/rng.js`. Never `Math.random`. Seeding is only available through `withSeed(seed, fn)`, which always releases the seed, even if `fn` throws.
5. Saved state is untrusted. Load it with `restore(target, key, rules)`, which keeps only known keys of the right type and allowed values, or with a feature-specific validator (`readSaved`, `cleanItems`). Never `Object.assign` parsed JSON into state.
6. A result worth keeping goes through `hist(tab, text)`. Password results are only passed on when the user turned that option on.
7. No code comments, no network requests, no external fonts or scripts. The build fails if it finds an external URL.
8. Styles: tokens only in `01-tokens.css`; every color comes from a token, so both themes stay in step.

## Adding things

- **Column type:** add an entry to `T` (label and parameters) and a generator to `G` in `features/table.js`. If its output is numeric, add it to `NUM`. Add it to the "every column type yields a string" unit test by being in `T`.
- **Template filter:** add one entry to `FX` in `features/template.js`.
- **Password mode:** add a pure `genX(P)` returning `{t, b}` (text, bits of entropy), register it in the mode map in `password.js`, add its controls, and test the entropy figure.
- **Tab:** add `features/x.js` exporting `init`, a `<main id="x-v">` and a nav button in `src/index.html`, an entry in `TABS` in `app.js`, and in `main.js`'s feature list.

## localStorage

`rz-p` password settings, `rz-t` table setup, `rz-k` pick settings, `rz-list` the pick list, `rz-tk` tools settings, `rz-mode` theme, `rz-tab` last tab, `rz-h` history.

## Known limits

- The hosted-preview build target (Claude artifacts) uses the host's download capability for Save file and cannot be tested here; the offline file uses a normal download.
- The interface is English only and has not had a screen-reader audit.
