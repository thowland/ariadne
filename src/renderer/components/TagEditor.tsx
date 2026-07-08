import { allKnownTags, suggestTags } from '@shared/domain/tags';
import { useState } from 'react';

import { useStore } from '../app/store';

/**
 * Chip editor for free-form tags (prototype _tagEditor), extended with:
 * - prefix autocomplete over every tag in the workspace (↑/↓ + Enter, click)
 * - click a chip to search for everything carrying that tag
 */
export function TagEditor({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}): React.JSX.Element {
  const { workspace, closeModal, setQuery } = useStore();
  const [draft, setDraft] = useState('');
  const [highlighted, setHighlighted] = useState(-1);

  const known = workspace !== null ? allKnownTags(workspace) : [];
  const suggestions = suggestTags(known, draft, tags);

  const commit = (raw: string): void => {
    const tag = raw.trim().replace(/^#/, '');
    if (tag === '') return;
    if (!tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      onChange([...tags, tag]);
    }
    setDraft('');
    setHighlighted(-1);
  };

  const searchTag = (tag: string): void => {
    closeModal();
    setQuery(tag);
  };

  return (
    <div className="tag-editor">
      {tags.map((tag, i) => (
        <span key={`${tag}-${String(i)}`} className="tag-chip">
          <button
            className="tag-chip-label"
            title={`Search for #${tag}`}
            onClick={() => {
              searchTag(tag);
            }}
          >
            #{tag}
          </button>
          <button
            aria-label={`Remove tag ${tag}`}
            onClick={() => {
              onChange(tags.filter((_, j) => j !== i));
            }}
          >
            ×
          </button>
        </span>
      ))}
      <span className="tag-input-wrap">
        <input
          className="tag-input"
          placeholder="+ tag"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setHighlighted(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const picked = highlighted >= 0 ? suggestions[highlighted] : undefined;
              commit(picked ?? draft);
            } else if (e.key === 'ArrowDown' && suggestions.length > 0) {
              e.preventDefault();
              setHighlighted((h) => (h + 1) % suggestions.length);
            } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
              e.preventDefault();
              setHighlighted((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
            } else if (e.key === 'Escape' && draft !== '') {
              e.stopPropagation();
              setDraft('');
              setHighlighted(-1);
            }
          }}
          onBlur={() => {
            // Let a suggestion mousedown land before the dropdown unmounts.
            setTimeout(() => {
              setHighlighted(-1);
            }, 0);
          }}
        />
        {suggestions.length > 0 && (
          <div className="tag-suggestions" role="listbox" aria-label="Tag suggestions">
            {suggestions.map((s, i) => (
              <button
                key={s}
                role="option"
                aria-selected={i === highlighted}
                className={`tag-suggestion ${i === highlighted ? 'active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus in the input
                  commit(s);
                }}
              >
                #{s}
              </button>
            ))}
          </div>
        )}
      </span>
    </div>
  );
}
