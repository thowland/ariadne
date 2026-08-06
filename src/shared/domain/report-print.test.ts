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
