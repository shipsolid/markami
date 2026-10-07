import { rm } from 'node:fs/promises';

for (const path of ['dist', 'out']) {
  await rm(path, { force: true, recursive: true });
}
