import { execFileSync, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';
import { cliInvocation } from './installSmoke.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUITE_TIMEOUT_MS = 180_000;

// @vscode/test-electron always passes --disable-workspace-trust, so Restricted Mode can only be reached by
// launching the binary directly.
export function restrictedLaunchArguments({ workspace, hostDirectory, testsPath, extensionsDirectory, userDataDirectory }) {
  return [
    workspace,
    '--no-sandbox',
    '--disable-gpu',
    '--disable-gpu-sandbox',
    '--disable-updates',
    '--skip-welcome',
    '--skip-release-notes',
    '--no-cached-data',
    `--extensionTestsPath=${testsPath}`,
    `--extensionDevelopmentPath=${hostDirectory}`,
    '--user-data-dir',
    userDataDirectory,
    '--extensions-dir',
    extensionsDirectory
  ];
}

export function restrictedUserSettings() {
  return {
    'security.workspace.trust.enabled': true,
    'security.workspace.trust.startupPrompt': 'never',
    'security.workspace.trust.untrustedFiles': 'open'
  };
}

function runCli(cli, arguments_) {
  const { ELECTRON_RUN_AS_NODE: _ignored, ...environment } = process.env;
  const { file, args, shell } = cliInvocation(cli, arguments_);
  return execFileSync(file, args, { encoding: 'utf8', env: { ...environment, DONT_PROMPT_WSL_INSTALL: '1' }, shell });
}

function runRestricted(executable, launchArguments) {
  const { ELECTRON_RUN_AS_NODE: _ignored, ...environment } = process.env;
  return new Promise((resolve, reject) => {
    const child = spawn(executable, launchArguments, { env: environment, stdio: 'inherit' });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Restricted Mode suite did not finish within ${String(SUITE_TIMEOUT_MS / 1000)} seconds.`));
    }, SUITE_TIMEOUT_MS);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Restricted Mode suite failed with exit code ${String(code)}.`));
    });
  });
}

async function main(arguments_) {
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const artifact = path.resolve(arguments_[0] ?? path.join(root, 'artifacts', `${manifest.name}-${manifest.version}.vsix`));
  const version = process.env.VSCODE_VERSION ?? 'stable';
  const vscodeExecutablePath = await downloadAndUnzipVSCode(version);
  const [cli, ...cliArguments] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath, { reuseMachineInstall: true });

  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'mk-restricted-'));
  const extensionsDirectory = path.join(temporaryRoot, 'extensions');
  const userDataDirectory = path.join(temporaryRoot, 'user-data');
  const hostDirectory = path.join(temporaryRoot, 'test-host');
  const workspace = path.join(temporaryRoot, 'workspace');
  const profile = ['--extensions-dir', extensionsDirectory, '--user-data-dir', userDataDirectory];

  try {
    await Promise.all([
      mkdir(path.join(userDataDirectory, 'User'), { recursive: true }),
      mkdir(extensionsDirectory),
      mkdir(hostDirectory),
      mkdir(path.join(workspace, '.vscode'), { recursive: true })
    ]);
    await writeFile(
      path.join(userDataDirectory, 'User', 'settings.json'),
      JSON.stringify(restrictedUserSettings(), null, 2)
    );
    // The host only gives the runner something to load; it declares untrusted-workspace support so that it is
    // never the thing being tested. markami comes from the installed VSIX.
    await writeFile(path.join(hostDirectory, 'package.json'), JSON.stringify({
      name: 'markami-restricted-host',
      version: '0.0.0',
      publisher: 'smoke',
      engines: { vscode: '^1.102.0' },
      capabilities: { untrustedWorkspaces: { supported: true } }
    }));
    await writeFile(path.join(workspace, 'restricted.md'), 'Restricted mode\n');
    await writeFile(path.join(workspace, '.vscode', 'settings.json'), JSON.stringify({
      'markami.remoteImages': 'allow',
      'markami.codeBlock.wrap': false
    }));

    runCli(cli, [...cliArguments, ...profile, '--install-extension', artifact]);
    console.log(`Installed ${path.basename(artifact)} into an isolated profile; opening an untrusted workspace.`);

    await runRestricted(vscodeExecutablePath, restrictedLaunchArguments({
      workspace,
      hostDirectory,
      testsPath: path.join(root, 'out', 'suite', 'restrictedMode.js'),
      extensionsDirectory,
      userDataDirectory
    }));
    console.log('markami works in Restricted Mode and workspace settings cannot change the remote image policy.');
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
