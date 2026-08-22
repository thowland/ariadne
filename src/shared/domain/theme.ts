import type { ThemeChoice } from '../types';

/**
 * Appearance (D38), as a pure function so the choice can be tested without a
 * window, a matchMedia, or an Electron.
 */

/** What is actually painted, once "system" has been resolved. */
export type ResolvedTheme = 'light' | 'dark';

/**
 * The theme to paint. `systemPrefersDark` is whatever the OS says; it is only
 * consulted for the `system` choice, so an explicit light or dark setting
 * keeps the app where the user put it even when the OS flips at sunset.
 */
export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): ResolvedTheme {
  if (choice === 'light' || choice === 'dark') return choice;
  return systemPrefersDark ? 'dark' : 'light';
}
