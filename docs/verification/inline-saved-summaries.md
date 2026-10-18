# Inline saved summaries verification

The approved scope covered safe Markdown formatting, inline details for independently expanded article rows, immediate offline lookup of saved summaries and explicit regeneration.

## Automated checks

- All 45 Python tests passed with the installed-runtime bridge probe enabled. Coverage includes offline cache reads after recreating the service, stale labels, successful regeneration that bypasses the cache, failed regeneration that preserves saved output, real HTTP route lookups with 404 responses and explicit regeneration, and the original CLI lifecycle in an isolated database.
- All 10 web and 7 Desktop behavioral tests passed. Headings, lists, bold text and inline code render through safe React text nodes. Raw HTML does not execute, and opening details does not trigger paid inference. Tests also cover independent row state and late responses after closing and reopening an article.
- Plugin validation passed. No Hermes core changes were made.

## Browser checks

The browser fixture loaded the actual web plugin with real React. Clicking test article 20 kept scrollY at 2882 before and after expansion, with details inside the article's list item. Headings, strong, code and ordered lists appeared in the DOM, and the injected script count was zero. Opening article 21 kept two rows expanded and recorded zero POST calls.

The fixture data was synthetic. These checks did not test inference or production API deployment.

## Cache behavior and review fixes

Existing successful cache files are read directly. A GET does not migrate the cache, request publisher content or call a model. Results older than seven days stay available with a stale label until bounded-storage eviction. Regenerate keeps the previous output visible while working or after an error, and requires explicit consent to provider costs.

Independent review found two backend bugs, and regression tests reproduced both before they were fixed. Regeneration now has its own in-flight identity instead of inheriting a normal cache-read request. Bounded cache reads accept valid multibyte output up to the generation character limit. Atomic writes use unique temporary files for concurrent modes. The UI review found no important reproducible defect.

## Deployment status

This verification did not change the production installation. Desktop on Mac needs its client file updated separately. Remote CI was still pending publication.
