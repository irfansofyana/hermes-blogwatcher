'use strict';

// Run both shipped component implementations with:
// node --experimental-vm-modules --test tests/test_reader_ui.cjs
const assert = require('node:assert/strict');
const test = require('node:test');
const { harness, nodes, text, memoryStorage, ARTICLES } = require('./reader_harness.cjs');

const selected = node => node.props['aria-selected'] === true || node.props['aria-selected'] === 'true';
const selectedFalse = node => node.props['aria-selected'] === false || node.props['aria-selected'] === 'false';
const unread = h => h.button(/^Unread(?:\s|$)/);
const allArticles = h => h.button(/^All articles(?:\s|$)/);
const query = call => new URL(call.route, 'https://reader.test').searchParams;
function assertQuery(call, values) {
  assert.ok(call, 'Expected an article-list request');
  for (const [key, value] of Object.entries(values)) assert.equal(query(call).get(key), value, 'article request query: ' + key);
}
function optionPairs(select) {
  return Object.fromEntries(nodes(select).filter(n => n.type === 'option').map(n => [n.props.value, text(n)]));
}
const posts = (h, route) => h.calls.filter(c => c.method === 'POST' && c.route === route);
const summary = value => ({ summary: { text: value, generated_at: 1792200000, cached: true, stale: false, coverage: 'full', provider: 'fixture', model: 'fixture' } });

for (const desktop of [false, true]) {
  const surface = desktop ? 'Desktop' : 'web';
  const check = (name, fn) => test(`${surface}: ${name}`, fn);

  // Removing accessible options, changing their persisted values, or applying
  // the choice outside the reader should break these consumer-visible contracts.
  check('Appearance offers Follow Hermes, Light and Dark with a system default', async () => {
    const h = await harness(desktop);
    const appearance = h.select('Appearance');
    const options = optionPairs(appearance);
    assert.equal(options.system, 'Follow Hermes');
    assert.equal(options.light, 'Light');
    assert.equal(options.dark, 'Dark');
    assert.equal(appearance.props.value, 'system');
    assert.equal(h.root().props['data-theme'], 'system');
  });

  check('dark and light choices change only the plugin-scoped root theme', async () => {
    const h = await harness(desktop);
    h.choose('Appearance', 'dark');
    assert.equal(h.root().props['data-theme'], 'dark');
    assert.equal(h.select('Appearance').props.value, 'dark');
    h.choose('Appearance', 'light');
    assert.equal(h.root().props['data-theme'], 'light');
    h.choose('Appearance', 'system');
    assert.equal(h.root().props['data-theme'], 'system');
    assert.deepEqual(h.globalWrites, [], 'reader appearance must not mutate documentElement, body, or host theme');
    assert.equal(h.window.document.documentElement.dataset.theme, 'light');
    assert.equal(h.window.document.body.dataset.theme, 'light');
    assert.equal(h.window.document.documentElement.className, 'hermes-host light');
  });

  check('Reading density switches comfortable/compact only on the reader root', async () => {
    const h = await harness(desktop);
    const density = h.select('Reading density');
    assert.ok(Object.hasOwn(optionPairs(density), 'comfortable'));
    assert.ok(Object.hasOwn(optionPairs(density), 'compact'));
    assert.equal(density.props.value, 'comfortable');
    assert.equal(h.root().props['data-density'], 'comfortable');
    h.choose('Reading density', 'compact');
    assert.equal(h.root().props['data-density'], 'compact');
    h.choose('Reading density', 'comfortable');
    assert.equal(h.root().props['data-density'], 'comfortable');
    assert.deepEqual(h.globalWrites, [], 'density must not change Hermes document/host styling');
  });

  check('saved appearance and density are restored after remount without assuming a storage key', async () => {
    const storage = memoryStorage();
    const first = await harness(desktop, { storage });
    first.choose('Appearance', 'dark');
    first.choose('Reading density', 'compact');
    await first.settle();
    const restored = await harness(desktop, { storage });
    assert.equal(restored.select('Appearance').props.value, 'dark');
    assert.equal(restored.root().props['data-theme'], 'dark');
    assert.equal(restored.select('Reading density').props.value, 'compact');
    assert.equal(restored.root().props['data-density'], 'compact');
    assert.deepEqual(restored.globalWrites, []);
  });

  check('malformed, null and unrecognized saved preferences safely fall back', async () => {
    const storage = memoryStorage();
    const first = await harness(desktop, { storage });
    first.choose('Appearance', 'dark');
    first.choose('Reading density', 'compact');
    await first.settle();
    const saved = storage.snapshot();
    assert.ok(Object.keys(saved).length, 'preference changes must be persisted');
    // Discover only keys, not implementation names or JSON property names.
    // Keep the real shape for the invalid-enum case so validation is exercised.
    const variants = [
      Object.fromEntries(Object.keys(saved).map(key => [key, '{'])),
      Object.fromEntries(Object.keys(saved).map(key => [key, 'null'])),
      Object.fromEntries(Object.entries(saved).map(([key, value]) => [key, value.replace(/dark/g, 'unsupported-theme').replace(/compact/g, 'unsupported-density')])),
    ];
    for (const seed of variants) {
      const h = await harness(desktop, { storage: memoryStorage(seed) });
      assert.equal(h.root().props['data-theme'], 'system');
      assert.equal(h.root().props['data-density'], 'comfortable');
      assert.equal(h.select('Appearance').props.value, 'system');
      assert.equal(h.select('Reading density').props.value, 'comfortable');
    }
  });

  for (const storageMode of ['unavailable', 'getter-throws', 'read-throws', 'write-throws']) {
    check(`unavailable localStorage (${storageMode}) does not prevent mounting or changing preferences`, async () => {
      const h = await harness(desktop, { storageMode });
      h.choose('Appearance', 'dark');
      h.choose('Reading density', 'compact');
      await h.settle();
      assert.equal(h.root().props['data-theme'], 'dark');
      assert.equal(h.root().props['data-density'], 'compact');
      assert.deepEqual(h.globalWrites, []);
    });
  }

  check('Unread and All articles expose the current selection through aria-selected', async () => {
    const h = await harness(desktop);
    assert.ok(selected(unread(h)), 'Unread must initially expose aria-selected=true');
    assert.ok(selectedFalse(allArticles(h)), 'All articles must initially expose aria-selected=false');
    h.click(allArticles(h));
    assert.ok(selected(allArticles(h)));
    assert.ok(selectedFalse(unread(h)));
    h.click(unread(h));
    assert.ok(selected(unread(h)));
    assert.ok(selectedFalse(allArticles(h)));
  });

  check('Unread/All articles requests preserve pagination and reset offset on mode changes', async () => {
    const h = await harness(desktop);
    assertQuery(h.articleCalls().at(-1), { all_articles: 'false', offset: '0', limit: '50', blog: null });
    h.click('Next');
    assertQuery(h.articleCalls().at(-1), { all_articles: 'false', offset: '50' });
    await h.respondToLists();
    h.click(allArticles(h));
    assertQuery(h.articleCalls().at(-1), { all_articles: 'true', offset: '0' });
    await h.respondToLists();
    h.click('Next');
    assertQuery(h.articleCalls().at(-1), { all_articles: 'true', offset: '50' });
    await h.respondToLists();
    h.click(unread(h));
    assertQuery(h.articleCalls().at(-1), { all_articles: 'false', offset: '0' });
    assert.equal(h.button('Previous').props.disabled, true);
  });

  check('selecting and clearing a source preserves mode and resets the requested offset', async () => {
    const h = await harness(desktop);
    h.click(allArticles(h)); await h.respondToLists();
    h.click('Next'); await h.respondToLists();
    h.selectSource('Beta & Bytes');
    assertQuery(h.articleCalls().at(-1), { all_articles: 'true', blog: 'Beta & Bytes', offset: '0' });
    await h.respondToLists();
    h.click('Next'); await h.respondToLists();
    assertQuery(h.articleCalls().at(-1), { all_articles: 'true', blog: 'Beta & Bytes', offset: '50' });
    h.selectSource('');
    assertQuery(h.articleCalls().at(-1), { all_articles: 'true', blog: null, offset: '0' });
  });

  // A global busy flag, a guard that only takes effect after rerender, or a
  // refresh captured from the old filter would each fail a different test.
  check('mark-read has row-local pending state and unrelated article controls remain usable', async () => {
    const h = await harness(desktop);
    h.click(h.readControl(101));
    const pending = h.readControl(101);
    assert.ok(pending.props.disabled || [true, 'true'].includes(pending.props['aria-busy']) || [true, 'true'].includes(pending.props['aria-disabled']), 'the affected article must expose a pending/disabled control');
    assert.ok(!h.readControl(202).props.disabled, 'another article must not be disabled by a read request');
    const otherTitle = h.button(ARTICLES[1].title, h.row(202));
    assert.ok(!otherTitle.props.disabled, 'another article can still expand');
    h.click(otherTitle);
    assert.ok(h.calls.some(c => c.method === 'GET' && c.route === '/articles/202/summary'));
    h.click(h.readControl(202));
    assert.deepEqual(posts(h, '/articles/read').map(c => h.body(c).article_id), [101, 202]);
  });

  check('a second mark-read activation before rerender cannot send a duplicate POST', async () => {
    const h = await harness(desktop);
    const read = h.readControl(101);
    // Deliberately retain the same rendered handler: state-only guards miss
    // two immediate activations before React commits its next render.
    read.props.onClick();
    read.props.onClick();
    assert.equal(posts(h, '/articles/read').length, 1, 'one in-flight mark-read POST per article, even before rerender');
    assert.deepEqual(h.body(posts(h, '/articles/read')[0]), { article_id: 101 });
  });

  check('a late read response cannot replace the newly selected source view', async () => {
    const h = await harness(desktop);
    h.click(h.readControl(101));
    const read = posts(h, '/articles/read')[0];
    h.selectSource('Beta & Bytes');
    assertQuery(h.articleCalls().at(-1), { blog: 'Beta & Bytes', offset: '0' });
    const current = { items: [{ ...ARTICLES[1], title: 'Current Beta filtered result' }], total: 1 };
    await h.respondToLists(current);
    assert.match(text(h.render()), /Current Beta filtered result/);
    read.resolve({ message: 'Article marked read' });
    await h.settle();
    // If an action refreshes, the server responds according to the actual
    // requested filter. Old-filter results must never replace the new view.
    await h.respondToLists(params => params.get('blog') === 'Beta & Bytes' ? current : { items: [{ ...ARTICLES[0], title: 'Obsolete unfiltered result' }], total: 1 });
    assert.match(text(h.render()), /Current Beta filtered result/);
    assert.doesNotMatch(text(h.render()), /Obsolete unfiltered result/);
  });

  check('article metadata does not expose internal #id values', async () => {
    const h = await harness(desktop);
    assert.doesNotMatch(text(h.row(101)), /#101\b/);
    assert.doesNotMatch(text(h.row(202)), /#202\b/);
    assert.match(text(h.row(101)), /Alpha Journal/);
  });

  check('opening multiple summaries remains inline and never generates or marks read automatically', async () => {
    const h = await harness(desktop);
    h.click(ARTICLES[0].title);
    h.click(ARTICLES[1].title);
    const first = h.calls.find(c => c.route === '/articles/101/summary');
    const second = h.calls.find(c => c.route === '/articles/202/summary');
    assert.ok(first && second, 'both articles must request only their saved summaries');
    assert.equal(first.method, 'GET'); assert.equal(second.method, 'GET');
    first.resolve(summary('Saved first summary'));
    second.resolve(summary('Saved second summary'));
    await h.settle();
    assert.match(text(h.row(101)), /Saved first summary/);
    assert.match(text(h.row(202)), /Saved second summary/);
    assert.equal(h.calls.filter(c => c.method === 'POST').length, 0);
    assert.deepEqual(h.confirmations, []);
    h.window.accept = false;
    h.click('Regenerate', h.row(101));
    assert.equal(posts(h, '/articles/summary').length, 0, 'declined consent must not generate');
    assert.equal(h.confirmations.length, 1);
  });
}
