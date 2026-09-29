import { isOpenableExternally } from '@shared/ipc-contract';
import type { LinkRef } from '@shared/types';
import { useState } from 'react';

import { getApi } from '../app/api';

import { Card } from './primitives';

/**
 * Inline-editable title/url list used on projects and tasks (prototype's
 * linkRow). Every edit writes through immediately.
 */
export function LinkListEditor({
  links,
  onChange,
}: {
  links: LinkRef[];
  onChange: (links: LinkRef[]) => void;
}): React.JSX.Element {
  const patch = (i: number, field: keyof LinkRef, value: string): void => {
    onChange(links.map((l, j) => (j === i ? { ...l, [field]: value } : l)));
  };

  return (
    <div className="link-editor">
      {links.map((link, i) => (
        <div key={i} className="link-row">
          <input
            className="inp"
            value={link.title}
            placeholder="Label"
            onChange={(e) => {
              patch(i, 'title', e.target.value);
            }}
          />
          <input
            className="inp link-url"
            value={link.url}
            placeholder="https://…"
            onChange={(e) => {
              patch(i, 'url', e.target.value);
            }}
          />
          {link.url.startsWith('http') && (
            <button
              className="link-open"
              title="Open link"
              onClick={() => {
                void getApi().openExternal(link.url);
              }}
            >
              ↗
            </button>
          )}
          <button
            className="link-remove"
            aria-label={`Remove link ${link.title || String(i + 1)}`}
            onClick={() => {
              onChange(links.filter((_, j) => j !== i));
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        className="link-add"
        onClick={() => {
          onChange([...links, { title: '', url: '' }]);
        }}
      >
        + Add link
      </button>
    </div>
  );
}

/**
 * A project's links as links: click one and it opens in the browser. The
 * inputs only appear behind the card's Edit button, because a page you read
 * far more often than you edit should not make you aim past a text box to
 * follow a URL.
 *
 * Buttons rather than `<a href>`: a real anchor would navigate the app
 * window. A URL the main process would refuse to open (no scheme, a typo)
 * renders as plain text, so nothing looks clickable that silently isn't.
 * Rows left entirely blank are swept up when editing ends.
 */
export function LinksCard({
  links,
  onChange,
}: {
  links: LinkRef[];
  onChange: (links: LinkRef[]) => void;
}): React.JSX.Element {
  const [editing, setEditing] = useState(false);

  const finish = (): void => {
    const kept = links.filter((l) => l.title.trim() !== '' || l.url.trim() !== '');
    if (kept.length !== links.length) onChange(kept);
    setEditing(false);
  };

  return (
    <Card
      title="Links"
      headRight={
        <button
          className="lib-btn"
          onClick={() => {
            if (editing) finish();
            else setEditing(true);
          }}
        >
          {editing ? 'Done' : 'Edit'}
        </button>
      }
    >
      <div className="card-pad">
        {editing ? (
          <LinkListEditor links={links} onChange={onChange} />
        ) : (
          <div className="link-list" data-testid="link-list">
            {links.map((link, i) => {
              const url = link.url.trim();
              const label = link.title.trim() || url || 'Untitled link';
              return isOpenableExternally(url) ? (
                <button
                  key={i}
                  type="button"
                  className="link-item"
                  title={url}
                  onClick={() => {
                    void getApi().openExternal(url);
                  }}
                >
                  <span className="link-item-label">{label}</span>
                  <span className="link-item-arrow" aria-hidden="true">
                    ↗
                  </span>
                </button>
              ) : (
                <span key={i} className="link-item dead" title={link.url.trim() || undefined}>
                  <span className="link-item-label">{label}</span>
                </span>
              );
            })}
            <button
              className="link-add"
              onClick={() => {
                onChange([...links, { title: '', url: '' }]);
                setEditing(true);
              }}
            >
              + Add link
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}
