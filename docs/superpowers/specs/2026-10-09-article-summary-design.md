# Article detail and reliable on-demand summaries

## Approved intent
Improve the existing original-Blogwatcher companion on main without patching Hermes. Both the Hermes web tab and Mac Desktop UI must support an article detail panel and explicit summarization through the VPS backend. Clicking an article does not spend tokens or mark it read. Blogwatcher's database remains owned by the CLI.

## User experience
- Clicking a title opens an article detail panel with the title, source, published date and original URL. Open original and Summarize are separate actions.
- Summarize explicitly authorizes retrieval and the sending of retrieved article text to the configured Hermes model provider. Show this notice before the first generation. Never claim that inference is private or local unless it is configured that way.
- The panel has these states: metadata ready, fetching content, summarizing, completed and failed. Closing or switching panels must prevent a late result from appearing under another article.
- A successful result includes an overview, key points, original and final source URLs, retrieved-at and generated-at timestamps, model/provider attribution, a coverage label and an indication of whether it came from the cache.
- Use the coverage label 'extracted article text'; it does not guarantee publisher completeness. Label truncated input 'excerpt only'. Insufficient or inaccessible content must produce no summary. Never invent a summary from a headline.
- Render summaries as escaped text. Do not execute article HTML or arbitrary model markup.

## Architecture
Use one server-side summary service for both plugin surfaces. New authenticated routes accept an existing article ID, not an arbitrary URL supplied by the browser. The backend resolves the ID through original Blogwatcher CLI output. Article extraction, cache and model calls belong in independent modules with test seams.

Prefer host-owned Hermes LLM calls to direct provider SDKs. Keep keys out of the renderer, and do not introduce a separate agent or a new chat runtime. A technical integration gate must prove that dashboard route -> plugin-scoped ctx.llm works in actual Hermes plugin-host mode. Do not assume register(ctx) and dashboard imports share module globals. If the supported context cannot be reached, report the missing contract. Do not patch core or copy credentials.

## Retrieval safety
- Accept HTTP(S) URLs only, with no credentials in URLs. Reject private, loopback, link-local, multicast, reserved and unspecified IPv4/IPv6 addresses, including mapped addresses and metadata endpoints.
- Validate every redirect, with at most 3 allowed. Resolve DNS and pin the approved destination used by the connection while preserving TLS host verification. Resolving once and allowing the HTTP client to resolve again is insufficient protection against DNS rebinding.
- Environment proxies must not bypass validation. Do not use browser automation, logged-in sessions, paywall bypass or JavaScript execution.
- Set a fetch wall-clock deadline of 20 seconds, a maximum decoded response of 2 MiB and a maximum model input of 30000 characters. Allow HTML/plain-text only. Reject login pages, challenges and empty extractions. Use an article extraction library to remove scripts, styles and navigation.

## Model and cache behavior
- Make one host-managed facade call with a 60-second per-call timeout, a maximum output of 800 tokens and no tools. The user approved inheriting Hermes's internal retry/fallback policy; disclose the possible additional token spend before generation. The plugin itself must never retry generation. Treat article text as untrusted evidence and explicitly separate it from system instructions.
- Cache successful results in plugin-owned, profile-scoped storage, never in Blogwatcher SQLite. The key includes the article URL, normalized content hash, prompt version and resolved model configuration. Cache results for 7 days and cap storage at 50 MiB, evicting the oldest records. Do not persist credentials or raw HTML.
- Look up metadata on every request so no summary is returned for a removed article. Concurrent requests for the same article/config share one generation and the same failure, with no plugin-level automatic retry. Hermes-owned retries/fallbacks remain permitted by explicit user approval. Limit concurrent generations to 2 per profile. A timeout or disconnect may already have consumed tokens; say so before offering an explicit retry.
- Do not use a process-global cross-profile cache or credentials. Background tasks must preserve their owning profile's scope. If jobs are asynchronous, expose opaque job IDs and reject cross-profile reads. On restart, in-flight jobs must fail clearly. Never report completion when state is missing.

## Reliability improvements in this slice
- Initial loading and refresh failures must not appear as '0 articles'. When a refresh fails, preserve the existing list and visibly mark it as stale.
- The refresh button and read-only diagnostics must distinguish API missing/disabled (404), wrong method/route (405), expired auth (401), CLI unavailable, parse failure and temporary network failure.
- Use request generations and stable article identity to prevent obsolete list/summary responses from replacing the current selection.
- Never automatically retry mutations. Tell the user to refresh if the outcome is unknown.
- UI API deadlines must exceed the server's bounded work. If jobs are used, poll through host-supported query primitives and stop on unmount. Preserve the instructions for deploying the Mac-local Desktop file + VPS package, including the necessary dashboard restart after route changes.

## Acceptance and release gates
1. Tests demonstrate that a title click makes no model call and that read state stays unchanged on detail/summary.
2. Tests cover blocked network destinations, redirects, DNS rebinding, oversized/slow responses, insufficient content, malicious HTML and prompt injection separation.
3. Tests cover cache invalidation, concurrent duplicate requests, cross-profile isolation, model/auth failure, timeout, malformed/empty model result, restart recovery and stale selection.
4. Exercise the real Hermes plugin loader and plugin-host HTTP route with host-owned model auth. A mocked provider is not evidence of successful live generation.
5. Test web interactions on an isolated DB and the Mac-local UI against VPS APIs. Explicitly identify user-assisted Mac checks when the agent cannot access the Mac.
6. Require independent code review, exact-head CI and plugin validation before release. Publication is a PR; merge or active deployment requires user approval. Do not restart a service without scoped user approval.

## Alternatives considered
- Generate immediately on click: rejected because inspecting an article should not create hidden cost.
- Use existing chat for every summary: rejected for this flow because the result belongs in the detail panel and should not clutter conversations.
- Direct provider client: rejected unless the supported Hermes bridge is genuinely unavailable and the user explicitly approves a separate credential/configuration boundary.

## Deferred
Title search, bookmarks, tagging, digests, relevance ranking, automatic summaries, and full chat embedding are out of scope.

## Source
Hermes Plugin LLM Access: https://hermes-agent.nousresearch.com/docs/developer-guide/plugin-llm-access (checked during design; documents host-managed ctx.llm.complete/acomplete, timeouts, audit, provider/model attribution and trust gates).
