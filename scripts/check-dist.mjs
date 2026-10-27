// Release gate for dist/. Exits 1 on any problem.
// - The only network code is pro/transport.js, and it may only reach the Gumroad verify URL.
// - Gumroad is named only in pro/ files and the options page (license screen).
// - Every http(s) URL in the build is on a short allowlist.
// - Permissions are exactly storage and alarms, plus the optional api.gumroad.com host.
// - No content scripts, no web accessible resources, no local paths, no remote code.

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TRANSPORT = 'pro/transport.js';
const GUMROAD_OK = /^(pro\/[a-zA-Z]+\.js|options\.(html|js))$/;
const ALLOWED_URLS = new Set([
  'https://api.gumroad.com/v2/licenses/verify',
  'https://api.gumroad.com/*',
  'https://larchwick.gumroad.com/l/sysaii',
  'https://github.com/larchwick/clockpane/issues',
  'https://github.com/larchwick/clockpane/blob/main/PRIVACY.md',
  // Documentation links in source comments.
  'https://gumroad.com/help/article/76-license-keys',
  'https://gumroad.com/api',
]);
/** @type {Array<[RegExp, string]>} */
const bannedEverywhere = [
  [/XMLHttpRequest/, 'XMLHttpRequest'],
  [/WebSocket/, 'WebSocket'],
  [/sendBeacon/, 'sendBeacon'],
  [/EventSource/, 'EventSource'],
  [/\beval\s*\(/, 'eval'],
  [/new\s+Function\s*\(/, 'new Function'],
  [/importScripts/, 'importScripts'],
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
    const rel = relative(dir, file).split(sep).join('/');
    const where = `dist/${target}/${rel}`;
    if (!/\.(js|mjs|html|css|json|txt|md)$/.test(file)) {
      if (!/^icons\/icon-\d+\.png$/.test(rel)) problems.push(`${where}: unexpected file type`);
      continue;
    }
    const text = await readFile(file, 'utf8');
    for (const [re, what] of bannedEverywhere) if (re.test(text)) problems.push(`${where}: ${what}`);
    if (/\bfetch\s*\(/.test(text) && rel !== TRANSPORT) problems.push(`${where}: fetch outside ${TRANSPORT}`);
    if (/gumroad/i.test(text) && !GUMROAD_OK.test(rel) && rel !== 'manifest.json') problems.push(`${where}: Gumroad named outside the license code`);
    for (const m of text.matchAll(/https?:\/\/[^\s'"`<>)]+/g)) {
      const url = m[0].replace(/[.,]+$/, '');
      if (url.startsWith('http://www.w3.org/')) continue;
      if (!ALLOWED_URLS.has(url)) problems.push(`${where}: URL not on the allowlist: ${url}`);
    }
    if (/<script[^>]+src=["']https?:/i.test(text)) problems.push(`${where}: remote script`);
  }
  const transport = await readFile(join(dir, TRANSPORT), 'utf8');
  if ((transport.match(/\bfetch\s*\(/g) ?? []).length !== 1) problems.push(`dist/${target}/${TRANSPORT}: expected exactly one fetch call`);

  const m = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  const perms = JSON.stringify(m.permissions ?? []);
  if (perms !== '["storage","alarms"]') problems.push(`dist/${target}: permissions ${perms}, expected ["storage","alarms"]`);
  const optHosts = JSON.stringify(m.optional_host_permissions ?? []);
  if (optHosts !== '["https://api.gumroad.com/*"]') problems.push(`dist/${target}: optional_host_permissions ${optHosts}`);
  for (const k of ['host_permissions', 'optional_permissions', 'content_scripts', 'web_accessible_resources', 'externally_connectable', 'content_security_policy']) {
    if (k in m) problems.push(`dist/${target}: unexpected ${k}`);
  }
  if (target === 'firefox') {
    const dc = JSON.stringify(m.browser_specific_settings?.gecko?.data_collection_permissions);
    if (dc !== '{"required":["none"],"optional":["authenticationInfo"]}') problems.push(`dist/firefox: data_collection_permissions ${dc}`);
  } else if ('browser_specific_settings' in m) {
    problems.push(`dist/${target}: Firefox keys in the build`);
  }
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('dist check passed: one fetch to Gumroad in pro/transport.js, allowlisted URLs only, storage and alarms permissions, optional api.gumroad.com host');
