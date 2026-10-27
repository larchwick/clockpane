// Release gate for dist/: no network calls, no Pro code, no local paths, only the
// storage permission. Exits 1 on any problem.

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/** @type {Array<[RegExp, string]>} */
const banned = [
  [/\bfetch\s*\(/, 'fetch call'],
  [/XMLHttpRequest/, 'XMLHttpRequest'],
  [/WebSocket/, 'WebSocket'],
  [/sendBeacon/, 'sendBeacon'],
  [/EventSource/, 'EventSource'],
  [/gumroad/i, 'Gumroad reference (Pro module must stay out of the free build)'],
  [/\/home\/box/, 'local path /home/box'],
  [/\/workspace/, 'local path /workspace'],
];
/** @type {string[]} */
const problems = [];

/** @param {string} dir @returns {Promise<string[]>} */
async function walk(dir) {
  /** @type {string[]} */
  const files = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(p)));
    else files.push(p);
  }
  return files;
}

for (const target of ['firefox', 'edge']) {
  const dir = join(root, 'dist', target);
  for (const file of await walk(dir)) {
    const rel = relative(root, file);
    if (/\/pro\//.test(rel)) problems.push(`${rel}: Pro file in free build`);
    if (!/\.(js|mjs|html|css|json|txt|md)$/.test(file)) continue;
    const text = await readFile(file, 'utf8');
    for (const [re, what] of banned) if (re.test(text)) problems.push(`${rel}: ${what}`);
  }
  const m = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  const perms = JSON.stringify(m.permissions ?? []);
  if (perms !== '["storage"]') problems.push(`dist/${target}: permissions ${perms}, expected ["storage"]`);
  for (const k of ['host_permissions', 'optional_permissions', 'optional_host_permissions', 'content_scripts', 'web_accessible_resources']) {
    if (k in m) problems.push(`dist/${target}: unexpected ${k}`);
  }
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('dist check passed: no network, no Pro code, no local paths, storage permission only');
