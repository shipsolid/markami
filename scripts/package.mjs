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
const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH ?? '315532800';
if (!/^\d+$/u.test(sourceDateEpoch) || Number(sourceDateEpoch) < 315532800) {
  throw new Error('SOURCE_DATE_EPOCH must be an integer at or after 1980-01-01T00:00:00Z.');
}

await mkdir(artifactDirectory, { recursive: true });
execFileSync(process.execPath, ['scripts/generateNotices.mjs'], { stdio: 'inherit' });
execFileSync(process.execPath, [npmCli, 'run', 'build'], { stdio: 'inherit' });
execFileSync(process.execPath, [vsceCli, 'package', '--no-dependencies', '--out', artifactPath], {
  env: { ...process.env, SOURCE_DATE_EPOCH: sourceDateEpoch },
  stdio: 'inherit'
});
execFileSync(process.execPath, ['scripts/checkPackage.mjs', artifactPath], { stdio: 'inherit' });

const digest = createHash('sha256').update(await readFile(artifactPath)).digest('hex');
const checksumPath = `${artifactPath}.sha256`;
await writeFile(checksumPath, `${digest}  ${path.basename(artifactPath)}\n`, 'utf8');
console.log(`SHA-256: ${digest}`);
console.log(`Reproducible ZIP epoch: ${sourceDateEpoch}`);
console.log(`Checksum: ${checksumPath}`);
