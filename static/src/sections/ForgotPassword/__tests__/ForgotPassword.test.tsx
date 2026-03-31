import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import axios from 'axios';
import { ForgotPasswordPage } from '../index';

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    isAxiosError: (err: unknown) => err && typeof err === 'object' && 'isAxiosError' in err,
  },
}));

const renderComponent = () => {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>
  );
};

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders email input and submit button', () => {
    renderComponent();

    expect(screen.getByRole('heading', { name: 'Reset Password' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('shows error for empty email', async () => {
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText('Email is required')).toBeInTheDocument();
  });

  it('shows success message after successful submit', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: {} });

    renderComponent();

    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText(/if an account with that email exists/i)).toBeInTheDocument();
  });

  it('shows success message even on API error to prevent enumeration', async () => {
    vi.mocked(axios.post).mockRejectedValueOnce(new Error('Network error'));

    renderComponent();

    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText(/if an account with that email exists/i)).toBeInTheDocument();
  });

  it('has link back to sign in', () => {
    renderComponent();

    const link = screen.getByText('Back to Sign In');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/signin');
  });
});
