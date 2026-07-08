import { fireEvent, render, screen } from '@testing-library/react';
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

describe('Sidebar — drag to reorder projects', () => {
  function projectOrder() {
    return (useStore.getState().workspace?.projects ?? []).map((p) => p.id);
  }

  it('dropping a project on another reorders and persists', () => {
    render(<Sidebar />);
    const source = screen.getByRole('button', { name: /Home network upgrade/ });
    const target = screen.getByRole('button', { name: /Q3 Platform Migration/ });

    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: () => undefined,
      getData: () => 'p6',
    };
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    expect(target).toHaveClass('drag-over');
    fireEvent.drop(target, { dataTransfer });

    expect(projectOrder()).toEqual(['p6', 'p1', 'p2', 'p3', 'p4', 'p5']);
    expect(window.ariadne.saveCollections).toHaveBeenCalledWith({
      projects: useStore.getState().workspace?.projects,
    });
  });

  it('dropping on itself and dragend clean up without changes', () => {
    render(<Sidebar />);
    const source = screen.getByRole('button', { name: /2025 Taxes/ });
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: () => undefined };
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(source, { dataTransfer });
    expect(source).not.toHaveClass('drag-over');
    fireEvent.drop(source, { dataTransfer });
    expect(projectOrder()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);

    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragEnd(source, { dataTransfer });
    const other = screen.getByRole('button', { name: /Refinish boat table/ });
    fireEvent.drop(other, { dataTransfer }); // no active drag → no move
    expect(projectOrder()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
  });
});
