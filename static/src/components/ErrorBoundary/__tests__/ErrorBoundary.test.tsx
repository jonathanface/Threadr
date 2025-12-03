import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ErrorBoundary } from '../index';

// Component that throws an error
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No Error</div>;
};

// Component with different error
const ThrowDifferentError = () => {
  throw new Error('Different error message');
};

describe('ErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Suppress console.error for cleaner test output
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('Normal Rendering', () => {
    it('should render children when there is no error', () => {
      render(
        <ErrorBoundary>
          <div>Child Content</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Child Content')).toBeInTheDocument();
    });

    it('should render multiple children when there is no error', () => {
      render(
        <ErrorBoundary>
          <div>First Child</div>
          <div>Second Child</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('First Child')).toBeInTheDocument();
      expect(screen.getByText('Second Child')).toBeInTheDocument();
    });

    it('should not show error message when rendering normally', () => {
      render(
        <ErrorBoundary>
          <div>Normal Content</div>
        </ErrorBoundary>
      );

      expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should catch error and display error message', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
    });

    it('should not render children when error is caught', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.queryByText('No Error')).not.toBeInTheDocument();
    });

    it('should log error to console', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'ErrorBoundary caught an error',
        expect.any(Error),
        expect.any(Object)
      );
    });

    it('should catch different error types', () => {
      render(
        <ErrorBoundary>
          <ThrowDifferentError />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
    });
  });

  describe('Error Recovery', () => {
    it('should render error state when child throws error', () => {
      const { rerender } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={false} />
        </ErrorBoundary>
      );

      expect(screen.getByText('No Error')).toBeInTheDocument();

      // Now make it throw
      rerender(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle null children', () => {
      render(<ErrorBoundary>{null}</ErrorBoundary>);

      expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument();
    });

    it('should handle undefined children', () => {
      render(<ErrorBoundary>{undefined}</ErrorBoundary>);

      expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument();
    });

    it('should handle empty fragment', () => {
      render(
        <ErrorBoundary>
          <></>
        </ErrorBoundary>
      );

      expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument();
    });

    it('should handle nested ErrorBoundaries', () => {
      render(
        <ErrorBoundary>
          <ErrorBoundary>
            <ThrowError shouldThrow={true} />
          </ErrorBoundary>
        </ErrorBoundary>
      );

      // Inner boundary should catch the error
      expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
    });

    it('should handle complex children structure', () => {
      render(
        <ErrorBoundary>
          <div>
            <span>Nested</span>
            <div>
              <p>Content</p>
            </div>
          </div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Nested')).toBeInTheDocument();
      expect(screen.getByText('Content')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('should maintain error state once error is caught', () => {
      const { rerender } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong.')).toBeInTheDocument();

      // Try to rerender with non-throwing component
      // Error state should persist (ErrorBoundary doesn't reset)
      rerender(
        <ErrorBoundary>
          <div>New Content</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should render error message as heading', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const heading = screen.getByRole('heading', { name: /something went wrong/i });
      expect(heading).toBeInTheDocument();
      expect(heading.tagName).toBe('H1');
    });
  });
});
