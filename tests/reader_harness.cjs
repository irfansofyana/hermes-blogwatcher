'use strict';

// Run the shipped entrypoints, not a test copy of the reader component. Only
// hooks and external boundaries (network, storage, host/DOM) are substituted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const tick = () => new Promise(resolve => setImmediate(resolve));

function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object') return [];
  return [node, ...nodes(node.props?.children)];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (node == null || node === false) return '';
  return typeof node === 'object' ? text(node.props?.children) : String(node);
}
function nameOf(node, tree) {
  if (node.props['aria-label']) return node.props['aria-label'];
  const all = nodes(tree);
  if (node.props['aria-labelledby']) return node.props['aria-labelledby'].split(/\s+/).map(id => text(all.find(n => n.props.id === id))).join(' ');
  const label = all.find(n => n.type === 'label' && ((n.props.htmlFor && n.props.htmlFor === node.props.id) || nodes(n.props.children).includes(node)));
  if (label) {
    const labelText = n => Array.isArray(n) ? n.map(labelText).join(' ') : n && typeof n === 'object' ? ['select', 'input', 'textarea'].includes(n.type) ? '' : labelText(n.props.children) : n == null ? '' : String(n);
    return labelText(label).replace(/\s+/g, ' ').trim();
  }
  return text(node);
}
function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed).map(([key, value]) => [key, String(value)]));
  return {
    getItem: key => values.has(String(key)) ? values.get(String(key)) : null,
    setItem: (key, value) => { values.set(String(key), String(value)); },
    removeItem: key => { values.delete(String(key)); },
    clear: () => values.clear(),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; },
    snapshot: () => Object.fromEntries(values),
  };
}
const ARTICLES = [
  { id: 101, title: 'Queue boundaries in practice', blog: 'Alpha Journal', url: 'https://alpha.example/posts/queue', status: 'new', published: '2026-10-15' },
  { id: 202, title: 'Explicit consent for summaries', blog: 'Beta & Bytes', url: 'https://beta.example/posts/consent', status: 'new', published: '2026-10-16' },
];
const SOURCES = [
  { name: 'Alpha Journal', url: 'https://alpha.example', feed: 'https://alpha.example/feed', last_scanned: '2026-10-17' },
  { name: 'Beta & Bytes', url: 'https://beta.example', feed: 'https://beta.example/feed', last_scanned: '2026-10-17' },
];

function hostBoundary() {
  const writes = [];
  function element(tag) {
    const attrs = { 'data-theme': 'light', class: 'hermes-host light' };
    const dataset = new Proxy({ theme: 'light' }, { set(target, key, value) { writes.push([tag, 'dataset', key, value]); target[key] = value; return true; }, deleteProperty(target, key) { writes.push([tag, 'delete dataset', key]); delete target[key]; return true; } });
    const style = new Proxy({ colorScheme: 'light', setProperty(key, value) { writes.push([tag, 'style', key, value]); this[key] = value; }, removeProperty(key) { writes.push([tag, 'remove style', key]); delete this[key]; } }, { set(target, key, value) { writes.push([tag, 'style', key, value]); target[key] = value; return true; } });
    return {
      dataset, style,
      get className() { return attrs.class; },
      set className(value) { writes.push([tag, 'className', value]); attrs.class = value; },
      getAttribute: key => attrs[key] ?? null,
      setAttribute(key, value) { writes.push([tag, 'attribute', key, value]); attrs[key] = value; },
      removeAttribute(key) { writes.push([tag, 'remove attribute', key]); delete attrs[key]; },
      classList: {
        contains: token => attrs.class.split(/\s+/).includes(token),
        add(...tokens) { writes.push([tag, 'class add', ...tokens]); attrs.class += ' ' + tokens.join(' '); },
        remove(...tokens) { writes.push([tag, 'class remove', ...tokens]); attrs.class = attrs.class.split(/\s+/).filter(t => !tokens.includes(t)).join(' '); },
        toggle(token, force) { const has = attrs.class.split(/\s+/).includes(token); if (force ?? !has) this.add(token); else this.remove(token); return force ?? !has; },
      },
    };
  }
  const document = { documentElement: element('html'), body: element('body') };
  const state = new Proxy({ theme: 'light', colorScheme: 'light' }, { set(target, key, value) { writes.push(['host.state', key, value]); target[key] = value; return true; } });
  const host = { state, navigate() {}, setTheme: value => writes.push(['host.setTheme', value]) };
  return { document, host, writes };
}

async function harness(desktop, options = {}) {
  const calls = [], confirmations = [], opened = [], slots = [];
  const boundary = hostBoundary();
  let cursor = 0, component, props, tree, dirty = true, effects = [];
  const storage = options.storage ?? memoryStorage();
  const hooks = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.length === 1 ? children[0] : children } }),
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) {
        const slot = { value: typeof initial === 'function' ? initial() : initial };
        slot.set = next => { const value = typeof next === 'function' ? next(slot.value) : next; if (!Object.is(value, slot.value)) { slot.value = value; dirty = true; } };
        slots[index] = slot;
      }
      return [slots[index].value, slots[index].set];
    },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || dependencies === undefined || previous.dependencies === undefined || dependencies.length !== previous.dependencies.length || dependencies.some((value, n) => !Object.is(value, previous.dependencies[n]))) {
        effects.push(() => { previous?.cleanup?.(); slots[index] = { dependencies, cleanup: effect() }; });
      }
    },
  };
  const request = (route, opts) => new Promise((resolve, reject) => {
    const call = { route, opts, method: opts?.method || 'GET', pending: true };
    call.resolve = result => { assert.equal(call.pending, true, 'network request already completed'); call.pending = false; resolve(JSON.parse(JSON.stringify(result))); };
    call.reject = error => { assert.equal(call.pending, true, 'network request already completed'); call.pending = false; reject(error); };
    calls.push(call);
  });
  const window = {
    document: boundary.document,
    confirm(message) { confirmations.push(message); return window.accept; },
    accept: true,
    matchMedia: media => ({ media, matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    addEventListener() {}, removeEventListener() {},
  };
  if (options.storageMode === 'getter-throws') Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage access denied'); } });
  else if (options.storageMode !== 'unavailable') window.localStorage = options.storageMode === 'read-throws' || options.storageMode === 'write-throws' ? {
    getItem: options.storageMode === 'read-throws' ? () => { throw new Error('Storage read denied'); } : storage.getItem,
    setItem: () => { throw new Error('Storage write denied'); },
  } : storage;
  const context = vm.createContext({ window, document: window.document, URL, URLSearchParams, console, setTimeout, clearTimeout });
  Object.defineProperty(context, 'localStorage', { get: () => window.localStorage });
  if (desktop) {
    const module = new vm.SourceTextModule(fs.readFileSync(path.join(__dirname, '../desktop/plugin.js'), 'utf8'), { context });
    await module.link(name => {
      const exports = name === 'react' ? hooks : name === '@hermes/plugin-sdk' ? { host: boundary.host, ROUTES_AREA: 'routes', SIDEBAR_NAV_AREA: 'nav' } : null;
      assert.ok(exports, 'Unsupported real entrypoint import: ' + name);
      return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
    });
    await module.evaluate();
    module.namespace.default.register({ rest: request, os: { openExternal: url => opened.push(url) }, register(contribution) { if (contribution.area === 'routes') { const el = contribution.render(); component = el.type; props = el.props; } } });
  } else {
    window.__HERMES_PLUGIN_SDK__ = { React: hooks, hooks, host: boundary.host, fetchJSON: (url, opts) => request(url.replace('/api/plugins/hermes-blogwatcher', ''), opts) };
    window.__HERMES_PLUGINS__ = { register(id, view) { assert.equal(id, 'hermes-blogwatcher'); component = view; } };
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../dashboard/dist/index.js'), 'utf8'), context);
  }
  assert.equal(typeof component, 'function', 'the actual entrypoint must register its component');
  function materialize(node) {
    if (Array.isArray(node)) return node.map(materialize);
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') return materialize(node.type(node.props));
    return { ...node, props: { ...node.props, children: materialize(node.props.children) } };
  }
  function render() {
    let turns = 0;
    while (dirty) {
      assert.ok(++turns < 50, 'component did not settle after hook updates');
      dirty = false; cursor = 0; effects = [];
      tree = materialize(component(props));
      for (const effect of effects) effect();
    }
    return tree;
  }
  async function settle() { await tick(); render(); await tick(); return render(); }
  const articleCalls = () => calls.filter(c => c.method === 'GET' && c.route.startsWith('/articles?'));
  const pendingLists = () => calls.filter(c => c.pending && c.method === 'GET' && (c.route === '/blogs' || c.route.startsWith('/articles?')));
  async function respondToLists(result = { items: ARTICLES, total: 125 }) {
    for (let turn = 0; turn < 10; turn++) {
      render();
      const pending = pendingLists();
      if (!pending.length) return tree;
      for (const call of pending) call.resolve(call.route === '/blogs' ? { items: SOURCES } : typeof result === 'function' ? result(new URL(call.route, 'https://reader.test').searchParams) : result);
      await settle();
    }
    assert.fail('article loading did not settle');
  }
  const findButton = (label, within = render()) => nodes(within).find(n => n.type === 'button' && (label instanceof RegExp ? label.test(nameOf(n, render())) : nameOf(n, render()) === label));
  function button(label, within) { const found = findButton(label, within); assert.ok(found, 'Missing button: ' + label); return found; }
  function click(target, within) {
    const found = typeof target === 'string' || target instanceof RegExp ? button(target, within) : target;
    assert.ok(found, 'Missing click target');
    assert.ok(!found.props.disabled && found.props['aria-disabled'] !== true && found.props['aria-disabled'] !== 'true', 'Control is disabled: ' + nameOf(found, render()));
    found.props.onClick({ preventDefault() {}, stopPropagation() {} });
    return render();
  }
  function select(label) {
    const found = nodes(render()).find(n => n.type === 'select' && nameOf(n, tree) === label);
    assert.ok(found, 'Missing select with accessible label: ' + label);
    return found;
  }
  function choose(label, value) {
    const found = select(label);
    assert.ok(!found.props.disabled, label + ' must remain usable');
    assert.ok(nodes(found).some(n => n.type === 'option' && n.props.value === value), label + ' has no option value ' + value);
    found.props.onChange({ target: { value }, currentTarget: { value } });
    return render();
  }
  function selectSource(value) {
    render();
    const sourceSelect = nodes(tree).find(n => n.type === 'select' && /source/i.test(nameOf(n, tree)) && nodes(n).some(o => o.type === 'option' && o.props.value === value));
    if (sourceSelect) { sourceSelect.props.onChange({ target: { value }, currentTarget: { value } }); return render(); }
    const label = value || 'All sources';
    let target = findButton(new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\s|$)'));
    if (!target) {
      const expand = nodes(tree).find(n => n.type === 'button' && /sources/i.test(nameOf(n, tree)) && [false, 'false'].includes(n.props['aria-expanded']));
      if (expand) click(expand);
      target = findButton(new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\s|$)'));
    }
    assert.ok(target, 'Missing source selector for ' + label);
    return click(target);
  }
  function row(id) {
    const article = ARTICLES.find(a => a.id === id);
    const found = nodes(render()).find(n => ['li', 'article'].includes(n.type) && nodes(n).some(child => child.type === 'button' && text(child) === article.title));
    assert.ok(found, 'Missing article row: ' + id);
    return found;
  }
  function readControl(id) {
    const found = nodes(row(id)).find(n => n.type === 'button' && /^(?:Mark (?:un)?read|Marking|Saving|Updating)/i.test(nameOf(n, tree)));
    assert.ok(found, 'Missing read-status control for article ' + id);
    return found;
  }
  function root() {
    const found = nodes(render()).find(n => String(n.props.className || '').split(/\s+/).includes('bw-reader'));
    assert.ok(found, 'Reader root must be scoped by class bw-reader');
    return found;
  }
  render();
  if (options.load !== false) await respondToLists();
  return { desktop, calls, articleCalls, pendingLists, render, settle, respondToLists, button, findButton, click, select, choose, selectSource, row, readControl, root, storage, window, confirmations, opened, globalWrites: boundary.writes,
    body: call => call.opts?.body === undefined ? undefined : JSON.parse(typeof call.opts.body === 'string' ? call.opts.body : JSON.stringify(call.opts.body)),
  };
}

module.exports = { harness, nodes, text, nameOf, memoryStorage, ARTICLES, SOURCES, tick };
