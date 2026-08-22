import { describe, expect, it } from 'vitest';

import { resolveTheme } from './theme';

describe('resolveTheme (D38)', () => {
  it('follows the OS when the choice is "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('ignores the OS once the user has chosen', () => {
    // The point of picking dark is that it stays dark at 9am.
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });
});
