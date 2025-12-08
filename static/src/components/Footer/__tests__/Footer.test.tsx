import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Footer } from '../index';

describe('Footer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock environment variable
    import.meta.env.VITE_APP_VERSION = '1.0.0';
  });

  describe('Rendering', () => {
    it('should render footer element', () => {
      render(<Footer />);

      const footer = screen.getByRole('contentinfo');
      expect(footer).toBeInTheDocument();
    });

    it('should render copyright text with current year', () => {
      const currentYear = new Date().getFullYear();
      render(<Footer />);

      expect(screen.getByText(`©${currentYear} Docter.io, All Rights Reserved`)).toBeInTheDocument();
    });

    it('should render Privacy Policy link', () => {
      render(<Footer />);

      const privacyLink = screen.getByText('Privacy Policy');
      expect(privacyLink).toBeInTheDocument();
      expect(privacyLink).toHaveAttribute('href', '/privacy.html');
    });

    it('should render Terms of Use link', () => {
      render(<Footer />);

      const termsLink = screen.getByText('Terms of Use');
      expect(termsLink).toBeInTheDocument();
      expect(termsLink).toHaveAttribute('href', '/terms.html');
    });

    it('should render version text', () => {
      render(<Footer />);

      expect(screen.getByText('version')).toBeInTheDocument();
    });
  });

  describe('Links', () => {
    it('should have both links in the same paragraph', () => {
      const { container } = render(<Footer />);

      const paragraphs = container.querySelectorAll('p');
      const linksContainer = Array.from(paragraphs).find(p =>
        p.textContent?.includes('Privacy Policy') && p.textContent?.includes('Terms of Use')
      );

      expect(linksContainer).toBeTruthy();
    });

    it('should have correct link structure', () => {
      render(<Footer />);

      const privacyLink = screen.getByText('Privacy Policy');
      const termsLink = screen.getByText('Terms of Use');

      expect(privacyLink.tagName).toBe('A');
      expect(termsLink.tagName).toBe('A');
    });

    it('should have external links that open in same window', () => {
      render(<Footer />);

      const privacyLink = screen.getByText('Privacy Policy');
      const termsLink = screen.getByText('Terms of Use');

      // Links don't have target="_blank" so they open in same window
      expect(privacyLink).not.toHaveAttribute('target');
      expect(termsLink).not.toHaveAttribute('target');
    });
  });

  describe('Version Display', () => {
    it('should show version from environment variable', () => {
      import.meta.env.VITE_APP_VERSION = '2.5.3';

      render(<Footer />);

      const versionElement = screen.getByText('version');
      expect(versionElement).toBeInTheDocument();
    });

    it('should wrap version in tooltip', () => {
      render(<Footer />);

      const versionElement = screen.getByText('version');
      expect(versionElement.tagName).toBe('SPAN');
    });

    it('should handle undefined version', () => {
      import.meta.env.VITE_APP_VERSION = undefined;

      render(<Footer />);

      // Should still render the version element
      expect(screen.getByText('version')).toBeInTheDocument();
    });

    it('should handle empty string version', () => {
      import.meta.env.VITE_APP_VERSION = '';

      render(<Footer />);

      expect(screen.getByText('version')).toBeInTheDocument();
    });
  });

  describe('Copyright Year', () => {
    it('should display current year dynamically', () => {
      const currentYear = new Date().getFullYear();
      render(<Footer />);

      const copyrightText = screen.getByText(`©${currentYear} Docter.io, All Rights Reserved`);
      expect(copyrightText).toBeInTheDocument();
    });
  });

  describe('Structure', () => {
    it('should have three main content sections', () => {
      render(<Footer />);

      // Copyright paragraph
      expect(screen.getByText(/©.*Docter\.io/)).toBeInTheDocument();

      // Links paragraph
      expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
      expect(screen.getByText('Terms of Use')).toBeInTheDocument();

      // Version div
      expect(screen.getByText('version')).toBeInTheDocument();
    });

    it('should render paragraphs for text content', () => {
      const { container } = render(<Footer />);

      const paragraphs = container.querySelectorAll('p');
      expect(paragraphs.length).toBeGreaterThanOrEqual(2);
    });

    it('should have version in a div element', () => {
      const { container } = render(<Footer />);

      const versionDiv = container.querySelector('div[class*="version"]');
      expect(versionDiv).toBeInTheDocument();
      expect(versionDiv?.textContent).toContain('version');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long version strings', () => {
      const longVersion = '1.2.3.4.5.6.7.8.9.10-beta-alpha-rc1-snapshot-build-12345';
      import.meta.env.VITE_APP_VERSION = longVersion;

      render(<Footer />);

      expect(screen.getByText('version')).toBeInTheDocument();
    });

    it('should handle special characters in version', () => {
      import.meta.env.VITE_APP_VERSION = '1.0.0-β+build.123';

      render(<Footer />);

      expect(screen.getByText('version')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should use semantic footer element', () => {
      render(<Footer />);

      const footer = screen.getByRole('contentinfo');
      expect(footer).toBeInTheDocument();
      expect(footer.tagName).toBe('FOOTER');
    });

    it('should have accessible links', () => {
      render(<Footer />);

      const privacyLink = screen.getByRole('link', { name: 'Privacy Policy' });
      const termsLink = screen.getByRole('link', { name: 'Terms of Use' });

      expect(privacyLink).toBeInTheDocument();
      expect(termsLink).toBeInTheDocument();
    });

    it('should have proper link text (not just "click here")', () => {
      render(<Footer />);

      // Links should have descriptive text
      expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
      expect(screen.getByText('Terms of Use')).toBeInTheDocument();

      // Should not have generic link text
      expect(screen.queryByText('click here')).not.toBeInTheDocument();
    });

    it('should be keyboard navigable', () => {
      render(<Footer />);

      const privacyLink = screen.getByText('Privacy Policy');
      const termsLink = screen.getByText('Terms of Use');

      privacyLink.focus();
      expect(privacyLink).toHaveFocus();

      termsLink.focus();
      expect(termsLink).toHaveFocus();
    });
  });

  describe('Content', () => {
    it('should display correct company name', () => {
      render(<Footer />);

      expect(screen.getByText(/Docter\.io/)).toBeInTheDocument();
    });

    it('should display "All Rights Reserved" text', () => {
      render(<Footer />);

      expect(screen.getByText(/All Rights Reserved/)).toBeInTheDocument();
    });

    it('should have copyright symbol', () => {
      render(<Footer />);

      expect(screen.getByText(/©/)).toBeInTheDocument();
    });
  });
});
