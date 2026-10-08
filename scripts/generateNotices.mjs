import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const notices = new Map();

for (const [packagePath, metadata] of Object.entries(lock.packages ?? {}).sort(([left], [right]) =>
  left.localeCompare(right)
)) {
  if (!packagePath.startsWith('node_modules/') || metadata.dev === true) continue;

  const manifest = JSON.parse(await readFile(path.join(packagePath, 'package.json'), 'utf8'));
  const licenseName = (await readdir(packagePath)).find((name) => /^licen[cs]e(?:\..+)?$/iu.test(name));
  if (!licenseName) throw new Error(`No license file found for ${packagePath}.`);

  const licenseText = (await readFile(path.join(packagePath, licenseName), 'utf8')).trim();
  const key = `${String(manifest.license ?? 'SEE LICENSE')}\n${licenseText}`;
  const packages = notices.get(key) ?? [];
  packages.push(`${String(manifest.name)}@${String(manifest.version)}`);
  notices.set(key, packages);
}

const sections = [...notices.entries()].map(([notice, packages], index) => {
  const [license, ...text] = notice.split('\n');
  return [
    `--------------------------------------------------------------------------------`,
    `${String(index + 1)}. ${license}`,
    '',
    ...packages.map((entry) => `- ${entry}`),
    '',
    text.join('\n')
  ].join('\n');
});

const output = [
  'markami third-party notices',
  '',
  'This distribution includes the following production dependencies. Packages sharing an',
  'identical license file are grouped together. This file is generated from package-lock.json',
  'and the installed package license files by scripts/generateNotices.mjs.',
  '',
  ...sections,
  ''
].join('\n');

await writeFile('THIRD_PARTY_NOTICES.txt', output, 'utf8');
console.log(`Wrote ${String(notices.size)} distinct notices for production dependencies.`);
