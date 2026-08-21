import { contactName } from '@shared/domain/contacts';
import type { Contact } from '@shared/types';

import { useStore } from '../app/store';

import { ContactAvatar, ContactPicker } from './ContactBits';

/**
 * The task editor's People field (D31): chips for the linked contacts plus a
 * picker. Deliberately the same shape as `TagEditor`, because it is the same
 * gesture — and it is the discoverable route that the @-mention in the title
 * is only an accelerator for.
 *
 * Clicking a chip opens that contact rather than searching, since the useful
 * next question about a person on a task is "what else do they have with me".
 */
export function ContactEditor({
  contacts,
  onChange,
}: {
  /** The linked contacts, resolved and in display order. */
  contacts: Contact[];
  onChange: (contactIds: string[]) => void;
}): React.JSX.Element {
  const { openContact, closeModal } = useStore();
  const ids = contacts.map((c) => c.id);

  return (
    <div className="contact-editor" data-testid="task-contacts">
      {contacts.map((c) => (
        <span key={c.id} className="contact-chip">
          <button
            className="contact-chip-label"
            title={`Open ${contactName(c)}`}
            onClick={() => {
              closeModal();
              openContact(c.id);
            }}
          >
            <ContactAvatar contact={c} size={18} />
            {contactName(c)}
          </button>
          <button
            aria-label={`Remove ${contactName(c)}`}
            onClick={() => {
              onChange(ids.filter((id) => id !== c.id));
            }}
          >
            ×
          </button>
        </span>
      ))}
      <ContactPicker
        exclude={ids}
        ariaLabel="Add a contact to this task"
        onPick={(contactId) => {
          onChange([...ids, contactId]);
        }}
      />
    </div>
  );
}
