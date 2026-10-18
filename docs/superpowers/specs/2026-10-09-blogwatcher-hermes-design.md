# Blogwatcher Hermes companion: design

## Intent
Build a self-hosted companion for users of the original `Hyaxia/blogwatcher` CLI. Users can see their subscribed sources and unread/all articles inside Hermes Desktop and `hermes dashboard`, manage exactly the state the installed CLI permits, and ask their existing Hermes agent about those articles. The companion has no separate web app, direct SQLite writes, feed engine, scheduler or custom chat runtime.

## Ownership and boundaries
- Blogwatcher owns source discovery, article storage, deduplication and read state. One backend adapter executes an explicitly allowlisted CLI binary using argument vectors, never a shell. It bounds the timeout and output, with `BLOGWATCHER_DB` inherited or explicitly configured. The adapter parses the original CLI's human-readable output. A format mismatch must be reported as an error, not an empty inbox.
- Hermes owns plugin authentication, AI credentials, agent chat and remote access. A single plugin package ships a Python agent tool layer, a dashboard FastAPI router, a Desktop ESM page and a web-dashboard tab. The UI clients share a JSON contract rather than a JS component library.
- Both surfaces call the same authenticated backend namespace. Treat source names and URLs as data, never as shell fragments. The plugin never writes to Blogwatcher's DB.
- The CLI and DB must be accessible from the Hermes host/profile. Tailscale can privately expose the authenticated Hermes dashboard; there is no plugin-specific listener.

## Core flows
1. The inbox loads unread articles by default. It has an all/read toggle, a source filter, source/date/title/link rows and original-article links. Use pagination or bounded results to keep the UI from being overwhelmed. Do not fabricate a teaser when none is available.
2. The source list includes the name, site URL, feed URL, selector and last scan when emitted. Adding a source accepts a name + URL, with optional feed URL, selector and user agent. Removal requires confirmation that Blogwatcher deletes the source's articles. There is no edit action because the CLI lacks one, and no individual article deletion.
3. Scan all sources or one source on demand, report new counts/errors and reload the views. There is no dashboard scheduler.
4. Use the CLI to mark one article read/unread or to mark all articles read, globally or for a source. Confirm both global and source-wide read-all.
5. Read-only agent tools expose bounded source/article reads. Model text must never become a shell command or a write confirmation. Desktop and web link to existing Hermes chat. Do not promise contextual article-to-composer injection without a verified API.

## AI and content roadmap
- The first working slice includes a deterministic inbox, CLI actions and agent tools, with no independent LLM calls or background processing.
- Next is an opt-in briefing on fetched content, with the exact source URL and clear access failures. Summarize only content that was actually retrieved; do not present headlines as full text. Feed descriptions/teasers need a separate read-only enrichment layer because the user's installed CLI does not display them.
- Later, if warranted, add deduplication, relevance filters and a recurring digest. These must never silently change read status or hide sources.

## Failure and security
- Make failures visible and distinguish between no CLI, unsupported output, timeout, nonzero exit, missing DB and permission errors. Parse only complete entries, cap text/process output and reject control characters for UI display.
- Mutations are POST-only, explicit and allowlisted. Do not allow direct arbitrary command/flag execution. Validate article IDs and names, and never automatically retry destructive actions. Keep untrusted feed text out of instructions and escape it in the UI.
- Trust the Hermes dashboard's authentication, but do not advertise unauthenticated public exposure. Test permissions and the profile path against real Hermes host integration before release.

## Verification
- Unit tests with an isolated fake CLI cover parsing, argument arrays, limits, missing/unsupported CLI and failures.
- Run an end-to-end test against the original CLI with `BLOGWATCHER_DB` pointing at an isolated test database. Verify add/list/scan/read/unread/remove while preserving the user's own DB.
- Load the plugin in Hermes Desktop and the dashboard, and check rendering and actions in both. Exercise agent tool discovery and real chat invocation before claiming end-to-end AI support.

## Phase boundary
The first slice is working local code with tests and install instructions. A release requires actual host-side UI and agent verification. Document any missing integration as a gap; do not mark it complete.
