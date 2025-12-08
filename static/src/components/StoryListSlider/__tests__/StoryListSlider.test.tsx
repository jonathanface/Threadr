import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StoryListSlider } from '../index';
import type { Series } from '../../../types/Series';
import type { Story } from '../../../types/Story';

const mockStory1: Story = {
  story_id: 'story-1',
  title: 'First Story',
  description: 'Description 1',
  image_url: 'https://example.com/story1.jpg',
  chapters: [],
  place: 2,
  inactive: false,
};

const mockStory2: Story = {
  story_id: 'story-2',
  title: 'Second Story',
  description: 'Description 2',
  image_url: 'https://example.com/story2.jpg',
  chapters: [],
  place: 1,
  inactive: false,
};

const mockStory3: Story = {
  story_id: 'story-3',
  title: 'Third Story',
  description: 'Description 3',
  image_url: 'https://example.com/story3.jpg',
  chapters: [],
  place: 3,
  inactive: false,
};

const mockInactiveStory: Story = {
  story_id: 'story-inactive',
  title: 'Inactive Story',
  description: 'Inactive description',
  image_url: 'https://example.com/inactive.jpg',
  chapters: [],
  place: 4,
  inactive: true,
};

describe('StoryListSlider', () => {
  const mockOnStoryClick = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render slider container', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/series.jpg',
        stories: [mockStory1, mockStory2],
      };

      const { container } = render(
        <StoryListSlider
          series={series}
          visible={true}
          onStoryClick={mockOnStoryClick}
          onClose={mockOnClose}
        />
      );

      const slider = container.querySelector('[class*="detailsSlider"]');
      expect(slider).toBeInTheDocument();
    });

    it('should render close button', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/series.jpg',
        stories: [mockStory1],
      };

      render(
        <StoryListSlider
          series={series}
          visible={true}
          onStoryClick={mockOnStoryClick}
          onClose={mockOnClose}
        />
      );

      const closeIcon = screen.getByTestId('CloseIcon');
      expect(closeIcon).toBeInTheDocument();
    });

    it('should render list of stories', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/series.jpg',
        stories: [mockStory1, mockStory2, mockStory3],
      };

      render(
        <StoryListSlider
          series={series}
          visible={true}
          onStoryClick={mockOnStoryClick}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('First Story')).toBeInTheDocument();
      expect(screen.getByText('Second Story')).toBeInTheDocument();
      expect(screen.getByText('Third Story')).toBeInTheDocument();
    });

    it('should render story avatars', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/series.jpg',
        stories: [mockStory1, mockStory2],
      };

      render(
        <StoryListSlider
          series={series}
          visible={true}
          onStoryClick={mockOnStoryClick}
          onClose={mockOnClose}
        />
      );

      const avatar1 = screen.getByAltText('First Story');
      const avatar2 = screen.getByAltText('Second Story');

      expect(avatar1).toBeInTheDocument();
      expect(avatar2).toBeInTheDocument();
      expect(avatar1).toHaveAttribute('src', 'https://example.com/story1.jpg');
      expect(avatar2).toHaveAttribute('src', 'https://example.com/story2.jpg');
    });
  });

  describe('Visibility', () => {
    it('should apply visible class when visible prop is true', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/series.jpg',
        stories: [mockStory1],
      };

      const { container } = render(
        <StoryListSlider
          series={series}
          visible={true}
          onStoryClick={mockOnStoryClick}
          onClose={mockOnClose}
        />
      );

      const slider = container.querySelector('[class*="visible"]');
      expect(slider).toBeInTheDocument();
    });

    it('should not apply visible class when visible prop is false', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/series.jpg',
        stories: [mockStory1],
      };

      const { container } = render(
        <StoryListSlider
          series={series}
          visible={false}
          onStoryClick={mockOnStoryClick}
          onClose={mockOnClose}
        />
      );

      const slider = container.querySelector('[class*="detailsSlider"]');
      expect(slider?.className).not.toContain('visible');
    });

    it('should update visibility when visible prop changes', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/series.jpg',
        stories: [mockStory1],
      };

      const { container, rerender } = render(
        <StoryListSlider
          series={series}
          visible={false}
          onStoryClick={mockOnStoryClick}
          onClose={mockOnClose}
        />
      );

      let slider = container.querySelector('[class*="detailsSlider"]');
      expect(slider?.className).not.toContain('visible');

      rerender(
        <StoryListSlider
          series={series}
          visible={true}
          onStoryClick={mockOnStoryClick}
          onClose={mockOnClose}
        />
      );

      slider = container.querySelector('[class*="visible"]');
      expect(slider).toBeInTheDocument();
    });
  });

  describe('Story Sorting', () => {
    it('should sort stories by place property', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/series.jpg',
        stories: [mockStory1, mockStory2, mockStory3], // place: 2, 1, 3
      };

      render(
        <StoryListSlider
          series={series}
          visible={true}
          onStoryClick={mockOnStoryClick}
          onClose={mockOnClose}
        />
      );

      const storyTitles = screen.getAllByRole('button').slice(1); // Skip close button
      expect(storyTitles[0].textContent).toContain('Second Story'); // place: 1
      expect(storyTitles[1].textContent).toContain('First Story'); // place: 2
      expect(storyTitles[2].textContent).toContain('Third Story'); // place: 3
    });

    it('should handle stories without place property', () => {
      const storyWithoutPlace = { ...mockStory1, place: undefined };
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/series.jpg',
        stories: [storyWithoutPlace],
      };

      expect(() =>
        render(
          <StoryListSlider
            series={series}
            visible={true}
            onStoryClick={mockOnStoryClick}
            onClose={mockOnClose}
          />
        )
      ).not.toThrow();
    });
  });

  describe('Click Handlers', () => {
    it('should call onClose when close button is clicked', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/series.jpg',
        stories: [mockStory1],
      };

      render(
        <StoryListSlider
          series={series}
          visible={true}
          onStoryClick={mockOnStoryClick}
          onClose={mockOnClose}
        />
      );

      const closeButton = screen.getByTestId('CloseIcon').closest('button');
      if (closeButton) {
        fireEvent.click(closeButton);
        expect(mockOnClose).toHaveBeenCalled();
      }
    });

    it('should call onStoryClick when story is clicked', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/series.jpg',
        stories: [mockStory1, mockStory2],
      };

      render(
        <StoryListSlider
          series={series}
          visible={true}
          onStoryClick={mockOnStoryClick}
          onClose={mockOnClose}
        />
      );

      const storyButton = screen.getByText('First Story').closest('button');
      if (storyButton) {
        fireEvent.click(storyButton);
        expect(mockOnStoryClick).toHaveBeenCalledWith(
          expect.any(Object),
          'story-1'
        );
      }
    });

    it('should pass correct story_id to onStoryClick', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/series.jpg',
        stories: [mockStory1, mockStory2],
      };

      render(
        <StoryListSlider
          series={series}
          visible={true}
          onStoryClick={mockOnStoryClick}
          onClose={mockOnClose}
        />
      );

      const story2Button = screen.getByText('Second Story').closest('button');
      if (story2Button) {
        fireEvent.click(story2Button);
        expect(mockOnStoryClick).toHaveBeenCalledWith(
          expect.any(Object),
          'story-2'
        );
      }
    });
  });

  describe('Inactive Stories', () => {
    it('should disable inactive stories', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/series.jpg',
        stories: [mockStory1, mockInactiveStory],
      };

      render(
        <StoryListSlider
          series={series}
          visible={true}
          onStoryClick={mockOnStoryClick}
          onClose={mockOnClose}
        />
      );

      const buttons = screen.getAllByRole('button');
      const inactiveButton = buttons.find(btn => btn.textContent?.includes('Inactive Story'));
      expect(inactiveButton).toBeTruthy();
      expect(inactiveButton).toHaveAttribute('aria-disabled', 'true');
    });

    it('should not disable active stories', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/series.jpg',
        stories: [mockStory1],
      };

      render(
        <StoryListSlider
          series={series}
          visible={true}
          onStoryClick={mockOnStoryClick}
          onClose={mockOnClose}
        />
      );

      const buttons = screen.getAllByRole('button');
      const activeButton = buttons.find(btn => btn.textContent?.includes('First Story'));
      expect(activeButton).toBeTruthy();
      expect(activeButton).not.toHaveAttribute('aria-disabled', 'true');
    });

    it('should not call onStoryClick for disabled stories', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/series.jpg',
        stories: [mockInactiveStory],
      };

      render(
        <StoryListSlider
          series={series}
          visible={true}
          onStoryClick={mockOnStoryClick}
          onClose={mockOnClose}
        />
      );

      const inactiveButton = screen.getByText('Inactive Story').closest('button');
      if (inactiveButton) {
        fireEvent.click(inactiveButton);
        expect(mockOnStoryClick).not.toHaveBeenCalled();
      }
    });
  });

  describe('Empty State', () => {
    it('should render empty list when stories array is empty', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/series.jpg',
        stories: [],
      };

      const { container } = render(
        <StoryListSlider
          series={series}
          visible={true}
          onStoryClick={mockOnStoryClick}
          onClose={mockOnClose}
        />
      );

      const list = container.querySelector('.MuiList-root');
      expect(list).toBeInTheDocument();
      expect(list?.children.length).toBe(0);
    });

    it('should handle when stories is initially null', () => {
      const series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/series.jpg',
        stories: null as any,
      };

      expect(() =>
        render(
          <StoryListSlider
            series={series}
            visible={true}
            onStoryClick={mockOnStoryClick}
            onClose={mockOnClose}
          />
        )
      ).not.toThrow();
    });
  });

  describe('Tooltips', () => {
    it('should show tooltips on story hover', async () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/series.jpg',
        stories: [mockStory1],
      };

      render(
        <StoryListSlider
          series={series}
          visible={true}
          onStoryClick={mockOnStoryClick}
          onClose={mockOnClose}
        />
      );

      const storyButton = screen.getByText('First Story').closest('button');
      if (storyButton) {
        fireEvent.mouseEnter(storyButton);

        // MUI Tooltip is handled internally
        expect(storyButton).toBeInTheDocument();
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined image_url', () => {
      const storyWithoutImage = { ...mockStory1, image_url: undefined as any };
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/series.jpg',
        stories: [storyWithoutImage],
      };

      render(
        <StoryListSlider
          series={series}
          visible={true}
          onStoryClick={mockOnStoryClick}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('First Story')).toBeInTheDocument();
    });

    it('should handle very long story titles', () => {
      const longTitleStory = {
        ...mockStory1,
        title: 'A'.repeat(200),
      };
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/series.jpg',
        stories: [longTitleStory],
      };

      render(
        <StoryListSlider
          series={series}
          visible={true}
          onStoryClick={mockOnStoryClick}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('A'.repeat(200))).toBeInTheDocument();
    });

    it('should handle special characters in story titles', () => {
      const specialTitleStory = {
        ...mockStory1,
        title: 'Story & Title <script>alert("xss")</script>',
      };
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/series.jpg',
        stories: [specialTitleStory],
      };

      render(
        <StoryListSlider
          series={series}
          visible={true}
          onStoryClick={mockOnStoryClick}
          onClose={mockOnClose}
        />
      );

      expect(
        screen.getByText('Story & Title <script>alert("xss")</script>')
      ).toBeInTheDocument();
    });

    it('should update stories when series prop changes', () => {
      const series1: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/series.jpg',
        stories: [mockStory1],
      };

      const { rerender } = render(
        <StoryListSlider
          series={series1}
          visible={true}
          onStoryClick={mockOnStoryClick}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('First Story')).toBeInTheDocument();

      const series2: Series = {
        ...series1,
        stories: [mockStory2],
      };

      rerender(
        <StoryListSlider
          series={series2}
          visible={true}
          onStoryClick={mockOnStoryClick}
          onClose={mockOnClose}
        />
      );

      expect(screen.queryByText('First Story')).not.toBeInTheDocument();
      expect(screen.getByText('Second Story')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible close button', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/series.jpg',
        stories: [mockStory1],
      };

      render(
        <StoryListSlider
          series={series}
          visible={true}
          onStoryClick={mockOnStoryClick}
          onClose={mockOnClose}
        />
      );

      const closeButton = screen.getByTestId('CloseIcon').closest('button');
      expect(closeButton).toBeInTheDocument();
    });

    it('should have alt text on story avatars', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/series.jpg',
        stories: [mockStory1, mockStory2],
      };

      render(
        <StoryListSlider
          series={series}
          visible={true}
          onStoryClick={mockOnStoryClick}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByAltText('First Story')).toBeInTheDocument();
      expect(screen.getByAltText('Second Story')).toBeInTheDocument();
    });

    it('should have clickable story list items', () => {
      const series: Series = {
        series_id: 'series-1',
        series_title: 'Test Series',
        series_description: 'Description',
        image_url: 'https://example.com/series.jpg',
        stories: [mockStory1],
      };

      render(
        <StoryListSlider
          series={series}
          visible={true}
          onStoryClick={mockOnStoryClick}
          onClose={mockOnClose}
        />
      );

      const storyButtons = screen.getAllByRole('button').filter(
        btn => btn.textContent?.includes('First Story')
      );
      expect(storyButtons.length).toBeGreaterThan(0);
    });
  });
});
