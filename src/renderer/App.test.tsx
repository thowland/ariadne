import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { App } from './App';
import { setupTestApp } from './test-utils';

beforeEach(() => {
  setupTestApp();
});

describe('App shell', () => {
  it('loads the workspace into the Command Center', async () => {
    render(<App />);
    expect(await screen.findByTestId('home-headline')).toHaveTextContent(
      /tasks? need your attention today/,
    );
    // Chrome present
    expect(screen.getByText('Ariadne')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search tasks & projects…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ New task' })).toBeInTheDocument();
  });

  it('navigates between views via the sidebar', async () => {
    render(<App />);
    await screen.findByTestId('home-headline');

    await userEvent.click(screen.getByRole('button', { name: 'Calendar' }));
    expect(screen.getByText('Calendar arrives in Sprint 4.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Command Center/ }));
    expect(screen.getByTestId('home-headline')).toBeInTheDocument();
  });

  it('opens a project from the sidebar', async () => {
    render(<App />);
    await screen.findByTestId('home-headline');

    const sidebar = screen.getByRole('navigation', { name: 'Projects' });
    await userEvent.click(within(sidebar).getByRole('button', { name: /Refinish boat table/ }));
    expect(screen.getByLabelText('Project name')).toHaveValue('Refinish boat table');
  });

  it('shows search results while a query is present and restores the view after', async () => {
    render(<App />);
    await screen.findByTestId('home-headline');

    const box = screen.getByPlaceholderText('Search tasks & projects…');
    await userEvent.type(box, 'varnish');
    expect(screen.getByTestId('search-summary')).toHaveTextContent(/matching “varnish”/);

    await userEvent.clear(box);
    expect(screen.getByTestId('home-headline')).toBeInTheDocument();
  });

  it('creates a task from the top bar and opens the editor modal', async () => {
    render(<App />);
    await screen.findByTestId('home-headline');

    await userEvent.click(screen.getByRole('button', { name: '+ New task' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit task' });
    // Defaults visible; targeted the first seeded project.
    expect(within(dialog).getByLabelText('Project')).toHaveValue('p1');
    expect(within(dialog).getByPlaceholderText('Task title')).toHaveValue('');
  });

  it('Escape closes the editor modal', async () => {
    render(<App />);
    await screen.findByTestId('home-headline');
    await userEvent.click(screen.getByRole('button', { name: '+ New task' }));
    expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Edit task' })).not.toBeInTheDocument();
  });

  it('creates a project from the sidebar +', async () => {
    render(<App />);
    await screen.findByTestId('home-headline');

    await userEvent.click(screen.getByTitle('New project'));
    expect(screen.getByLabelText('Project name')).toHaveValue('Untitled project');
  });
});
