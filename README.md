# randomizer

Generates passwords (4–128 characters, passphrases from the 7,776-word EFF list, pronounceable syllables, PINs), fake-data tables, random picks from a pasted list, dice rolls and numbers, tokens and color palettes. Tables have 15 column types, including columns built from other columns, and export as TSV, CSV, JSON, Markdown or SQL. A table's columns and settings can be copied as a schema and pasted back. Passwords use the browser's cryptographic generator; a seeded table does not, so don't use one for secrets. A table generates up to 100,000 rows (in chunks above 2,000, with progress) and previews the first 100. Dice take several terms, keep-highest and keep-lowest, and exploding dice. The interface is English only.

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

## Deploy

`vercel.json` sets the build command and the output directory (`dist`). The build writes the same file as `dist/index.html` and `dist/randomizer.html`, so `/` and `/randomizer.html` both work. Any static host works the same way: publish `dist/`.

## Layout

```
src/
  index.html        shell and templates; /*CSS*/ and /*JS*/ are filled by the build
  main.js           wires everything; the only file that knows every feature
  app.js            tab navigation and keyboard shortcuts
  core/             no knowledge of features
    dom.js          $ and el
    rng.js          rnd, rf, pick, withSeed, seeded, isSeeded
    storage.js      get, set, loadJSON, saveJSON, restore
    clipboard.js    copy, scheduleClear
    live.js         announce, the screen-reader live region
    history.js      hist(tab, text), the drawer, pushItem and cleanItems
    theme.js        system/light/dark, theme-aware favicon
  ui/
    controls.js     fld, label, txt, chip, seg, dd, slider, spin
    paint.js        colors password characters by class
  features/
    password.js     genChars, genWords, genPron, genPin
    table.js        column types T and generators G, format, readSaved, exportSchema, importSchema, rowStream
    template.js     FX filters, compile, plan, fill, renameRefs
    pick.js         parseItems, draw, pickResult
    roll.js         tokenize, parseTerms, parseDice, rollNumber
    tools.js        makeTokens, makePalette
  data/             words.js (EFF list), names.js, alphabets.js
  styles/           01-tokens … 06-responsive; file order is cascade order
assets/fonts/       woff2 files, embedded by the build
test/               unit.test.mjs, smoke.mjs, parity.mjs, lint.mjs
```

## Rules

1. Dependencies point one way: `core` ← `ui` ← `features` ← `main`. A feature never imports another feature, except `table.js` using `template.js`.
2. Logic that decides a result is a top-level exported function that takes its state as an argument and touches no DOM. That is what the unit tests cover. DOM code lives inside the feature's `init()`.
3. `init()` builds the controls and returns `{refresh}`. `main.js` calls `refresh` once everything exists.
4. All randomness comes from `core/rng.js`. Never `Math.random`. Seeding is only available through `withSeed(seed, fn)`, which always releases the seed, even if `fn` throws.
5. Saved state is untrusted. Load it with `restore(target, key, rules)`, which keeps only known keys of the right type and allowed values, or with a feature-specific validator (`readSaved`, `cleanItems`). Never `Object.assign` parsed JSON into state.
6. A result worth keeping goes through `hist(tab, text)`. Password results are only passed on when the user turned that option on.
7. No code comments, no network requests, no external fonts or scripts. The build fails if it finds an external URL.
8. Styles: tokens only in `01-tokens.css`; every color comes from a token, so both themes stay in step. The unit tests check the contrast of every token pair in both themes, so a palette change that drops below 4.5:1 for text or 3:1 for focus rings, field borders and icons fails the build.
9. Controls get their accessible name from `fld(label, control)` (or `label(control, id, text)` for markup in `index.html`). Results worth announcing go through `announce(text)`; never announce a password or token, only a summary of it.
10. The unit tests fail on any code comment (JavaScript or CSS) and on `Math.random` in `src`, so the rules above are enforced.

## Adding things

- **Column type:** add an entry to `T` (label and parameters) and a generator to `G` in `features/table.js`. If its output is numeric, add it to `NUM`. Add it to the "every column type yields a string" unit test by being in `T`.
- **Template filter:** add one entry to `FX` in `features/template.js`.
- **Password mode:** add a pure `genX(P)` returning `{t, b}` (text, bits of entropy), register it in the mode map and the `restore` rules in `password.js`, add its tab and controls (a control group's `data-m` lists the modes that show it), and test the entropy figure. `genPron` is the newest example.
- **Dice syntax:** add a token to `tokenize`, handle it in `parseTerms`, apply it in `rollTerm`, and extend the breakdown in `parseDice`.
- **Tab:** add `features/x.js` exporting `init`, a `<main id="x-v">` and a nav button in `src/index.html`, an entry in `TABS` in `app.js`, and in `main.js`'s feature list.

## localStorage

`rz-p` password settings, `rz-t` table setup, `rz-k` pick settings, `rz-list` the pick list, `rz-tk` tools settings, `rz-mode` theme, `rz-tab` last tab, `rz-h` history.

## Accessibility

Every control has an accessible name; the four segmented controls, the nav and the theme button expose their state; dropdowns open and move with the arrow keys, Home, End, Enter and Escape; the history drawer is a dialog that takes focus when opened and gives it back when closed; the table preview is a focusable scroll region; results are announced through one polite live region (passwords and tokens only as a summary); focus rings are drawn in both themes. Text pairs reach 4.5:1 and text-field and dropdown borders reach 3:1 (`--bd`). Buttons and chips keep the lighter decorative `--ln` border because their text identifies them.

## Known limits

- The hosted-preview build target (Claude artifacts) uses the host's download capability for Save file and cannot be tested here; the offline file uses a normal download.
- The interface is English only. It has had an accessibility pass and automated checks, but has not been tested with a real screen reader.
- Spaces in a dice formula are ignored, so `2d6 3` reads as `2d63`.
- A seeded table is the same however it is chunked; a table above 2,000 rows is generated in the background, and Copy and Save wait until it is finished.
