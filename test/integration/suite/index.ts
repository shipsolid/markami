import path from 'node:path';
import Mocha from 'mocha';
import { glob } from 'glob';
import { warmUpMarkamiEditor } from '../support.js';

export async function run(): Promise<void> {
  const mocha = new Mocha({ color: true, ui: 'tdd' });
  const root = path.resolve(__dirname, '..');
  // An installed extension runs in production mode, which omits the test-only inspection command that the
  // view-preferences suite drives.
  const installed = process.env.MARKAMI_INSTALLED_VSIX === '1';
  const files = (await glob('**/*.test.js', { cwd: root }))
    .filter((file) => !(installed && file === 'viewPreferences.test.js'));

  await warmUpMarkamiEditor();

  for (const file of files) {
    mocha.addFile(path.resolve(root, file));
  }

  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) => failures === 0 ? resolve() : reject(new Error(`${String(failures)} integration test(s) failed`)));
  });
}
