import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { TagEditor } from './TagEditor';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
});

function editor(initial: string[] = []) {
  const onChange = vi.fn();
  render(<TagEditor tags={initial} onChange={onChange} />);
  return onChange;
}

describe('TagEditor — autocomplete', () => {
  it('suggests known tags matching the typed prefix', async () => {
    editor();
    await userEvent.type(screen.getByPlaceholderText('+ tag'), 'in');
    const list = screen.getByRole('listbox', { name: 'Tag suggestions' });
    expect(within(list).getByText('#infra')).toBeInTheDocument();
    expect(within(list).queryByText('#finance')).not.toBeInTheDocument();
  });

  it('clicking a suggestion adds it and clears the input', async () => {
    const onChange = editor(['q3']);
    const input = screen.getByPlaceholderText('+ tag');
    await userEvent.type(input, 'wo');
    await userEvent.click(screen.getByText('#woodworking'));
    expect(onChange).toHaveBeenCalledWith(['q3', 'woodworking']);
    expect(input).toHaveValue('');
  });

  it('arrow keys navigate and Enter picks the highlighted suggestion', async () => {
    const onChange = editor();
    const input = screen.getByPlaceholderText('+ tag');
    await userEvent.type(input, 'h'); // hiring (seed)
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith(['hiring']);
  });

  it('Enter with no highlight creates the typed tag as-is', async () => {
    const onChange = editor();
    await userEvent.type(screen.getByPlaceholderText('+ tag'), 'brand-new{Enter}');
    expect(onChange).toHaveBeenCalledWith(['brand-new']);
  });

  it('excludes tags already on the entity and ignores duplicates', async () => {
    const onChange = editor(['infra']);
    const input = screen.getByPlaceholderText('+ tag');
    await userEvent.type(input, 'inf');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument(); // only match excluded
    await userEvent.keyboard('{Enter}'); // commit 'inf'? no—draft is 'inf', creates new tag 'inf'
    expect(onChange).toHaveBeenCalledWith(['infra', 'inf']);
    onChange.mockClear();
    await userEvent.type(input, 'INFRA{Enter}');
    expect(onChange).not.toHaveBeenCalled(); // case-insensitive duplicate
  });

  it('Escape clears the draft and suggestions', async () => {
    editor();
    const input = screen.getByPlaceholderText('+ tag');
    await userEvent.type(input, 'in');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(input).toHaveValue('');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('TagEditor — chip search', () => {
  it('clicking a chip label searches for the tag and closes any modal', async () => {
    useStore.setState({ modal: { type: 'task', id: 't1' } });
    editor(['infra']);
    await userEvent.click(screen.getByTitle('Search for #infra'));
    expect(useStore.getState().q).toBe('infra');
    expect(useStore.getState().modal).toBeNull();
  });

  it('the × still removes without searching', async () => {
    const onChange = editor(['infra']);
    await userEvent.click(screen.getByRole('button', { name: 'Remove tag infra' }));
    expect(onChange).toHaveBeenCalledWith([]);
    expect(useStore.getState().q).toBe('');
  });
});
