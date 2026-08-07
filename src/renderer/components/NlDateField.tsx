import { relativeDueLabel } from '@shared/domain/derive';
import { findNlDate } from '@shared/domain/nl-date';
import type { NlDateMatch } from '@shared/domain/nl-date';
import type { IsoDate } from '@shared/types';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * A title field that highlights a natural-language date as you type (D29).
 *
 * You cannot style a range of text inside a `<textarea>` or `<input>`, so the
 * highlight is painted by a mirror element sitting directly behind a
 * transparent-text field. The mirror renders the same string with the matched
 * span wrapped in a `<mark>`; as long as both share a font, padding, and
 * wrapping, the mark lands exactly under the real characters.
 *
 * The mirror is `aria-hidden` and never focusable — screen readers and the
 * caret only ever see the real field. The proposed date is announced through
 * the visible chip beside it instead.
 */
export function NlDateField({
  value,
  onChange,
  today,
  onDateChange,
  dismissed,
  onDismiss,
  placeholder,
  ariaLabel,
  multiline = false,
  className = '',
  inputRef,
  onKeyDown,
}: {
  value: string;
  onChange: (value: string) => void;
  today: IsoDate;
  /** Fired when the detected date changes (null when there is none). */
  onDateChange: (date: IsoDate | null, match: NlDateMatch | null) => void;
  /** True once the user has clicked the highlight off for this text. */
  dismissed: boolean;
  onDismiss: () => void;
  placeholder?: string;
  ariaLabel?: string;
  /** Task titles are a growing textarea; quick-add is a single-line input. */
  multiline?: boolean;
  className?: string;
  inputRef?: React.RefObject<HTMLTextAreaElement>;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}): React.JSX.Element {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const field = inputRef ?? localRef;
  const mirror = useRef<HTMLDivElement>(null);
  const [match, setMatch] = useState<NlDateMatch | null>(null);

  // Re-detect on every change to the text or the date. `today` matters: the
  // app can sit open across midnight, and "tomorrow" has to follow it.
  useEffect(() => {
    const found = dismissed ? null : findNlDate(value, today);
    setMatch(found);
    onDateChange(found?.date ?? null, found);
    // onDateChange is a fresh closure each render in most callers; depending on
    // it would loop. The text/date pair is what actually decides the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, today, dismissed]);

  // The mirror only scrolls in the single-line case, where the field can be
  // scrolled horizontally past its visible width.
  useLayoutEffect(() => {
    const el = field.current;
    const m = mirror.current;
    if (el === null || m === null) return;
    m.scrollTop = el.scrollTop;
    m.scrollLeft = el.scrollLeft;
  }, [value, field]);

  const syncScroll = (): void => {
    const el = field.current;
    const m = mirror.current;
    if (el !== null && m !== null) {
      m.scrollTop = el.scrollTop;
      m.scrollLeft = el.scrollLeft;
    }
  };

  const before = match === null ? value : value.slice(0, match.start);
  const hit = match === null ? '' : value.slice(match.start, match.end);
  const after = match === null ? '' : value.slice(match.end);

  return (
    <div className={`nl-field ${multiline ? 'multiline' : ''}`}>
      <div className="nl-mirror" ref={mirror} aria-hidden="true">
        {before}
        {match !== null && <mark className="nl-hit">{hit}</mark>}
        {after}
        {/* A trailing newline is not rendered by a div the way it is by a
            textarea; this keeps the mirror's height in step. */}
        {'​'}
      </div>
      <textarea
        ref={field}
        className={`nl-input ${className}`}
        rows={1}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        spellCheck={!multiline ? false : undefined}
        onScroll={syncScroll}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          // A single-line field must not accept a newline.
          if (!multiline && e.key === 'Enter') e.preventDefault();
          onKeyDown?.(e);
        }}
      />
      {match !== null && (
        <button
          type="button"
          className="nl-chip"
          data-testid="nl-date-chip"
          title={`Due ${match.date} — click to ignore this date`}
          onClick={onDismiss}
        >
          {relativeDueLabel(match.date, today).text}
          <span className="nl-chip-x" aria-hidden="true">
            ×
          </span>
        </button>
      )}
    </div>
  );
}
