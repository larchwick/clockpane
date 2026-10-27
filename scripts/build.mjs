// Builds dist/firefox and dist/edge from extension/. No bundler: files are copied as is.
// The Pro license module in pro/ is never copied into a build.

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifestFor, TARGETS } from './manifest.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'extension');
const base = JSON.parse(await readFile(join(src, 'manifest.json'), 'utf8'));

for (const target of TARGETS) {
  const out = join(root, 'dist', target);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await cp(src, out, { recursive: true, filter: (p) => !p.endsWith('manifest.json') });
  await writeFile(join(out, 'manifest.json'), JSON.stringify(manifestFor(base, target), null, 2) + '\n');
  console.log(`built dist/${target}`);
}
