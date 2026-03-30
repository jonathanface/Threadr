import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AuthRunner } from '../index';

// Mock react-oidc-context
const mockSigninRedirect = vi.fn();
const mockAuth: {
  isLoading: boolean;
  error: Error | null;
  isAuthenticated: boolean;
  signinRedirect: typeof mockSigninRedirect;
} = {
  isLoading: false,
  error: null,
  isAuthenticated: false,
  signinRedirect: mockSigninRedirect,
};

vi.mock('react-oidc-context', () => ({
  useAuth: () => mockAuth,
}));

describe('AuthRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).location;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).location = { href: '' };

    // Mock environment variables
    import.meta.env.VITE_COGNITO_CLIENT_ID = 'test-client-id';
    import.meta.env.VITE_COGNITO_LOGOUT_URI = 'http://localhost:3000/logout';
    import.meta.env.VITE_COGNITO_DOMAIN = 'https://cognito.example.com';
  });

  describe('Loading State', () => {
    it('should show loading message when auth is loading', () => {
      mockAuth.isLoading = true;
      mockAuth.error = null;
      mockAuth.isAuthenticated = false;

      render(<AuthRunner />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should not render children when loading', () => {
      mockAuth.isLoading = true;
      mockAuth.error = null;
      mockAuth.isAuthenticated = false;

      render(
        <AuthRunner>
          <div>Child Content</div>
        </AuthRunner>
      );

      expect(screen.queryByText('Child Content')).not.toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('should show error message when auth has error', () => {
      mockAuth.isLoading = false;
      mockAuth.error = new Error('Authentication failed');
      mockAuth.isAuthenticated = false;

      render(<AuthRunner />);

      expect(screen.getByText(/Encountering error/)).toBeInTheDocument();
      expect(screen.getByText(/Authentication failed/)).toBeInTheDocument();
    });

    it('should not render children when there is an error', () => {
      mockAuth.isLoading = false;
      mockAuth.error = new Error('Auth error');
      mockAuth.isAuthenticated = false;

      render(
        <AuthRunner>
          <div>Child Content</div>
        </AuthRunner>
      );

      expect(screen.queryByText('Child Content')).not.toBeInTheDocument();
    });
  });

  describe('Authenticated State', () => {
    it('should render children when authenticated', () => {
      mockAuth.isLoading = false;
      mockAuth.error = null;
      mockAuth.isAuthenticated = true;

      render(
        <AuthRunner>
          <div>Child Content</div>
        </AuthRunner>
      );

      expect(screen.getByText('Child Content')).toBeInTheDocument();
    });

    it('should not show auth buttons when authenticated', () => {
      mockAuth.isLoading = false;
      mockAuth.error = null;
      mockAuth.isAuthenticated = true;

      render(<AuthRunner />);

      expect(screen.queryByText('Sign in')).not.toBeInTheDocument();
      expect(screen.queryByText('Sign out')).not.toBeInTheDocument();
    });

    it('should render multiple children when authenticated', () => {
      mockAuth.isLoading = false;
      mockAuth.error = null;
      mockAuth.isAuthenticated = true;

      render(
        <AuthRunner>
          <div>First Child</div>
          <div>Second Child</div>
        </AuthRunner>
      );

      expect(screen.getByText('First Child')).toBeInTheDocument();
      expect(screen.getByText('Second Child')).toBeInTheDocument();
    });
  });

  describe('Unauthenticated State', () => {
    it('should show Sign in button when not authenticated', () => {
      mockAuth.isLoading = false;
      mockAuth.error = null;
      mockAuth.isAuthenticated = false;

      render(<AuthRunner />);

      expect(screen.getByText('Sign in')).toBeInTheDocument();
    });

    it('should show Sign out button when not authenticated', () => {
      mockAuth.isLoading = false;
      mockAuth.error = null;
      mockAuth.isAuthenticated = false;

      render(<AuthRunner />);

      expect(screen.getByText('Sign out')).toBeInTheDocument();
    });

    it('should call signinRedirect when Sign in is clicked', () => {
      mockAuth.isLoading = false;
      mockAuth.error = null;
      mockAuth.isAuthenticated = false;

      render(<AuthRunner />);

      const signInButton = screen.getByText('Sign in');
      fireEvent.click(signInButton);

      expect(mockSigninRedirect).toHaveBeenCalled();
    });

    it('should redirect to Cognito logout when Sign out is clicked', () => {
      mockAuth.isLoading = false;
      mockAuth.error = null;
      mockAuth.isAuthenticated = false;

      render(<AuthRunner />);

      const signOutButton = screen.getByText('Sign out');
      fireEvent.click(signOutButton);

      const expectedUrl = 'https://cognito.example.com/logout?client_id=test-client-id&logout_uri=http%3A%2F%2Flocalhost%3A3000%2Flogout';
      expect(window.location.href).toBe(expectedUrl);
    });

    it('should not render children when not authenticated', () => {
      mockAuth.isLoading = false;
      mockAuth.error = null;
      mockAuth.isAuthenticated = false;

      render(
        <AuthRunner>
          <div>Child Content</div>
        </AuthRunner>
      );

      expect(screen.queryByText('Child Content')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty children', () => {
      mockAuth.isLoading = false;
      mockAuth.error = null;
      mockAuth.isAuthenticated = true;

      render(<AuthRunner />);

      // Should not crash with no children
      expect(screen.queryByText('Sign in')).not.toBeInTheDocument();
    });

    it('should handle null children', () => {
      mockAuth.isLoading = false;
      mockAuth.error = null;
      mockAuth.isAuthenticated = true;

      render(<AuthRunner>{null}</AuthRunner>);

      // Should not crash
      expect(screen.queryByText('Sign in')).not.toBeInTheDocument();
    });

    it('should handle error without message', () => {
      mockAuth.isLoading = false;
      mockAuth.error = new Error();
      mockAuth.isAuthenticated = false;

      render(<AuthRunner />);

      expect(screen.getByText(/Encountering error/)).toBeInTheDocument();
    });

    it('should properly encode logout URI', () => {
      import.meta.env.VITE_COGNITO_LOGOUT_URI = 'http://example.com/path?param=value&other=test';

      mockAuth.isLoading = false;
      mockAuth.error = null;
      mockAuth.isAuthenticated = false;

      render(<AuthRunner />);

      const signOutButton = screen.getByText('Sign out');
      fireEvent.click(signOutButton);

      expect(window.location.href).toContain(encodeURIComponent('http://example.com/path?param=value&other=test'));
    });

    it('should handle missing environment variables', () => {
      import.meta.env.VITE_COGNITO_CLIENT_ID = undefined;
      import.meta.env.VITE_COGNITO_LOGOUT_URI = undefined;
      import.meta.env.VITE_COGNITO_DOMAIN = undefined;

      mockAuth.isLoading = false;
      mockAuth.error = null;
      mockAuth.isAuthenticated = false;

      render(<AuthRunner />);

      const signOutButton = screen.getByText('Sign out');

      // Should not crash when clicking
      expect(() => fireEvent.click(signOutButton)).not.toThrow();
    });
  });

  describe('Button Types', () => {
    it('should have correct button types', () => {
      mockAuth.isLoading = false;
      mockAuth.error = null;
      mockAuth.isAuthenticated = false;

      render(<AuthRunner />);

      const signInButton = screen.getByText('Sign in');
      const signOutButton = screen.getByText('Sign out');

      expect(signInButton).toHaveAttribute('type', 'button');
      expect(signOutButton).toHaveAttribute('type', 'button');
    });
  });
});
