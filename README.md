# Blogwatcher for Hermes

Read and manage your [original Blogwatcher](https://github.com/Hyaxia/blogwatcher) subscriptions inside Hermes Desktop and `hermes dashboard`. No Hermes patches or direct SQLite writes.

## Features

- A reading-first inbox with a collapsible source library, clear unread states, comfortable typography and responsive controls.
- Light, dark or Follow Hermes appearance; comfortable or compact list density. Preferences stay local to Blogwatcher and never change the host theme.
- Unread/all inbox, source filters, pagination and independent read/unread controls.
- Add/remove sources and scan on demand. Removal deletes the source's articles.
- Expand multiple articles inline, with formatted summaries and independent controls. Opening loads saved results without publisher access or inference.
- Explicitly **Summarize** or **Regenerate** using your Hermes model. Neither action marks articles read.
- Read-only agent tools for articles and subscriptions.

Summaries use retrieved text, not headlines. They show coverage and model attribution, reuse successful results for seven days (50 MiB cap), display older saved results as stale until eviction, and require consent before sending article text to your model provider. Hermes may retry or use configured fallback models; the plugin never retries a generation itself. Inaccessible/blocked pages produce an error, not a guessed summary. Private-network fetches are blocked.

## Install

On the **Hermes backend host**, ensure `blogwatcher` is on the service's PATH, then:

```bash
hermes plugins install https://github.com/irfansofyana/hermes-blogwatcher --enable
```

Restart the **dashboard/API server** after installation or updates that add routes. Open **Blogwatcher** in the web sidebar. Keep Hermes's authentication enabled for remote access.

For Desktop on the same machine: **Capabilities → Plugins → Rescan**, then enable Blogwatcher.

For Desktop on a **different machine**, copy `desktop/plugin.js` to:

```text
~/.hermes/desktop-plugins/hermes-blogwatcher/plugin.js
```

Rescan and enable the local Desktop plugin. It calls the connected remote backend; the client needs neither Python nor Blogwatcher. Update both copies together.

Optional backend launch variables: `BLOGWATCHER_BIN` (absolute executable path) and `BLOGWATCHER_DB` (the CLI's database override). The `blogwatcher-cli` fork is not supported. AI requires the backend plugin's registered Hermes LLM context; no separate API key is needed in the UI.

## Upgrading from the old plugin ID

The plugin ID is now `hermes-blogwatcher`. This is not an in-place update of `blogwatcher-dashboard`.

On the backend, remove only the old plugin package (`hermes plugins remove blogwatcher-dashboard`), then install this repository with `--enable` and restart the dashboard/API server. On Mac, remove the old `~/.hermes/desktop-plugins/blogwatcher-dashboard/` folder and copy the new UI to `~/.hermes/desktop-plugins/hermes-blogwatcher/plugin.js`, then reload Desktop plugins and enable it. Do not keep both IDs enabled.

Subscriptions/read state remain in the original CLI database. Successful summaries continue using the same `cache/blogwatcher-summaries` directory under the active Hermes home; do not delete that cache. The `/blogwatcher` page and agent-tool names are unchanged; the API namespace is `/api/plugins/hermes-blogwatcher`.

## Development

Edit `ui/reader.js` and `ui/reader.css`, then rebuild the two standalone delivery files. The builder uses only Node's standard library. Installation needs no Node build or additional runtime dependencies. Scoped CSS is embedded because disk plugins are not processed by the host's Tailwind build.

```bash
node scripts/build-ui.cjs
node scripts/build-ui.cjs --check
hermes plugins validate .
python -m unittest discover -s tests -v
node --experimental-vm-modules --test tests/test_ui.cjs tests/test_desktop.cjs tests/test_reader_ui.cjs
```

Optional interactive previews and real-browser checks use React, ReactDOM, esbuild and Playwright from an existing Hermes source checkout (`~/.hermes/hermes-agent`, or set `HERMES_SOURCE`). The browser test uses `/usr/bin/google-chrome` unless `CHROME_BIN` is set.

```bash
node scripts/preview-ui.cjs
node tests/browser_smoke.cjs
```

The preview command prints two self-contained HTML paths under `TMPDIR` (or the system temporary directory). Both previews use explicit synthetic fixtures and the actual generated UI. They never touch the Blogwatcher database, publishers or model providers. `--output DIR` selects another preview directory; pass that same directory to `tests/browser_smoke.cjs`. Screenshot and browser-check results are saved there too.

Run Python tests in an environment with Hermes/FastAPI. Real-CLI tests use a temporary database; set `BLOGWATCHER_TEST_BIN` if necessary. `HERMES_BRIDGE_HOST_TEST=1` enables the installed-runtime bridge test; leave `HERMES_BRIDGE_LIVE=0` to keep inference stubbed. Live inference tests are opt-in and may spend tokens. The reader doesn't bypass paywalls or execute publisher JavaScript. Native agent chat embedding, source editing and scheduled scans are outside this plugin's scope.
