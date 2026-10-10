// ZIP stores entry times in the packager's local time, so a fixed SOURCE_DATE_EPOCH still yields a different
// archive in a different time zone. Pinning UTC makes the VSIX byte-identical on every machine.
export function packagingEnvironment(environment, sourceDateEpoch) {
  return { ...environment, SOURCE_DATE_EPOCH: sourceDateEpoch, TZ: 'UTC' };
}
