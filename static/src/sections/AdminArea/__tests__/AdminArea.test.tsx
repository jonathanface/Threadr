import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { AdminArea } from '../index';
import { UserContext, UserContextType } from '../../../contexts/user';
import { LoaderContext } from '../../../contexts/loader';
import { MemoryRouter } from 'react-router-dom';
import { ReactNode } from 'react';

// Mock api module
const mockGet = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../../api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

// Mock useLoader
const mockShowLoader = vi.fn();
const mockHideLoader = vi.fn();

vi.mock('../../../hooks/useLoader', () => ({
  useLoader: () => ({
    showLoader: mockShowLoader,
    hideLoader: mockHideLoader,
    loadingCount: 0,
  }),
}));

const mockUsers = [
  {
    email: 'user1@example.com',
    first_name: 'Alice',
    last_name: 'Smith',
    subscriber: true,
    last_accessed: 1700000000,
    stories: [{ title: 'My Story' }],
  },
  {
    email: 'user2@example.com',
    first_name: 'Bob',
    last_name: 'Jones',
    subscriber: false,
    last_accessed: 0,
    stories: [],
  },
];

function renderAdminArea(admin = true) {
  const userContextValue: UserContextType = {
    userDetails: {
      email: 'admin@example.com',
      first_name: 'Admin',
      last_name: 'User',
      subscriber: true,
      admin,
    },
    isLoggedIn: true,
    userLoading: false,
    setIsLoggedIn: vi.fn(),
    setUserDetails: vi.fn(),
    clearWelcomeFlags: vi.fn(),
  };

  const loaderContextValue = {
    showLoader: mockShowLoader,
    hideLoader: mockHideLoader,
    loadingCount: 0,
  };

  return render(
    <MemoryRouter>
      <LoaderContext.Provider value={loaderContextValue}>
        <UserContext.Provider value={userContextValue}>
          <AdminArea />
        </UserContext.Provider>
      </LoaderContext.Provider>
    </MemoryRouter>
  );
}

describe('AdminArea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: mockUsers });
    mockDelete.mockResolvedValue({ data: { message: 'User deleted' } });
  });

  it('renders delete button for each user', async () => {
    renderAdminArea();

    await waitFor(() => {
      const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
      expect(deleteButtons).toHaveLength(mockUsers.length);
    });
  });

  it('calls window.confirm on delete click', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderAdminArea();

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /delete/i })).toHaveLength(2);
    });

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    await user.click(deleteButtons[0]);

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('Alice Smith')
    );

    confirmSpy.mockRestore();
  });

  it('calls API delete endpoint when confirmed', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderAdminArea();

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /delete/i })).toHaveLength(2);
    });

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    await user.click(deleteButtons[0]);

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith(
        `/admin/users/${encodeURIComponent('user1@example.com')}`
      );
    });

    vi.restoreAllMocks();
  });

  it('does not call API when cancelled', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderAdminArea();

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /delete/i })).toHaveLength(2);
    });

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    await user.click(deleteButtons[0]);

    expect(mockDelete).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('refreshes user list after delete', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderAdminArea();

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /delete/i })).toHaveLength(2);
    });

    // mockGet is called once on mount for fetchUsers
    const initialCallCount = mockGet.mock.calls.length;

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    await user.click(deleteButtons[0]);

    await waitFor(() => {
      // fetchUsers should be called again after successful delete
      expect(mockGet.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    vi.restoreAllMocks();
  });

  it('shows error on API failure', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockDelete.mockRejectedValue(new Error('Network error'));

    renderAdminArea();

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /delete/i })).toHaveLength(2);
    });

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    await user.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Failed to delete user/i)).toBeInTheDocument();
    });

    vi.restoreAllMocks();
  });
});
