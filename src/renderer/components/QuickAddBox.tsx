import { contactName } from '@shared/domain/contacts';
import { finishQuickAdd } from '@shared/domain/quick-add';
import type { QuickAddDraft } from '@shared/domain/quick-add';
import type { Contact, IsoDate } from '@shared/types';
import { useRef, useState } from 'react';

import { ContactAvatar } from './ContactBits';
import { NlDateField } from './NlDateField';

/** A quick-add person, keyed so a provisional one can stand in for an id. */
interface HeldPerson {
  /** Contact id, or a provisional key for someone not created yet. */
  key: string;
  contactId: string | null;
  name: string;
}

/**
 * The one-line task composer (D29, D31, D35, D40): type a title, `@` someone,
 * `#` a tag, write the date in words, press Enter. Used by the project
 * screen's Tasks card and by the menu-bar flyout (D51), so both read a typed
 * line the same way — the parsing itself is `finishQuickAdd`.
 *
 * People and tags picked while composing are held here, not written: the
 * task they belong to does not exist yet, and a brand-new person is only
 * added to the address book when the task is (see `commitQuickAdd`).
 */
export function QuickAddBox({
  contacts,
  tagVocabulary,
  today,
  onSubmit,
  placeholder = 'Add a task, @ someone or # a tag, and press Enter…',
  inputRef,
}: {
  contacts: readonly Contact[];
  tagVocabulary: readonly string[];
  today: IsoDate;
  /** The composed task, minus the project — the caller knows where it goes. */
  onSubmit: (draft: Omit<QuickAddDraft, 'projectId'>) => void;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLTextAreaElement>;
}): React.JSX.Element {
  const [title, setTitle] = useState('');
  // Whether the user has waved the date highlight off (D29) for what they
  // are currently typing; the date itself is re-read on commit.
  const [dismissed, setDismissed] = useState(false);
  const [people, setPeople] = useState<HeldPerson[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const provisional = useRef(0);

  const submit = (): void => {
    const finished = finishQuickAdd(title, { today, dismissed, tags });
    if (finished === null) return;
    onSubmit({
      title: finished.title,
      dueDate: finished.dueDate,
      tags,
      people: people.map(({ contactId, name }) => ({ contactId, name })),
    });
    setTitle('');
    setDismissed(false);
    setPeople([]);
    setTags([]);
  };

  return (
    <>
      {people.length > 0 && (
        <div className="quick-add-people" data-testid="quick-add-people">
          {people.map((person) => {
            const c =
              person.contactId === null
                ? undefined
                : contacts.find((x) => x.id === person.contactId);
            return (
              <span key={person.key} className={`contact-chip ${c === undefined ? 'pending' : ''}`}>
                <span className="contact-chip-label">
                  {c !== undefined && <ContactAvatar contact={c} size={18} />}
                  {person.name}
                  {/* Says out loud that nobody has been added yet. */}
                  {c === undefined && <span className="contact-chip-new">new</span>}
                </span>
                <button
                  aria-label={`Remove ${person.name}`}
                  onClick={() => {
                    setPeople((list) => list.filter((p) => p.key !== person.key));
                  }}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
      {tags.length > 0 && (
        <div className="quick-add-people" data-testid="quick-add-tags">
          {tags.map((tag) => (
            <span key={tag} className="tag-chip">
              <span>#{tag}</span>
              <button
                aria-label={`Remove tag ${tag}`}
                onClick={() => {
                  setTags((list) => list.filter((t) => t !== tag));
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="quick-add-row">
        <div className="inp quick-add-input">
          <NlDateField
            value={title}
            onChange={(next) => {
              setTitle(next);
              // A cleared field starts a fresh task: re-arm detection.
              if (next === '') setDismissed(false);
            }}
            today={today}
            onDateChange={() => undefined}
            dismissed={dismissed}
            onDismiss={() => {
              setDismissed(true);
            }}
            placeholder={placeholder}
            ariaLabel="Add a task"
            inputRef={inputRef}
            tagVocabulary={tagVocabulary}
            tagExclude={tags}
            onTag={(tag) => {
              setTags((list) =>
                list.some((t) => t.toLowerCase() === tag.toLowerCase()) ? list : [...list, tag],
              );
            }}
            mentionContacts={contacts}
            mentionExclude={people
              .map((p) => p.contactId)
              .filter((id): id is string => id !== null)}
            onCreateContact={(name) => {
              // Hold them, don't create them. The key stands in for a
              // contact id until the task exists.
              const existing = people.find(
                (p) => p.contactId === null && p.name.toLowerCase() === name.toLowerCase(),
              );
              if (existing !== undefined) return existing.key;
              provisional.current += 1;
              const key = `pending:${String(provisional.current)}`;
              setPeople((list) => [...list, { key, contactId: null, name }]);
              return key;
            }}
            onMention={(contactId) => {
              setPeople((list) => {
                // A provisional person was appended by onCreateContact.
                if (list.some((p) => p.key === contactId)) return list;
                const c = contacts.find((x) => x.id === contactId);
                if (c === undefined) return list;
                return [...list, { key: contactId, contactId, name: contactName(c) }];
              });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
        </div>
        <button className="btn ghost" onClick={submit}>
          Add
        </button>
      </div>
    </>
  );
}
