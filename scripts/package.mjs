import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const artifactDirectory = 'artifacts';
const artifactPath = path.join(artifactDirectory, `${manifest.name}-${manifest.version}.vsix`);
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run packaging through npm so the npm CLI path is available.');
const vsceCli = path.resolve('node_modules', '@vscode', 'vsce', 'vsce');

await mkdir(artifactDirectory, { recursive: true });
execFileSync(process.execPath, ['scripts/generateNotices.mjs'], { stdio: 'inherit' });
execFileSync(process.execPath, [npmCli, 'run', 'build'], { stdio: 'inherit' });
execFileSync(process.execPath, [vsceCli, 'package', '--no-dependencies', '--out', artifactPath], {
  stdio: 'inherit'
});
execFileSync(process.execPath, ['scripts/checkPackage.mjs', artifactPath], { stdio: 'inherit' });

const digest = createHash('sha256').update(await readFile(artifactPath)).digest('hex');
const checksumPath = `${artifactPath}.sha256`;
await writeFile(checksumPath, `${digest}  ${path.basename(artifactPath)}\n`, 'utf8');
console.log(`SHA-256: ${digest}`);
console.log(`Checksum: ${checksumPath}`);
