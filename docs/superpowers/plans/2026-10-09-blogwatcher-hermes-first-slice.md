# Blogwatcher Hermes Companion first slice implementation plan

> Agentic workers must use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan one task at a time. Track progress with the checkbox (`- [ ]`) syntax.

Goal: Deliver a testable, CLI-backed Blogwatcher inbox and source controls in both Hermes UI surfaces, plus tools for agents.

Architecture: Agent plugin handlers and an authenticated FastAPI dashboard router share a single Python CLI adapter. Separate Desktop and web SDK entrypoints consume a stable JSON response. Neither entrypoint executes the CLI or accesses SQLite.

Tech stack: Python 3 standard library, Hermes plugin API/FastAPI, plain ESM for Desktop, plain React via the Hermes web SDK, unittest, and Node syntax checks.

Spec: `docs/superpowers/specs/2026-10-09-blogwatcher-hermes-design.md`

## Global constraints

- Use only the original `Hyaxia/blogwatcher` and honor `BLOGWATCHER_DB`. Do not access SQLite directly or execute shell commands.
- Allow mutations only through supported commands: add/remove, scan, and read/unread/read-all. Do not support source editing or article deletion.
- Keep a separate web server, automatic AI summary, and custom chat client out of this slice.
- Test CLI writes with an isolated database, never the user's data.

## Review focus

- A source name containing quotes/semicolons must remain one argv element. Check this in an adapter test.
- A missing CLI, timeout, or nonzero exit must return an error rather than an empty list. Check these cases in adapter tests.
- If an article listing is malformed or its format changes, the parser must fail closed rather than silently omit entries. Add a parser test.
- Destructive remove/read-all operations must require explicit UI confirmation. Check this in the UI review and a route test.
- URLs and titles containing HTML must render as escaped text, not markup. Check this in the UI review.

### Task 1: CLI adapter and parser

Files: `blogwatcher_core.py`, `tests/test_core.py`.
Interfaces: `BlogwatcherCLI(binary=None, database=None).blogs()`, `.articles(all_articles=False, blog=None)`, `.add(name,url,feed_url=None,scrape_selector=None,user_agent=None)`, `.remove(name)`, `.scan(blog=None)`, `.read(id)`, `.unread(id)`, `.read_all(blog=None)` return JSON-safe dict/list results. `BlogwatcherError` identifies failures.

- [ ] Write failing tests using a temporary executable fake CLI. Cover article/source parsing, the stdout cap, safe argv, and errors. For example, use `self.assertEqual(cli.articles()[0]['title'], 'Hello')` for an output block containing `[42] [new] Hello`.
- [ ] Run `python -m unittest tests.test_core -v` and inspect the expected missing-module failure.
- [ ] Implement the smallest adapter using `subprocess.run([binary,*args], shell=False, timeout=...)`, bounded output, strict record parsing, and an exact command allowlist.
- [ ] Run the targeted tests, then `python -m unittest discover -s tests -v`.
- [ ] Commit only this tested task.

### Task 2: Backend HTTP and agent tools

Files: `dashboard/plugin_api.py`, `dashboard/manifest.json`, `plugin.yaml`, `__init__.py`, `tests/test_plugin.py`.
Interfaces: Mount the FastAPI router at `/api/plugins/hermes-blogwatcher/`. Provide JSON responses for `GET /articles`, `GET /blogs`, POST `/blogs`, `/blogs/remove`, `/scan`, `/articles/read`, `/articles/unread`, `/articles/read-all`. Agent tool handlers expose only bounded, read-only article/source listing.

- [ ] Write tests for request validation and handler delegation against the isolated fake CLI. A bad article id must yield a client error without invoking the CLI.
- [ ] Run `python -m unittest tests.test_plugin -v` and verify that it fails because the route/handler is missing.
- [ ] Implement FastAPI route handlers, explicit validation, and safe error responses. Register agent tools with narrow JSON schemas and allowlisted handlers.
- [ ] Run the targeted tests and the full suite, then validate the manifest JSON and plugin loader.
- [ ] Commit only this tested task.

### Task 3: Hermes web and Desktop surfaces

Files: `dashboard/dist/index.js`, `desktop/plugin.js`, `dashboard/style.css`, `tests/test_ui_contract.py`.
Interfaces: Use the same backend API as Task 2. Render an inbox, filters, source list/add/remove, scan, and read/unread/read-all. Require confirmation for bulk/destructive operations.

- [ ] Before writing JS, write failing UI contract tests for the expected SDK entrypoints and API routes.
- [ ] Run the targeted test and confirm that it fails.
- [ ] Build a native web tab and Desktop page using each supported SDK. Reuse the layout and copy, but do not assume their JS components are interchangeable.
- [ ] Run JS syntax checks and tests. Exercise both surfaces in running Hermes; if that is not possible, report the gap explicitly.
- [ ] Commit only this tested task.

### Task 4: Installation and isolated real-CLI verification

Files: `README.md`, `tests/test_real_cli.py`.
Interfaces: Install through the Hermes plugin package directory. Document the enable switches and the requirement to have the CLI on the same host.

- [ ] Write a failing isolated real-CLI test, skipping it if the CLI is absent. Use `BLOGWATCHER_DB` in a temporary directory and a local RSS fixture.
- [ ] Run the test and inspect the failure, then wire up the fixture and supported actions.
- [ ] Test the real CLI, the whole unittest suite, `node --check` for JS, and Hermes plugin validation. Document only verified behavior and explicitly list the remaining integration gaps.
- [ ] Commit the tested task. Publish a branch/PR only after reviewing its external effects, if you choose to publish one.
