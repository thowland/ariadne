import type { IsoDate } from '@shared/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

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
