import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App', () => {
  it('renders the brand heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Ariadne' })).toBeInTheDocument();
  });

  it("shows today's long-form date", () => {
    render(<App />);
    // e.g. "Wednesday, July 8, 2026" — assert shape, not a pinned day.
    expect(screen.getByText(/^\w+, \w+ \d{1,2}, \d{4}$/)).toBeInTheDocument();
  });
});
