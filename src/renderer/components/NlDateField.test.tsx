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
}: {
  onMention: (id: string) => void;
  exclude?: string[];
  onEnter?: () => void;
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

  it('links the person and takes the @name back out of the title', async () => {
    const onMention = vi.fn();
    render(<MentionHarness onMention={onMention} />);
    const field = screen.getByLabelText('Task title');
    await userEvent.type(field, 'Ask @dana about the budget');
    // Walk the caret back into the mention rather than retyping it.
    await userEvent.type(field, '{Home}');
    await userEvent.keyboard('{ArrowRight>9/}');
    await userEvent.click(screen.getByRole('option', { name: /Dana Reyes/ }));

    expect(onMention).toHaveBeenCalledWith('c1');
    expect(screen.getByTestId('text')).toHaveTextContent('Ask about the budget');
  });

  it('Enter picks the top match instead of submitting the task', async () => {
    const onMention = vi.fn();
    const onEnter = vi.fn();
    render(<MentionHarness onMention={onMention} onEnter={onEnter} />);
    await userEvent.type(screen.getByLabelText('Task title'), 'Ask @dana{Enter}');
    expect(onMention).toHaveBeenCalledWith('c1');
    expect(onEnter).not.toHaveBeenCalled();
    expect(screen.getByTestId('text')).toHaveTextContent('Ask');
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
    expect(screen.getByTestId('text')).toHaveTextContent('Chase');
  });

  it('leaves an email address in the title alone', async () => {
    render(<MentionHarness onMention={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Task title'), 'mail dana@northwind.example');
    expect(screen.queryByRole('listbox', { name: 'Mention a contact' })).not.toBeInTheDocument();
  });
});
