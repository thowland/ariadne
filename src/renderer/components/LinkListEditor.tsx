import type { LinkRef } from '@shared/types';

import { getApi } from '../app/api';

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
