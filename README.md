# Blogwatcher for Hermes

Read and manage your [Blogwatcher](https://github.com/Hyaxia/blogwatcher) subscriptions in Hermes Desktop and the web dashboard.

## Features

- Unread/all-article views, source filters, pagination and read/unread controls.
- Follow Hermes, light and dark themes, with comfortable or compact layouts.
- Multiple inline saved summaries, with explicit Summarize and Regenerate actions.
- Add/remove sources and scan on demand. Removing a source also deletes its articles.
- Read-only agent tools for articles and subscriptions.

Generating a summary retrieves article text and sends it to your configured Hermes model after confirmation. Provider costs, retries and fallback models may apply. Opening saved summaries does not fetch publisher content, run inference or mark articles read.

## Screenshots

### Follow Hermes

![Blogwatcher following the Hermes theme](docs/screenshots/follow-hermes.png)

### Light

![Blogwatcher with the light theme](docs/screenshots/light.png)

### Dark

![Blogwatcher with the dark theme](docs/screenshots/dark.png)

## Install

Install the original Blogwatcher CLI on the **Hermes backend host** and ensure `blogwatcher` is on the service's PATH. The `blogwatcher-cli` fork is not supported. Then run:

```bash
hermes plugins install https://github.com/irfansofyana/hermes-blogwatcher --enable
```

Restart the dashboard/API server and open **Blogwatcher** in the web sidebar. For Desktop on the same machine, use **Capabilities → Plugins → Rescan**, then enable Blogwatcher.

### Remote Desktop clients

If Desktop runs on a different machine, copy `desktop/plugin.js` to this location on the client:

```text
~/.hermes/desktop-plugins/hermes-blogwatcher/plugin.js
```

Rescan and enable the local plugin. Keep the backend and Desktop copies in sync; the client needs neither Python nor Blogwatcher.

Optional backend variables: `BLOGWATCHER_BIN` (absolute CLI path) and `BLOGWATCHER_DB` (database override). AI uses your configured Hermes model; no separate API key is needed in the UI. Keep Hermes authentication enabled for remote access.

## Development

Edit `ui/reader.js` and `ui/reader.css`, then rebuild and test:

```bash
node scripts/build-ui.cjs
node scripts/build-ui.cjs --check
hermes plugins validate .
python -m unittest discover -s tests -v
node --experimental-vm-modules --test tests/test_ui.cjs tests/test_desktop.cjs tests/test_reader_ui.cjs
```

Python tests need Hermes/FastAPI. CLI tests use a temporary database. Live inference tests are opt-in and may incur costs.

See [browser previews and verification details](docs/verification/reader-ui.md) for additional checks.
