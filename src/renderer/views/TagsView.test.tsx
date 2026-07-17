import { emptyWorkspace } from '@shared/types';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { TagsView } from './TagsView';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
  useStore.setState({ view: 'tags' });
});

describe('TagsView', () => {
  it('lists every tag in the workspace with a usage count', () => {
    render(<TagsView />);
    const cloud = screen.getByTestId('tags-cloud');
    // A few known seed tags across projects and tasks.
    expect(within(cloud).getByText('#woodworking')).toBeInTheDocument();
    expect(within(cloud).getByText('#infra')).toBeInTheDocument();
    expect(within(cloud).getByText('#finance')).toBeInTheDocument();
    // #woodworking is on project p3 only → count 1.
    const chip = within(cloud).getByText('#woodworking').closest('button');
    expect(within(chip as HTMLElement).getByText('1')).toBeInTheDocument();
  });

  it('clicking a tag searches for it, like tag chips elsewhere', async () => {
    render(<TagsView />);
    await userEvent.click(screen.getByText('#woodworking'));
    expect(useStore.getState().q).toBe('woodworking');
  });

  it('shows an empty state without tags', () => {
    loadTestWorkspace(emptyWorkspace());
    render(<TagsView />);
    expect(screen.getByTestId('tags-headline')).toHaveTextContent('No tags yet');
  });
});
