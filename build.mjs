// Publish only runtime assets and required third-party notices.
// No packages, Python, bundler, or network connection are needed for this build.
import {copyFileSync, existsSync, lstatSync, mkdirSync, realpathSync, rmSync, statSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = realpathSync(fileURLToPath(new URL('.', import.meta.url)));
const output = resolve(root, 'dist');
if (relative(root, output) !== 'dist' || (existsSync(output) && lstatSync(output).isSymbolicLink())) {
  throw new Error('Refusing to replace an output directory outside this project.');
}
const files = [
  'index.html', 'style.css', 'notices.json',
  'assets/app.js', 'assets/models.js', 'assets/survivor.js',
  'assets/boy-materials.jpg', 'assets/boy-normal.png',
  'assets/boy-skin-normal.png', 'assets/boy-skin.jpg',
  'assets/preview.jpg', 'assets/zombie-detail.jpg', 'assets/zombie-diffuse.jpg',
];
let total = 0, largest = {name: '', size: 0};
for (const name of files) {
  const source = join(root, name);
  const resolved = realpathSync(source);
  if (relative(root, resolved).startsWith('..') || lstatSync(source).isSymbolicLink()) {
    throw new Error(`Asset must be a regular project file: ${name}`);
  }
  const stat = statSync(source);
  if (!stat.isFile() || stat.size > 25 * 1024 * 1024) {
    throw new Error(`Invalid asset or exceeds the Workers 25 MiB file limit: ${name}`);
  }
  total += stat.size;
  if (stat.size > largest.size) largest = {name, size: stat.size};
}
if (total > 10_000_000) throw new Error(`Runtime assets exceed the 10 MB budget: ${total}`);
// The validated destination is exactly <project>/dist, never the repository root.
rmSync(output, {recursive: true, force: true});
for (const name of files) {
  const destination = join(output, name);
  mkdirSync(dirname(destination), {recursive: true});
  copyFileSync(join(root, name), destination);
}
console.log(`RE Junjun: built ${files.length} static files in dist/ (${(total / 1024 / 1024).toFixed(2)} MiB).`);
console.log(`Largest asset: ${largest.name} (${(largest.size / 1024 / 1024).toFixed(2)} MiB).`);
console.log('Deployment excludes node_modules, source archives, tests, logs and development scripts.');
