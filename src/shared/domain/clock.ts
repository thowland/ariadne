import type { IsoDate } from '../types';

import { isValidIsoDate, toIsoDate } from './dates';

/**
 * The single boundary where "now" enters the system. All domain functions take
 * `today` as a parameter; only application shells (store bootstrap, main
 * process) call this. Tests pass a fixed date instead.
 *
 * `override` supports the ARIADNE_FAKE_TODAY escape hatch used by E2E runs:
 * the caller reads the environment and passes the raw value through.
 */
export function todayIso(override?: string, now: Date = new Date()): IsoDate {
  if (override !== undefined && isValidIsoDate(override)) return override;
  return toIsoDate(now);
}
