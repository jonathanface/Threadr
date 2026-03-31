import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import axios from 'axios';
import { LinkAccountPage } from '../index';

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    isAxiosError: (err: unknown) => err && typeof err === 'object' && 'isAxiosError' in err,
  },
}));

let mockSearchParams = new URLSearchParams('email=test@example.com&provider=google');

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [mockSearchParams],
  };
});

const renderComponent = () => {
  return render(
    <MemoryRouter>
      <LinkAccountPage />
    </MemoryRouter>
  );
};

describe('LinkAccountPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams('email=test@example.com&provider=google');
  });

  it('shows error when no email/provider in URL', () => {
    mockSearchParams = new URLSearchParams('');
    renderComponent();

    expect(screen.getByText(/invalid link/i)).toBeInTheDocument();
    expect(screen.getByText('Back to Sign In')).toHaveAttribute('href', '/signin');
  });

  it('renders explanation text with email and provider', () => {
    renderComponent();

    expect(screen.getByRole('heading', { name: 'Link Your Account' })).toBeInTheDocument();
    expect(screen.getByText(/test@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/link it to Google/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/enter your current password/i)).toBeInTheDocument();
  });

  it('shows error for empty password', async () => {
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /link to google/i }));

    expect(await screen.findByText('Password is required to confirm linking')).toBeInTheDocument();
  });

  it('shows success message after linking', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: {} });

    renderComponent();

    fireEvent.change(screen.getByPlaceholderText(/enter your current password/i), { target: { value: 'mypassword' } });
    fireEvent.click(screen.getByRole('button', { name: /link to google/i }));

    expect(await screen.findByText(/account has been linked to Google/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in with Google/i })).toHaveAttribute('href', '/auth/google');
  });

  it('shows API error on failure', async () => {
    vi.mocked(axios.post).mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        data: { error: 'Invalid password' },
      },
    });

    renderComponent();

    fireEvent.change(screen.getByPlaceholderText(/enter your current password/i), { target: { value: 'wrongpassword' } });
    fireEvent.click(screen.getByRole('button', { name: /link to google/i }));

    expect(await screen.findByText('Invalid password')).toBeInTheDocument();
  });

  it('has cancel link back to sign in', () => {
    renderComponent();

    const cancelLink = screen.getByText(/cancel/i);
    expect(cancelLink).toHaveAttribute('href', '/signin');
  });
});
