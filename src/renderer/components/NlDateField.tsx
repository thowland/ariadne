import {
  completeMention,
  contactName,
  findMention,
  mentionCandidates,
} from '@shared/domain/contacts';
import type { MentionQuery } from '@shared/domain/contacts';
import { relativeDueLabel } from '@shared/domain/derive';
import { findNlDate } from '@shared/domain/nl-date';
import type { NlDateMatch } from '@shared/domain/nl-date';
import type { Contact, IsoDate } from '@shared/types';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useStore } from '../app/store';

import { ContactAvatar, splitTypedName } from './ContactBits';

/**
 * A title field that highlights a natural-language date as you type (D29),
 * and — when given contacts — completes an `@name` into a linked person (D31).
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
 *
 * The mention deliberately does *not* use the mirror. The picked name is
 * completed in place — `@dan` becomes `@Dana Reyes` — rather than marked up,
 * so there is no second highlight to keep in register with the date's.
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
  mentionContacts,
  mentionExclude = [],
  onMention,
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
  /** Enables `@name` completion when provided (D31). */
  mentionContacts?: readonly Contact[];
  /** Contacts already linked, so the picker never offers a duplicate. */
  mentionExclude?: readonly string[];
  /** Fired with the picked contact's id; the `@name` text is removed. */
  onMention?: (contactId: string) => void;
}): React.JSX.Element {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const field = inputRef ?? localRef;
  const mirror = useRef<HTMLDivElement>(null);
  const [match, setMatch] = useState<NlDateMatch | null>(null);
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [highlighted, setHighlighted] = useState(-1);
  /** Where the caret must land after a mention is spliced out of the text. */
  const pendingCaret = useRef<number | null>(null);
  const newContact = useStore((s) => s.newContact);

  const mentionsOn = mentionContacts !== undefined && onMention !== undefined;

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

  // Restoring the caret has to happen after React has written the new value,
  // or the browser parks it at the end of the shortened string.
  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    const el = field.current;
    if (caret === null || el === null) return;
    pendingCaret.current = null;
    el.focus();
    el.setSelectionRange(caret, caret);
  }, [value, field]);

  const syncScroll = (): void => {
    const el = field.current;
    const m = mirror.current;
    if (el !== null && m !== null) {
      m.scrollTop = el.scrollTop;
      m.scrollLeft = el.scrollLeft;
    }
  };

  /** Re-reads the caret and updates which `@…` token (if any) it sits in. */
  const refreshMention = (text: string, caret: number | null): void => {
    if (!mentionsOn || caret === null) {
      setMention(null);
      return;
    }
    setMention(findMention(text, caret));
    setHighlighted(-1);
  };

  const suggestions =
    mention === null || !mentionsOn
      ? []
      : mentionCandidates(mentionContacts, mention.query, mentionExclude);
  const typed = mention === null ? '' : mention.query.trim();
  const canCreate =
    mentionsOn &&
    mention !== null &&
    typed !== '' &&
    !mentionContacts.some((c) => contactName(c).toLowerCase() === typed.toLowerCase());
  const rowCount = suggestions.length + (canCreate ? 1 : 0);
  const pickerOpen = mention !== null && rowCount > 0;

  /** Links the contact and completes the typed fragment to their full name. */
  const link = (contactId: string, name: string): void => {
    if (mention === null || onMention === undefined) return;
    const next = completeMention(value, mention, name);
    pendingCaret.current = next.caret;
    onChange(next.text);
    onMention(contactId);
    setMention(null);
    setHighlighted(-1);
  };

  const commitRow = (index: number): void => {
    const contact = suggestions[index];
    if (contact !== undefined) link(contact.id, contactName(contact));
    else if (canCreate) {
      // A brand-new person's display name is exactly what was typed, which is
      // also what splitTypedName just carved into first/last.
      const id = newContact({ ...splitTypedName(typed) });
      if (id !== null) link(id, typed);
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
          refreshMention(e.target.value, e.target.selectionStart);
        }}
        onClick={(e) => {
          refreshMention(value, e.currentTarget.selectionStart);
        }}
        onBlur={() => {
          // Let a suggestion's mousedown land before the list unmounts.
          setTimeout(() => {
            setMention(null);
          }, 0);
        }}
        onKeyDown={(e) => {
          // While the people picker is open it owns the arrows, Enter and
          // Escape; otherwise Enter here would submit the quick-add task the
          // user is still in the middle of addressing.
          if (pickerOpen) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlighted((h) => (h + 1) % rowCount);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlighted((h) => (h <= 0 ? rowCount - 1 : h - 1));
              return;
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              commitRow(highlighted >= 0 ? highlighted : 0);
              return;
            }
            if (e.key === 'Escape') {
              e.stopPropagation();
              setMention(null);
              return;
            }
          }
          // A single-line field must not accept a newline.
          if (!multiline && e.key === 'Enter') e.preventDefault();
          onKeyDown?.(e);
        }}
        onKeyUp={(e) => {
          // Arrow keys and Home/End move the caret without changing the text,
          // so onChange never fires and the mention has to be re-read here.
          // Not the vertical arrows while the picker is open, though: those
          // were consumed above to walk the list, the caret did not move, and
          // re-reading would reset the very highlight they just set.
          const walking = pickerOpen && (e.key === 'ArrowUp' || e.key === 'ArrowDown');
          if (!walking && (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End')) {
            refreshMention(value, e.currentTarget.selectionStart);
          }
        }}
      />
      {pickerOpen && (
        <div className="contact-suggestions mention" role="listbox" aria-label="Mention a contact">
          {suggestions.map((c, i) => (
            <button
              key={c.id}
              role="option"
              aria-selected={i === highlighted}
              className={`contact-suggestion ${i === highlighted ? 'active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                link(c.id, contactName(c));
              }}
            >
              <ContactAvatar contact={c} size={20} />
              <span className="contact-suggestion-name">{contactName(c)}</span>
              <span className="contact-suggestion-meta">
                {[c.role, c.company].filter((x) => x.trim() !== '').join(' · ')}
              </span>
            </button>
          ))}
          {canCreate && (
            <button
              role="option"
              aria-selected={highlighted === suggestions.length}
              className={`contact-suggestion create ${
                highlighted === suggestions.length ? 'active' : ''
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                commitRow(suggestions.length);
              }}
            >
              <span className="contact-suggestion-name">+ Add “{typed}” as a new contact</span>
            </button>
          )}
        </div>
      )}
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
