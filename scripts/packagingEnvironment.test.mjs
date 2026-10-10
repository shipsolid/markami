import assert from 'node:assert/strict';
import test from 'node:test';

import { packagingEnvironment } from './packagingEnvironment.mjs';

test('packaging pins UTC so ZIP entry timestamps do not depend on the machine time zone', () => {
  const environment = packagingEnvironment({ PATH: '/usr/bin', TZ: 'Asia/Kolkata' }, '315532800');

  assert.equal(environment.TZ, 'UTC');
  assert.equal(environment.SOURCE_DATE_EPOCH, '315532800');
  assert.equal(environment.PATH, '/usr/bin');
});

test('packaging does not mutate the environment it was given', () => {
  const base = { TZ: 'Asia/Kolkata' };

  packagingEnvironment(base, '315532800');

  assert.equal(base.TZ, 'Asia/Kolkata');
});
