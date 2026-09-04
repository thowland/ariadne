import type { Contact, IsoDate } from '@shared/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { NlDateField } from './NlDateField';

const TODAY = '2026-07-08'; // a Wednesday

/** Harness that owns the text/dismissed state the way a real caller does. */
function Harness({
  onDate,
  initial = '',
}: {
  onDate?: (d: IsoDate | null) => void;
  initial?: string;
}): React.JSX.Element {
  const [value, setValue] = useState(initial);
  const [dismissed, setDismissed] = useState(false);
  return (
    <NlDateField
      value={value}
      onChange={setValue}
      today={TODAY}
      onDateChange={(d) => onDate?.(d)}
      dismissed={dismissed}
      onDismiss={() => {
        setDismissed(true);
      }}
      ariaLabel="Task title"
    />
  );
}

describe('NlDateField', () => {
  it('highlights the date phrase and proposes its date', async () => {
    const onDate = vi.fn();
    render(<Harness onDate={onDate} />);
    await userEvent.type(screen.getByLabelText('Task title'), 'call Bob tomorrow');

    // The mark sits in the mirror, over the matched word only.
    const mark = document.querySelector('.nl-hit');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe('tomorrow');
    expect(onDate).toHaveBeenLastCalledWith('2026-07-09');
  });

  it('keeps the typed text exactly as written', async () => {
    render(<Harness />);
    const field = screen.getByLabelText<HTMLTextAreaElement>('Task title');
    await userEvent.type(field, 'call Bob tomorrow');
    // The phrase stays in the title; nothing is stripped as the user types.
    expect(field.value).toBe('call Bob tomorrow');
  });

  it('mirrors the text either side of the match so the mark lines up', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText('Task title'), 'call Bob tomorrow please');
    const mirror = document.querySelector('.nl-mirror');
    // Mirror content must equal the field content, or the highlight drifts.
    // The trailing zero-width space is the mirror's height shim.
    expect((mirror?.textContent ?? '').replace('​', '')).toBe('call Bob tomorrow please');
  });

  it('shows a chip with the relative date', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText('Task title'), 'ship today');
    expect(screen.getByTestId('nl-date-chip')).toHaveTextContent('Today');
  });

  it('clicking the chip turns the detected date off', async () => {
    const onDate = vi.fn();
    render(<Harness onDate={onDate} />);
    await userEvent.type(screen.getByLabelText('Task title'), 'call Bob tomorrow');
    expect(onDate).toHaveBeenLastCalledWith('2026-07-09');

    await userEvent.click(screen.getByTestId('nl-date-chip'));
    expect(onDate).toHaveBeenLastCalledWith(null);
    expect(document.querySelector('.nl-hit')).toBeNull();
    expect(screen.queryByTestId('nl-date-chip')).not.toBeInTheDocument();
  });

  it('stays dismissed while the user keeps typing the same task', async () => {
    render(<Harness />);
    const field = screen.getByLabelText('Task title');
    await userEvent.type(field, 'call Bob tomorrow');
    await userEvent.click(screen.getByTestId('nl-date-chip'));
    await userEvent.type(field, ' about the thing');
    // Re-proposing what the user just waved off would be nagging.
    expect(screen.queryByTestId('nl-date-chip')).not.toBeInTheDocument();
  });

  it('proposes nothing for a title with no date', async () => {
    const onDate = vi.fn();
    render(<Harness onDate={onDate} />);
    await userEvent.type(screen.getByLabelText('Task title'), 'Provision new k8s cluster');
    expect(document.querySelector('.nl-hit')).toBeNull();
    expect(screen.queryByTestId('nl-date-chip')).not.toBeInTheDocument();
    expect(onDate).toHaveBeenLastCalledWith(null);
  });

  it('does not fire on a word that merely contains a weekday', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText('Task title'), 'satisfy the auditor');
    expect(screen.queryByTestId('nl-date-chip')).not.toBeInTheDocument();
  });

  it('updates the proposal as the phrase changes', async () => {
    const onDate = vi.fn();
    render(<Harness onDate={onDate} />);
    const field = screen.getByLabelText('Task title');
    await userEvent.type(field, 'ship today');
    expect(onDate).toHaveBeenLastCalledWith('2026-07-08');
    await userEvent.clear(field);
    await userEvent.type(field, 'ship friday');
    expect(onDate).toHaveBeenLastCalledWith('2026-07-10');
  });
});

// ---------------------------------------------------------------------------
// @-mentions (D31). The picker only exists when the caller supplies contacts,
// so the date-only harness above proves the field still works without them.
// ---------------------------------------------------------------------------

const PEOPLE: Contact[] = [
  {
    id: 'c1',
    firstName: 'Dana',
    lastName: 'Reyes',
    company: 'Northwind',
    department: 'Platform',
    role: 'Platform Lead',
    email: 'dana@example.com',
    phone: '',
    notes: '',
    tags: [],
    createdAt: TODAY,
  },
  {
    id: 'c2',
    firstName: 'Marcus',
    lastName: 'Bell',
    company: '',
    department: '',
    role: 'SRE',
    email: '',
    phone: '',
    notes: '',
    tags: [],
    createdAt: TODAY,
  },
];

function MentionHarness({
  onMention,
  exclude = [],
  onEnter,
  onCreateContact,
}: {
  onMention: (id: string) => void;
  exclude?: string[];
  onEnter?: () => void;
  onCreateContact?: (name: string) => string | null;
}): React.JSX.Element {
  const [value, setValue] = useState('');
  return (
    <>
      <NlDateField
        value={value}
        onChange={setValue}
        today={TODAY}
        onDateChange={() => undefined}
        dismissed={false}
        onDismiss={() => undefined}
        ariaLabel="Task title"
        mentionContacts={PEOPLE}
        mentionExclude={exclude}
        onMention={onMention}
        onCreateContact={onCreateContact}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter?.();
        }}
      />
      <div data-testid="text">{value}</div>
    </>
  );
}

describe('NlDateField — @-mentions', () => {
  it('opens the picker on @ and narrows as you type', async () => {
    render(<MentionHarness onMention={vi.fn()} />);
    const field = screen.getByLabelText('Task title');
    await userEvent.type(field, 'Ask @');
    expect(screen.getByRole('listbox', { name: 'Mention a contact' })).toBeInTheDocument();
    await userEvent.type(field, 'dan');
    expect(screen.getByRole('option', { name: /Dana Reyes/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Marcus Bell/ })).not.toBeInTheDocument();
  });

  it('links the person and completes the typed fragment to their full name', async () => {
    const onMention = vi.fn();
    render(<MentionHarness onMention={onMention} />);
    const field = screen.getByLabelText('Task title');
    await userEvent.type(field, 'Ask @dana about the budget');
    // Walk the caret back into the mention rather than retyping it.
    await userEvent.type(field, '{Home}');
    await userEvent.keyboard('{ArrowRight>9/}');
    await userEvent.click(screen.getByRole('option', { name: /Dana Reyes/ }));

    expect(onMention).toHaveBeenCalledWith('c1');
    // The name stays in the title, completed in place.
    expect(screen.getByTestId('text')).toHaveTextContent('Ask @Dana Reyes about the budget');
  });

  it('Enter picks the top match instead of submitting the task', async () => {
    const onMention = vi.fn();
    const onEnter = vi.fn();
    render(<MentionHarness onMention={onMention} onEnter={onEnter} />);
    await userEvent.type(screen.getByLabelText('Task title'), 'Ask @dana{Enter}');
    expect(onMention).toHaveBeenCalledWith('c1');
    expect(onEnter).not.toHaveBeenCalled();
    expect(screen.getByTestId('text')).toHaveTextContent('Ask @Dana Reyes');
  });

  it('arrows move through the list, Escape closes it without linking', async () => {
    const onMention = vi.fn();
    render(<MentionHarness onMention={onMention} />);
    const field = screen.getByLabelText('Task title');
    await userEvent.type(field, '@');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onMention).toHaveBeenCalledWith('c2');

    onMention.mockClear();
    await userEvent.type(field, '@dan{Escape}');
    expect(screen.queryByRole('listbox', { name: 'Mention a contact' })).not.toBeInTheDocument();
    expect(onMention).not.toHaveBeenCalled();
  });

  it('never offers somebody already linked to this task', async () => {
    render(<MentionHarness onMention={vi.fn()} exclude={['c1']} />);
    await userEvent.type(screen.getByLabelText('Task title'), '@dan');
    expect(screen.queryByRole('option', { name: /Dana Reyes/ })).not.toBeInTheDocument();
  });

  it('creates a contact from the title when nobody matches', async () => {
    setupTestApp();
    loadTestWorkspace();
    const onMention = vi.fn();
    render(<MentionHarness onMention={onMention} />);
    await userEvent.type(screen.getByLabelText('Task title'), 'Chase @Nia Okoro');
    await userEvent.click(screen.getByRole('option', { name: /Add “Nia Okoro”/ }));

    const created = useStore.getState().workspace?.contacts.find((c) => c.firstName === 'Nia');
    expect(created?.lastName).toBe('Okoro');
    expect(onMention).toHaveBeenCalledWith(created?.id);
    expect(screen.getByTestId('text')).toHaveTextContent('Chase @Nia Okoro');
  });

  it('leaves an email address in the title alone', async () => {
    render(<MentionHarness onMention={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Task title'), 'mail dana@northwind.example');
    expect(screen.queryByRole('listbox', { name: 'Mention a contact' })).not.toBeInTheDocument();
  });

  it('Enter never creates a contact: a mistyped name commits the task instead', async () => {
    setupTestApp();
    loadTestWorkspace();
    const before = useStore.getState().workspace?.contacts.length ?? 0;
    const onMention = vi.fn();
    const onEnter = vi.fn();
    render(<MentionHarness onMention={onMention} onEnter={onEnter} />);

    // "@Tomm about" matches nobody, so the only row is "add this person".
    await userEvent.type(screen.getByLabelText('Task title'), 'Ask @Tomm about{Enter}');

    expect(useStore.getState().workspace?.contacts).toHaveLength(before);
    expect(onMention).not.toHaveBeenCalled();
    // The keystroke reaches the caller, so the task is still added.
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('text')).toHaveTextContent('Ask @Tomm about');
  });

  it('creating still works when the row is deliberately chosen', async () => {
    setupTestApp();
    loadTestWorkspace();
    const onMention = vi.fn();
    const onEnter = vi.fn();
    render(<MentionHarness onMention={onMention} onEnter={onEnter} />);
    await userEvent.type(screen.getByLabelText('Task title'), 'Ask @Tomm');
    // Arrowing onto the create row is the deliberate act Enter alone is not.
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(useStore.getState().workspace?.contacts.some((c) => c.firstName === 'Tomm')).toBe(true);
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('Enter still picks the top match without touching the address book', async () => {
    setupTestApp();
    loadTestWorkspace();
    const before = useStore.getState().workspace?.contacts.length ?? 0;
    const onMention = vi.fn();
    render(<MentionHarness onMention={onMention} />);
    await userEvent.type(screen.getByLabelText('Task title'), 'Ask @dan{Enter}');
    expect(onMention).toHaveBeenCalledWith('c1');
    expect(useStore.getState().workspace?.contacts).toHaveLength(before);
  });

  it('lets the caller supply how a new name becomes a contact', async () => {
    setupTestApp();
    loadTestWorkspace();
    const before = useStore.getState().workspace?.contacts.length ?? 0;
    const onCreateContact = vi.fn().mockReturnValue('pending:1');
    const onMention = vi.fn();
    render(<MentionHarness onMention={onMention} onCreateContact={onCreateContact} />);
    await userEvent.type(screen.getByLabelText('Task title'), 'Chase @Nia Okoro');
    await userEvent.click(screen.getByRole('option', { name: /Add “Nia Okoro”/ }));

    expect(onCreateContact).toHaveBeenCalledWith('Nia Okoro');
    expect(onMention).toHaveBeenCalledWith('pending:1');
    // Nothing reached the address book — that is the caller's call to make.
    expect(useStore.getState().workspace?.contacts).toHaveLength(before);
  });

  it('a name behind an @ is never read as a date (D29 × D31)', async () => {
    // "tom" abbreviates tomorrow. Once a picked mention leaves "@Tom Whitaker"
    // in the title, the date scanner used to read it and set a due date
    // nobody asked for — the exact false positive D29 exists to avoid.
    const onDate = vi.fn();
    render(<Harness onDate={onDate} />);
    await userEvent.type(screen.getByLabelText('Task title'), 'Ask @Tom Whitaker about the coat');

    expect(screen.queryByTestId('nl-date-chip')).not.toBeInTheDocument();
    expect(document.querySelector('.nl-hit')).toBeNull();
    expect(onDate).toHaveBeenLastCalledWith(null);
  });

  it('still reads a real date in the same sentence as a mention', async () => {
    const onDate = vi.fn();
    render(<Harness onDate={onDate} />);
    await userEvent.type(screen.getByLabelText('Task title'), 'Ask @Tom Whitaker tomorrow');
    expect(document.querySelector('.nl-hit')?.textContent).toBe('tomorrow');
    expect(onDate).toHaveBeenLastCalledWith('2026-07-09');
  });
});

// #-tags (D40). Same shape as the mention picker, and it shares its dropdown:
// the caret can only be inside one sigil token at a time.
const VOCAB = ['finance', 'infra', 'vibecoding', 'woodworking'];

function TagHarness({
  onTag,
  exclude = [],
  onEnter,
  initial = '',
}: {
  onTag: (tag: string) => void;
  exclude?: string[];
  onEnter?: () => void;
  initial?: string;
}): React.JSX.Element {
  const [value, setValue] = useState(initial);
  const [date, setDate] = useState<IsoDate | null>(null);
  return (
    <>
      <NlDateField
        value={value}
        onChange={setValue}
        today={TODAY}
        onDateChange={setDate}
        dismissed={false}
        onDismiss={() => undefined}
        ariaLabel="Task title"
        mentionContacts={PEOPLE}
        onMention={() => undefined}
        tagVocabulary={VOCAB}
        tagExclude={exclude}
        onTag={onTag}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter?.();
        }}
      />
      <div data-testid="text">{value}</div>
      <div data-testid="date">{date ?? 'none'}</div>
    </>
  );
}

describe('NlDateField — #tags', () => {
  it('opens the picker on # and narrows as you type', async () => {
    render(<TagHarness onTag={vi.fn()} />);
    const field = screen.getByLabelText('Task title');
    await userEvent.type(field, 'Sand the top #');
    expect(screen.getByRole('listbox', { name: 'Pick a tag' })).toBeInTheDocument();
    await userEvent.type(field, 'wood');
    expect(screen.getByRole('option', { name: '#woodworking' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '#infra' })).not.toBeInTheDocument();
  });

  it('adds the tag and completes the typed fragment in place', async () => {
    const onTag = vi.fn();
    render(<TagHarness onTag={onTag} />);
    await userEvent.type(screen.getByLabelText('Task title'), 'Sand the top #vibe');
    await userEvent.click(screen.getByRole('option', { name: '#vibecoding' }));
    expect(onTag).toHaveBeenCalledWith('vibecoding');
    expect(screen.getByTestId('text')).toHaveTextContent('Sand the top #vibecoding');
  });

  it('Enter picks the top match instead of submitting the task', async () => {
    const onTag = vi.fn();
    const onEnter = vi.fn();
    render(<TagHarness onTag={onTag} onEnter={onEnter} />);
    await userEvent.type(screen.getByLabelText('Task title'), 'Strip it #wood{Enter}');
    expect(onTag).toHaveBeenCalledWith('woodworking');
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('offers a brand-new tag, which the vocabulary has no say over', async () => {
    const onTag = vi.fn();
    render(<TagHarness onTag={onTag} />);
    await userEvent.type(screen.getByLabelText('Task title'), 'Try #kayak');
    await userEvent.click(screen.getByRole('option', { name: '+ New tag “kayak”' }));
    expect(onTag).toHaveBeenCalledWith('kayak');
    expect(screen.getByTestId('text')).toHaveTextContent('Try #kayak');
  });

  it('never offers a tag the entity already carries', async () => {
    render(<TagHarness onTag={vi.fn()} exclude={['woodworking']} />);
    await userEvent.type(screen.getByLabelText('Task title'), '#wood');
    expect(screen.queryByRole('option', { name: '#woodworking' })).not.toBeInTheDocument();
  });

  it('Escape closes the picker without tagging', async () => {
    const onTag = vi.fn();
    render(<TagHarness onTag={onTag} />);
    await userEvent.type(screen.getByLabelText('Task title'), '#wood{Escape}');
    expect(screen.queryByRole('listbox', { name: 'Pick a tag' })).not.toBeInTheDocument();
    expect(onTag).not.toHaveBeenCalled();
  });

  it('leaves a mid-word # alone', async () => {
    render(<TagHarness onTag={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Task title'), 'Learn C#');
    expect(screen.queryByRole('listbox', { name: 'Pick a tag' })).not.toBeInTheDocument();
  });

  it('a tag that spells a weekday does not set a due date (D40 × D29)', () => {
    render(<TagHarness onTag={vi.fn()} initial="Ship the #sat build" />);
    expect(screen.getByTestId('date')).toHaveTextContent('none');
  });

  it('the two pickers never open at once', async () => {
    render(<TagHarness onTag={vi.fn()} />);
    const field = screen.getByLabelText('Task title');
    await userEvent.type(field, 'Ask @dana');
    expect(screen.getByRole('listbox', { name: 'Mention a contact' })).toBeInTheDocument();
    expect(screen.queryByRole('listbox', { name: 'Pick a tag' })).not.toBeInTheDocument();
    await userEvent.type(field, ' #wood');
    expect(screen.getByRole('listbox', { name: 'Pick a tag' })).toBeInTheDocument();
    expect(screen.queryByRole('listbox', { name: 'Mention a contact' })).not.toBeInTheDocument();
  });
});
