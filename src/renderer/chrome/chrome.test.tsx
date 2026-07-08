import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '../app/store';
import { loadTestWorkspace, setupTestApp } from '../test-utils';

import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

beforeEach(() => {
  setupTestApp();
  loadTestWorkspace();
});

describe('Sidebar', () => {
  it('shows the overdue badge on Command Center and per-project counts', () => {
    render(<Sidebar />);
    // 3 seeded overdue tasks → badge.
    expect(screen.getByRole('button', { name: /Command Center/ })).toHaveTextContent('3');
    // p1 has 1 overdue → red count 1; p2 has 4 open, none overdue.
    expect(screen.getByRole('button', { name: /Q3 Platform Migration/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /Customer Onboarding Revamp/ })).toHaveTextContent(
      '4',
    );
  });

  it('marks the active view and project', async () => {
    render(<Sidebar />);
    expect(screen.getByRole('button', { name: /Command Center/ })).toHaveClass('active');
    await userEvent.click(screen.getByRole('button', { name: /2025 Taxes/ }));
    expect(screen.getByRole('button', { name: /2025 Taxes/ })).toHaveClass('active');
    expect(useStore.getState().activeProjectId).toBe('p4');
  });
});

describe('TopBar', () => {
  it('shows the view title, date, and overdue pill', () => {
    render(<TopBar />);
    expect(screen.getByText('Command Center')).toBeInTheDocument();
    expect(screen.getByText('Wednesday, July 8, 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /3 overdue/ })).toBeInTheDocument();
  });

  it('overdue pill jumps home with scope all', async () => {
    useStore.setState({ view: 'calendar', scope: 'home' });
    render(<TopBar />);
    await userEvent.click(screen.getByRole('button', { name: /3 overdue/ }));
    expect(useStore.getState().view).toBe('home');
    expect(useStore.getState().scope).toBe('all');
  });

  it('titles the project view with the project name', () => {
    useStore.setState({ view: 'project', activeProjectId: 'p3' });
    render(<TopBar />);
    expect(screen.getByText('Refinish boat table')).toBeInTheDocument();
  });

  it('titles search results while a query is active', () => {
    useStore.setState({ q: 'varnish' });
    render(<TopBar />);
    expect(screen.getByText('Search results')).toBeInTheDocument();
  });
});
