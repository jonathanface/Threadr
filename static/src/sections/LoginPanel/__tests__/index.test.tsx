import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { LoginPanel } from '../index';

const renderWithRouter = (ui: React.ReactElement) => {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
};

const mockWindowLocation = (search: string) => {
  Object.defineProperty(window, 'location', {
    value: { search },
    writable: true,
  });
};

describe('LoginPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWindowLocation('');
  });

  describe('Rendering', () => {
    it('should render without crashing', () => {
      renderWithRouter(<LoginPanel />);
      expect(screen.getByText('Sign In Options')).toBeInTheDocument();
    });

    it('should render Google login option', () => {
      renderWithRouter(<LoginPanel />);

      const googleLink = screen.getByRole('link', { name: /login with google/i });
      expect(googleLink).toBeInTheDocument();
      expect(googleLink).toHaveAttribute('href', '/auth/google');
      expect(googleLink).toHaveAttribute('id', 'LoginWithGoogle');
    });

    it('should render Amazon login option', () => {
      renderWithRouter(<LoginPanel />);

      const amazonLink = screen.getByRole('link', { name: /login with amazon/i });
      expect(amazonLink).toBeInTheDocument();
      expect(amazonLink).toHaveAttribute('href', '/auth/amazon');
      expect(amazonLink).toHaveAttribute('id', 'LoginWithAmazon');
    });

    it('should render Google login image', () => {
      renderWithRouter(<LoginPanel />);

      const googleImg = screen.getByAltText('Login with Google');
      expect(googleImg).toBeInTheDocument();
      expect(googleImg).toHaveAttribute('src', 'https://developers.google.com/static/identity/images/branding_guideline_sample_lt_sq_lg.svg');
      expect(googleImg).toHaveAttribute('width', '175');
    });

    it('should render Amazon login image', () => {
      renderWithRouter(<LoginPanel />);

      const amazonImg = screen.getByAltText('Login with Amazon');
      expect(amazonImg).toBeInTheDocument();
      expect(amazonImg).toHaveAttribute('src', 'https://images-na.ssl-images-amazon.com/images/G/01/lwa/btnLWA_gold_156x32.png');
      expect(amazonImg).toHaveAttribute('width', '175');
    });
  });

  describe('Query String Handling', () => {
    it('should preserve query string in Google auth link', () => {
      mockWindowLocation('?redirect=/stories');
      renderWithRouter(<LoginPanel />);

      const googleLink = screen.getByRole('link', { name: /login with google/i });
      expect(googleLink).toHaveAttribute('href', '/auth/google?redirect=/stories');
    });

    it('should preserve query string in Amazon auth link', () => {
      mockWindowLocation('?redirect=/stories');
      renderWithRouter(<LoginPanel />);

      const amazonLink = screen.getByRole('link', { name: /login with amazon/i });
      expect(amazonLink).toHaveAttribute('href', '/auth/amazon?redirect=/stories');
    });

    it('should handle empty query string', () => {
      mockWindowLocation('');
      renderWithRouter(<LoginPanel />);

      const googleLink = screen.getByRole('link', { name: /login with google/i });
      const amazonLink = screen.getByRole('link', { name: /login with amazon/i });

      expect(googleLink).toHaveAttribute('href', '/auth/google');
      expect(amazonLink).toHaveAttribute('href', '/auth/amazon');
    });

    it('should handle complex query strings', () => {
      mockWindowLocation('?redirect=/stories&token=abc123');
      renderWithRouter(<LoginPanel />);

      const googleLink = screen.getByRole('link', { name: /login with google/i });
      expect(googleLink).toHaveAttribute('href', '/auth/google?redirect=/stories&token=abc123');
    });
  });

  describe('Accessibility', () => {
    it('should have descriptive alt text for images', () => {
      renderWithRouter(<LoginPanel />);

      expect(screen.getByAltText('Login with Google')).toBeInTheDocument();
      expect(screen.getByAltText('Login with Amazon')).toBeInTheDocument();
    });

    it('should have proper heading structure', () => {
      renderWithRouter(<LoginPanel />);

      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent('Sign In Options');
    });

    it('should have valid links', () => {
      renderWithRouter(<LoginPanel />);

      const links = screen.getAllByRole('link');
      expect(links).toHaveLength(2);
      links.forEach(link => {
        expect(link).toHaveAttribute('href');
      });
    });
  });

  describe('Structure', () => {
    it('should render both login options in separate containers', () => {
      renderWithRouter(<LoginPanel />);

      const googleLink = screen.getByRole('link', { name: /login with google/i });
      const amazonLink = screen.getByRole('link', { name: /login with amazon/i });

      // Both should be rendered
      expect(googleLink).toBeInTheDocument();
      expect(amazonLink).toBeInTheDocument();

      // Links should not be the same element
      expect(googleLink).not.toBe(amazonLink);
    });
  });

  describe('Close Button', () => {
    it('should render close button', () => {
      renderWithRouter(<LoginPanel />);

      const closeButton = screen.getByRole('button', { name: /go back/i });
      expect(closeButton).toBeInTheDocument();
    });

    it('should have accessible label on close button', () => {
      renderWithRouter(<LoginPanel />);

      const closeButton = screen.getByLabelText('Go back');
      expect(closeButton).toBeInTheDocument();
    });

    it('should be clickable', () => {
      renderWithRouter(<LoginPanel />);

      const closeButton = screen.getByRole('button', { name: /go back/i });
      expect(() => fireEvent.click(closeButton)).not.toThrow();
    });
  });
});
