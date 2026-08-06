/**
 * Builds the standalone HTML document that the main process prints to PDF.
 *
 * The renderer captures the report's own markup and passes it here; this file
 * wraps it in a print-shaped document. Deliberately not the app stylesheet:
 * on paper we want black text on white with generous margins, not the app's
 * chrome, and interactive affordances (the sortable-header buttons) have to
 * flatten back into plain headings.
 */

/** Escapes text for interpolation into the document shell. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const REPORT_PRINT_CSS = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 11px;
    line-height: 1.45;
    color: #14140f;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .print-head { border-bottom: 1.5px solid #14140f; padding-bottom: 8px; margin-bottom: 16px; }
  .print-title { font-size: 17px; font-weight: 700; margin: 0; }
  .print-sub { font-size: 10.5px; color: #55554d; margin-top: 3px; }
  h1, h2, h3 { font-size: 12.5px; margin: 14px 0 6px; }

  /* Report structure. Blocks avoid splitting mid-project where possible. */
  .report-block { margin-bottom: 14px; break-inside: avoid; }
  .report-project-head {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
    font-size: 12px;
    margin-bottom: 5px;
    padding-bottom: 3px;
    border-bottom: 1px solid #dcdcd4;
  }
  .spacer { flex: 1; }
  .report-line { display: flex; gap: 8px; padding: 2px 0; break-inside: avoid; }
  .report-line-title { flex: 1; }
  .report-line-due, .retro-date, .weekly-empty { white-space: nowrap; }

  /* The weekly report is three columns on screen; keep that on paper rather
     than letting them stack into one ambiguous list. */
  .weekly-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .weekly-col-label {
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.06em;
    margin-bottom: 3px;
  }
  .weekly-empty { color: #55554d; }
  .card-empty, .card-hint, .muted, .retro-range { color: #55554d; }
  .card-count, .report-count-pill { color: #55554d; font-weight: 600; }

  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #dcdcd4; }
  thead th {
    font-size: 9.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #55554d;
    border-bottom: 1.2px solid #14140f;
  }
  thead { display: table-header-group; }  /* repeat headers across pages */
  tr { break-inside: avoid; }
  .num, td.num { text-align: right; font-variant-numeric: tabular-nums; }

  /* Sort buttons are chrome, not content: flatten them back to plain labels. */
  th button, th .sort-caret { all: unset; font: inherit; color: inherit; }
  th .sort-caret { display: none; }

  /* Progress bars carry real information, so they print. */
  .portfolio-progress { display: flex; align-items: center; gap: 6px; }
  .progress-track { width: 54px; height: 5px; background: #e6e6de; border-radius: 3px; }
  .progress-fill { height: 5px; border-radius: 3px; }
  .overdue-count { color: #b3261e; font-weight: 700; }

  /* Project/status dots are <span class="dot"> sized by inline style. Without
     an explicit display they stay inline, where width/height do nothing and
     the colour identity of every row disappears. */
  .dot {
    display: inline-block;
    border-radius: 50%;
    flex: none;
    vertical-align: middle;
    margin-right: 5px;
  }
  .portfolio-name { display: inline-flex; align-items: center; }
  .pill {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 9px;
    font-size: 9.5px;
    font-weight: 600;
  }
  svg { vertical-align: middle; }

  @page { size: Letter; margin: 14mm 12mm; }
`;

/**
 * Wraps captured report markup in a printable document. `bodyHtml` is markup
 * the renderer produced from its own DOM — React has already escaped every
 * piece of user text inside it, and the print window runs with JavaScript
 * disabled, so nothing in it can execute.
 */
export function buildReportDocument({
  title,
  subtitle,
  bodyHtml,
}: {
  title: string;
  subtitle: string;
  bodyHtml: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${REPORT_PRINT_CSS}</style>
</head>
<body>
<div class="print-head">
  <h1 class="print-title">${escapeHtml(title)}</h1>
  <div class="print-sub">${escapeHtml(subtitle)}</div>
</div>
${bodyHtml}
</body>
</html>`;
}

/** `Portfolio roll-up` + a date → `ariadne-portfolio-roll-up-2026-08-06.pdf`. */
export function reportFileName(label: string, today: string, ext: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `ariadne-${slug}-${today}.${ext}`;
}
