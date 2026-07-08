/** Chip editor for free-form tags (prototype _tagEditor). */
export function TagEditor({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}): React.JSX.Element {
  return (
    <div className="tag-editor">
      {tags.map((tag, i) => (
        <span key={`${tag}-${String(i)}`} className="tag-chip">
          #{tag}
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
      <input
        className="tag-input"
        placeholder="+ tag"
        onKeyDown={(e) => {
          const value = e.currentTarget.value.trim();
          if (e.key === 'Enter' && value !== '') {
            onChange([...tags, value.replace(/^#/, '')]);
            e.currentTarget.value = '';
          }
        }}
      />
    </div>
  );
}
