import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import axios from 'axios';
import { SignupPanel } from '../index';

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    isAxiosError: (err: unknown) => err && typeof err === 'object' && 'isAxiosError' in err,
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

const renderComponent = () => {
  return render(
    <MemoryRouter>
      <SignupPanel />
    </MemoryRouter>
  );
};

describe('SignupPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders form fields', () => {
    renderComponent();

    expect(screen.getByRole('heading', { name: 'Create Account' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('First Name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Last Name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password (min 8 characters)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Confirm Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('shows error for empty fields on submit', async () => {
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('All fields are required')).toBeInTheDocument();
  });

  it('shows error when password is too short', async () => {
    renderComponent();

    fireEvent.change(screen.getByPlaceholderText('First Name'), { target: { value: 'John' } });
    fireEvent.change(screen.getByPlaceholderText('Last Name'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'john@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password (min 8 characters)'), { target: { value: 'short' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm Password'), { target: { value: 'short' } });

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument();
  });

  it('shows error when passwords do not match', async () => {
    renderComponent();

    fireEvent.change(screen.getByPlaceholderText('First Name'), { target: { value: 'John' } });
    fireEvent.change(screen.getByPlaceholderText('Last Name'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'john@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password (min 8 characters)'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm Password'), { target: { value: 'different123' } });

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
  });

  it('calls API on valid submit', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { message: 'Account created! Check your email to verify.' },
    });

    renderComponent();

    fireEvent.change(screen.getByPlaceholderText('First Name'), { target: { value: 'John' } });
    fireEvent.change(screen.getByPlaceholderText('Last Name'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'john@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password (min 8 characters)'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByLabelText(/Accept Terms of Service/i));

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith('/auth/email/signup', {
        email: 'john@test.com',
        password: 'password123',
        first_name: 'John',
        last_name: 'Doe',
        terms_accepted: true,
      });
    });
  });

  it('blocks submit and shows ToS error when checkbox unchecked', async () => {
    renderComponent();

    fireEvent.change(screen.getByPlaceholderText('First Name'), { target: { value: 'John' } });
    fireEvent.change(screen.getByPlaceholderText('Last Name'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'john@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password (min 8 characters)'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm Password'), { target: { value: 'password123' } });

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/You must agree to the Terms of Service/i)).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('shows success message after successful signup', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { message: 'Account created! Check your email to verify.' },
    });

    renderComponent();

    fireEvent.change(screen.getByPlaceholderText('First Name'), { target: { value: 'John' } });
    fireEvent.change(screen.getByPlaceholderText('Last Name'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'john@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password (min 8 characters)'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByLabelText(/Accept Terms of Service/i));

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('Account created! Check your email to verify.')).toBeInTheDocument();
    expect(screen.getByText('Go to Sign In')).toBeInTheDocument();
  });

  it('shows OAuth redirect message on 409 with account_exists_oauth', async () => {
    vi.mocked(axios.post).mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 409,
        data: { error: 'account_exists_oauth', auth_type: 'Google' },
      },
    });

    renderComponent();

    fireEvent.change(screen.getByPlaceholderText('First Name'), { target: { value: 'John' } });
    fireEvent.change(screen.getByPlaceholderText('Last Name'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'john@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password (min 8 characters)'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByLabelText(/Accept Terms of Service/i));

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/already exists using Google/)).toBeInTheDocument();
  });

  it('shows generic error on 409 for existing email account', async () => {
    vi.mocked(axios.post).mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 409,
        data: { error: 'Email already registered' },
      },
    });

    renderComponent();

    fireEvent.change(screen.getByPlaceholderText('First Name'), { target: { value: 'John' } });
    fireEvent.change(screen.getByPlaceholderText('Last Name'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'john@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password (min 8 characters)'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByLabelText(/Accept Terms of Service/i));

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('Email already registered')).toBeInTheDocument();
  });
});
