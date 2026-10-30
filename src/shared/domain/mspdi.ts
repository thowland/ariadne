/**
 * Microsoft Project XML (MSPDI) → the loose task document `convertMsProject`
 * reads (D54). MS Project writes this with File → Save As → XML Format. It is
 * plain XML with no schema tricks: a `<Project>` holding `<Tasks>`, each
 * `<Task>` a flat list of child elements (`UID`, `Name`, `OutlineLevel`,
 * `Start`, `Finish`, `PercentComplete`, `PredecessorLink`, …).
 *
 * Pure, like the rest of `shared/`: a small XML reader instead of the DOM's
 * `DOMParser`, so it runs in the domain tests, the main process and the MCP
 * server alike. It reads elements, text, CDATA and entities, and skips the
 * prolog, comments, processing instructions and attributes — everything
 * MSPDI uses and nothing else.
 */

export interface XmlElement {
  /** Local name: `<ms:Task>` and `<Task>` are both `Task`. */
  name: string;
  children: XmlElement[];
  text: string;
}

export type XmlResult = { ok: true; root: XmlElement } | { ok: false; error: string };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (!body.startsWith('#')) return ENTITIES[body] ?? whole;
    const code = body.startsWith('#x') ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    // An out-of-range reference stays as written rather than throwing.
    return code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

function localName(tag: string): string {
  const colon = tag.indexOf(':');
  return colon < 0 ? tag : tag.slice(colon + 1);
}

/** Parses an XML document into an element tree, or says why it could not. */
export function parseXml(source: string): XmlResult {
  const s = source.replace(/^\uFEFF/, '');
  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;
  let i = 0;
  const bad = (why: string): XmlResult => ({ ok: false, error: `Invalid XML — ${why}` });

  while (i < s.length) {
    const lt = s.indexOf('<', i);
    const textEnd = lt < 0 ? s.length : lt;
    if (textEnd > i) {
      const top = stack.at(-1);
      if (top !== undefined) top.text += decode(s.slice(i, textEnd));
      else if (s.slice(i, textEnd).trim() !== '') return bad('text outside the root element');
    }
    if (lt < 0) break;

    if (s.startsWith('<!--', lt)) {
      const end = s.indexOf('-->', lt + 4);
      if (end < 0) return bad('unclosed comment');
      i = end + 3;
    } else if (s.startsWith('<![CDATA[', lt)) {
      const end = s.indexOf(']]>', lt + 9);
      if (end < 0) return bad('unclosed CDATA section');
      const top = stack.at(-1);
      if (top !== undefined) top.text += s.slice(lt + 9, end);
      i = end + 3;
    } else if (s.startsWith('<?', lt)) {
      const end = s.indexOf('?>', lt + 2);
      if (end < 0) return bad('unclosed processing instruction');
      i = end + 2;
    } else if (s.startsWith('<!', lt)) {
      // A DOCTYPE; MSPDI has none, but one must not break the read.
      const end = s.indexOf('>', lt + 2);
      if (end < 0) return bad('unclosed declaration');
      i = end + 1;
    } else if (s.startsWith('</', lt)) {
      const end = s.indexOf('>', lt + 2);
      if (end < 0) return bad('unclosed end tag');
      const name = localName(s.slice(lt + 2, end).trim());
      const open = stack.pop();
      if (open?.name !== name) return bad(`</${name}> does not match the open element`);
      i = end + 1;
    } else {
      // A start tag. Attribute values may hold '>', so skip quoted runs.
      let j = lt + 1;
      let quote: string | null = null;
      while (j < s.length) {
        const c = s[j];
        if (quote !== null) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '>') break;
        j += 1;
      }
      if (j >= s.length) return bad('unclosed start tag');
      const body = s.slice(lt + 1, j);
      const selfClosing = body.endsWith('/');
      const tag = /^[^\s/>]+/.exec(body)?.[0];
      if (tag === undefined) return bad('empty tag name');
      const el: XmlElement = { name: localName(tag), children: [], text: '' };
      const parent = stack.at(-1);
      if (parent !== undefined) parent.children.push(el);
      else if (root === null) root = el;
      else return bad('more than one root element');
      if (!selfClosing) stack.push(el);
      i = j + 1;
    }
  }
  if (stack.length > 0) return bad(`<${stack.at(-1)?.name ?? ''}> is never closed`);
  if (root === null) return bad('no root element');
  return { ok: true, root };
}

function child(el: XmlElement, name: string): XmlElement | undefined {
  return el.children.find((c) => c.name === name);
}

function childText(el: XmlElement, name: string): string | undefined {
  const c = child(el, name);
  return c === undefined ? undefined : c.text.trim();
}

/**
 * The MSPDI fields Ariadne uses, renamed to the keys `convertMsProject`
 * already reads. Everything else in a task — costs, baselines, timephased
 * data, extended attributes — is dropped here.
 */
const TASK_FIELDS: readonly (readonly [string, string])[] = [
  ['UID', 'unique_id'],
  ['ID', 'id'],
  ['Name', 'name'],
  ['OutlineLevel', 'outline_level'],
  ['Summary', 'summary'],
  ['Milestone', 'milestone'],
  ['Start', 'start'],
  ['Finish', 'finish'],
  ['ActualStart', 'actual_start'],
  ['ActualFinish', 'actual_finish'],
  ['PercentComplete', 'percent_complete'],
  ['Priority', 'priority'],
  ['Notes', 'notes'],
  ['CreateDate', 'created'],
];

export type MspdiResult = { ok: true; doc: Record<string, unknown> } | { ok: false; error: string };

/** True when the text is XML rather than JSON — the first thing in it is a tag. */
export function looksLikeXml(source: string): boolean {
  return /^\s*</.test(source.replace(/^\uFEFF/, ''));
}

/**
 * Reads an MS Project XML file into `{ property_values, tasks }` for
 * `convertMsProject`. Refuses XML whose root is not a `<Project>` with a
 * `<Tasks>` list, so some other XML file gets a clear message rather than an
 * empty project.
 */
export function readMspdi(source: string): MspdiResult {
  const parsed = parseXml(source);
  if (!parsed.ok) return parsed;
  const project = parsed.root;
  const tasksEl = project.name === 'Project' ? child(project, 'Tasks') : undefined;
  if (tasksEl === undefined) {
    return { ok: false, error: 'Not a Microsoft Project XML file (no <Project> with <Tasks>)' };
  }

  const tasks = tasksEl.children
    .filter((t) => t.name === 'Task')
    // Project writes a placeholder <Task><IsNull>1</IsNull></Task> for a blank row.
    .filter((t) => childText(t, 'IsNull') !== '1')
    .map((t) => {
      const out: Record<string, unknown> = {};
      for (const [from, to] of TASK_FIELDS) {
        const v = childText(t, from);
        if (v !== undefined && v !== '') out[to] = v;
      }
      const links = t.children
        .filter((c) => c.name === 'PredecessorLink')
        .flatMap((c) => {
          const uid = childText(c, 'PredecessorUID');
          return uid === undefined ? [] : [{ predecessor_task_unique_id: uid }];
        });
      if (links.length > 0) out.predecessors = links;
      return out;
    });

  return {
    ok: true,
    doc: {
      property_values: {
        project_title: childText(project, 'Title') ?? '',
        name: (childText(project, 'Name') ?? '').replace(/\.(xml|mpp)$/i, ''),
        comments: childText(project, 'Comments') ?? '',
      },
      tasks,
    },
  };
}
