# Reader UI verification

## Scope

The approved change is a reading-first redesign of the existing Desktop and web flows: plugin-scoped Follow Hermes/light/dark appearance, saved comfortable/compact density, a collapsible source library, responsive filtering, clearer controls and proportional prose. Backend routes, Blogwatcher storage and summary behavior are unchanged.

`ui/reader.js` and `ui/reader.css` generate both standalone entrypoints through the dependency-free `scripts/build-ui.cjs`. Installation still needs no build step. All CSS is scoped to `.bw-reader`. Follow Hermes maps to each host's actual theme variables; dashboard text uses `--midground` rather than its potentially transparent `--foreground`.

## Automated checks

- Python: 45 tests passed, including the original CLI lifecycle against a temporary database and the opt-in installed-Hermes bridge probe. Inference was stubbed (`HERMES_BRIDGE_LIVE=0`). Hermes emitted a `dashboard-auth-basic` configuration warning during that probe; no authentication settings were changed.
- JavaScript: 51 behavioral tests passed across the actual web and Desktop entrypoints, including 34 new reader tests. Before implementation, the new suite produced 28 expected failures and 6 passes.
- The existing superseded-load test now gives each `useRef` its own stable identity. Its assertion is unchanged. Aliasing all refs to the request-generation token was not a valid model of React.
- Plugin validation passed, including SDK-only Desktop imports and the isolated capability probe.
- Generated-file consistency, JavaScript syntax and `git diff --check` passed.
- The GitHub workflow checks generated-file drift and runs the reader suite. Local verification does not establish remote CI status; the publishing handoff reports checks against the pushed commit separately.

## Real-browser checks

`tests/browser_smoke.cjs` completed 28 checks with real React and headless Google Chrome through Playwright. Both actual entrypoints were loaded in isolated host fixtures. This exercises the real component and adapters, not a second reader implementation.

The articles and summaries are explicitly synthetic. Browser verification made no publisher/model requests, authenticated production API requests, production database mutations or installed-plugin updates. The Desktop fixture substitutes the SDK boundary; it is not an Electron deployment test.

Coverage:

- Live host-theme inheritance and plugin-local light/dark overrides.
- Preference restoration and actual comfortable/compact row geometry.
- Collapsible source rail, filtering, keyboard tab navigation and focus restoration to the article title when closing details.
- Multiple inline saved summaries without POSTs and without scroll jumps.
- Row-local read-action pending state and successful result read-back.
- Recoverable connection errors, source addition and confirmed removal.
- Responsive reading at 390px, intentional mobile toolbar alignment and reduced motion.
- No browser runtime errors or external HTTP requests.

Browser verification reproduced two presentation defects before correction: the initial reduced-motion rule lost to more-specific button styles, and the mobile toolbar accidentally wrapped Scan now onto another line. Both have passing browser assertions.

Built-in light/dark palettes passed the browser test's 4.5:1 minimum for body text, metadata and primary-button labels. Raw measured ratios and screenshots are emitted in `browser-results.json` beside the previews. These measurements do not cover every custom Hermes theme and are not a complete accessibility audit.

## Preserved behavior

Opening an article only reads its saved summary. It never fetches the publisher, generates a summary or marks the article read. Multiple independent summaries remain open, and regeneration retains saved output during work or failure. Generation still requires explicit consent with the provider retry/fallback disclosure.

The restricted Markdown renderer uses semantic React elements; raw HTML and links remain inert text. Read/unread requests have synchronous per-row duplicate guards. Action completion refreshes the current filter instead of a stale render. Destructive removal and bulk mark-read retain confirmation. Invalid or inaccessible browser storage never blocks reading.

## Reproduce

```bash
node scripts/build-ui.cjs --check
HERMES_BRIDGE_HOST_TEST=1 HERMES_BRIDGE_LIVE=0 python -m unittest discover -s tests -v
node --experimental-vm-modules --test tests/test_ui.cjs tests/test_desktop.cjs tests/test_reader_ui.cjs
hermes plugins validate .
node scripts/preview-ui.cjs --output "$TMPDIR/blogwatcher-reader-preview"
node tests/browser_smoke.cjs "$TMPDIR/blogwatcher-reader-preview"
```

Optional browser tooling resolves development dependencies from an existing Hermes source checkout (`HERMES_SOURCE`). `CHROME_BIN` selects a local Chrome/Chromium executable. No new production dependency is required.

Independent behavioral and quality/security/accessibility reviews both passed with no blocking findings. The CI-coverage suggestion was already addressed during review. A reproduced focus-restoration improvement was subsequently covered by a failing real-browser assertion, fixed, and verified in both adapters. Additional teardown/source-failure tests were suggested as non-blocking follow-up coverage; they are not claimed as committed regression tests here.

Verification did not change the installed plugin or its data. Deployment remains a separate, approval-gated step.
