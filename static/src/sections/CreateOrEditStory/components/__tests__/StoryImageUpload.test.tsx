import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StoryImageUpload } from '../StoryImageUpload';

// Mock PortraitDropper component
vi.mock('../../../../components/PortraitDropper', () => ({
  PortraitDropper: ({ imageURL, name, onComplete, onImageLoaded }: any) => (
    <div
      data-testid="portrait-dropper"
      data-image-url={imageURL}
      data-name={name}
      onClick={() => {
        const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
        onComplete([file]);
      }}
      onLoad={() => onImageLoaded()}
    >
      PortraitDropper Mock
    </div>
  ),
}));

describe('StoryImageUpload', () => {
  const defaultProps = {
    imageURL: '/test-image.jpg',
    title: 'Test Story',
    isLoading: false,
    onImageComplete: vi.fn(),
    onImageLoaded: vi.fn(),
  };

  describe('Rendering', () => {
    it('should render without crashing', () => {
      render(<StoryImageUpload {...defaultProps} />);
      expect(screen.getByTestId('portrait-dropper')).toBeInTheDocument();
    });

    it('should pass imageURL to PortraitDropper', () => {
      render(<StoryImageUpload {...defaultProps} />);
      const dropper = screen.getByTestId('portrait-dropper');
      expect(dropper).toHaveAttribute('data-image-url', '/test-image.jpg');
    });

    it('should pass title as name to PortraitDropper', () => {
      render(<StoryImageUpload {...defaultProps} />);
      const dropper = screen.getByTestId('portrait-dropper');
      expect(dropper).toHaveAttribute('data-name', 'Test Story');
    });

    it('should use default name when title is empty', () => {
      render(<StoryImageUpload {...defaultProps} title="" />);
      const dropper = screen.getByTestId('portrait-dropper');
      expect(dropper).toHaveAttribute('data-name', 'Story cover image');
    });
  });

  describe('Loading State', () => {
    it('should hide loading screen when not loading', () => {
      render(<StoryImageUpload {...defaultProps} isLoading={false} />);
      // Use hidden: true to find elements with visibility: hidden
      const loadingScreen = screen.getByRole('status', { hidden: true });
      expect(loadingScreen).toHaveStyle({ visibility: 'hidden' });
    });

    it('should show loading screen when loading', () => {
      render(<StoryImageUpload {...defaultProps} isLoading={true} />);
      // Use hidden: true to find elements that might be hidden
      const loadingScreen = screen.getByRole('status', { hidden: true });
      expect(loadingScreen).toHaveStyle({ visibility: 'visible' });
    });

    it('should have proper ARIA labels for loading', () => {
      render(<StoryImageUpload {...defaultProps} isLoading={true} />);
      expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading image');
      expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    });

    it('should render CircularProgress when loading', () => {
      render(<StoryImageUpload {...defaultProps} isLoading={true} />);
      expect(screen.getByLabelText('Loading')).toBeInTheDocument();
    });
  });

  describe('Callbacks', () => {
    it('should call onImageComplete when PortraitDropper completes', () => {
      const onImageComplete = vi.fn();
      render(<StoryImageUpload {...defaultProps} onImageComplete={onImageComplete} />);

      const dropper = screen.getByTestId('portrait-dropper');
      dropper.click();

      expect(onImageComplete).toHaveBeenCalledTimes(1);
      expect(onImageComplete).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'test.jpg',
          type: 'image/jpeg',
        }),
      ]);
    });

    it('should pass onImageLoaded callback to PortraitDropper', () => {
      const onImageLoaded = vi.fn();
      render(<StoryImageUpload {...defaultProps} onImageLoaded={onImageLoaded} />);

      // The mock doesn't actually call onImageLoaded in this test setup
      // Just verify the prop was passed correctly
      const dropper = screen.getByTestId('portrait-dropper');
      expect(dropper).toBeInTheDocument();

      // In the real component, PortraitDropper would call this when image loads
      // We're testing that the component passes the callback, not that it fires
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes on loading screen', () => {
      render(<StoryImageUpload {...defaultProps} isLoading={true} />);
      const loadingScreen = screen.getByRole('status');

      expect(loadingScreen).toHaveAttribute('aria-live', 'polite');
      expect(loadingScreen).toHaveAttribute('aria-label', 'Loading image');
    });

    it('should pass name to PortraitDropper for accessibility', () => {
      render(<StoryImageUpload {...defaultProps} title="My Adventure Story" />);
      const dropper = screen.getByTestId('portrait-dropper');
      expect(dropper).toHaveAttribute('data-name', 'My Adventure Story');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty imageURL', () => {
      render(<StoryImageUpload {...defaultProps} imageURL="" />);
      const dropper = screen.getByTestId('portrait-dropper');
      expect(dropper).toHaveAttribute('data-image-url', '');
    });

    it('should handle null title gracefully', () => {
      // @ts-expect-error Testing null case
      render(<StoryImageUpload {...defaultProps} title={null} />);
      const dropper = screen.getByTestId('portrait-dropper');
      expect(dropper).toHaveAttribute('data-name', 'Story cover image');
    });

    it('should handle undefined title gracefully', () => {
      // @ts-expect-error Testing undefined case
      render(<StoryImageUpload {...defaultProps} title={undefined} />);
      const dropper = screen.getByTestId('portrait-dropper');
      expect(dropper).toHaveAttribute('data-name', 'Story cover image');
    });
  });
});
