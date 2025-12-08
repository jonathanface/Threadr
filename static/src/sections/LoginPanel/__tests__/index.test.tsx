import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LoginPanel } from '../index';

describe('LoginPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.location.search
    delete (window as any).location;
    window.location = { search: '' } as any;
  });

  describe('Rendering', () => {
    it('should render without crashing', () => {
      render(<LoginPanel />);
      expect(screen.getByText('Sign In Options')).toBeInTheDocument();
    });

    it('should render Google login option', () => {
      render(<LoginPanel />);

      const googleLink = screen.getByRole('link', { name: /login with google/i });
      expect(googleLink).toBeInTheDocument();
      expect(googleLink).toHaveAttribute('href', '/auth/google');
      expect(googleLink).toHaveAttribute('id', 'LoginWithGoogle');
    });

    it('should render Amazon login option', () => {
      render(<LoginPanel />);

      const amazonLink = screen.getByRole('link', { name: /login with amazon/i });
      expect(amazonLink).toBeInTheDocument();
      expect(amazonLink).toHaveAttribute('href', '/auth/amazon');
      expect(amazonLink).toHaveAttribute('id', 'LoginWithAmazon');
    });

    it('should render Google login image', () => {
      render(<LoginPanel />);

      const googleImg = screen.getByAltText('Login with Google');
      expect(googleImg).toBeInTheDocument();
      expect(googleImg).toHaveAttribute('src', 'https://developers.google.com/static/identity/images/branding_guideline_sample_lt_sq_lg.svg');
      expect(googleImg).toHaveAttribute('width', '175');
    });

    it('should render Amazon login image', () => {
      render(<LoginPanel />);

      const amazonImg = screen.getByAltText('Login with Amazon');
      expect(amazonImg).toBeInTheDocument();
      expect(amazonImg).toHaveAttribute('src', 'https://images-na.ssl-images-amazon.com/images/G/01/lwa/btnLWA_gold_156x32.png');
      expect(amazonImg).toHaveAttribute('width', '175');
    });
  });

  describe('Query String Handling', () => {
    it('should preserve query string in Google auth link', () => {
      window.location = { search: '?redirect=/stories' } as any;
      render(<LoginPanel />);

      const googleLink = screen.getByRole('link', { name: /login with google/i });
      expect(googleLink).toHaveAttribute('href', '/auth/google?redirect=/stories');
    });

    it('should preserve query string in Amazon auth link', () => {
      window.location = { search: '?redirect=/stories' } as any;
      render(<LoginPanel />);

      const amazonLink = screen.getByRole('link', { name: /login with amazon/i });
      expect(amazonLink).toHaveAttribute('href', '/auth/amazon?redirect=/stories');
    });

    it('should handle empty query string', () => {
      window.location = { search: '' } as any;
      render(<LoginPanel />);

      const googleLink = screen.getByRole('link', { name: /login with google/i });
      const amazonLink = screen.getByRole('link', { name: /login with amazon/i });

      expect(googleLink).toHaveAttribute('href', '/auth/google');
      expect(amazonLink).toHaveAttribute('href', '/auth/amazon');
    });

    it('should handle complex query strings', () => {
      window.location = { search: '?redirect=/stories&token=abc123' } as any;
      render(<LoginPanel />);

      const googleLink = screen.getByRole('link', { name: /login with google/i });
      expect(googleLink).toHaveAttribute('href', '/auth/google?redirect=/stories&token=abc123');
    });
  });

  describe('Accessibility', () => {
    it('should have descriptive alt text for images', () => {
      render(<LoginPanel />);

      expect(screen.getByAltText('Login with Google')).toBeInTheDocument();
      expect(screen.getByAltText('Login with Amazon')).toBeInTheDocument();
    });

    it('should have proper heading structure', () => {
      render(<LoginPanel />);

      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent('Sign In Options');
    });

    it('should have valid links', () => {
      render(<LoginPanel />);

      const links = screen.getAllByRole('link');
      expect(links).toHaveLength(2);
      links.forEach(link => {
        expect(link).toHaveAttribute('href');
      });
    });
  });

  describe('Structure', () => {
    it('should render both login options in separate containers', () => {
      render(<LoginPanel />);

      const googleLink = screen.getByRole('link', { name: /login with google/i });
      const amazonLink = screen.getByRole('link', { name: /login with amazon/i });

      // Both should be rendered
      expect(googleLink).toBeInTheDocument();
      expect(amazonLink).toBeInTheDocument();

      // Links should not be the same element
      expect(googleLink).not.toBe(amazonLink);
    });
  });
});
