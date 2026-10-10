import assert from 'node:assert/strict';
import test from 'node:test';

import { isLicenseAllowed } from './licensePolicy.mjs';

test('keeps the permissive allowlist for ordinary packages', () => {
  for (const license of ['MIT', 'ISC', 'Apache-2.0', 'BSD-3-Clause']) {
    assert.equal(isLicenseAllowed('left-pad', license), true, license);
  }
  assert.equal(isLicenseAllowed('left-pad', 'GPL-3.0'), false);
  assert.equal(isLicenseAllowed('left-pad', 'UNKNOWN'), false);
});

test('accepts the SIL Open Font License only for bundled font packages', () => {
  assert.equal(isLicenseAllowed('@fontsource-variable/shantell-sans', 'OFL-1.1'), true);
  assert.equal(isLicenseAllowed('@fontsource/some-font', 'OFL-1.1'), true);
  assert.equal(isLicenseAllowed('left-pad', 'OFL-1.1'), false);
  assert.equal(isLicenseAllowed('@fontsource-variable/shantell-sans', 'GPL-3.0'), false);
});
