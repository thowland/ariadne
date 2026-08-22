import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPORT_PRINT_CSS } from '@shared/domain/report-print';
import { describe, expect, it } from 'vitest';

/**
 * The theme is only as good as its coverage (D38). A colour that stayed a
 * literal looks fine in light and wrong in dark, and a `var()` the print
 * document does not declare prints as nothing at all — neither failure shows
 * up in a component test, so they are checked here against the files.
 */

/**
 * Read as text, not imported. A `?raw` import resolves to the empty string as
 * soon as anything else in the run imports the same stylesheet normally —
 * Vite's CSS pipeline wins — which made this suite pass alone and fail in
 * company. Hence `.node.test.ts`: it runs in the node project, where `fs`
 * exists, while the renderer keeps its node-free types.
 */
const here = dirname(fileURLToPath(import.meta.url));
const tokens = readFileSync(join(here, 'tokens.css'), 'utf8');
const app = readFileSync(join(here, 'app.css'), 'utf8');
// Comments mention token names in prose ("valid in both, e.g. var(--x)");
// only real code counts.
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const colors = stripComments(readFileSync(join(here, 'colors.ts'), 'utf8'));

/** Custom properties declared inside the first block matching `selector`. */
function declared(css: string, selector: string): Set<string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`no ${selector} block`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('\n}', open);
  const body = css.slice(open, close);
  return new Set([...body.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]!));
}

/** Every custom property `css` reads with var(). */
function used(css: string): Set<string> {
  return new Set([...css.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]!));
}

const light = declared(tokens, ':root {');
const dark = declared(tokens, ":root[data-theme='dark']");

/** Not colours, so they do not change with the theme. */
const THEME_INDEPENDENT = new Set(['--font-ui', '--font-mono']);

describe('design tokens', () => {
  it('gives every themed token a dark value', () => {
    const missing = [...light].filter((t) => !THEME_INDEPENDENT.has(t) && !dark.has(t));
    expect(missing, `no dark value for: ${missing.join(', ')}`).toEqual([]);
  });

  it('defines nothing in dark that light does not have', () => {
    // A dark-only token is a token nothing can use.
    expect([...dark].filter((t) => !light.has(t))).toEqual([]);
  });

  it('declares every token the stylesheet reads', () => {
    const missing = [...used(app)].filter((t) => !light.has(t));
    expect(missing, `app.css uses undeclared: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('app.css carries no literal colours', () => {
  it('has no raw hex', () => {
    // One literal is one thing that will not follow the theme.
    expect(app.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
  });

  it('has no raw rgba, which is how the top bar stayed light', () => {
    expect(app.match(/rgba\(/g)).toBeNull();
  });
});

describe('the print stylesheet declares what report markup carries', () => {
  // Report HTML is captured from the live DOM with these inline, and the
  // print document never loads tokens.css.
  const printed = declared(REPORT_PRINT_CSS, ':root {');

  it('declares every palette token an inline style can reference', () => {
    const missing = [...used(colors)].filter((t) => !printed.has(t));
    expect(missing, `print CSS is missing: ${missing.join(', ')}`).toEqual([]);
  });

  it('declares every token its own rules read', () => {
    const missing = [...used(REPORT_PRINT_CSS)].filter((t) => !printed.has(t));
    expect(missing).toEqual([]);
  });

  it('keeps the light values, because paper is white', () => {
    expect(printed.has('--text')).toBe(true);
    expect(REPORT_PRINT_CSS).not.toContain("data-theme='dark'");
  });
});

describe('styles/colors.ts is nothing but tokens', () => {
  it('holds no colour literals of its own', () => {
    // The whole point of that module is the indirection; a literal there is
    // a colour that cannot follow the theme.
    expect(colors.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
    expect(colors.match(/rgba?\(/g)).toBeNull();
  });

  it('is covered by tokens.css', () => {
    const missing = [...used(colors)].filter((t) => !light.has(t));
    expect(missing).toEqual([]);
  });
});
