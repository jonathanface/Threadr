import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { UserMenu } from '../index';
import { UserContext } from '../../../contexts/user';
import * as api from '../../../api';

// Mock dependencies
const mockShowLoader = vi.fn();
const mockHideLoader = vi.fn();
const mockSetIsLoggedIn = vi.fn();
const mockSetStory = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../../../hooks/useLoader', () => ({
  useLoader: () => ({
    showLoader: mockShowLoader,
    hideLoader: mockHideLoader,
  }),
}));

vi.mock('../../../hooks/useFetchUserData', () => ({
  useFetchUserData: () => ({
    setIsLoggedIn: mockSetIsLoggedIn,
  }),
}));

vi.mock('../../../hooks/useSelections', () => ({
  useSelections: () => ({
    setStory: mockSetStory,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../../../api', () => ({
  api: {
    delete: vi.fn(),
  },
}));

const createMockUserContext = (isLoggedIn: boolean) => ({
  userDetails: null,
  isLoggedIn,
  userLoading: false,
  setIsLoggedIn: vi.fn(),
        clearWelcomeFlags: vi.fn(),
  setUserDetails: vi.fn(),
});

describe('UserMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as any).location;
    (window as any).location = { pathname: '/' };
  });

  describe('When logged out', () => {
    it('should show Register / SignIn link', () => {
      render(
        <UserContext.Provider value={createMockUserContext(false)}>
          <UserMenu />
        </UserContext.Provider>
      );

      expect(screen.getByText('Register / SignIn')).toBeInTheDocument();
    });

    it('should navigate to signin when Register / SignIn clicked', () => {
      render(
        <UserContext.Provider value={createMockUserContext(false)}>
          <UserMenu />
        </UserContext.Provider>
      );

      const link = screen.getByText('Register / SignIn');
      fireEvent.click(link);

      expect(mockNavigate).toHaveBeenCalledWith('/signin');
    });

    it('should not show Register / SignIn link on signin page', () => {
      (window as any).location = { pathname: '/signin' };

      render(
        <UserContext.Provider value={createMockUserContext(false)}>
          <UserMenu />
        </UserContext.Provider>
      );

      expect(screen.queryByText('Register / SignIn')).not.toBeInTheDocument();
    });
  });

  describe('When logged in', () => {
    it('should show user menu icon', () => {
      render(
        <UserContext.Provider value={createMockUserContext(true)}>
          <UserMenu />
        </UserContext.Provider>
      );

      expect(screen.getByLabelText('user menu')).toBeInTheDocument();
    });

    it('should not show menu items initially', () => {
      render(
        <UserContext.Provider value={createMockUserContext(true)}>
          <UserMenu />
        </UserContext.Provider>
      );

      expect(screen.queryByText('Account')).not.toBeInTheDocument();
      expect(screen.queryByText('Signout')).not.toBeInTheDocument();
    });

    it('should show menu on mouse enter', async () => {
      render(
        <UserContext.Provider value={createMockUserContext(true)}>
          <UserMenu />
        </UserContext.Provider>
      );

      const menuIcon = screen.getByLabelText('user menu').closest('span')?.parentElement;
      expect(menuIcon).toBeTruthy();

      fireEvent.mouseEnter(menuIcon!);

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument();
        expect(screen.getByText('Signout')).toBeInTheDocument();
      });
    });

    it('should hide menu on mouse leave', async () => {
      render(
        <UserContext.Provider value={createMockUserContext(true)}>
          <UserMenu />
        </UserContext.Provider>
      );

      const menuIcon = screen.getByLabelText('user menu').closest('span')?.parentElement;
      expect(menuIcon).toBeTruthy();

      fireEvent.mouseEnter(menuIcon!);

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument();
      });

      fireEvent.mouseLeave(menuIcon!);

      await waitFor(() => {
        expect(screen.queryByText('Account')).not.toBeInTheDocument();
      });
    });

    it('should toggle menu on click', async () => {
      render(
        <UserContext.Provider value={createMockUserContext(true)}>
          <UserMenu />
        </UserContext.Provider>
      );

      const menuIcon = screen.getByLabelText('user menu').closest('span')?.parentElement;
      expect(menuIcon).toBeTruthy();

      // Click to open
      fireEvent.click(menuIcon!);

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument();
      });

      // Click to close
      fireEvent.click(menuIcon!);

      await waitFor(() => {
        expect(screen.queryByText('Account')).not.toBeInTheDocument();
      });
    });

    it('should navigate to settings when Account clicked', async () => {
      render(
        <UserContext.Provider value={createMockUserContext(true)}>
          <UserMenu />
        </UserContext.Provider>
      );

      const menuIcon = screen.getByLabelText('user menu').closest('span')?.parentElement;
      fireEvent.mouseEnter(menuIcon!);

      const accountLink = await screen.findByText('Account');
      fireEvent.click(accountLink);

      expect(mockNavigate).toHaveBeenCalledWith('/account/subscription');
    });

    it('should call signout API when Signout clicked', async () => {
      vi.mocked(api.api.delete).mockResolvedValue({ status: 200, data: {} } as any);

      render(
        <UserContext.Provider value={createMockUserContext(true)}>
          <UserMenu />
        </UserContext.Provider>
      );

      const menuIcon = screen.getByLabelText('user menu').closest('span')?.parentElement;
      fireEvent.mouseEnter(menuIcon!);

      const signoutLink = await screen.findByText('Signout');
      fireEvent.click(signoutLink);

      await waitFor(() => {
        expect(mockShowLoader).toHaveBeenCalled();
        expect(api.api.delete).toHaveBeenCalledWith('/auth/logout', { baseURL: '' });
      });
    });

    it('should update state on successful signout', async () => {
      vi.mocked(api.api.delete).mockResolvedValue({ status: 200, data: {} } as any);

      render(
        <UserContext.Provider value={createMockUserContext(true)}>
          <UserMenu />
        </UserContext.Provider>
      );

      const menuIcon = screen.getByLabelText('user menu').closest('span')?.parentElement;
      fireEvent.mouseEnter(menuIcon!);

      const signoutLink = await screen.findByText('Signout');
      fireEvent.click(signoutLink);

      await waitFor(() => {
        expect(mockSetIsLoggedIn).toHaveBeenCalledWith(false);
        expect(mockNavigate).toHaveBeenCalledWith('/');
        expect(mockSetStory).toHaveBeenCalledWith(undefined);
        expect(mockHideLoader).toHaveBeenCalled();
      });
    });

    it('should handle signout error gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(api.api.delete).mockRejectedValue(new Error('Network error'));

      render(
        <UserContext.Provider value={createMockUserContext(true)}>
          <UserMenu />
        </UserContext.Provider>
      );

      const menuIcon = screen.getByLabelText('user menu').closest('span')?.parentElement;
      fireEvent.mouseEnter(menuIcon!);

      const signoutLink = await screen.findByText('Signout');
      fireEvent.click(signoutLink);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
        expect(mockSetStory).toHaveBeenCalledWith(undefined);
        expect(mockHideLoader).toHaveBeenCalled();
      });

      consoleErrorSpy.mockRestore();
    });

    it('should handle axios error on signout', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const axiosError = {
        isAxiosError: true,
        response: { status: 500 },
        message: 'Server error',
      };
      vi.mocked(api.api.delete).mockRejectedValue(axiosError);

      render(
        <UserContext.Provider value={createMockUserContext(true)}>
          <UserMenu />
        </UserContext.Provider>
      );

      const menuIcon = screen.getByLabelText('user menu').closest('span')?.parentElement;
      fireEvent.mouseEnter(menuIcon!);

      const signoutLink = await screen.findByText('Signout');
      fireEvent.click(signoutLink);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Unable to logout: 500 Server error'
        );
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined UserContext', () => {
      render(
        <UserContext.Provider value={undefined}>
          <UserMenu />
        </UserContext.Provider>
      );

      // Should not crash
      expect(screen.queryByLabelText('user menu')).not.toBeInTheDocument();
    });

    it('should handle different pathname values', () => {
      (window as any).location = { pathname: '/stories/123' };

      render(
        <UserContext.Provider value={createMockUserContext(false)}>
          <UserMenu />
        </UserContext.Provider>
      );

      expect(screen.getByText('Register / SignIn')).toBeInTheDocument();
    });

    it('should handle rapid menu toggle', async () => {
      render(
        <UserContext.Provider value={createMockUserContext(true)}>
          <UserMenu />
        </UserContext.Provider>
      );

      const menuIcon = screen.getByLabelText('user menu').closest('span')?.parentElement;
      expect(menuIcon).toBeTruthy();

      // Rapid clicks
      fireEvent.click(menuIcon!);
      fireEvent.click(menuIcon!);
      fireEvent.click(menuIcon!);

      // Should not crash
      expect(menuIcon).toBeInTheDocument();
    });

    it('should handle mouse enter and leave rapidly', async () => {
      render(
        <UserContext.Provider value={createMockUserContext(true)}>
          <UserMenu />
        </UserContext.Provider>
      );

      const menuIcon = screen.getByLabelText('user menu').closest('span')?.parentElement;
      expect(menuIcon).toBeTruthy();

      // Rapid hovers
      fireEvent.mouseEnter(menuIcon!);
      fireEvent.mouseLeave(menuIcon!);
      fireEvent.mouseEnter(menuIcon!);
      fireEvent.mouseLeave(menuIcon!);

      // Should not crash
      expect(menuIcon).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have aria-label for user menu icon', () => {
      render(
        <UserContext.Provider value={createMockUserContext(true)}>
          <UserMenu />
        </UserContext.Provider>
      );

      expect(screen.getByLabelText('user menu')).toBeInTheDocument();
    });

    it('should have clickable menu items', async () => {
      render(
        <UserContext.Provider value={createMockUserContext(true)}>
          <UserMenu />
        </UserContext.Provider>
      );

      const menuIcon = screen.getByLabelText('user menu').closest('span')?.parentElement;
      fireEvent.mouseEnter(menuIcon!);

      const accountLink = await screen.findByText('Account');
      const signoutLink = await screen.findByText('Signout');

      expect(accountLink).toBeInTheDocument();
      expect(signoutLink).toBeInTheDocument();
    });

    it('should have clickable Register / SignIn link when logged out', () => {
      render(
        <UserContext.Provider value={createMockUserContext(false)}>
          <UserMenu />
        </UserContext.Provider>
      );

      const link = screen.getByText('Register / SignIn');
      expect(link).toBeInTheDocument();
      expect(link.tagName).toBe('A');
    });
  });
});
