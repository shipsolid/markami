import { readFile } from 'node:fs/promises';
import path from 'node:path';

const allowed = new Set([
  '(MPL-2.0 OR Apache-2.0)',
  'Apache-2.0',
  'BSD-3-Clause',
  'EPL-2.0',
  'ISC',
  'MIT',
  'Unlicense'
]);
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const failures = [];
let checked = 0;

for (const [packagePath, metadata] of Object.entries(lock.packages ?? {})) {
  if (!packagePath.startsWith('node_modules/') || metadata.dev === true) continue;
  const manifestPath = path.join(packagePath, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  let license = manifest.license;
  if (typeof license !== 'string') {
    license = await licenseFromFile(packagePath);
  }
  checked += 1;
  if (!allowed.has(license)) {
    failures.push(`${manifest.name ?? packagePath}@${manifest.version ?? 'unknown'}: ${license}`);
  }
}

if (failures.length > 0) {
  console.error(`Unapproved production dependency licenses:\n${failures.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Checked ${String(checked)} production dependency licenses against the allowlist.`);
}

async function licenseFromFile(packagePath) {
  for (const name of ['license', 'LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
    try {
      const content = await readFile(path.join(packagePath, name), 'utf8');
      if (/The MIT License/iu.test(content)) return 'MIT';
    } catch {
      // Try the next conventional license filename.
    }
  }
  return 'UNKNOWN';
}
