# To do

Each item is complete when its tests exist and `npm run check` passes. Size: S under an hour, M a few hours, L a day or more.

## Open

1. **Test with a real screen reader (S).** The labels, roles, live region, dropdown keyboard model and dialog focus are checked with axe-core and by keyboard in headless Chromium only. Try VoiceOver, NVDA and TalkBack and fix what the automated checks cannot see.
2. **Check the hosted build in the real host (S).** Publish `dist/artifact.html` as an artifact and confirm the downloads capability, the data-URI fonts and the content-security policy behave as the tests assume. If fonts are blocked there, consider the allowed Google Fonts host for that target only.
3. **Shortcuts from anywhere on the page (S).** Space and `c` are ignored while a nav button has focus, which is where focus lands after clicking a tab. Allow them there without breaking Space on a focused button.
4. **Native review of the translations (S per language).** Ask a speaker to read the Spanish, French and German text in context and correct the catalogs in `src/lang/`.
5. **More languages (S each).** One file in `src/lang/` and two lines in `core/i18n.js`. Languages that need other plural rules need `many` in `i18n.js` extended first.

## Decided against

- Breach checking of generated passwords: needs a network request.
- Storing generated passwords by default: history keeps them only on explicit opt-in.
- A background update prompt for the installed app: the worker already serves the newest build from the next load, and a prompt would add a string in every language for little gain.
