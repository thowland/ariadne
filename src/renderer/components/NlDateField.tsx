import {
  completeMention,
  contactName,
  findMention,
  maskMentions,
  mentionCandidates,
} from '@shared/domain/contacts';
import type { MentionQuery } from '@shared/domain/contacts';
import { relativeDueLabel } from '@shared/domain/derive';
import { findNlDate } from '@shared/domain/nl-date';
import type { NlDateMatch } from '@shared/domain/nl-date';
import { completeHashtag, findHashtag, hashtagCandidates, maskHashtags } from '@shared/domain/tags';
import type { HashtagQuery } from '@shared/domain/tags';
import type { Contact, IsoDate } from '@shared/types';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useStore } from '../app/store';

import { ContactAvatar, splitTypedName } from './ContactBits';

/**
 * A title field that highlights a natural-language date as you type (D29),
 * and — when given contacts or a tag vocabulary — completes an `@name` into a
 * linked person (D31) or a `#tag` into a tag on the entity (D40).
 *
 * You cannot style a range of text inside a `<textarea>` or `<input>`, so the
 * highlight is painted by a mirror element sitting directly behind a
 * transparent-text field. The mirror renders the same string with the matched
 * span wrapped in a `<mark>`; as long as both share a font, padding, and
 * wrapping, the mark lands exactly under the real characters.
 *
 * Neither picker uses the mirror. The pick is completed in place — `@dan`
 * becomes `@Dana Reyes`, `#vibe` becomes `#vibecoding` — rather than marked
 * up, so there is no second highlight to keep in register with the date's.
 *
 * The caret sits in at most one sigil token at a time, so the two pickers
 * share one dropdown, one highlighted row, and one set of key bindings.
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
  tagVocabulary,
  tagExclude = [],
  onTag,
  onCommitTitle,
  onMention,
  onCreateContact,
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
  /** Enables `#tag` completion when provided alongside `onTag` (D40). */
  tagVocabulary?: readonly string[];
  /** Tags already on the entity, so the picker never offers a duplicate. */
  tagExclude?: readonly string[];
  /** Fired with the picked tag once it is completed in place. */
  onTag?: (tag: string) => void;
  /**
   * Fired when the field loses focus, with the date phrase still standing in
   * the text (null if there is none or it was waved off). The caller decides
   * what to take out of the title — only it knows whether the date was
   * actually applied (D35) and which tags ended up on the entity (D40).
   */
  onCommitTitle?: (match: NlDateMatch | null) => void;
  /** Fired with the picked contact's id once the name is completed in place. */
  onMention?: (contactId: string) => void;
  /**
   * Turns a typed name into a contact id when the "add this person" row is
   * chosen. Defaults to creating the contact straight away; the project
   * quick-add overrides it to hold a provisional person until the task is
   * actually created, so a name typed and then corrected never reaches the
   * address book.
   */
  onCreateContact?: (name: string) => string | null;
}): React.JSX.Element {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const field = inputRef ?? localRef;
  const mirror = useRef<HTMLDivElement>(null);
  const [match, setMatch] = useState<NlDateMatch | null>(null);
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [hashtag, setHashtag] = useState<HashtagQuery | null>(null);
  const [highlighted, setHighlighted] = useState(-1);
  /** Where the caret must land after a pick is spliced into the text. */
  const pendingCaret = useRef<number | null>(null);
  const newContact = useStore((s) => s.newContact);

  const mentionsOn = mentionContacts !== undefined && onMention !== undefined;
  const tagsOn = tagVocabulary !== undefined && onTag !== undefined;

  // Re-detect on every change to the text or the date. `today` matters: the
  // app can sit open across midnight, and "tomorrow" has to follow it.
  useEffect(() => {
    // Scan the text with the @names and #tags blanked out: a colleague called
    // Tom is not the word "tom", and neither is a tag called #mar the month.
    // Both masks preserve every offset, so the mirror's highlight still lands
    // on the real characters.
    const found = dismissed ? null : findNlDate(maskHashtags(maskMentions(value)), today);
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

  const closePickers = (): void => {
    setMention(null);
    setHashtag(null);
  };

  /** Re-reads the caret and updates which sigil token (if any) it sits in. */
  const refreshPickers = (text: string, caret: number | null): void => {
    if (caret === null) {
      closePickers();
      return;
    }
    // A `@` and a `#` cannot both own the caret: whichever token the caret is
    // inside wins, and the mention is checked first only because it is the
    // more constrained match (it allows an inner space, so it can start
    // further back).
    const foundMention = mentionsOn ? findMention(text, caret) : null;
    setMention(foundMention);
    setHashtag(foundMention === null && tagsOn ? findHashtag(text, caret) : null);
    setHighlighted(-1);
  };

  const contactRows =
    mention === null || !mentionsOn
      ? []
      : mentionCandidates(mentionContacts, mention.query, mentionExclude);
  const tagRows =
    hashtag === null || !tagsOn ? [] : hashtagCandidates(tagVocabulary, hashtag.query, tagExclude);

  const typed = (mention?.query ?? hashtag?.query ?? '').trim();
  const canCreateContact =
    mentionsOn &&
    mention !== null &&
    typed !== '' &&
    !mentionContacts.some((c) => contactName(c).toLowerCase() === typed.toLowerCase());
  const canCreateTag =
    tagsOn &&
    hashtag !== null &&
    typed !== '' &&
    !tagVocabulary.some((t) => t.toLowerCase() === typed.toLowerCase());

  const suggestions: string[] = mention !== null ? contactRows.map((c) => c.id) : tagRows;
  const canCreate = canCreateContact || canCreateTag;
  const rowCount = suggestions.length + (canCreate ? 1 : 0);
  const pickerOpen = (mention !== null || hashtag !== null) && rowCount > 0;

  /** Links the contact and completes the typed fragment to their full name. */
  const link = (contactId: string, name: string): void => {
    if (mention === null || onMention === undefined) return;
    const next = completeMention(value, mention, name);
    pendingCaret.current = next.caret;
    onChange(next.text);
    onMention(contactId);
    closePickers();
    setHighlighted(-1);
  };

  /** Adds the tag and completes the typed fragment to its full spelling. */
  const applyTag = (tag: string): void => {
    if (hashtag === null || onTag === undefined) return;
    const next = completeHashtag(value, hashtag, tag);
    pendingCaret.current = next.caret;
    onChange(next.text);
    onTag(tag);
    closePickers();
    setHighlighted(-1);
  };

  const commitRow = (index: number): void => {
    if (hashtag !== null) {
      const tag = tagRows[index];
      if (tag !== undefined) {
        applyTag(tag);
        return;
      }
      // A tag nobody has used yet is created by picking the "new tag" row —
      // the vocabulary is free-form, so anything typed is already valid.
      if (canCreateTag) applyTag(typed);
      return;
    }
    const contact = contactRows[index];
    if (contact !== undefined) {
      link(contact.id, contactName(contact));
      return;
    }
    if (!canCreateContact) return;
    // A brand-new person's display name is exactly what was typed, which is
    // also what splitTypedName carves into first/last.
    const id = onCreateContact?.(typed) ?? newContact({ ...splitTypedName(typed) });
    if (id !== null) link(id, typed);
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
          refreshPickers(e.target.value, e.target.selectionStart);
        }}
        onClick={(e) => {
          refreshPickers(value, e.currentTarget.selectionStart);
        }}
        onBlur={() => {
          // Let a suggestion's mousedown land before the list unmounts.
          setTimeout(() => {
            closePickers();
          }, 0);
          onCommitTitle?.(match);
        }}
        onKeyDown={(e) => {
          // While a picker is open it owns the arrows, Enter and Escape;
          // otherwise Enter here would submit the quick-add task the user is
          // still in the middle of addressing.
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
              // Enter picks an existing row, but it never *creates* one. With
              // a mistyped name nothing matches, the only row is "add this
              // person", and Enter here means what it means everywhere else
              // in the field — commit the task. Creating has to be chosen:
              // click the row, or arrow onto it first. Otherwise a typo in
              // "Ask @Tomm about the coat" quietly becomes an address-book
              // entry, and swallows the keystroke that was adding the task.
              const index = highlighted >= 0 ? highlighted : suggestions.length > 0 ? 0 : -1;
              if (index >= 0) {
                e.preventDefault();
                commitRow(index);
                return;
              }
              closePickers();
            }
            if (e.key === 'Escape') {
              e.stopPropagation();
              closePickers();
              return;
            }
          }
          // A single-line field must not accept a newline.
          if (!multiline && e.key === 'Enter') e.preventDefault();
          onKeyDown?.(e);
        }}
        onKeyUp={(e) => {
          // Arrow keys and Home/End move the caret without changing the text,
          // so onChange never fires and the token has to be re-read here.
          // Not the vertical arrows while a picker is open, though: those
          // were consumed above to walk the list, the caret did not move, and
          // re-reading would reset the very highlight they just set.
          const walking = pickerOpen && (e.key === 'ArrowUp' || e.key === 'ArrowDown');
          if (!walking && (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End')) {
            refreshPickers(value, e.currentTarget.selectionStart);
          }
        }}
      />
      {pickerOpen && mention !== null && (
        <div className="contact-suggestions mention" role="listbox" aria-label="Mention a contact">
          {contactRows.map((c, i) => (
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
          {canCreateContact && (
            <button
              role="option"
              aria-selected={highlighted === contactRows.length}
              className={`contact-suggestion create ${
                highlighted === contactRows.length ? 'active' : ''
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                commitRow(contactRows.length);
              }}
            >
              <span className="contact-suggestion-name">+ Add “{typed}” as a new contact</span>
            </button>
          )}
        </div>
      )}
      {pickerOpen && hashtag !== null && (
        <div className="contact-suggestions mention hashtag" role="listbox" aria-label="Pick a tag">
          {tagRows.map((t, i) => (
            <button
              key={t}
              role="option"
              aria-selected={i === highlighted}
              className={`contact-suggestion ${i === highlighted ? 'active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                applyTag(t);
              }}
            >
              <span className="contact-suggestion-name">#{t}</span>
            </button>
          ))}
          {canCreateTag && (
            <button
              role="option"
              aria-selected={highlighted === tagRows.length}
              className={`contact-suggestion create ${
                highlighted === tagRows.length ? 'active' : ''
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                commitRow(tagRows.length);
              }}
            >
              <span className="contact-suggestion-name">+ New tag “{typed}”</span>
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
          // Keep the focus in the field: blurring commits the date and takes
          // the phrase out of the title (D35), which would unmount this chip
          // before the click that is trying to wave the date off landed.
          onMouseDown={(e) => {
            e.preventDefault();
          }}
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
