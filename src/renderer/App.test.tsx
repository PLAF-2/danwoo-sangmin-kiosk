import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App', () => {
  it('renders the kiosk application entry', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'HIGHEST Kiosk' })).toBeInTheDocument();
  });
});
