/* Synthetic fixtures only. No publisher access, model calls, or production DB. */
function installReaderPreview(React, createRoot, surface) {
  const names = ['The Engineering Notebook', 'Interface Notes', 'Systems Weekly', 'Small Things'];
  const titles = ['A calmer way to keep up with the web', 'Designing APIs that are easy to change', 'The small details that make a good reading experience', 'What happens when a background job fails?', 'Building software that leaves room to think', 'A practical guide to useful defaults', 'Readable interfaces start with a little restraint'];
  let sources = names.map(name => ({ name, url: 'https://example.org', feed: 'https://example.org/feed.xml', last_scanned: '2026-10-18 09:30' }));
  let articles = Array.from({ length: 72 }, (_, index) => ({ id: index + 1,
    title: titles[index % titles.length] + (index >= titles.length ? ' · Field note ' + (index + 1) : ''),
    blog: names[index % names.length], url: 'https://example.org/preview/' + (index + 1),
    published: index < 8 ? '2026-10-18' : index < 20 ? '2026-10-17' : '2026-10-16', status: (index + 1) % 8 ? 'new' : 'read',
  }));
  const summary = id => ({ text: '## A little more room to read\n\nThis is **sample summary copy**, included only to preview the interface. It is not reporting or a summary of a real publication.\n\nA good reading experience gives the words room to breathe. The headline stays visible, supporting details recede, and the next action is easy to find.\n\n### Things to notice\n\n- The reading column stays comfortable rather than stretching across the window.\n- **Saved summaries** open without contacting a publisher or model.\n- Inline `code` and clear spacing make technical articles easier to follow.\n\nYou can keep several articles open, switch between light and dark, and choose a denser list without losing your place.',
    provider: 'demo', model: 'synthetic-fixture', coverage: 'preview text only', generated_at: 1792287000,
    cached: true, stale: id % 7 === 0 });
  const calls = [];
  let fault = '', delay = 25;
  function request(route, opts) {
    const body = opts?.body ? (typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body) : null;
    const url = new URL(route.replace('/api/plugins/hermes-blogwatcher', ''), 'https://fixture.invalid');
    const method = opts?.method || 'GET';
    calls.push({ method, path: url.pathname, query: url.search, body });
    return new Promise((resolve, reject) => setTimeout(() => {
      if (fault && (fault === 'all' || fault === 'list' && url.pathname === '/articles' || fault === 'summary' && url.pathname.endsWith('/summary'))) {
        reject(new Error('Preview connection interrupted')); return;
      }
      let value;
      if (method === 'GET' && url.pathname === '/blogs') value = { items: sources };
      else if (method === 'GET' && url.pathname === '/articles') {
        const filtered = articles.filter(a => (url.searchParams.get('all_articles') === 'true' || a.status !== 'read') && (!url.searchParams.get('blog') || a.blog === url.searchParams.get('blog')));
        const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 50);
        value = { items: filtered.slice(offset, offset + limit), total: filtered.length, offset, limit };
      } else if (method === 'GET' && /^\/articles\/\d+\/summary$/.test(url.pathname)) {
        const id = Number(url.pathname.split('/')[2]); value = { summary: id % 3 ? summary(id) : null };
      } else if (method === 'POST' && ['/articles/read', '/articles/unread'].includes(url.pathname)) {
        articles = articles.map(a => a.id === body.article_id ? { ...a, status: url.pathname.endsWith('/unread') ? 'new' : 'read' } : a);
        value = { message: url.pathname.endsWith('/unread') ? 'Article marked unread' : 'Article marked read' };
      } else if (method === 'POST' && url.pathname === '/articles/read-all') {
        if (!body.confirm) { reject(new Error('Confirmation required')); return; }
        articles = articles.map(a => !body.blog || a.blog === body.blog ? { ...a, status: 'read' } : a);
        value = { message: 'Articles marked read' };
      } else if (method === 'POST' && url.pathname === '/articles/summary') {
        if (!body.consent) { reject(new Error('Consent required')); return; }
        value = { ...summary(body.article_id), cached: false, stale: false };
      } else if (method === 'POST' && url.pathname === '/scan') value = { message: 'Preview scan complete. No publishers were contacted.' };
      else if (method === 'POST' && url.pathname === '/blogs/remove') {
        if (!body.confirm) { reject(new Error('Confirmation required')); return; }
        sources = sources.filter(s => s.name !== body.name); articles = articles.filter(a => a.blog !== body.name); value = { message: 'Preview source removed' };
      } else if (method === 'POST' && url.pathname === '/blogs') { sources.push({ ...body, feed: body.feed_url, last_scanned: 'Never' }); value = { message: 'Preview source added' }; }
      else { reject(new Error('Unsupported fixture request: ' + url.pathname)); return; }
      resolve(JSON.parse(JSON.stringify(value)));
    }, method === 'POST' ? Math.max(delay, 250) : delay));
  }
  const params = new URLSearchParams(location.search);
  if (params.has('theme') || params.has('density')) {
    try { localStorage.setItem('hermes-blogwatcher.reader.preferences', JSON.stringify({ theme: params.get('theme') || 'system', density: params.get('density') || 'comfortable' })); } catch (_) {}
  }
  let root;
  window.readerPreview = { calls, request, setFault(value) { fault = value; }, setDelay(value) { delay = value; },
    setHostTheme(value) { document.documentElement.dataset.host = value; },
    mount(component, props) { root = createRoot(document.getElementById('root')); root.render(React.createElement(component, props)); },
  };
  document.getElementById('host-theme').onclick = () => {
    const next = document.documentElement.dataset.host === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.host = next;
    document.getElementById('host-theme').textContent = 'Host: ' + next;
  };
  if (surface === 'web') {
    window.__HERMES_PLUGIN_SDK__ = { React, hooks: React, fetchJSON: request };
    window.__HERMES_PLUGINS__ = { register: (_id, component) => window.readerPreview.mount(component) };
  }
}
