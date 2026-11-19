# randomizer

Makes passwords, fake-data tables, random picks, dice rolls, tokens, color palettes and placeholder text, all on your device.

- **Passwords:** characters (4–128), passphrases from the 7,776-word EFF list or a shorter typable list, pronounceable syllables, patterns like `Cvcc-999`, and PINs. Each shows its entropy. Settings for a site (a length limit, banned symbols) can be saved as presets.
- **Tables:** 18 column types including normal, exponential and log-normal curves, cities, and columns built from other columns with filters (`{city|lookup}`, `{date|addDays:30}`, `{price|num}`). Columns can be unique, moved and duplicated. Up to 100,000 rows, generated in chunks with progress, previewed at 100. Export as TSV, CSV, JSON, Markdown or SQL, or copy the table's columns and settings as a schema and paste it back.
- **Pick:** pick, shuffle or split a pasted list into teams; weights; several named saved lists.
- **Roll:** `2d6+1d4+3`, keep highest or lowest (`4d6kh3`), exploding dice (`3d6!`), with the odds shown; coin with a kept tally; numbers.
- **Tools:** tokens (alphanumeric, hex, base64, NanoID, UUID, ULID, KSUID), color palettes with contrast per swatch, locking, and copy as hex, rgb, hsl or CSS variables, and lorem text.
- **Interface:** English, Spanish, French and German, chosen from the browser or the header. Light, dark or system theme.

Passwords use the browser's cryptographic generator. A seeded table or lorem text does not, so don't use one for secrets.

The page makes no network calls. Fonts and the word list are built into the file, so `dist/randomizer.html` opens from `file://`. Settings and the last 40 results stay in `localStorage`, per browser and per device; password results are kept only if you turn that on. Served over http(s) the page is also an installable app that works offline.

## Build and check

```
npm install
npm run build      dist/randomizer.html (web), dist/artifact.html (hosted preview)
npm test           unit tests, Node only
npm run smoke      builds, then drives the real page in headless Chromium
npm run parity     compares the build with the committed visual baseline
npm run baseline   accepts the current look as the new baseline
npm run icons      renders assets/icons from the logo (needs Chromium)
npm run check      npm test, smoke, then parity; this is what CI runs
```

**Targets.** `node build.mjs` writes both builds; `--target=web` or `--target=artifact` writes one.

- *web*: `randomizer.html` (also `index.html`), `manifest.webmanifest`, `sw.js` and `icons/`. The page adds the manifest and registers the worker only over http(s), so opening the file directly adds neither. The worker caches the page, manifest and icons under a name derived from their content and takes over without waiting; a new build is used from the next load.
- *artifact*: `artifact.html`, for Claude's hosted preview. It has no worker or install code. Save file uses the host's `downloads` capability and is hidden when that is not granted, because a plain download does nothing inside a hosted page. The page is checked against a policy modelled on the documented hosting limits, and if a host refuses data-URI fonts the interface falls back to its system font stacks.

**Size budget.** `budget.json` caps the page, the script and the styles in KB. The build fails above it. Raise it only on purpose.

**Visual baseline.** `test/baseline.json.br` holds the layout and style of every visible element in both themes at phone and desktop width, across every tab and several states, plus German at phone width and French at 320 px. `npm run parity` fails with a readable diff when anything moves or changes color. If the change is intended, run `npm run baseline` and commit the new file. `node test/parity.mjs a.html [b.html]` compares two builds instead.

**CI.** `.github/workflows/check.yml` runs `npm run check` on every push and pull request, then fails if `dist/` or the baseline is stale. Chromium comes inside the `@sparticuz/chromium` npm package, so caching npm caches it.

## Deploy

`vercel.json` sets the build command, the output directory (`dist`) and the headers: a content-security-policy that allows no network, no remote fonts, scripts or images, and no `eval`; `nosniff`; no referrer; and cache rules (the worker and manifest are never cached, icons are immutable). The tests serve `dist/` with exactly these headers. Any static host works: publish `dist/` and send the same headers.

## Layout

```
build.mjs           bundles the targets, writes the worker and manifest, enforces budget.json
budget.json         size limits in KB
scripts/icons.mjs   renders assets/icons
src/
  index.html        shell and templates; /*CSS*/ and /*JS*/ are filled by the build
  main.js           wires everything; the only file that knows every feature
  app.js            navigation, language menu, install button, keyboard shortcuts
  core/             no knowledge of features
    dom.js          $ and el
    rng.js          rnd, rf, pick, withSeed, seeded, isSeeded
    storage.js      get, set, loadJSON, saveJSON, pickValid, restore
    clipboard.js    copy, scheduleClear
    live.js         announce, the screen-reader live region
    i18n.js         t, tt, fmt, nf, pickLang, setLang, translateDom
    download.js     getSaver (file download, or the hosted capability), saveMessage
    pwa.js          initPwa: manifest, worker, install prompt
    history.js      hist(tab, text), the drawer, pushItem and cleanItems
    theme.js        system/light/dark, theme-aware favicon
  ui/
    controls.js     fld, label, txt, chip, seg, dd, slider, icon, spin
    paint.js        colors password characters by class
  features/
    password.js     genChars, genWords, genPron, genPattern, genPin, presets
    table.js        column types T and generators G, readSaved, schema, rowStream, capacity, moveCol, dupCol
    template.js     FX filters, compile, plan, fill, renameRefs
    pick.js         parseItems, draw, pickResult, readLists
    roll.js         tokenize, parseTerms, parseDice, diceStats, rollNumber
    tools.js        makeTokens, makeUlid, makeKsuid, makePalette, makeLorem
  data/             words.js (EFF list), names.js, places.js, alphabets.js
  lang/             es.js, fr.js, de.js: English text to translation
  styles/           01-tokens … 06-responsive; file order is cascade order
assets/fonts/       woff2 files, embedded by the build
assets/icons/       PNG icons for the manifest and iOS
test/               unit, features, i18n and platform tests (Node), smoke.mjs and parity.mjs (browser), lint.mjs, i18n-keys.mjs
```

## Rules

1. Dependencies point one way: `core` ← `ui` ← `features` ← `main`. A feature never imports another feature, except `table.js` using `template.js`.
2. Logic that decides a result is a top-level exported function that takes its state as an argument and touches no DOM. That is what the unit tests cover. DOM code lives inside the feature's `init()`.
3. `init()` builds the controls and returns `{refresh}`. `main.js` calls `refresh` once everything exists.
4. All randomness comes from `core/rng.js`. Never `Math.random`. Seeding is only available through `withSeed(seed, fn)` or a resumable `seeded(seed)`, which always release the seed, even if the function throws.
5. Saved state is untrusted. Load it with `restore(target, key, rules)` or `pickValid`, which keep only known keys of the right type and allowed values, or with a feature-specific validator (`readSaved`, `readLists`, `cleanPresets`, `readTally`, `cleanItems`). Never `Object.assign` parsed JSON into state, and never index an object with a stored name without `hasOwnProperty`.
6. A result worth keeping goes through `hist(tab, text)`. Password results are only passed on when the user turned that option on.
7. No code comments, no network requests from the page, no external fonts or scripts. The build fails if it finds an external URL. The worker only reads its own files.
8. Styles: tokens only in `01-tokens.css`; every color comes from a token, so both themes stay in step. The unit tests check the contrast of every token pair in both themes, so a palette change that drops below 4.5:1 for text or 3:1 for focus rings, field borders and icons fails the build.
9. Controls get their accessible name from `fld(label, control)` (or `label(control, id, text)` for markup in `index.html`). A button's accessible name must contain its visible text. Results worth announcing go through `announce(text)`; never announce a password or token, only a summary of it.
10. Every string a person reads is a literal passed to `t('English text')`, with `{name}` placeholders and `{n|one|many}` plurals, never built by joining pieces. Fixed text in `index.html` uses `data-i`, `data-i-aria`, `data-i-ph` or `data-i-title`. Pass numbers to `t` as numbers: it formats them for the language and chooses plurals from the raw value. Mark text that is data, not language (a dice name like `d20`, a pattern example), with the `raw` class.
11. The unit tests fail on any code comment (JavaScript or CSS) and on `Math.random` in `src`, so the rules above are enforced.

## Adding things

- **Column type:** add an entry to `T` (label and parameters) and a generator to `G` in `features/table.js`. If its output is numeric, add it to `NUM`. If the values can be listed, add it to `capacity` and `domain` so Unique values works exactly.
- **Template filter:** add one entry to `FX` in `features/template.js`; it receives the text and the argument after the colon, and must return `''` for `''`.
- **Password mode:** add a pure `genX(P)` returning `{t, b}` (text, bits of entropy), register it in the mode map, `RULES` and `PRESET_KEYS` in `password.js`, add its tab and controls (a control group's `data-m` lists the modes that show it), and test the entropy figure.
- **Dice syntax:** add a token to `tokenize`, handle it in `parseTerms`, apply it in `rollTerm`, and extend the breakdown in `parseDice` and the odds in `diceStats`.
- **Tab:** add `features/x.js` exporting `init`, a `<main id="x-v">` and a nav button in `src/index.html`, an entry in `TABS` in `app.js`, and in `main.js`'s feature list.
- **Language:** add `src/lang/xx.js` exporting an object from each English string to its translation, import it and add it to `LANGS` and `CATS` in `core/i18n.js`, and add it to the list in `test/i18n.test.mjs`. The tests list any missing or unused string, any placeholder or plural that does not match, and the pseudo-language test finds text that skipped `t`. For plural rules other than "one, or else many", change `many` in `i18n.js`.

## localStorage

`rz-p` password settings, `rz-pp` site presets, `rz-t` table setup, `rz-k` pick settings, `rz-list` the saved pick lists (an older plain-text value becomes the first list), `rz-rt` coin tally, `rz-tk` tools settings, `rz-mode` theme, `rz-lang` language, `rz-tab` last tab, `rz-h` history.

## Accessibility

Every control has an accessible name that contains its visible text; the segmented controls, the nav and the theme button expose their state; dropdowns open and move with the arrow keys, Home, End, Enter and Escape; the history drawer is a dialog that takes focus when opened and gives it back when closed; the table preview is a focusable scroll region; results are announced through one polite live region (passwords and tokens only as a summary); focus rings are drawn in both themes. Text pairs reach 4.5:1 and text-field and dropdown borders reach 3:1 (`--bd`). Buttons and chips keep the lighter decorative `--ln` border because their text identifies them. The smoke tests run axe-core on every tab in both themes, in the main states, in each language at 320 px and on desktop, and require zero violations.

## Known limits

- The interface has been checked with axe-core and by keyboard in headless Chromium, but not with a real screen reader.
- The Spanish, French and German text was written without a native-speaker review. The word lists (passphrases, names, cities) stay English in every language.
- The hosted build is tested against a policy modelled on the documented hosting limits and a mock of the `downloads` capability, not in the real host.
- Keyboard shortcuts (Space to generate, `c` to copy) work only when nothing is focused, so after clicking a tab press somewhere blank first.
- Safari on iOS has no install prompt; use Share, then Add to Home Screen.
- Spaces in a dice formula are ignored, so `2d6 3` reads as `2d63`.
- A table above 2,000 rows is generated in the background; Copy and Save wait until it is finished. The same seed gives the same table however it is chunked.
