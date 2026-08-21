import { describe, expect, it } from 'vitest';

import { buildReportDocument, REPORT_PRINT_CSS, reportFileName } from './report-print';

describe('buildReportDocument', () => {
  const doc = buildReportDocument({
    title: 'Ariadne — Portfolio roll-up',
    subtitle: 'All projects · Wednesday, July 8, 2026',
    bodyHtml: '<table><tr><td>Q3</td></tr></table>',
  });

  it('produces a standalone document with the stylesheet inlined', () => {
    expect(doc.startsWith('<!doctype html>')).toBe(true);
    expect(doc).toContain('<title>Ariadne — Portfolio roll-up</title>');
    expect(doc).toContain(REPORT_PRINT_CSS);
    // Nothing external: the print window must not need the network.
    expect(doc).not.toMatch(/<link|src=|@import/);
  });

  it('carries the title and subtitle into the page header', () => {
    expect(doc).toContain('<h1 class="print-title">Ariadne — Portfolio roll-up</h1>');
    expect(doc).toContain('All projects · Wednesday, July 8, 2026');
  });

  it('embeds the body markup verbatim', () => {
    expect(doc).toContain('<table><tr><td>Q3</td></tr></table>');
  });

  it('escapes the title and subtitle so a project name cannot break the shell', () => {
    const evil = buildReportDocument({
      title: '</title><script>alert(1)</script>',
      subtitle: 'a "quoted" & <tagged> scope',
      bodyHtml: '',
    });
    expect(evil).not.toContain('<script>');
    expect(evil).toContain('&lt;/title&gt;');
    expect(evil).toContain('&amp;');
    expect(evil).toContain('&quot;quoted&quot;');
  });

  it('repeats table headers across pages and keeps rows whole', () => {
    // Both matter for a multi-page portfolio roll-up.
    expect(REPORT_PRINT_CSS).toContain('display: table-header-group');
    expect(REPORT_PRINT_CSS).toContain('break-inside: avoid');
  });

  /**
   * Every layout class the reports render needs a rule here, because the print
   * document deliberately does not load app.css. A class with no rule silently
   * degrades to a block: that is how the deferred report's 8-cell analytics
   * grid shipped as 16 stacked lines across the top of page 1.
   */
  it('lays out every flex/grid class the reports depend on', () => {
    for (const cls of [
      'defer-stats',
      'defer-stat-value',
      'defer-stat-label',
      'defer-row',
      'defer-count',
      'defer-bar-track',
      'defer-bar-fill',
      'defer-trail',
      'defer-breakdowns',
      'trow',
      'trow-body',
      'risk-title',
      'risk-reason',
      'contact-avatar',
      'contact-report-row',
      'contact-report-open',
      'contact-report-name',
      'contact-report-reach',
      'copy-value',
      'copy-value-icon',
    ]) {
      expect(REPORT_PRINT_CSS, `.${cls} has no print rule`).toContain(`.${cls} `);
    }
  });

  it('gives the analytics strip and breakdowns explicit column counts', () => {
    // app.css sizes .defer-stats with auto-fit, which resolves against the
    // print viewport rather than the paper. The column count has to be stated
    // outright here for a predictable Letter layout.
    expect(REPORT_PRINT_CSS).toMatch(
      /\.defer-stats \{[^}]*grid-template-columns: repeat\(4, 1fr\)/,
    );
    expect(REPORT_PRINT_CSS).not.toMatch(/\.defer-stats \{[^}]*auto-fit/);
    expect(REPORT_PRINT_CSS).toMatch(/\.defer-breakdowns \{[^}]*grid-template-columns: 1fr 1fr/);
  });

  it('prints the copied value rather than the button label', () => {
    // On screen the button says "Email"; on paper that is useless, so the
    // stylesheet swaps in the address the button would have copied.
    expect(REPORT_PRINT_CSS).toMatch(/\.copy-value-text \{ display: none/);
    expect(REPORT_PRINT_CSS).toMatch(/\.copy-value::after \{ content: attr\(data-print\)/);
  });

  it('gives the contact avatar an explicit display so its inline size applies', () => {
    // A <span> sized only by width/height stays inline, where those do
    // nothing — the same trap the project dots fell into.
    expect(REPORT_PRINT_CSS).toMatch(/\.contact-avatar \{[^}]*display: inline-flex/);
  });
});

describe('reportFileName', () => {
  it('slugs the report label and stamps the date', () => {
    expect(reportFileName('Portfolio roll-up', '2026-08-06', 'pdf')).toBe(
      'ariadne-portfolio-roll-up-2026-08-06.pdf',
    );
    expect(reportFileName('At-risk', '2026-08-06', 'csv')).toBe('ariadne-at-risk-2026-08-06.csv');
  });

  it('collapses punctuation runs and never leaves a dangling dash', () => {
    expect(reportFileName('Weekly status!! (draft)', '2026-01-02', 'pdf')).toBe(
      'ariadne-weekly-status-draft-2026-01-02.pdf',
    );
  });
});
