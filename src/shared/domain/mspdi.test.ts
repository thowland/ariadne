import { describe, expect, it } from 'vitest';

import { looksLikeXml, parseXml, readMspdi } from './mspdi';
import { convertMsProject } from './msproject';

const TODAY = '2026-07-08';

/** Trimmed from a real File → Save As → XML export. */
const MSPDI = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <SaveVersion>14</SaveVersion>
  <Name>Lab Move.xml</Name>
  <Title>Lab Move &amp; Fit-out</Title>
  <Comments>Building 4</Comments>
  <!-- calendars, extended attributes … -->
  <Calendars><Calendar><UID>1</UID><Name>Standard</Name></Calendar></Calendars>
  <Tasks>
    <Task><UID>0</UID><ID>0</ID><Name>Lab Move</Name><OutlineLevel>0</OutlineLevel><Summary>1</Summary></Task>
    <Task>
      <UID>1</UID><ID>1</ID><Name>Design Phase</Name><OutlineLevel>1</OutlineLevel><Summary>1</Summary>
    </Task>
    <Task>
      <UID>2</UID><ID>2</ID><Name>Floor plan</Name><OutlineLevel>2</OutlineLevel>
      <Summary>0</Summary><Milestone>0</Milestone><Priority>700</Priority>
      <Start>2026-03-02T08:00:00</Start><Finish>2026-03-06T17:00:00</Finish>
      <ActualFinish>2026-03-05T17:00:00</ActualFinish><PercentComplete>100</PercentComplete>
      <Notes><![CDATA[Ask <facilities> first]]></Notes>
      <Baseline><Number>0</Number><Start>2026-03-01T08:00:00</Start></Baseline>
    </Task>
    <Task>
      <UID>3</UID><ID>3</ID><Name>Sign-off</Name><OutlineLevel>2</OutlineLevel>
      <Milestone>1</Milestone><Finish>2026-03-09T17:00:00</Finish><PercentComplete>0</PercentComplete>
      <PredecessorLink><PredecessorUID>2</PredecessorUID><Type>1</Type><LinkLag>0</LinkLag></PredecessorLink>
    </Task>
    <Task><UID>9</UID><ID>4</ID><IsNull>1</IsNull></Task>
    <Task>
      <UID>4</UID><ID>5</ID><Name>Build Phase</Name><OutlineLevel>1</OutlineLevel><Summary>1</Summary>
    </Task>
    <Task>
      <UID>5</UID><ID>6</ID><Name>Move benches &#8211; east wing</Name><OutlineLevel>2</OutlineLevel>
      <Finish>2026-04-10T17:00:00</Finish><PercentComplete>40</PercentComplete><Priority>950</Priority>
      <PredecessorLink><PredecessorUID>3</PredecessorUID></PredecessorLink>
      <PredecessorLink><PredecessorUID>1</PredecessorUID></PredecessorLink>
    </Task>
  </Tasks>
  <Resources><Resource><UID>1</UID><Name>Pat</Name></Resource></Resources>
</Project>`;

describe('readMspdi', () => {
  it('reads an MS Project XML export into tasks convertMsProject understands', () => {
    const read = readMspdi(MSPDI);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const { doc, warnings } = convertMsProject(read.doc, TODAY);
    expect(doc.project).toEqual({ name: 'Lab Move & Fit-out', notes: 'Building 4' });
    expect(doc.tasks.map((t) => [t.title, t.status, t.tags])).toEqual([
      ['Floor plan', 'Done', ['design-phase']],
      ['Sign-off', 'Todo', ['design-phase', 'milestone']],
      ['Move benches – east wing', 'Doing', ['build-phase']],
    ]);
    expect(doc.tasks[0]).toMatchObject({
      dueDate: '2026-03-06',
      completedAt: '2026-03-05',
      priority: 'High',
      notes: 'Ask <facilities> first',
    });
    expect(doc.tasks[1]!.dependsOn).toEqual(['2']);
    expect(doc.tasks[2]).toMatchObject({ dependsOn: ['3'], priority: 'Critical' });
    expect(warnings).toEqual([
      '2 summary tasks became tags',
      '1 link to a summary or missing task dropped',
    ]);
  });

  it('falls back to the file name when there is no title', () => {
    const read = readMspdi(
      '<Project><Name>Plan.mpp</Name><Tasks><Task><UID>1</UID><Name>a</Name></Task></Tasks></Project>',
    );
    expect(read.ok && convertMsProject(read.doc, TODAY).doc.project.name).toBe('Plan');
  });

  it('refuses XML that is not an MS Project file', () => {
    expect(readMspdi('<html><body/></html>')).toEqual({
      ok: false,
      error: 'Not a Microsoft Project XML file (no <Project> with <Tasks>)',
    });
    expect(readMspdi('<Project><Name>x</Name></Project>').ok).toBe(false);
    expect(readMspdi('<Project><Tasks>')).toEqual({
      ok: false,
      error: 'Invalid XML — <Tasks> is never closed',
    });
  });
});

describe('parseXml', () => {
  const err = (s: string): string => {
    const r = parseXml(s);
    return r.ok ? '' : r.error;
  };

  it('reads elements, prefixes, attributes, entities and CDATA', () => {
    const r = parseXml(
      '\uFEFF<!DOCTYPE x><ms:a k="1>2" j=\'q\'><b>x &lt;&#65;&#x42;&bogus;</b><c/><![CDATA[<raw>]]></ms:a>',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.root.name).toBe('a');
    expect(r.root.children.map((c) => [c.name, c.text])).toEqual([
      ['b', 'x <AB&bogus;'],
      ['c', ''],
    ]);
    expect(r.root.text).toBe('<raw>');
  });

  it('keeps an out-of-range character reference as written', () => {
    const r = parseXml('<a>&#x110000;</a>');
    expect(r.ok && r.root.text).toBe('&#x110000;');
  });

  it('explains malformed input', () => {
    expect(err('')).toBe('Invalid XML — no root element');
    expect(err('hello <a/>')).toBe('Invalid XML — text outside the root element');
    expect(err('<a></b>')).toBe('Invalid XML — </b> does not match the open element');
    expect(err('<a/><b/>')).toBe('Invalid XML — more than one root element');
    expect(err('<a><!-- x')).toBe('Invalid XML — unclosed comment');
    expect(err('<a><![CDATA[ x')).toBe('Invalid XML — unclosed CDATA section');
    expect(err('<?xml x')).toBe('Invalid XML — unclosed processing instruction');
    expect(err('<!DOCTYPE')).toBe('Invalid XML — unclosed declaration');
    expect(err('<a></a')).toBe('Invalid XML — unclosed end tag');
    expect(err('<a k="x>')).toBe('Invalid XML — unclosed start tag');
    expect(err('< >')).toBe('Invalid XML — empty tag name');
  });

  it('tells XML from JSON by its first character', () => {
    expect(looksLikeXml('  <?xml version="1.0"?><a/>')).toBe(true);
    expect(looksLikeXml('\uFEFF<Project/>')).toBe(true);
    expect(looksLikeXml('{"name": "x"}')).toBe(false);
  });
});

describe('readMspdi — edge cases', () => {
  it('skips empty fields and links without a predecessor id', () => {
    const read = readMspdi(
      '<Project><Tasks><Task><UID>1</UID><Name>a</Name><Notes></Notes>' +
        '<PredecessorLink><Type>1</Type></PredecessorLink></Task></Tasks></Project>',
    );
    expect(read.ok && read.doc.tasks).toEqual([{ unique_id: '1', name: 'a' }]);
  });

  it('reads namespaced elements and ignores other top-level sections', () => {
    const read = readMspdi(
      '<p:Project xmlns:p="x"><p:Title>T</p:Title><p:Resources/>' +
        '<p:Tasks><p:Task><p:UID>7</p:UID><p:Name>n</p:Name></p:Task><p:Note/></p:Tasks></p:Project>',
    );
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.doc.tasks).toEqual([{ unique_id: '7', name: 'n' }]);
    expect(read.doc.property_values).toMatchObject({ project_title: 'T' });
  });
});
