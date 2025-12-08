import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SeriesCompositeImage } from '../index';
import type { Series } from '../../../types/Series';
import type { Story } from '../../../types/Story';

const mockStory1: Story = {
  story_id: 'story-1',
  title: 'First Story',
  description: 'Description',
  image_url: 'https://example.com/story1.jpg',
  chapters: [],
  inactive: false,
};

const mockStory2: Story = {
  ...mockStory1,
  story_id: 'story-2',
  title: 'Second Story',
  image_url: 'https://example.com/story2.jpg',
};

const mockStory3: Story = {
  ...mockStory1,
  story_id: 'story-3',
  title: 'Third Story',
  image_url: 'https://example.com/story3.jpg',
};

const mockStory4: Story = {
  ...mockStory1,
  story_id: 'story-4',
  title: 'Fourth Story',
  image_url: 'https://example.com/story4.jpg',
};

const mockStory5: Story = {
  ...mockStory1,
  story_id: 'story-5',
  title: 'Fifth Story',
  image_url: 'https://example.com/story5.jpg',
};

describe('SeriesCompositeImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Custom Image Display', () => {
    it('should render custom series image when image_url is set', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/custom-series.jpg',
        stories: [],
      };

      render(<SeriesCompositeImage series={series} />);

      const img = screen.getByAltText('Test Series');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'https://example.com/custom-series.jpg');
    });

    it('should show SERIES badge with custom image', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/custom-series.jpg',
        stories: [],
      };

      render(<SeriesCompositeImage series={series} />);

      expect(screen.getByText('SERIES')).toBeInTheDocument();
    });

    it('should call onLoad when custom image loads', () => {
      const onLoad = vi.fn();
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/custom-series.jpg',
        stories: [],
      };

      render(<SeriesCompositeImage series={series} onLoad={onLoad} />);

      const img = screen.getByAltText('Test Series');
      fireEvent.load(img);

      expect(onLoad).toHaveBeenCalled();
    });

    it('should not call onLoad if not provided', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/custom-series.jpg',
        stories: [],
      };

      expect(() => render(<SeriesCompositeImage series={series} />)).not.toThrow();
    });
  });

  describe('Composite Image Display', () => {
    it('should render composite of story images when no custom image', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: '/img/icons/story_series_icon.jpg',
        stories: [mockStory1, mockStory2],
      };

      const { container } = render(<SeriesCompositeImage series={series} />);

      const composite = container.querySelector('[role="img"]');
      expect(composite).toBeInTheDocument();
      expect(composite).toHaveAttribute('aria-label', 'Test Series series composite');
    });

    it('should render up to 4 story images in composite', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: '/img/icons/story_series_icon.jpg',
        stories: [mockStory1, mockStory2, mockStory3, mockStory4, mockStory5],
      };

      const { container } = render(<SeriesCompositeImage series={series} />);

      const compositeImages = container.querySelectorAll('[style*="background-image"]');
      expect(compositeImages).toHaveLength(4);
    });

    it('should render 1 story image when only 1 story', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: '/img/icons/story_series_icon.jpg',
        stories: [mockStory1],
      };

      const { container } = render(<SeriesCompositeImage series={series} />);

      const compositeImages = container.querySelectorAll('[style*="background-image"]');
      expect(compositeImages).toHaveLength(1);
    });

    it('should render 2 story images when 2 stories', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: '/img/icons/story_series_icon.jpg',
        stories: [mockStory1, mockStory2],
      };

      const { container } = render(<SeriesCompositeImage series={series} />);

      const compositeImages = container.querySelectorAll('[style*="background-image"]');
      expect(compositeImages).toHaveLength(2);
    });

    it('should render 3 story images when 3 stories', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: '/img/icons/story_series_icon.jpg',
        stories: [mockStory1, mockStory2, mockStory3],
      };

      const { container } = render(<SeriesCompositeImage series={series} />);

      const compositeImages = container.querySelectorAll('[style*="background-image"]');
      expect(compositeImages).toHaveLength(3);
    });

    it('should set background images correctly', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: '/img/icons/story_series_icon.jpg',
        stories: [mockStory1, mockStory2],
      };

      const { container } = render(<SeriesCompositeImage series={series} />);

      const compositeImages = container.querySelectorAll('[style*="background-image"]');
      expect(compositeImages[0]).toHaveStyle({ backgroundImage: 'url(https://example.com/story1.jpg)' });
      expect(compositeImages[1]).toHaveStyle({ backgroundImage: 'url(https://example.com/story2.jpg)' });
    });

    it('should set title attributes on composite images', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: '/img/icons/story_series_icon.jpg',
        stories: [mockStory1, mockStory2],
      };

      const { container } = render(<SeriesCompositeImage series={series} />);

      const compositeImages = container.querySelectorAll('[style*="background-image"]');
      expect(compositeImages[0]).toHaveAttribute('title', 'First Story');
      expect(compositeImages[1]).toHaveAttribute('title', 'Second Story');
    });

    it('should call onLoad when first composite image loads', () => {
      const onLoad = vi.fn();
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: '/img/icons/story_series_icon.jpg',
        stories: [mockStory1, mockStory2],
      };

      const { container } = render(<SeriesCompositeImage series={series} onLoad={onLoad} />);

      // Find the hidden img element used for onLoad
      const hiddenImg = container.querySelector('img[style*="opacity: 0"]');
      expect(hiddenImg).toBeInTheDocument();

      if (hiddenImg) {
        fireEvent.load(hiddenImg);
        expect(onLoad).toHaveBeenCalled();
      }
    });

    it('should show SERIES badge with composite images', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: '/img/icons/story_series_icon.jpg',
        stories: [mockStory1, mockStory2],
      };

      render(<SeriesCompositeImage series={series} />);

      expect(screen.getByText('SERIES')).toBeInTheDocument();
    });
  });

  describe('Default Image Display', () => {
    it('should render default image when no custom image and no stories', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: '/img/icons/story_series_icon.jpg',
        stories: [],
      };

      render(<SeriesCompositeImage series={series} />);

      const img = screen.getByAltText('Test Series');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', '/img/icons/story_series_icon.jpg');
    });

    it('should show SERIES badge with default image', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: '/img/icons/story_series_icon.jpg',
        stories: [],
      };

      render(<SeriesCompositeImage series={series} />);

      expect(screen.getByText('SERIES')).toBeInTheDocument();
    });

    it('should call onLoad when default image loads', () => {
      const onLoad = vi.fn();
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: '/img/icons/story_series_icon.jpg',
        stories: [],
      };

      render(<SeriesCompositeImage series={series} onLoad={onLoad} />);

      const img = screen.getByAltText('Test Series');
      fireEvent.load(img);

      expect(onLoad).toHaveBeenCalled();
    });

    it('should use default image when image_url is undefined', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: '',
        stories: [],
      };

      render(<SeriesCompositeImage series={series} />);

      const img = screen.getByAltText('Test Series');
      expect(img).toHaveAttribute('src', '/img/icons/story_series_icon.jpg');
    });
  });

  describe('Edge Cases', () => {
    it('should handle series with empty title', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: '',
        series_description: 'Description',
        image_url: 'https://example.com/custom.jpg',
        stories: [],
      };

      render(<SeriesCompositeImage series={series} />);

      const img = screen.getByAltText('');
      expect(img).toBeInTheDocument();
    });

    it('should handle undefined stories array', () => {
      const series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: '/img/icons/story_series_icon.jpg',
        stories: undefined as any,
      };

      render(<SeriesCompositeImage series={series} />);

      // Should fall back to default image
      const img = screen.getByAltText('Test Series');
      expect(img).toHaveAttribute('src', '/img/icons/story_series_icon.jpg');
    });

    it('should handle stories with undefined image_url', () => {
      const storyWithoutImage = { ...mockStory1, image_url: undefined as any };
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: '/img/icons/story_series_icon.jpg',
        stories: [storyWithoutImage],
      };

      const { container } = render(<SeriesCompositeImage series={series} />);

      const compositeImages = container.querySelectorAll('[style*="background-image"]');
      expect(compositeImages).toHaveLength(1);
    });

    it('should handle very long series title', () => {
      const longTitle = 'A'.repeat(200);
      const series: Series = {
        series_id: 'series-1',
        series_title: longTitle,
        series_description: 'Description',
        image_url: 'https://example.com/custom.jpg',
        stories: [],
      };

      render(<SeriesCompositeImage series={series} />);

      const img = screen.getByAltText(longTitle);
      expect(img).toBeInTheDocument();
    });

    it('should handle special characters in series title', () => {
      const specialTitle = 'Test & Series <script>alert("xss")</script>';
      const series: Series = {
        series_id: 'series-1',
        series_title: specialTitle,
        series_description: 'Description',
        image_url: 'https://example.com/custom.jpg',
        stories: [],
      };

      render(<SeriesCompositeImage series={series} />);

      const img = screen.getByAltText(specialTitle);
      expect(img).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper alt text on custom image', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Accessible Series',
        series_description: 'Description',
        image_url: 'https://example.com/custom.jpg',
        stories: [],
      };

      render(<SeriesCompositeImage series={series} />);

      const img = screen.getByAltText('Accessible Series');
      expect(img).toBeInTheDocument();
    });

    it('should have role="img" on composite container', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: '/img/icons/story_series_icon.jpg',
        stories: [mockStory1, mockStory2],
      };

      const { container } = render(<SeriesCompositeImage series={series} />);

      const composite = container.querySelector('[role="img"]');
      expect(composite).toBeInTheDocument();
    });

    it('should have aria-label on composite container', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Accessible Composite',
        series_description: 'Description',
        image_url: '/img/icons/story_series_icon.jpg',
        stories: [mockStory1, mockStory2],
      };

      const { container } = render(<SeriesCompositeImage series={series} />);

      const composite = container.querySelector('[aria-label="Accessible Composite series composite"]');
      expect(composite).toBeInTheDocument();
    });

    it('should have title attributes for story images in composite', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: '/img/icons/story_series_icon.jpg',
        stories: [mockStory1, mockStory2, mockStory3],
      };

      const { container } = render(<SeriesCompositeImage series={series} />);

      const compositeImages = container.querySelectorAll('[title]');
      expect(compositeImages.length).toBeGreaterThan(0);
    });
  });

  describe('Series Badge', () => {
    it('should show SERIES badge with custom image', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Custom',
        series_description: 'Description',
        image_url: 'https://example.com/custom.jpg',
        stories: [],
      };

      render(<SeriesCompositeImage series={series} />);
      expect(screen.getByText('SERIES')).toBeInTheDocument();
    });

    it('should show SERIES badge with composite images', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Composite',
        series_description: 'Description',
        image_url: '/img/icons/story_series_icon.jpg',
        stories: [mockStory1, mockStory2],
      };

      render(<SeriesCompositeImage series={series} />);
      expect(screen.getByText('SERIES')).toBeInTheDocument();
    });

    it('should show SERIES badge with default image', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Default',
        series_description: 'Description',
        image_url: '/img/icons/story_series_icon.jpg',
        stories: [],
      };

      render(<SeriesCompositeImage series={series} />);
      expect(screen.getByText('SERIES')).toBeInTheDocument();
    });
  });
});
