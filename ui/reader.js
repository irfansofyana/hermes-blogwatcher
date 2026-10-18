/* Shared reading experience. Built into each host's standalone delivery file. */
function createBlogwatcherPage(React, adapter, styles) {
  const { createElement: h, useState, useEffect, useRef } = React;
  const PREFS_KEY = 'hermes-blogwatcher.reader.preferences';
  const LIMIT = 50;

  function validPreferences(value) {
    const input = value && typeof value === 'object' ? value : {};
    return {
      theme: ['system', 'light', 'dark'].includes(input.theme) ? input.theme : 'system',
      density: ['comfortable', 'compact'].includes(input.density) ? input.density : 'comfortable',
      sourcesOpen: typeof input.sourcesOpen === 'boolean' ? input.sourcesOpen : true,
    };
  }
  function readPreferences() {
    try { return validPreferences(JSON.parse(window.localStorage.getItem(PREFS_KEY))); }
    catch (_) { return validPreferences(null); }
  }
  function savePreferences(value) {
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(value)); }
    catch (_) { /* Reading must work when browser storage is unavailable. */ }
  }
  function formattedDate(value) {
    if (!value) return 'Date unknown';
    // Parse a date-only value at local noon, never UTC midnight (which can show yesterday).
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + 'T12:00:00' : value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function summaryMarkdown(text) {
    // Deliberately small Markdown subset. Publisher HTML/links remain inert text.
    function inline(value) {
      return value.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((part, key) =>
        part.startsWith('`') && part.endsWith('`') ? h('code', { key }, part.slice(1, -1)) :
        part.startsWith('**') && part.endsWith('**') ? h('strong', { key }, inline(part.slice(2, -2))) : part);
    }
    const blocks = [], lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    let index = 0;
    const list = line => /^\s*([-+*]|\d+[.)])\s+(.+)$/.exec(line);
    const heading = line => /^(#{1,6})\s+(.+)$/.exec(line);
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) { index++; continue; }
      const title = heading(line), item = list(line), key = index;
      if (title) {
        blocks.push(h('h' + title[1].length, { key }, inline(title[2]))); index++;
      } else if (item) {
        const ordered = /^\d/.test(item[1]), items = [];
        while (index < lines.length) {
          const next = list(lines[index]);
          if (!next || /^\d/.test(next[1]) !== ordered) break;
          items.push(h('li', { key: index }, inline(next[2]))); index++;
        }
        blocks.push(h(ordered ? 'ol' : 'ul', { key, start: ordered ? parseInt(item[1], 10) : undefined }, items));
      } else {
        const paragraph = [];
        while (index < lines.length && lines[index].trim() && !heading(lines[index]) && !list(lines[index])) paragraph.push(lines[index++]);
        blocks.push(h('p', { key }, inline(paragraph.join('\n'))));
      }
    }
    return h('div', { className: 'bw-prose' }, blocks);
  }

  return function BlogwatcherPage({ ctx } = {}) {
    const [view, setView] = useState('inbox');
    const [mode, setMode] = useState('unread');
    const [blog, setBlog] = useState('');
    const [page, setPage] = useState(0);
    const [articles, setArticles] = useState({ items: [], total: 0 });
    const [sources, setSources] = useState([]);
    const [form, setForm] = useState({ name: '', url: '', feed_url: '', scrape_selector: '', user_agent: '' });
    const [busy, setBusy] = useState({});
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [details, setDetails] = useState({});
    const rows = useRef({});
    const [loading, setLoading] = useState(true);
    const generation = useRef(0);
    const [preferences, setPreferences] = useState(readPreferences);
    const prefs = validPreferences(preferences);
    const preferenceRef = useRef(prefs);
    preferenceRef.current = prefs;
    const pending = useRef({});
    const reload = useRef(null);
    const alive = useRef(true);
    const currentView = useRef({ blog, mode, page });
    const titleButtons = useRef({});
    currentView.current = { blog, mode, page };

    function changePreferences(changes) {
      const next = validPreferences({ ...preferenceRef.current, ...changes });
      preferenceRef.current = next;
      setPreferences(next);
      savePreferences(next);
    }
    function load() {
      const request = ++generation.current;
      setLoading(true);
      const query = new URLSearchParams({ all_articles: String(mode === 'all'), offset: String(page * LIMIT), limit: String(LIMIT) });
      if (blog) query.set('blog', blog);
      return Promise.all([adapter.request(ctx, '/blogs'), adapter.request(ctx, '/articles?' + query.toString())])
        .then(([s, a]) => {
          if (!alive.current || request !== generation.current) return;
          const lastPage = Math.max(0, Math.ceil(a.total / LIMIT) - 1);
          if (page > lastPage) { setPage(lastPage); return; }
          setSources(s.items); setArticles(a); setError('');
        })
        .catch(e => { if (alive.current && request === generation.current) setError(e.message || 'Could not load Blogwatcher. Refresh to try again.'); })
        .finally(() => { if (alive.current && request === generation.current) setLoading(false); });
    }
    // Action completions refresh the CURRENT filter, not the render that started them.
    reload.current = load;
    useEffect(() => {
      alive.current = true;
      load();
      return () => { alive.current = false; generation.current++; };
    }, [mode, blog, page]);

    function action(route, body, key, onSuccess) {
      if (pending.current[key] || (key.startsWith('article:') && pending.current['read-all'])) return;
      if (key === 'read-all' && Object.keys(pending.current).some(k => k.startsWith('article:'))) return;
      pending.current[key] = true;
      setBusy({ ...pending.current }); setError(''); setNotice('');
      let result;
      try { result = adapter.request(ctx, route, body); }
      catch (e) { result = Promise.reject(e); }
      return Promise.resolve(result)
        .then(value => {
          if (!alive.current) return;
          if (onSuccess) onSuccess();
          setNotice(value.message || 'Done');
          reload.current();
        })
        .catch(e => {
          if (alive.current) setError(`${e.message || 'Request failed'}. The action may still have completed; refresh before retrying.`);
        })
        .finally(() => {
          delete pending.current[key];
          if (alive.current) setBusy({ ...pending.current });
        });
    }
    function confirmAction(message, route, body, key, onSuccess) {
      if (pending.current[key]) return;
      if (window.confirm(message)) action(route, { ...body, confirm: true }, key, onSuccess);
    }
    function chooseSource(value) { setBlog(value); setPage(0); setView('inbox'); }
    function chooseMode(value) { setMode(value); setPage(0); setView('inbox'); }
    function updateRow(id, row, changes) {
      if (!alive.current || rows.current[id] !== row) return;
      Object.assign(row, changes);
      setDetails(previous => ({ ...previous, [id]: { ...row } }));
    }
    function inspect(article) {
      const id = article.id;
      if (rows.current[id]) {
        delete rows.current[id];
        setDetails(previous => { const next = { ...previous }; delete next[id]; return next; });
        return;
      }
      const row = { summary: null, error: '', loading: true, inflight: false };
      rows.current[id] = row;
      updateRow(id, row, {});
      adapter.request(ctx, '/articles/' + id + '/summary')
        .then(result => updateRow(id, row, { summary: result.summary }))
        .catch(e => updateRow(id, row, { error: e.message || 'Could not load the saved summary. Try closing and reopening this article.' }))
        .finally(() => updateRow(id, row, { loading: false }));
    }
    function summarize(article) {
      const row = rows.current[article.id];
      if (!row || row.loading || row.inflight) return;
      if (!window.confirm('Fetch this article and send its text to Hermes? Its configured model provider may retry or use fallback models, which can consume additional tokens and incur additional cost.')) return;
      updateRow(article.id, row, { inflight: true, error: '' });
      adapter.request(ctx, '/articles/summary', { article_id: article.id, consent: true, regenerate: !!row.summary })
        .then(result => updateRow(article.id, row, { summary: result }))
        .catch(e => updateRow(article.id, row, { error: e.message || 'Summary request failed. Hermes may still be processing or retrying; wait before requesting another summary.' }))
        .finally(() => updateRow(article.id, row, { inflight: false }));
    }
    function tabKey(event) {
      const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const value = event.key === 'Home' ? 'unread' : event.key === 'End' ? 'all' : mode === 'unread' ? 'all' : 'unread';
      chooseMode(value);
      const tabs = event.currentTarget.parentElement.querySelectorAll('[role="tab"]');
      tabs[value === 'unread' ? 0 : 1]?.focus();
    }
    const button = (label, onClick, extra = {}) => h('button', {
      type: 'button', onClick, ...extra, className: 'bw-btn ' + (extra.className || ''),
    }, label);
    const select = (label, value, onChange, choices, className = '') => h('select', {
      'aria-label': label, value, onChange: e => onChange(e.target.value), className: 'bw-select ' + className,
    }, choices.map(([v, title]) => h('option', { key: v, value: v }, title)));
    const sourceSelect = select('Filter by source', blog, chooseSource, [['', 'All sources'], ...sources.map(s => [s.name, s.name])], 'bw-source-select');
    const appearance = select('Appearance', prefs.theme, theme => changePreferences({ theme }), [['system', 'Follow Hermes'], ['light', 'Light'], ['dark', 'Dark']]);
    const density = select('Reading density', prefs.density, value => changePreferences({ density: value }), [['comfortable', 'Comfortable'], ['compact', 'Compact']]);
    const bulkBusy = !!busy['read-all'];
    const anyReadBusy = Object.keys(busy).some(key => key.startsWith('article:'));
    const originalLink = article => article.url && h('a', {
      href: article.url, target: '_blank', rel: 'noopener noreferrer', className: 'bw-btn bw-btn-secondary', 'data-icon': 'external',
      ...(adapter.openExternal ? { onClick: e => { e.preventDefault(); adapter.openExternal(ctx, article.url); } } : {}),
    }, 'Open original');

    const heading = h('header', { className: 'bw-topbar' },
      h('div', { className: 'bw-brand' }, h('span', { className: 'bw-brand-mark', 'aria-hidden': true },
        h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 },
          h('path', { d: 'M5 5a14 14 0 0 1 14 14M5 11a8 8 0 0 1 8 8', strokeLinecap: 'round' }), h('circle', { cx: 5, cy: 19, r: 1.5, fill: 'currentColor', stroke: 'none' }))),
        h('div', null, h('h1', null, 'Blogwatcher'), h('p', { className: 'bw-brand-caption' }, 'Your personal reading room'))),
      h('div', { className: 'bw-toolbar' },
        h('label', { className: 'bw-appearance' }, h('span', { className: 'bw-sr-only' }, 'Appearance'), appearance),
        button('Sources', () => setView(view === 'sources' ? 'inbox' : 'sources'), { className: 'bw-btn-ghost', 'data-icon': 'sources', 'aria-pressed': view === 'sources' }),
        button('Refresh', () => reload.current(), { className: 'bw-btn-secondary bw-refresh', 'data-icon': 'refresh', disabled: loading, 'aria-busy': loading, title: 'Refresh saved articles' }),
        button(busy.scan ? 'Scanning…' : 'Scan now', () => action('/scan', { blog: blog || null }, 'scan'), { className: 'bw-btn-primary', 'data-icon': 'scan', disabled: !!busy.scan, 'aria-busy': !!busy.scan })));

    const rail = h('aside', { id: 'bw-source-rail', className: 'bw-rail', 'aria-label': 'Source library' },
      h('div', { className: 'bw-rail-heading' }, h('span', { className: 'bw-eyebrow' }, 'Your library'), h('span', { className: 'bw-small-count' }, sources.length)),
      h('nav', { 'aria-label': 'Filter articles by source', className: 'bw-source-nav' },
        button('All sources', () => chooseSource(''), { className: 'bw-source-link', 'data-active': !blog, 'data-icon': 'inbox', 'aria-current': !blog ? 'true' : undefined }),
        sources.map(source => h('button', { type: 'button', key: source.name, className: 'bw-source-link', 'data-active': blog === source.name,
          'aria-current': blog === source.name ? 'true' : undefined, onClick: () => chooseSource(source.name), title: source.name },
          h('span', { className: 'bw-source-initial', 'aria-hidden': true }, source.name.slice(0, 1).toUpperCase()), h('span', { className: 'bw-source-name' }, source.name)))),
      !sources.length && !loading && h('p', { className: 'bw-rail-note' }, 'Add a source to start your reading list.'),
      button('Manage sources', () => setView('sources'), { className: 'bw-manage-link', 'data-icon': 'plus' }),
      h('div', { className: 'bw-rail-footer' }, h('p', null, 'Read at your own pace.'),
        adapter.chat ? button('Chat with Hermes', adapter.chat, { className: 'bw-text-link' }) : h('a', { href: '/chat', className: 'bw-text-link' }, 'Chat with Hermes')));

    const detail = (article, row) => h('section', { id: 'bw-detail-' + article.id, 'aria-label': 'Article details', className: 'bw-detail' },
      h('header', { className: 'bw-detail-heading' }, h('span', { className: 'bw-eyebrow' }, 'In brief'),
        row.summary && h('span', { className: 'bw-badge', 'data-stale': !!row.summary.stale }, row.summary.stale ? 'Stale saved summary' : 'Saved summary')),
      row.error && h('p', { role: 'alert', className: 'bw-inline-error' }, row.error),
      row.summary ? summaryMarkdown(row.summary.text) : h('p', { className: 'bw-summary-empty' }, row.loading ? 'Looking for a saved summary…' : 'No saved summary yet. Summarize this article when you’re ready, or read the original.'),
      h('div', { className: 'bw-detail-actions' },
        button(row.loading ? 'Loading saved summary…' : row.inflight ? 'Fetching and summarizing…' : row.summary ? 'Regenerate' : 'Summarize', () => summarize(article),
          { className: row.summary ? 'bw-btn-secondary' : 'bw-btn-primary', 'data-icon': 'spark', disabled: row.loading || row.inflight || !article.url, 'aria-busy': row.loading || row.inflight }),
        originalLink(article), button('Close', () => { titleButtons.current[article.id]?.focus(); inspect(article); }, { className: 'bw-btn-ghost' })),
      row.summary ? h('p', { className: 'bw-summary-attribution' }, [row.summary.coverage, row.summary.provider && row.summary.model ? row.summary.provider + '/' + row.summary.model : null,
        (row.summary.cached ? 'Cached' : 'Generated') + (row.summary.generated_at ? ' ' + new Date(row.summary.generated_at * 1000).toLocaleString() : '')].filter(Boolean).join(' · ')) :
        h('p', { className: 'bw-summary-attribution' }, 'Summarizing sends article text to your configured model provider after confirmation.'));

    const tabs = h('div', { className: 'bw-tabs', role: 'tablist', 'aria-label': 'Article views' }, ['unread', 'all'].map(value =>
      button(value === 'unread' ? 'Unread' : 'All articles', () => chooseMode(value), {
        key: value, id: 'bw-tab-' + value, role: 'tab', 'aria-selected': mode === value, 'aria-controls': 'bw-article-panel', tabIndex: mode === value ? 0 : -1,
        onKeyDown: tabKey, className: 'bw-tab',
      })));
    const empty = h('div', { className: 'bw-empty', role: 'status' },
      h('span', { className: 'bw-empty-mark', 'data-icon': error ? 'refresh' : 'inbox', 'aria-hidden': true }),
      h('h3', null, loading ? 'Gathering your reading list' : error ? 'Your reading list is unavailable' : sources.length ? (mode === 'unread' ? 'You’re all caught up.' : 'No articles here yet.') : 'Your reading room starts here.'),
      h('p', null, loading ? 'Loading articles from your sources…' : error ? 'Your saved articles are safe. Refresh to try again.' : sources.length ? (mode === 'unread' ? 'Take a breather, browse all articles, or scan for something new.' : 'Scan your sources for new articles, or choose another source.') : 'Add a blog or feed you enjoy. New articles will appear here.'),
      !loading && !error && (sources.length && mode === 'unread' ? button('Browse all articles', () => chooseMode('all'), { className: 'bw-btn-secondary' }) : button(sources.length ? 'Scan now' : 'Add your first source', () => sources.length ? action('/scan', { blog: blog || null }, 'scan') : setView('sources'), { className: 'bw-btn-primary', disabled: !!busy.scan })));
    const articleView = h('div', { className: 'bw-content', 'data-rail': prefs.sourcesOpen }, rail,
      h('section', { className: 'bw-main', 'aria-label': 'Reading list' },
        h('div', { className: 'bw-reading-heading' }, h('div', null, h('p', { className: 'bw-eyebrow' }, blog || 'From your sources'), h('h2', null, 'Your reading list'),
          h('p', { className: 'bw-reading-caption' }, error ? 'Count unavailable; displayed articles may be out of date.' : loading ? 'Updating your reading list…' : `${articles.total} ${mode === 'unread' ? 'unread' : 'articles'}${blog ? ' from this source' : ' to explore'}`)),
          button(prefs.sourcesOpen ? 'Hide sources' : 'Show sources', () => changePreferences({ sourcesOpen: !prefs.sourcesOpen }), { className: 'bw-btn-ghost bw-rail-toggle', 'data-icon': 'sidebar', 'aria-expanded': prefs.sourcesOpen, 'aria-controls': 'bw-source-rail' })),
        h('div', { className: 'bw-list-toolbar' }, tabs,
          h('div', { className: 'bw-list-tools' }, density,
            button(bulkBusy ? 'Marking all read…' : 'Mark all read', () => confirmAction(`Mark all ${blog ? 'unread articles from ' + blog : 'unread articles'} as read?`, '/articles/read-all', { blog: blog || null }, 'read-all'),
              { className: 'bw-btn-ghost bw-bulk', 'data-icon': 'check', disabled: mode !== 'unread' || !articles.total || loading || bulkBusy || anyReadBusy, 'aria-busy': bulkBusy }))),
        h('div', { className: 'bw-mobile-filter' }, sourceSelect),
        h('div', { id: 'bw-article-panel', role: 'tabpanel', 'aria-labelledby': 'bw-tab-' + mode, 'aria-busy': loading, className: 'bw-article-panel' },
          articles.items.length ? h('ul', { className: 'bw-articles', 'aria-label': 'Articles', 'data-loading': loading }, articles.items.map(article => {
            const rowBusy = !!busy['article:' + article.id];
            return h('li', { key: article.id, className: 'bw-article', 'data-open': !!details[article.id], 'data-read': article.status === 'read' },
              h('div', { className: 'bw-article-header' },
                h('div', { className: 'bw-article-copy' },
                  h('div', { className: 'bw-article-meta' }, h('span', { className: 'bw-unread-dot', 'data-read': article.status === 'read', 'aria-label': article.status === 'read' ? 'Read' : 'Unread' }),
                    h('span', { className: 'bw-article-source' }, article.blog), h('span', { className: 'bw-meta-separator', 'aria-hidden': true }, '·'), h('time', { dateTime: article.published || undefined }, formattedDate(article.published))),
                  h('h3', { className: 'bw-article-title' }, h('button', { type: 'button', onClick: () => inspect(article),
                    ref: element => { if (element) titleButtons.current[article.id] = element; else delete titleButtons.current[article.id]; },
                    'aria-expanded': !!details[article.id], 'aria-controls': details[article.id] ? 'bw-detail-' + article.id : undefined }, article.title))),
                button(rowBusy ? 'Saving…' : article.status === 'read' ? 'Mark unread' : 'Mark read', () => action(article.status === 'read' ? '/articles/unread' : '/articles/read', { article_id: article.id }, 'article:' + article.id),
                  { className: 'bw-btn-ghost bw-read-toggle', 'data-icon': article.status === 'read' ? 'unread' : 'check', disabled: rowBusy || bulkBusy || loading, 'aria-busy': rowBusy, title: article.status === 'read' ? 'Return this article to unread' : 'Mark this article as read' })),
              details[article.id] && detail(article, details[article.id]));
          })) : empty),
        h('footer', { className: 'bw-pagination', 'aria-label': 'Article pagination' },
          h('span', { className: 'bw-page-description' }, !loading && !error && articles.total ? `${page * LIMIT + 1}–${Math.min((page + 1) * LIMIT, articles.total)} of ${articles.total}` : 'Reading, at your pace'),
          h('div', { className: 'bw-pagination-controls' },
            button('Previous', () => setPage(Math.max(0, page - 1)), { className: 'bw-btn-secondary', disabled: !page || loading }), h('span', { className: 'bw-page-number' }, `Page ${page + 1}`),
            button('Next', () => setPage(page + 1), { className: 'bw-btn-secondary', disabled: loading || (page + 1) * LIMIT >= articles.total })))));

    const field = (key, label, required = false, type = 'text') => h('label', { key, className: 'bw-field' }, label,
      h('input', { className: 'bw-input', type, value: form[key], required, disabled: !!busy.add, maxLength: 1000,
        placeholder: key === 'name' ? 'A blog you enjoy' : key === 'url' ? 'https://example.com' : key === 'feed_url' ? 'https://example.com/feed.xml' : '',
        onChange: e => setForm({ ...form, [key]: e.target.value }) }));
    const sourceView = h('section', { className: 'bw-source-page' },
      button('Back to reading', () => setView('inbox'), { className: 'bw-btn-ghost bw-back', 'data-icon': 'back' }),
      h('div', { className: 'bw-reading-heading' }, h('div', null, h('p', { className: 'bw-eyebrow' }, 'Curate your reading'), h('h2', null, 'Your sources'), h('p', { className: 'bw-reading-caption' }, 'Make room for the writers and publications you enjoy.'))),
      h('div', { className: 'bw-source-grid' },
        h('div', null, h('h3', { className: 'bw-section-label' }, `Following (${sources.length})`),
          sources.length ? h('ul', { className: 'bw-source-cards' }, sources.map(source => h('li', { key: source.name, className: 'bw-source-card' },
            h('div', { className: 'bw-source-card-heading' }, h('span', { className: 'bw-source-initial', 'aria-hidden': true }, source.name.slice(0, 1).toUpperCase()), h('h4', null, source.name)),
            source.url && h('a', { href: source.url, target: '_blank', rel: 'noopener noreferrer', className: 'bw-source-url', ...(adapter.openExternal ? { onClick: e => { e.preventDefault(); adapter.openExternal(ctx, source.url); } } : {}) }, source.url),
            h('p', { className: 'bw-source-scanned' }, 'Last scanned: ' + (source.last_scanned || 'Never')),
            h('div', { className: 'bw-source-card-footer' }, button('Read articles', () => chooseSource(source.name), { className: 'bw-btn-ghost' }),
              button(busy['remove:' + source.name] ? 'Removing…' : 'Remove', () => confirmAction(`Remove ${source.name} and ALL its articles? This cannot be undone.`, '/blogs/remove', { name: source.name }, 'remove:' + source.name,
                () => { if (currentView.current.blog === source.name) { setBlog(''); setPage(0); } }), { className: 'bw-btn-danger', disabled: !!busy['remove:' + source.name] }))))) : h('p', { className: 'bw-summary-empty' }, 'No sources yet. Add your first one alongside.')),
        h('form', { className: 'bw-add-source', onSubmit: e => {
          e.preventDefault(); action('/blogs', { ...form, feed_url: form.feed_url || null, scrape_selector: form.scrape_selector || null, user_agent: form.user_agent || null }, 'add', () => setForm({ name: '', url: '', feed_url: '', scrape_selector: '', user_agent: '' }));
        } }, h('span', { className: 'bw-eyebrow' }, 'Something worth reading'), h('h3', null, 'Add a source'), h('p', { className: 'bw-form-hint' }, 'Start with a website. Blogwatcher will look for its feed.'),
          field('name', 'Name', true), field('url', 'Website URL', true, 'url'),
          h('details', { className: 'bw-advanced' }, h('summary', null, 'Advanced options'), field('feed_url', 'Feed URL (optional)', false, 'url'), field('scrape_selector', 'Scrape selector (optional)'), field('user_agent', 'User-Agent (optional)')),
          h('button', { type: 'submit', className: 'bw-btn bw-btn-primary', disabled: !!busy.add, 'aria-busy': !!busy.add, 'data-icon': 'plus' }, busy.add ? 'Adding source…' : 'Add source'),
          h('p', { className: 'bw-form-footnote' }, 'Removing a source also deletes its articles. You’ll be asked to confirm.'))));

    return h('main', { className: 'bw-reader', 'data-theme': prefs.theme, 'data-density': prefs.density },
      h('style', null, styles),
      h('div', { className: 'bw-shell' }, heading,
        error && h('div', { role: 'alert', className: 'bw-banner bw-banner-error' }, h('p', null, error), button('Refresh', () => reload.current(), { className: 'bw-btn-secondary', disabled: loading })),
        notice && h('div', { role: 'status', className: 'bw-banner' }, h('p', null, notice), button('Dismiss', () => setNotice(''), { className: 'bw-btn-ghost' })),
        view === 'sources' ? sourceView : articleView));
  };
}
