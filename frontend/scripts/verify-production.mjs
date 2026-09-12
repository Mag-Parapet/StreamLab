import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = resolve(root, 'dist/control/browser');
const html = readFileSync(resolve(directory, 'index.html'), 'utf8');
const stylesheets = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)].map(match => match[0]);
assert.ok(stylesheets.length > 0, 'Production HTML must include a stylesheet');
for (const tag of stylesheets) {
  assert.ok(!/\bonload\s*=/i.test(tag), 'Stylesheet loading must not depend on inline JavaScript blocked by CSP');
  assert.ok(!/\bmedia=["']print["']/i.test(tag), 'Dashboard CSS must apply to screens immediately');
  const href = /\bhref=["']([^"']+)["']/i.exec(tag)?.[1];
  assert.ok(href, 'Stylesheet must have an href');
  const css = readFileSync(resolve(directory, href), 'utf8');
  assert.ok(css.includes('.sidebar') && css.includes('.metric-grid'), 'Built CSS must contain the dashboard layout');
}
console.log('PASS: production CSS loads without inline script handlers under the Nginx CSP');
