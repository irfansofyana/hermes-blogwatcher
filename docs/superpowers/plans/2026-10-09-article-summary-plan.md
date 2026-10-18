# Reliable article summaries implementation plan

> Agentic workers must use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan one task at a time. Track progress with the checkboxes.

Goal: Add article detail panels to both Hermes surfaces, with trustworthy summaries generated only when explicitly requested.
Architecture: Share VPS-side article lookup, bounded safe extraction, host-managed model invocation, and a profile-scoped result cache. Keep the native Desktop and web panels thin, with no changes to Hermes core or Blogwatcher storage.
Tech stack: Python/FastAPI, Hermes plugin ctx.llm, an HTTPS client with a pinned destination and TLS verification, an article extraction library, Hermes React plugin SDKs, Python unittest, and Node behavioral tests.
Spec: docs/superpowers/specs/2026-10-09-article-summary-design.md

## Global constraints
- Accept only HTTP(S). Reject private, loopback, link-local, multicast, reserved, and unspecified IPv4/IPv6 addresses, including mapped addresses.
- Allow at most 3 redirects. Set a 20-second wall-clock deadline for fetching, limit the decoded response to 2 MiB, and cap model input at 30000 characters.
- Set the model facade timeout to 60 seconds and limit output to 800 tokens. Do not use tools or plugin-level retries. Approved amendment: disclose and inherit the Hermes-owned retry/fallback policy.
- Cache successful results for 7 days, up to 50 MiB. Allow at most 2 concurrent generations per profile.
- Do not patch Hermes core, put credentials in the renderer, use direct provider clients, or write to Blogwatcher SQLite.
- Do not install or restart the live system, or merge, without user approval.

## Review focus
- For DNS rebinding protection, validate and connect to the same resolved IP while preserving TLS hostname checks.
- Article identity, model configuration, cache, and work ownership must all follow the request profile to prevent cross-profile data access.
- After an article or connection switch, a late result must not display the previous summary for the new selection.
- If a disconnect or timeout leaves the generation outcome unknown, do not silently retry the paid call.
- State the coverage of extracted or truncated publisher content explicitly, including partial content. Do not guarantee completeness.

### Task 1: Verify the host-owned LLM bridge
Files: tests/test_summary_bridge.py, summary_bridge.py, __init__.py, dashboard/plugin_api.py.
Contract: `summarize_text(text, source_url)` uses plugin-scoped `ctx.llm` to return model text, model/provider, and usage, or a typed capability-unavailable error. The contract must not include credentials or arbitrary provider overrides.
- [ ] Write a failing integration test that loads the real plugin through a temporary HERMES_HOME with plugins.isolation=host. The HTTP route must invoke the plugin-scoped context. Assert `result['provider']` and nonempty `result['text']` only on a genuine successful call.
- [ ] Run the isolated bridge test and record where it fails. Dashboard API imports are separate modules and do not receive ctx automatically, so do not rely on shared globals set at import time.
- [ ] Implement the supported context handoff within the package. If the host does not offer a supported route-to-context contract, stop and report the specific missing capability. Do not bypass host credential ownership.
- [ ] Make an explicit, tiny live inference call and record the actual model/provider, then run the plugin validator. Commit only after the bridge is proven.

### Task 2: Safe article lookup and retrieval
Files: article_content.py, tests/test_article_content.py, dashboard/plugin_api.py.
Contracts: `get_article(article_id)` resolves existing CLI records. `fetch_article(url)` returns text, the original/final URL, and coverage. `ContentError(code, message)` carries safe errors.
- [ ] Write failing tests for nonexistent IDs, private/mapped addresses, redirect-to-metadata, rebinding, timeouts, oversized decoded bodies, and challenge/login pages. Example assertion: `with self.assertRaises(ContentError): fetch_article('http://169.254.169.254/latest/meta-data/')`.
- [ ] Run each targeted test and confirm it fails before implementing the behavior it covers.
- [ ] Implement DNS-pinned HTTP(S) connections, TLS name verification, per-hop validation, bounded reads, and extraction. Declare bounded dependency versions in the plugin manifest. Use plugin dependency consent/install isolation; do not edit the Hermes environment.
- [ ] Add a controlled public extraction integration check and preserve provenance. Never pass title-only text to the model as article content. Run all tests, then commit.

### Task 3: Cache and generation lifecycle
Files: article_summary.py, tests/test_article_summary.py, dashboard/plugin_api.py.
Contract: Requests must use an existing article ID and explicit consent. Responses include an overview and key points or escaped summary text, plus coverage, source URLs, timestamps, model/provider, and a cached flag. Errors must never appear as successful responses.
- [ ] Write failing tests covering duplicate concurrent requests, removed articles, content/model/prompt invalidation, expiry, size eviction, profile isolation, empty/malformed model output, and failures not being cached. For example, concurrent identical calls must assert that the model call count equals one and both responses have matching provenance.
- [ ] Implement profile-scoped storage and request ownership, a fetch deadline plus a 60-second model deadline, atomic cache writes for successful results only, and the 2-generation limit. Do not persist raw HTML or credentials.
- [ ] Test recovery from failures and timeouts. Prefer a bounded synchronous request/response if the bridge supports its deadline. If async jobs are necessary, persist opaque ownership and restart failure states, and test them explicitly. Do not hide work in untracked threads.
- [ ] Run the full backend tests and a real live summary before committing. Do not synthesize the provider result.

### Task 4: Desktop and web detail panels
Files: desktop/plugin.js, dashboard/dist/index.js, tests/test_desktop.cjs, tests/test_ui.cjs.
Contract: Clicking a title opens details without fetching, running inference, or changing read state. Explicitly choosing Summarize sends the article ID plus consent through the existing authenticated backend. Closing or switching must prevent stale state.
- [ ] Write failing behavioral tests for title clicks that make zero model/read calls, explicit consent, fetching/summarizing/error states, switching selection, cached results, and preserved read state.
- [ ] Implement a metadata panel with Summarize and Open original. Use escaped text and native theme tokens. Show an explicit provider-data notice before the first generation.
- [ ] Add Refresh and actionable errors for 401/404/405/network/CLI/model failures. If loading fails, show unknown/stale rather than zero. Set request deadlines above the backend budget, and do not automatically retry mutations or generation.
- [ ] Run Node behavioral tests and real web browser tests. Deliver an updated local Desktop file for Mac and obtain user-assisted remote verification. Do not claim that the agent controls the Mac.
- [ ] Commit the tested UI work.

### Task 5: Release verification and installation docs
Files: README.md, plugin.yaml, dashboard/manifest.json, .github/workflows/tests.yml, docs/verification/article-summaries.md.
- [ ] Add CI for Python/JS tests and plugin validation with pinned tool/action versions. Keep fixture networks isolated and secrets out of CI.
- [ ] Test original CLI writes only with an isolated BLOGWATCHER_DB. Check that summary interactions did not change any real read state.
- [ ] Complete an independent security/correctness review, fix concrete findings with regression tests, and run exact-head CI and a live plugin-host summary smoke test.
- [ ] Document extraction fidelity, paid inference, cache retention/limits, remote Mac/VPS packaging, and server restart after API route additions. Record the exact executed results and state any gaps explicitly.
- [ ] Publish the PR without merging. Offer to install the pinned verified commit and provide a separate Mac Desktop artifact. Require scoped consent before restarting the live dashboard.

## Recommended execution method
Use native execution with an independent whole-branch review. The tasks are tightly coupled through the LLM bridge, retrieval, and summary response contracts. Resolve the bridge gate first so parallel work does not rely on assumptions about it.
