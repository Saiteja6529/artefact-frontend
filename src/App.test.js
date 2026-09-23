import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the initial scope prompt and disabled send button', () => {
  render(<App />);

  expect(screen.getByText(/select a civilization and book to begin\./i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
});
