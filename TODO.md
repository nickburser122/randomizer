# To do

Each item is complete when its tests exist and `npm run check` passes. Size: S under an hour, M a few hours, L a day or more.

## Table

1. **More filters and lookups (S each).** A `lookup` filter (city to country) using the same `FX` map; number formatting; date arithmetic.
2. **Unique-value constraint (M).** Per column, retry until unique or report that the range is too small. Tests for exhaustion.
3. **Column order and duplication (S).** Move up/down and duplicate. The dependency order already comes from `plan()`, so display order can change freely.
4. **More distributions (S).** Uniform, exponential, log-normal beside the normal curve.

## Pick, roll and tools

5. **Named saved lists (M).** Several lists in `rz-list`, with a validator like `readSaved`.
6. **Coin tally and roll statistics (S).** Persist the tally; reset button; distribution summary for dice.
7. **More tokens (S).** ULID, nanoid, KSUID. Palettes: WCAG contrast ratio per swatch, lock a color, copy as hex, rgb, hsl or CSS variables.
8. **Lorem text (S).** Words from the built-in list, with a seed option.

## Passwords

9. **Pattern templates (M).** `Cvcc-999` style patterns with a documented alphabet.
10. **Site presets (S).** Saved rule sets for sites with a length limit or banned symbols.
11. **Shorter word list option (S).** A phone-friendly list for typing, with the lower entropy per word shown honestly.

## Platform and quality

12. **Hosted-preview build target (S).** A build flag for the Claude artifact variant: the download capability, the content-security-policy constraints, and a check that data-URI fonts load there. Currently untested.
13. **Bundle size budget (S).** Fail the build above an agreed size (currently about 240 KB, of which about 55 KB is the word list and about 80 KB fonts).
14. **CI (S).** A workflow running `npm run check` on every push; cache Chromium.
15. **Committed visual baseline (M).** Keep a DOM and style snapshot of the interface in the repo so `parity` can run without a second build.
16. **Browser coverage for `theme.js`, `clipboard.js`, `app.js` shortcuts (S).** Smoke covers theme and the Copied announcement; add clipboard clearing and the keyboard shortcuts.
17. **Installable offline app (L, undecided).** Conflicts with the one-file, no-service-worker rule. Decide first whether the rule should change.
18. **Interface translations (L).** Strings are inline in the modules. Move them to a table first.

## Found during the accessibility pass

- **Test with a real screen reader (S).** The labels, roles, live region and dropdown keyboard model are checked in headless Chromium only. Try VoiceOver, NVDA and TalkBack, and fix what the automated checks cannot see.
- **History entries lose their type label after a copy (S).** `copy()` restores the button with `textContent`, which drops the "Password"/"Roll" label span. Restore the original children instead.

## Decided against

- Breach checking of generated passwords: needs a network request.
- Storing generated passwords by default: history keeps them only on explicit opt-in.
