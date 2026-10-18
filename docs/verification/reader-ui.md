# Reader UI verification

## Scope

The approved redesign covered the existing Desktop and web readers. It added plugin-scoped Follow Hermes, light and dark themes, saved comfortable or compact density, a collapsible source library, responsive filters, clearer controls and proportional reading text. Backend routes, Blogwatcher storage and summary behavior were left unchanged.

The shared sources, `ui/reader.js` and `ui/reader.css`, are built into both standalone entrypoints by the dependency-free `scripts/build-ui.cjs` script. Installation still needs no build step. All CSS is scoped to `.bw-reader`. Follow Hermes uses each host's theme variables. Dashboard text uses `--midground` because `--foreground` can be transparent.

## Automated checks

- Python: 45 tests passed, including the original CLI lifecycle against a temporary database and the opt-in installed-Hermes bridge probe. Inference was stubbed (`HERMES_BRIDGE_LIVE=0`). Hermes emitted a `dashboard-auth-basic` configuration warning during that probe; no authentication settings were changed.
- JavaScript: 51 behavioral tests passed across the actual web and Desktop entrypoints, including 34 new reader tests. Before implementation, the new suite returned 28 expected failures and 6 passes.
- The existing test for superseded loads now gives each `useRef` its own stable identity without changing the assertion. The old harness aliased all refs to the request-generation token, which did not match React's ref behavior.
- Plugin validation passed, including the SDK-only Desktop import checks and the isolated capability probe.
- Generated-file consistency, JavaScript syntax and `git diff --check` passed.
- The GitHub workflow checks that generated files are up to date and runs the reader suite. Local results do not establish remote CI status; the publishing handoff reports checks for the pushed commit separately.

## Real-browser checks

`tests/browser_smoke.cjs` completed 28 checks using real React and headless Google Chrome through Playwright. Both entrypoints were loaded in isolated host fixtures, exercising the actual reader component and its adapters.

These checks used synthetic articles and summaries. They made no requests to publishers, model providers or authenticated production APIs, and did not change the production database or installed plugin. The Desktop fixture substitutes the SDK boundary, so this was not an Electron deployment test.

The checks covered:

- Live host-theme inheritance and plugin-local light/dark overrides.
- Restoring preferences and checking row sizes in comfortable/compact modes.
- Collapsing the source rail, filtering, keyboard tab navigation and returning focus to the article title when details close.
- Keeping multiple saved summaries open without POSTs or scroll jumps.
- Row-local pending state for read actions and reading back successful results.
- Recoverable connection errors, adding sources and confirming removal.
- Responsive reading at 390px, mobile toolbar alignment and reduced motion.
- No browser runtime errors or external HTTP requests.

Browser checks caught two presentation bugs: button styles overrode the initial reduced-motion rule, and the mobile toolbar wrapped Scan now onto a second line. Both were fixed and are covered by passing browser assertions.

The built-in light/dark palettes passed the browser test's 4.5:1 minimum contrast for body text, metadata and primary-button labels. Measured ratios and screenshots are saved in `browser-results.json` beside the previews. These measurements do not cover every custom Hermes theme and are not a complete accessibility audit.

## Preserved behavior

Opening an article only reads its saved summary. It does not fetch publisher content, generate a summary or mark the article read. You can keep several articles expanded at once. Regeneration keeps saved output visible while working or after a failure. Generation still requires explicit consent that discloses provider retries and fallbacks.

The restricted Markdown renderer uses semantic React elements. Raw HTML and links appear as inert text. Read/unread actions use synchronous per-row guards to block duplicate requests. When an action finishes, it refreshes the currently selected filter. Removing a source or marking all articles read still requires confirmation. Reading still works if browser storage is invalid or inaccessible.

## Run the checks

```bash
node scripts/build-ui.cjs --check
HERMES_BRIDGE_HOST_TEST=1 HERMES_BRIDGE_LIVE=0 python -m unittest discover -s tests -v
node --experimental-vm-modules --test tests/test_ui.cjs tests/test_desktop.cjs tests/test_reader_ui.cjs
hermes plugins validate .
node scripts/preview-ui.cjs --output "$TMPDIR/blogwatcher-reader-preview"
node tests/browser_smoke.cjs "$TMPDIR/blogwatcher-reader-preview"
```

The optional browser tools load development dependencies from an existing Hermes source checkout (`HERMES_SOURCE`). Use `CHROME_BIN` to select a local Chrome/Chromium executable. No new production dependency is required.

Both independent reviews passed without blocking findings: one covered behavior, and the other covered quality, security and accessibility. The CI-coverage suggestion had already been addressed during review. After focus loss was reproduced, a failing real-browser assertion was added; the fix then passed in both adapters. More teardown and source-failure tests were suggested as non-blocking follow-up work. This record does not claim that those tests were committed.

The installed plugin and its data were left unchanged. Deployment is a separate step and requires approval.
