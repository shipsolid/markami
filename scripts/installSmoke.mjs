import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath, runTests } from '@vscode/test-electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSION_ID = 'shipsolid.markami';

export function parseExtensionList(output) {
  const installed = new Map();
  for (const line of output.split(/\r?\n/u)) {
    const match = /^([^@\s]+)@(\S+)$/u.exec(line.trim());
    if (match) installed.set(match[1].toLowerCase(), match[2]);
  }
  return installed;
}

export function assertInstalled(output, id, version) {
  const found = parseExtensionList(output).get(id.toLowerCase());
  if (found === undefined) throw new Error(`${id} is not installed.`);
  if (found !== version) throw new Error(`${id} installed as ${found}, expected ${version}.`);
}

export function assertNotInstalled(output, id) {
  if (parseExtensionList(output).has(id.toLowerCase())) throw new Error(`${id} is still installed after uninstall.`);
}

export function verifyChecksum(checksumText, artifactName, digest) {
  const [recorded, name] = checksumText.trim().split(/\s+/u);
  if (name !== artifactName) throw new Error(`Checksum file names ${name ?? 'nothing'}, expected ${artifactName}.`);
  if (recorded !== digest) throw new Error('VSIX SHA-256 does not match the recorded checksum.');
}

const CMD_SPECIAL = /[\s&|<>^()]/u;

function quoteForCmd(argument) {
  if (argument.includes('"')) throw new Error(`Cannot quote a double quote for cmd.exe: ${argument}`);
  if (argument.includes('%')) throw new Error(`Cannot pass a percent sign through cmd.exe unexpanded: ${argument}`);
  return CMD_SPECIAL.test(argument) ? `"${argument}"` : argument;
}

// Since Node 20.12 a .cmd shim cannot be spawned without a shell, which then needs its own quoting.
export function cliInvocation(cli, arguments_, platform = process.platform) {
  if (platform !== 'win32') return { file: cli, args: arguments_, shell: false };
  return { file: quoteForCmd(cli), args: arguments_.map(quoteForCmd), shell: true };
}

function runCli(cli, arguments_) {
  const { ELECTRON_RUN_AS_NODE: _ignored, ...environment } = process.env;
  const { file, args, shell } = cliInvocation(cli, arguments_);
  // The CLI wrapper otherwise stops to ask for confirmation on WSL kernels, which containers share.
  return execFileSync(file, args, { encoding: 'utf8', env: { ...environment, DONT_PROMPT_WSL_INSTALL: '1' }, shell });
}

async function main(arguments_) {
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const artifactName = `${manifest.name}-${manifest.version}.vsix`;
  const artifact = path.resolve(arguments_[0] ?? path.join(root, 'artifacts', artifactName));
  const bytes = await readFile(artifact);
  verifyChecksum(
    await readFile(`${artifact}.sha256`, 'utf8'),
    path.basename(artifact),
    createHash('sha256').update(bytes).digest('hex')
  );
  console.log(`Checksum verified for ${path.basename(artifact)}.`);

  const version = process.env.VSCODE_VERSION ?? 'stable';
  const vscodeExecutablePath = await downloadAndUnzipVSCode(version);
  const [cli, ...cliArguments] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath, { reuseMachineInstall: true });
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'mk-smoke-'));
  const extensionsDirectory = path.join(temporaryRoot, 'extensions');
  const userDataDirectory = path.join(temporaryRoot, 'user-data');
  const hostDirectory = path.join(temporaryRoot, 'test-host');
  const profile = ['--extensions-dir', extensionsDirectory, '--user-data-dir', userDataDirectory];
  const launchArguments = [
    ...profile, '--disable-gpu', '--no-sandbox', '--skip-welcome', '--skip-release-notes'
  ];

  try {
    await Promise.all([mkdir(extensionsDirectory), mkdir(userDataDirectory), mkdir(hostDirectory)]);
    // A throwaway development extension only gives the test runner something to load; markami itself comes
    // from the installed VSIX, so the suite exercises the exact artifact that would be published.
    await writeFile(path.join(hostDirectory, 'package.json'), JSON.stringify({
      name: 'markami-install-smoke-host', version: '0.0.0', publisher: 'smoke', engines: { vscode: '^1.102.0' }
    }));

    runCli(cli, [...cliArguments, ...profile, '--install-extension', artifact]);
    assertInstalled(runCli(cli, [...cliArguments, ...profile, '--list-extensions', '--show-versions']), EXTENSION_ID, manifest.version);
    console.log(`Installed ${EXTENSION_ID}@${manifest.version} into an isolated profile.`);

    await runTests({
      version,
      extensionDevelopmentPath: hostDirectory,
      extensionTestsPath: path.join(root, 'out', 'suite', 'index.js'),
      extensionTestsEnv: { MARKAMI_INSTALLED_VSIX: '1' },
      launchArgs: [hostDirectory, ...launchArguments]
    });
    console.log('Integration suite passed against the installed VSIX.');

    runCli(cli, [...cliArguments, ...profile, '--uninstall-extension', EXTENSION_ID]);
    assertNotInstalled(runCli(cli, [...cliArguments, ...profile, '--list-extensions', '--show-versions']), EXTENSION_ID);
    await runTests({
      version,
      extensionDevelopmentPath: hostDirectory,
      extensionTestsPath: path.join(root, 'out', 'suite', 'afterUninstall.js'),
      launchArgs: [hostDirectory, ...launchArguments]
    });
    console.log('Uninstalled cleanly; Markdown opens natively with its bytes unchanged.');
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
