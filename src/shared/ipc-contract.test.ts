import { describe, expect, it } from 'vitest';

import { isOpenableExternally, OPENABLE_SCHEMES } from './ipc-contract';

/**
 * The guard on `shell.openExternal`. Worth its own test because the URLs it
 * screens come from user data — a contact's email field, a project link —
 * and the OS will launch a great deal more than a browser if asked.
 */
describe('isOpenableExternally', () => {
  it('allows the web, mail and telephone', () => {
    expect(isOpenableExternally('https://example.com/rfc')).toBe(true);
    expect(isOpenableExternally('http://example.com')).toBe(true);
    expect(isOpenableExternally('mailto:dana@northwind.example')).toBe(true);
    expect(isOpenableExternally('tel:5552148890')).toBe(true);
    expect(isOpenableExternally('tel:+15552148890')).toBe(true);
  });

  it('refuses everything else the OS would happily launch', () => {
    for (const url of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox',
      'smb://share/x',
      'ariadne-blob://abc',
    ]) {
      expect(isOpenableExternally(url), url).toBe(false);
    }
  });

  it('refuses anything that is not a parseable absolute URL', () => {
    expect(isOpenableExternally('example.com')).toBe(false);
    expect(isOpenableExternally('/etc/passwd')).toBe(false);
    expect(isOpenableExternally('')).toBe(false);
    expect(isOpenableExternally(null)).toBe(false);
    expect(isOpenableExternally(undefined)).toBe(false);
    expect(isOpenableExternally(42)).toBe(false);
  });

  it('matches the scheme exactly, not as a prefix', () => {
    // `startsWith('https://')` would pass this; the parser reads the scheme
    // as `httpsx:` and it is refused.
    expect(isOpenableExternally('httpsx://example.com')).toBe(false);
    // Leading whitespace does not smuggle a scheme past it either.
    expect(isOpenableExternally(' javascript:alert(1)')).toBe(false);
    expect(isOpenableExternally('JAVASCRIPT:alert(1)')).toBe(false);
  });

  it('restricts the scheme, not the destination', () => {
    // The parser normalizes backslashes for special schemes, so this really
    // is an https URL and is allowed — as any https link the user typed
    // would be. Where an http(s) link goes is the user's business; what the
    // guard exists to stop is `file:` and `javascript:` reaching the OS.
    expect(isOpenableExternally('https:/\\example.com')).toBe(true);
    expect(new URL('https:/\\example.com').protocol).toBe('https:');
  });

  it('keeps the allowlist small enough to read', () => {
    expect([...OPENABLE_SCHEMES]).toEqual(['http:', 'https:', 'mailto:', 'tel:']);
  });
});
