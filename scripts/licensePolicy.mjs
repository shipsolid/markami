const allowed = new Set([
  '(MPL-2.0 OR Apache-2.0)',
  'Apache-2.0',
  'BSD-3-Clause',
  'EPL-2.0',
  'ISC',
  'MIT',
  'Unlicense'
]);

// The SIL Open Font License is accepted only for the font files the webview bundles, never for code.
const fontPackages = /^@fontsource(?:-variable)?\//u;

export function isLicenseAllowed(packageName, license) {
  if (allowed.has(license)) return true;
  return license === 'OFL-1.1' && fontPackages.test(packageName);
}
