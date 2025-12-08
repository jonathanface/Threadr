import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StoryPreview } from '../StoryPreview';

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
      Portrait Mock
    </div>
  ),
}));

describe('StoryPreview', () => {
  const defaultProps = {
    title: 'My Story Title',
    description: 'This is a great story about adventure.',
    imageURL: '/story-image.jpg',
    selectedSeries: null,
    isImageLoading: false,
    onImageComplete: vi.fn(),
    onImageLoaded: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render without crashing', () => {
      render(<StoryPreview {...defaultProps} />);
      expect(screen.getByRole('region', { name: /story preview/i })).toBeInTheDocument();
    });

    it('should display preview title', () => {
      render(<StoryPreview {...defaultProps} />);
      expect(screen.getByText('Story Preview')).toBeInTheDocument();
    });

    it('should display story title', () => {
      render(<StoryPreview {...defaultProps} />);
      expect(screen.getByText('My Story Title')).toBeInTheDocument();
    });

    it('should display story description', () => {
      render(<StoryPreview {...defaultProps} />);
      expect(screen.getByText('This is a great story about adventure.')).toBeInTheDocument();
    });

    it('should render PortraitDropper', () => {
      render(<StoryPreview {...defaultProps} />);
      expect(screen.getByTestId('portrait-dropper')).toBeInTheDocument();
    });
  });

  describe('Default Content', () => {
    it('should show default title when title is empty', () => {
      render(<StoryPreview {...defaultProps} title="" />);
      expect(screen.getByText('Story Title')).toBeInTheDocument();
    });

    it('should show default description when description is empty', () => {
      render(<StoryPreview {...defaultProps} description="" />);
      expect(screen.getByText('Story description will appear here.')).toBeInTheDocument();
    });

    it('should use empty title as PortraitDropper name fallback', () => {
      render(<StoryPreview {...defaultProps} title="" />);
      const dropper = screen.getByTestId('portrait-dropper');
      expect(dropper).toHaveAttribute('data-name', 'Story cover image');
    });
  });

  describe('Series Display', () => {
    it('should not show series chip when no series selected', () => {
      render(<StoryPreview {...defaultProps} selectedSeries={null} />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('should show series chip when series is selected', () => {
      render(<StoryPreview {...defaultProps} selectedSeries={{
        series_id: 'series-123',
        series_name: 'My Series',
      }} />);
      expect(screen.getByText('My Series')).toBeInTheDocument();
    });

    it('should show series chip for new series (without id)', () => {
      render(<StoryPreview {...defaultProps} selectedSeries={{
        series_name: 'New Series',
      }} />);
      expect(screen.getByText('New Series')).toBeInTheDocument();
    });

    it('should have proper ARIA label on series chip', () => {
      render(<StoryPreview {...defaultProps} selectedSeries={{
        series_name: 'Adventure Series',
      }} />);
      const chip = screen.getByLabelText('Part of series: Adventure Series');
      expect(chip).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should hide loading screen when not loading', () => {
      render(<StoryPreview {...defaultProps} isImageLoading={false} />);
      const loadingScreen = screen.getByRole('status', { hidden: true });
      expect(loadingScreen).toHaveStyle({ visibility: 'hidden' });
    });

    it('should show loading screen when loading', () => {
      render(<StoryPreview {...defaultProps} isImageLoading={true} />);
      const loadingScreen = screen.getByRole('status', { hidden: true });
      expect(loadingScreen).toHaveStyle({ visibility: 'visible' });
    });

    it('should have proper ARIA labels for loading', () => {
      render(<StoryPreview {...defaultProps} isImageLoading={true} />);
      const loadingScreen = screen.getByRole('status', { hidden: true });
      expect(loadingScreen).toHaveAttribute('aria-label', 'Loading image');
      expect(loadingScreen).toHaveAttribute('aria-live', 'polite');
    });

    it('should render CircularProgress when loading', () => {
      render(<StoryPreview {...defaultProps} isImageLoading={true} />);
      expect(screen.getByLabelText('Loading')).toBeInTheDocument();
    });
  });

  describe('Image Handling', () => {
    it('should pass imageURL to PortraitDropper', () => {
      render(<StoryPreview {...defaultProps} imageURL="/custom-image.jpg" />);
      const dropper = screen.getByTestId('portrait-dropper');
      expect(dropper).toHaveAttribute('data-image-url', '/custom-image.jpg');
    });

    it('should pass title as name to PortraitDropper', () => {
      render(<StoryPreview {...defaultProps} title="Epic Tale" />);
      const dropper = screen.getByTestId('portrait-dropper');
      expect(dropper).toHaveAttribute('data-name', 'Epic Tale');
    });

    it('should call onImageComplete when image is uploaded', () => {
      const onImageComplete = vi.fn();
      render(<StoryPreview {...defaultProps} onImageComplete={onImageComplete} />);

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

    it('should pass onImageLoaded callback', () => {
      const onImageLoaded = vi.fn();
      render(<StoryPreview {...defaultProps} onImageLoaded={onImageLoaded} />);

      // The callback is passed to PortraitDropper
      const dropper = screen.getByTestId('portrait-dropper');
      expect(dropper).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper region role and label', () => {
      render(<StoryPreview {...defaultProps} />);
      const region = screen.getByRole('region', { name: /story preview/i });
      expect(region).toHaveAttribute('aria-label', 'Story preview');
    });

    it('should have proper ARIA label on title', () => {
      render(<StoryPreview {...defaultProps} />);
      const title = screen.getByLabelText('Story title preview');
      expect(title).toHaveTextContent('My Story Title');
    });

    it('should have proper ARIA label on description', () => {
      render(<StoryPreview {...defaultProps} />);
      const description = screen.getByLabelText('Story description preview');
      expect(description).toHaveTextContent('This is a great story about adventure.');
    });

    it('should have proper ARIA attributes on loading screen', () => {
      render(<StoryPreview {...defaultProps} isImageLoading={true} />);
      const loadingScreen = screen.getByRole('status', { hidden: true });
      expect(loadingScreen).toHaveAttribute('aria-live', 'polite');
      expect(loadingScreen).toHaveAttribute('aria-label', 'Loading image');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long titles', () => {
      const longTitle = 'A'.repeat(300);
      render(<StoryPreview {...defaultProps} title={longTitle} />);
      expect(screen.getByText(longTitle)).toBeInTheDocument();
    });

    it('should handle very long descriptions', () => {
      const longDesc = 'A'.repeat(6000);
      render(<StoryPreview {...defaultProps} description={longDesc} />);
      expect(screen.getByText(longDesc)).toBeInTheDocument();
    });

    it('should handle special characters in title', () => {
      const specialTitle = 'Story: "The <Adventure>" & More!';
      render(<StoryPreview {...defaultProps} title={specialTitle} />);
      expect(screen.getByText(specialTitle)).toBeInTheDocument();
    });

    it('should handle special characters in description', () => {
      const specialDesc = 'Description with <tags> & "quotes" and \' apostrophes';
      render(<StoryPreview {...defaultProps} description={specialDesc} />);
      expect(screen.getByText(specialDesc)).toBeInTheDocument();
    });

    it('should handle unicode characters', () => {
      render(<StoryPreview {...defaultProps} title="测试 🎭" description="العربية テスト" />);
      expect(screen.getByText('测试 🎭')).toBeInTheDocument();
      expect(screen.getByText('العربية テスト')).toBeInTheDocument();
    });

    it('should handle series with very long names', () => {
      const longSeriesName = 'A'.repeat(200);
      render(<StoryPreview {...defaultProps} selectedSeries={{
        series_name: longSeriesName,
      }} />);
      expect(screen.getByText(longSeriesName)).toBeInTheDocument();
    });

    it('should handle empty imageURL', () => {
      render(<StoryPreview {...defaultProps} imageURL="" />);
      const dropper = screen.getByTestId('portrait-dropper');
      expect(dropper).toHaveAttribute('data-image-url', '');
    });
  });

  describe('Card Structure', () => {
    it('should render as a Card component', () => {
      render(<StoryPreview {...defaultProps} />);
      const card = screen.getByRole('region');
      expect(card.closest('.MuiCard-root')).toBeInTheDocument();
    });

    it('should have card content section', () => {
      const { container } = render(<StoryPreview {...defaultProps} />);
      const cardContent = container.querySelector('.MuiCardContent-root');
      expect(cardContent).toBeInTheDocument();
    });
  });
});
