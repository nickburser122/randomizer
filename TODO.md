# To do

Each item is complete when its tests exist and `npm run check` passes. Size: S under an hour, M a few hours, L a day or more.

## Next (highest value)

1. **Schema import and export (M).** `Copy schema` and `Paste schema` for the table, using the shape saved in `rz-t`. Validation already exists in `readSaved`; add a visible error message and a size limit. Tests: round trip, hostile input, unknown column types become `word`.
2. **Pronounceable passwords (M).** A fourth password mode. Alternating consonant and vowel syllables; entropy is the sum of log2 of the choices per syllable, returned as `{t, b}`. Tests: shape, entropy formula, no repeated bad patterns.
3. **Multi-term dice (M).** `2d6+1d4+3`, exploding dice and a clearer breakdown. Replace the single regex in `parseDice` with a small tokenizer; keep every current formula working (existing tests stay).
4. **Tables above 1,000 rows (M).** The slider stops at 1,000 and `make()` clamps at 10,000. Generate in chunks, keep the preview at 100 rows, and show progress. Test the seeded output is identical when chunked.
5. **Accessibility pass (M).** Screen-reader labels on every control, focus handling in the history drawer, an `aria-live` region for results, visible focus in both themes, a contrast check of every token pair. Add the contrast check to the unit tests so a palette change cannot regress it.

## Table

6. **More filters and lookups (S each).** A `lookup` filter (city to country) using the same `FX` map; number formatting; date arithmetic.
7. **Unique-value constraint (M).** Per column, retry until unique or report that the range is too small. Tests for exhaustion.
8. **Column order and duplication (S).** Move up/down and duplicate. The dependency order already comes from `plan()`, so display order can change freely.
9. **More distributions (S).** Uniform, exponential, log-normal beside the normal curve.

## Pick, roll and tools

10. **Named saved lists (M).** Several lists in `rz-list`, with a validator like `readSaved`.
11. **Coin tally and roll statistics (S).** Persist the tally; reset button; distribution summary for dice.
12. **More tokens (S).** ULID, nanoid, KSUID. Palettes: WCAG contrast ratio per swatch, lock a color, copy as hex, rgb, hsl or CSS variables.
13. **Lorem text (S).** Words from the built-in list, with a seed option.

## Passwords

14. **Pattern templates (M).** `Cvcc-999` style patterns with a documented alphabet.
15. **Site presets (S).** Saved rule sets for sites with a length limit or banned symbols.
16. **Shorter word list option (S).** A phone-friendly list for typing, with the lower entropy per word shown honestly.

## Platform and quality

17. **Hosted-preview build target (S).** A build flag for the Claude artifact variant: the download capability, the content-security-policy constraints, and a check that data-URI fonts load there. Currently untested.
18. **Comment and `Math.random` lint (S).** A test that fails if any `src` file contains a comment or `Math.random`, matching the project rules.
19. **Bundle size budget (S).** Fail the build above an agreed size (currently about 230 KB, of which about 55 KB is the word list and about 80 KB fonts).
20. **CI (S).** A workflow running `npm run check` on every push; cache Chromium.
21. **Committed visual baseline (M).** Keep a DOM and style snapshot of the interface in the repo so `parity` can run without a second build.
22. **Browser coverage for `theme.js`, `clipboard.js`, `app.js` shortcuts (S).** Smoke covers theme; add clipboard clearing and the keyboard shortcuts.
23. **Installable offline app (L, undecided).** Conflicts with the one-file, no-service-worker rule. Decide first whether the rule should change.
24. **Interface translations (L).** Strings are inline in the modules. Move them to a table first.

## Decided against

- Breach checking of generated passwords: needs a network request.
- Storing generated passwords by default: history keeps them only on explicit opt-in.
