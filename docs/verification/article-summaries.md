# Article summary execution record

Plan: docs/superpowers/plans/2026-10-09-article-summary-plan.md
Base main: 6ea58daecbbef3d02f7d075e61940fffdaa064eb

- The user approved implementation directly on main and a concise README. These repository edits did not change the production installation.
- Bridge: 78fb3c29fc04a242eb64d6279bb964e0d0c0d625. Independent implementation tests verified that plugin-host mode passes context explicitly through the package module. The parent agent also inspected the source and exercised the production summary API separately.
- Retrieval validates destinations, pins sockets to DNS results, verifies TLS hostnames, handles redirects, bounds retrieved text and extracts article content semantically. Unit tests passed. A live fetch of a public article returned 7957 characters and was labeled excerpt-only.
- Only successful summaries are cached, using atomic writes. Entries expire after seven days, and eviction keeps the cache within 50MiB. The cache key includes content, configuration and the prompt. Generation is limited to two slots, with concurrent requests for the same article deduplicated. Unit tests cover successful caching, invalidation after model/config/content changes, duplicate calls and empty model results.
- Clicking an article title opens its details without generating a summary or changing its read state. Summary generation requires explicit consent. The panel was checked in a web browser, and tests cover both interfaces. Responses include attribution and coverage, rendered as escaped text.
- A live smoke test of the production API in an isolated PluginHost returned HTTP200 and a genuine summary of a subscribed Simon Willison article, using provider=openai-codex model=gpt-6.1-sol-900k. No provider credentials were read or copied, and the main service was not restarted.
- A separate `hermes dashboard` process ran on loopback port 9137 with an isolated home and a symlink to the checkout. Its authenticated production summary endpoint also returned HTTP200 without calling host.load manually, and a web browser opened the details successfully.
- At this point, the local suite had 37 Python tests, with one optional runtime integration test skipped in the plain interpreter. All five JS behavior tests passed. The explicit runtime integration/live bridge command still needed to run separately before publication.
- A CI workflow was added, but remote CI had not yet been exercised.
- Review fixes made concurrent failures share an in-flight Future; the regression test had reproduced two generations before the fix. Full retrieval now runs in a disposable worker that is killed at an absolute deadline, and the slow-header regression passes. The final local suite passed 39 Python and five JavaScript tests, including runtime bridge integration.
- The approved retry-policy amendment leaves internal retries and fallbacks to Hermes and requires disclosure before inference. Plugin-level retries and duplicate generations remain prohibited. No host-global retry settings were changed.

## Implementation decisions

- Extraction uses a small standard-library HTML parser that favors article/main content and ignores navigation and scripts. The fallback returns an excerpt, so full-fidelity extraction isn't guaranteed. This avoids changing Hermes dependencies. Complex publisher layouts can still fail or produce weaker coverage, and those limitations remain visible.
- Summary generation uses a bounded synchronous call. The UI shows 'Fetching and summarizing…' together because there is no streaming status channel. Closing the selection doesn't cancel a model call, and the plugin doesn't automatically retry paid calls. A long-running host call may outlast the client's patience, so timeouts and unknown outcomes must remain explicit.
- This work followed the user's explicit instruction to work directly on main, overriding the original plan's PR-only workflow. There was no automatic deployment or service restart. Mac runtime testing requires the user's help.
