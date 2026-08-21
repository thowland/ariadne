import {
  contactColor,
  contactInitials,
  contactName,
  mentionCandidates,
} from '@shared/domain/contacts';
import type { Contact } from '@shared/types';
import { PROJECT_PALETTE } from '@shared/types';
import { useRef, useState } from 'react';

import { useStore } from '../app/store';

/**
 * Small shared pieces of the contacts UI (D31): click-to-copy, the avatar
 * chip, and the picker that every "add a person here" affordance is built
 * from. Kept together because the contacts screen, the project card, the task
 * editor and the reports all draw from the same three primitives — a second
 * copy button that toasts differently is exactly the drift this avoids.
 */

/**
 * Click-to-copy for a single value. The whole control is the button, because
 * the point is to hit it without aiming, and it reports success in place for
 * a moment as well as through the app toast.
 */
export function CopyValue({
  value,
  label,
  what,
  className = '',
}: {
  value: string;
  /** What is rendered; defaults to the value itself. */
  label?: string;
  /** Names the thing in the tooltip and toast, e.g. "email". */
  what: string;
  className?: string;
}): React.JSX.Element | null {
  const showToast = useStore((s) => s.showToast);
  const [copied, setCopied] = useState(false);
  const trimmed = value.trim();
  if (trimmed === '') return null;

  const copy = (): void => {
    navigator.clipboard.writeText(trimmed).then(
      () => {
        setCopied(true);
        showToast(`Copied ${what}`);
        setTimeout(() => {
          setCopied(false);
        }, 1200);
      },
      () => {
        showToast('Copy failed — check permissions');
      },
    );
  };

  return (
    <button
      type="button"
      className={`copy-value ${copied ? 'copied' : ''} ${className}`}
      // Read by the print stylesheet through `content: attr(...)`, so an
      // exported report shows the address instead of the word "Email". An
      // attribute rather than a hidden element on purpose: generated content
      // is not in the DOM, so it cannot collide with a test's text query or be
      // read out twice by a screen reader.
      data-print={trimmed}
      title={`Copy ${what}`}
      aria-label={`Copy ${what}`}
      onClick={(e) => {
        e.stopPropagation();
        copy();
      }}
    >
      <span className="copy-value-text">{label ?? trimmed}</span>
      <span className="copy-value-icon" aria-hidden="true">
        {copied ? '✓' : '⧉'}
      </span>
    </button>
  );
}

export function ContactAvatar({
  contact,
  size = 26,
}: {
  contact: Contact;
  size?: number;
}): React.JSX.Element {
  return (
    <span
      className="contact-avatar"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        background: contactColor(contact, PROJECT_PALETTE),
        fontSize: Math.round(size * 0.42),
      }}
    >
      {contactInitials(contact)}
    </span>
  );
}

/** Splits typed text into a first/last name for an on-the-fly create. */
export function splitTypedName(typed: string): { firstName: string; lastName: string } {
  const parts = typed.trim().split(/\s+/);
  const firstName = parts.shift() ?? '';
  return { firstName, lastName: parts.join(' ') };
}

/**
 * Type-ahead over the address book, with "add this person" as the last row so
 * a contact you have not met before never interrupts what you were doing to
 * go and create them somewhere else.
 *
 * `exclude` is the ids already attached wherever this picker lives, so the
 * same person is not offered twice.
 *
 * Focusing it lists everyone straight away rather than waiting for a letter.
 * That is not a nicety: a bare borderless input that answers a click with no
 * caret, no border and no list is indistinguishable from a dead link, which is
 * exactly how the first version of this control read.
 *
 * `trigger` turns it into a button that opens the field. Card headers want
 * that — there is no room for a permanent input beside a title — while the
 * task editor's chip row wants the input inline, the way `TagEditor` does.
 */
export function ContactPicker({
  exclude = [],
  onPick,
  placeholder = '+ person',
  ariaLabel = 'Add a contact',
  trigger,
  className = '',
}: {
  exclude?: readonly string[];
  onPick: (contactId: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  /** Render as a button with this label until it is clicked. */
  trigger?: string;
  className?: string;
}): React.JSX.Element {
  const { workspace, newContact, showToast } = useStore();
  const [draft, setDraft] = useState('');
  const [highlighted, setHighlighted] = useState(-1);
  const [focused, setFocused] = useState(false);
  // Only meaningful in `trigger` mode: whether the field has replaced the button.
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const contacts = workspace?.contacts ?? [];
  // mentionCandidates, not suggestContacts: an empty draft lists everyone.
  const suggestions = mentionCandidates(contacts, draft, exclude);
  const typed = draft.trim();
  // Offer to create unless what was typed already names somebody exactly —
  // otherwise a second "Dana Reyes" is one careless Enter away.
  const canCreate =
    typed !== '' && !contacts.some((c) => contactName(c).toLowerCase() === typed.toLowerCase());
  // Rows are the suggestions plus, optionally, the create row at the end.
  const rowCount = suggestions.length + (canCreate ? 1 : 0);

  const reset = (): void => {
    setDraft('');
    setHighlighted(-1);
  };

  /** Back to the button (trigger mode) or an empty resting field. */
  const dismiss = (): void => {
    reset();
    setFocused(false);
    setOpen(false);
  };

  const pick = (contact: Contact): void => {
    onPick(contact.id);
    dismiss();
  };

  const create = (): void => {
    const id = newContact({ ...splitTypedName(typed) });
    if (id === null) return;
    onPick(id);
    showToast(`Added ${typed}`);
    dismiss();
  };

  const commitRow = (index: number): void => {
    const contact = suggestions[index];
    if (contact !== undefined) pick(contact);
    else if (canCreate) create();
  };

  if (trigger !== undefined && !open) {
    return (
      <button
        className={`lib-btn ${className}`}
        onClick={() => {
          setOpen(true);
          setFocused(true);
        }}
      >
        {trigger}
      </button>
    );
  }

  return (
    <span className={`contact-picker ${trigger !== undefined ? 'standalone' : ''} ${className}`}>
      <input
        ref={inputRef}
        className="contact-picker-input"
        value={draft}
        placeholder={placeholder}
        aria-label={ariaLabel}
        // The button is gone by the time this renders, so the caret has to
        // land here without a second click.
        autoFocus={trigger !== undefined}
        onFocus={() => {
          setFocused(true);
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          setHighlighted(-1);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            // No row highlighted: the first suggestion is the obvious intent,
            // and creating is a deliberate arrow-down away.
            commitRow(highlighted >= 0 ? highlighted : 0);
          } else if (e.key === 'ArrowDown' && rowCount > 0) {
            e.preventDefault();
            setHighlighted((h) => (h + 1) % rowCount);
          } else if (e.key === 'ArrowUp' && rowCount > 0) {
            e.preventDefault();
            setHighlighted((h) => (h <= 0 ? rowCount - 1 : h - 1));
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            dismiss();
          }
        }}
        onBlur={() => {
          // Let a suggestion's mousedown land before the list unmounts.
          setTimeout(dismiss, 0);
        }}
      />
      {focused && rowCount > 0 && (
        <div className="contact-suggestions" role="listbox" aria-label="Contact suggestions">
          {suggestions.map((c, i) => (
            <button
              key={c.id}
              role="option"
              aria-selected={i === highlighted}
              className={`contact-suggestion ${i === highlighted ? 'active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c);
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
                create();
              }}
            >
              <span className="contact-suggestion-name">+ Add “{typed}” as a new contact</span>
            </button>
          )}
        </div>
      )}
    </span>
  );
}
