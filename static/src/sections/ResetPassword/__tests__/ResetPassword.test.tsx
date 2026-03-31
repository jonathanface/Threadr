import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import axios from 'axios';
import { ResetPasswordPage } from '../index';

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    isAxiosError: (err: unknown) => err && typeof err === 'object' && 'isAxiosError' in err,
  },
}));

let mockSearchParams = new URLSearchParams('token=test-token');

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
      <ResetPasswordPage />
    </MemoryRouter>
  );
};

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams('token=test-token');
  });

  it('shows error when no token in URL', () => {
    mockSearchParams = new URLSearchParams('');
    renderComponent();

    expect(screen.getByText(/missing reset token/i)).toBeInTheDocument();
    expect(screen.getByText('Request a new reset link')).toBeInTheDocument();
  });

  it('renders password fields when token present', () => {
    renderComponent();

    expect(screen.getByRole('heading', { name: 'Set New Password' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('New Password (min 8 characters)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Confirm New Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument();
  });

  it('shows error when password is too short', async () => {
    renderComponent();

    fireEvent.change(screen.getByPlaceholderText('New Password (min 8 characters)'), { target: { value: 'short' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm New Password'), { target: { value: 'short' } });

    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument();
  });

  it('shows error when passwords do not match', async () => {
    renderComponent();

    fireEvent.change(screen.getByPlaceholderText('New Password (min 8 characters)'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm New Password'), { target: { value: 'different123' } });

    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
  });

  it('shows success message after reset', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: {} });

    renderComponent();

    fireEvent.change(screen.getByPlaceholderText('New Password (min 8 characters)'), { target: { value: 'newpassword123' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm New Password'), { target: { value: 'newpassword123' } });

    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByText(/password has been reset successfully/i)).toBeInTheDocument();
    expect(screen.getByText('Sign In')).toHaveAttribute('href', '/signin?reset=true');
  });

  it('shows API error message on failure', async () => {
    vi.mocked(axios.post).mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        data: { error: 'Token expired' },
      },
    });

    renderComponent();

    fireEvent.change(screen.getByPlaceholderText('New Password (min 8 characters)'), { target: { value: 'newpassword123' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm New Password'), { target: { value: 'newpassword123' } });

    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByText('Token expired')).toBeInTheDocument();
  });
});
