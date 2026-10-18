#!/usr/bin/env node
'use strict';
// Optional development tool. Uses an existing Hermes checkout's dev dependencies.
// It creates self-contained HTML previews, never installs/updates the live plugin.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const host = process.env.HERMES_SOURCE || path.join(os.homedir(), '.hermes/hermes-agent');
let esbuild, react, client;
try {
  esbuild = require(require.resolve('esbuild', { paths: [root, host] }));
  react = require.resolve('react', { paths: [root, path.join(host, 'apps/desktop'), host] });
  client = require.resolve('react-dom/client', { paths: [root, path.join(host, 'apps/desktop'), host] });
} catch (_) {
  console.error('Preview requires React, ReactDOM and esbuild in this repo or an existing Hermes source checkout. Set HERMES_SOURCE to that checkout. No production dependency is required.');
  process.exit(1);
}
const outputIndex = process.argv.indexOf('--output');
const out = outputIndex >= 0 ? path.resolve(process.argv[outputIndex + 1]) : path.join(process.env.TMPDIR || os.tmpdir(), 'blogwatcher-reader-preview');
const fixture = fs.readFileSync(path.join(root, 'tests/preview_fixture.js'), 'utf8');
const palette = `
html { --ui-bg-editor:#f8f7f1;--ui-bg-sidebar:#f0f0e7;--ui-text-primary:#142014;--ui-text-secondary:#58645c;--ui-stroke-secondary:#dedfd4;--ui-accent:#0b7a3b;--dt-destructive:#b72a3a;--dt-font-sans:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;--dt-font-mono:ui-monospace,monospace;
--background-base:#f8f7f1;--foreground:transparent;--midground:#142014;--color-card:#fffefa;--color-muted:#f0f0e7;--color-muted-foreground:#58645c;--color-border:#dedfd4;--color-primary:#0b7a3b;--color-destructive:#b72a3a; }
html[data-host='dark'] { --ui-bg-editor:#111613;--ui-bg-sidebar:#181f1a;--ui-text-primary:#e8f3e9;--ui-text-secondary:#a8b8aa;--ui-stroke-secondary:#2d3930;--ui-accent:#91cda4;--dt-destructive:#ff9ba4;
--background-base:#111613;--midground:#e8f3e9;--color-card:#151b17;--color-muted:#181f1a;--color-muted-foreground:#a8b8aa;--color-border:#2d3930;--color-primary:#91cda4;--color-destructive:#ff9ba4; }
html,body { height:100%;margin:0; } body { display:flex;flex-direction:column;background:var(--background-base);color:var(--midground);font-family:system-ui,sans-serif; }
#root { flex:1;min-height:0; } .preview-strip { flex-shrink:0;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 16px;border-bottom:1px solid var(--color-border);font-size:10px;line-height:1.5;color:var(--color-muted-foreground); }
.preview-strip button { color:inherit;background:transparent;border:1px solid var(--color-border);border-radius:4px;padding:3px 7px;cursor:pointer;white-space:nowrap; }
`;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  for (const surface of ['web', 'desktop']) {
    const adapter = surface === 'web' ? fs.readFileSync(path.join(root, 'dashboard/dist/index.js'), 'utf8') : `
import plugin from ${JSON.stringify(path.join(root, 'desktop/plugin.js'))};
plugin.register({ rest: window.readerPreview.request, os: { openExternal: url => { window.readerPreview.external = url; return true; } },
  register(contribution) { if (contribution.area === 'routes') { const element = contribution.render(); window.readerPreview.mount(element.type, element.props); } }
});`;
    const result = await esbuild.build({
      stdin: { contents: `import React from ${JSON.stringify(react)};\nimport { createRoot } from ${JSON.stringify(client)};\n${fixture}\ninstallReaderPreview(React, createRoot, ${JSON.stringify(surface)});\n${adapter}`, resolveDir: root, loader: 'js' },
      bundle: true, write: false, format: 'iife', minify: true, alias: { react }, define: { 'process.env.NODE_ENV': '"production"' },
      plugins: [{ name: 'preview-sdk', setup(build) {
        build.onResolve({ filter: /^@hermes\/plugin-sdk$/ }, () => ({ path: 'sdk', namespace: 'reader-preview' }));
        build.onLoad({ filter: /.*/, namespace: 'reader-preview' }, () => ({ contents: `export const host = { navigate: path => { window.readerPreview.navigation = path; } }; export const ROUTES_AREA = 'routes'; export const SIDEBAR_NAV_AREA = 'nav';` }));
      } }],
    });
    // Escape HTML script terminators even though the bundle is trusted local code.
    const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
    // The web fixture must NOT expose Desktop aliases, or it would fail to
    // exercise the dashboard's transparent-foreground / midground contract.
    const hostPalette = surface === 'web' ? palette.replace(/--(?:ui-[\w-]+|dt-[\w-]+):[^;}]*;/g, '') : palette;
    const html = `<!doctype html><html lang="en" data-host="light" data-theme="hermes-preview"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blogwatcher · ${surface} reader preview</title><style>${hostPalette}</style></head><body><div class="preview-strip"><span>${surface === 'web' ? 'Web' : 'Desktop'} UI preview · synthetic articles and summaries · no publisher/model requests</span><button id="host-theme" type="button">Host: light</button></div><div id="root"></div><script>${script}</script></body></html>`;
    const target = path.join(out, surface + '.html');
    fs.writeFileSync(target, html); console.log(target);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
