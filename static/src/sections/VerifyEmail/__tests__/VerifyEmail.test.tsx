import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VerifyEmailPage } from '../index';
import { MemoryRouter } from 'react-router-dom';

// Mock axios
vi.mock('axios', () => {
  return {
    default: {
      isAxiosError: vi.fn((err: unknown): boolean => {
        return err instanceof Error && 'isAxiosError' in err;
      }),
      get: vi.fn(),
    },
  };
});

// We need to control useSearchParams per test
let mockToken: string | null = null;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [
      {
        get: (key: string) => (key === 'token' ? mockToken : null),
      },
    ],
  };
});

import axios from 'axios';

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToken = null;
  });

  it('shows error when no token in URL', () => {
    mockToken = null;

    render(
      <MemoryRouter>
        <VerifyEmailPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Missing verification token.')).toBeInTheDocument();
  });

  it('shows loading state with token', () => {
    mockToken = 'abc123';
    // Make axios.get hang (never resolve) so we stay in loading
    vi.mocked(axios.get).mockReturnValue(new Promise(() => {}));

    render(
      <MemoryRouter>
        <VerifyEmailPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Verifying your email...')).toBeInTheDocument();
  });

  it('shows success on 302 response', async () => {
    mockToken = 'valid-token';

    const axiosError = new Error('Request failed') as Error & {
      isAxiosError: boolean;
      response: { status: number; data: Record<string, unknown> };
    };
    axiosError.isAxiosError = true;
    axiosError.response = { status: 302, data: {} };

    vi.mocked(axios.get).mockRejectedValue(axiosError);
    // Override isAxiosError to return true for this error
    vi.mocked(axios.isAxiosError).mockReturnValue(true);

    render(
      <MemoryRouter>
        <VerifyEmailPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Email verified successfully!')).toBeInTheDocument();
    });
  });

  it('shows error message on API error', async () => {
    mockToken = 'expired-token';

    const axiosError = new Error('Request failed') as Error & {
      isAxiosError: boolean;
      response: { status: number; data: { error: string } };
    };
    axiosError.isAxiosError = true;
    axiosError.response = { status: 400, data: { error: 'Token has expired' } };

    vi.mocked(axios.get).mockRejectedValue(axiosError);
    vi.mocked(axios.isAxiosError).mockReturnValue(true);

    render(
      <MemoryRouter>
        <VerifyEmailPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Token has expired')).toBeInTheDocument();
    });
  });

  it('has link back to sign in', () => {
    mockToken = null;

    render(
      <MemoryRouter>
        <VerifyEmailPage />
      </MemoryRouter>
    );

    const link = screen.getByText('Back to Sign In');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', '/signin');
  });
});
