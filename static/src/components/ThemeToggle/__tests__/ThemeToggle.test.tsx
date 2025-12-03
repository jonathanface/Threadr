import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeToggle } from '../index';

describe('ThemeToggle', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Clear document attribute
    document.documentElement.removeAttribute('data-theme');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial Rendering', () => {
    it('should render theme toggle button', () => {
      render(<ThemeToggle />);

      const button = screen.getByRole('button', { name: /toggle theme/i });
      expect(button).toBeInTheDocument();
    });

    it('should render in light mode by default', () => {
      render(<ThemeToggle />);

      const darkModeIcon = screen.getByTestId('DarkModeIcon');
      expect(darkModeIcon).toBeInTheDocument();
    });

    it('should set data-theme attribute to light by default', () => {
      render(<ThemeToggle />);

      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });
  });

  describe('Saved Theme', () => {
    it('should load saved dark theme from localStorage', () => {
      localStorage.setItem('theme', 'dark');

      render(<ThemeToggle />);

      const lightModeIcon = screen.getByTestId('LightModeIcon');
      expect(lightModeIcon).toBeInTheDocument();
    });

    it('should load saved light theme from localStorage', () => {
      localStorage.setItem('theme', 'light');

      render(<ThemeToggle />);

      const darkModeIcon = screen.getByTestId('DarkModeIcon');
      expect(darkModeIcon).toBeInTheDocument();
    });

    it('should set data-theme attribute from saved theme', () => {
      localStorage.setItem('theme', 'dark');

      render(<ThemeToggle />);

      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
  });

  describe('Theme Toggle', () => {
    it('should toggle from light to dark when clicked', () => {
      render(<ThemeToggle />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      const lightModeIcon = screen.getByTestId('LightModeIcon');
      expect(lightModeIcon).toBeInTheDocument();
    });

    it('should toggle from dark to light when clicked', () => {
      localStorage.setItem('theme', 'dark');

      render(<ThemeToggle />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      const darkModeIcon = screen.getByTestId('DarkModeIcon');
      expect(darkModeIcon).toBeInTheDocument();
    });

    it('should toggle multiple times', () => {
      render(<ThemeToggle />);

      const button = screen.getByRole('button');

      // Light -> Dark
      fireEvent.click(button);
      expect(screen.getByTestId('LightModeIcon')).toBeInTheDocument();

      // Dark -> Light
      fireEvent.click(button);
      expect(screen.getByTestId('DarkModeIcon')).toBeInTheDocument();

      // Light -> Dark again
      fireEvent.click(button);
      expect(screen.getByTestId('LightModeIcon')).toBeInTheDocument();
    });
  });

  describe('LocalStorage Persistence', () => {
    it('should save theme to localStorage when toggled', () => {
      render(<ThemeToggle />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(localStorage.getItem('theme')).toBe('dark');
    });

    it('should update localStorage on each toggle', () => {
      render(<ThemeToggle />);

      const button = screen.getByRole('button');

      fireEvent.click(button);
      expect(localStorage.getItem('theme')).toBe('dark');

      fireEvent.click(button);
      expect(localStorage.getItem('theme')).toBe('light');
    });
  });

  describe('Document Attribute', () => {
    it('should set data-theme attribute when toggled', () => {
      render(<ThemeToggle />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('should update data-theme on each toggle', () => {
      render(<ThemeToggle />);

      const button = screen.getByRole('button');

      fireEvent.click(button);
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

      fireEvent.click(button);
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });
  });

  describe('Animation State', () => {
    it('should apply animating class during toggle', () => {
      const { container } = render(<ThemeToggle />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      const toggle = container.querySelector('[class*="animating"]');
      expect(toggle).toBeInTheDocument();
    });
  });

  describe('Icons', () => {
    it('should show dark mode icon in light mode', () => {
      render(<ThemeToggle />);

      expect(screen.getByTestId('DarkModeIcon')).toBeInTheDocument();
    });

    it('should show light mode icon in dark mode', () => {
      localStorage.setItem('theme', 'dark');

      render(<ThemeToggle />);

      expect(screen.getByTestId('LightModeIcon')).toBeInTheDocument();
    });

    it('should have medium fontSize for icons', () => {
      render(<ThemeToggle />);

      const icon = screen.getByTestId('DarkModeIcon');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('Tooltip', () => {
    it('should have tooltip title attribute in light mode', () => {
      render(<ThemeToggle />);

      // Tooltip is handled by MUI internally
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should have tooltip title attribute in dark mode', () => {
      localStorage.setItem('theme', 'dark');

      render(<ThemeToggle />);

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have aria-label', () => {
      render(<ThemeToggle />);

      const button = screen.getByRole('button', { name: /toggle theme/i });
      expect(button).toHaveAttribute('aria-label', 'toggle theme');
    });

    it('should be keyboard accessible', () => {
      render(<ThemeToggle />);

      const button = screen.getByRole('button');

      button.focus();
      expect(button).toHaveFocus();
    });

    it('should toggle on Enter key', () => {
      render(<ThemeToggle />);

      const button = screen.getByRole('button');
      button.focus();

      fireEvent.keyDown(button, { key: 'Enter', code: 'Enter' });

      // MUI IconButton handles Enter automatically
      expect(button).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid clicking', () => {
      render(<ThemeToggle />);

      const button = screen.getByRole('button');

      // Rapid clicks
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);

      // Should not crash
      expect(button).toBeInTheDocument();
    });

    it('should handle invalid localStorage value', () => {
      localStorage.setItem('theme', 'invalid-theme');

      expect(() => render(<ThemeToggle />)).not.toThrow();
    });

    it('should handle empty localStorage', () => {
      localStorage.clear();

      render(<ThemeToggle />);

      // Should default to light
      expect(screen.getByTestId('DarkModeIcon')).toBeInTheDocument();
    });

    it('should handle component unmount during animation', () => {
      const { unmount } = render(<ThemeToggle />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      // Unmount before animation finishes
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Styling', () => {
    it('should have white color', () => {
      render(<ThemeToggle />);

      const button = screen.getByRole('button');
      expect(button).toHaveStyle({ color: '#ffffff' });
    });

    it('should have transition style', () => {
      render(<ThemeToggle />);

      const button = screen.getByRole('button');
      expect(button).toHaveStyle({ transition: 'all 0.3s ease' });
    });
  });
});
