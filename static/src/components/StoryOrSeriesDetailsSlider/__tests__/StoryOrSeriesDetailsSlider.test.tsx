import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { StoryOrSeriesDetailsSlider } from '../index';
import type { Story } from '../../../types/Story';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

const mockStory1: Story = {
  story_id: 'story-1',
  title: 'First Story',
  description: 'Description 1',
  image_url: 'https://example.com/story1.jpg',
  chapters: [],
  place: 2,
};

const mockStory2: Story = {
  story_id: 'story-2',
  title: 'Second Story',
  description: 'Description 2',
  image_url: 'https://example.com/story2.jpg',
  chapters: [],
  place: 1,
};

const mockStory3: Story = {
  story_id: 'story-3',
  title: 'Third Story',
  description: 'Description 3',
  image_url: 'https://example.com/story3.jpg',
  chapters: [],
  place: 3,
};

const mockStory4: Story = {
  story_id: 'story-4',
  title: 'Fourth Story',
  description: 'Description 4',
  image_url: 'https://example.com/story4.jpg',
  chapters: [],
  place: 4,
};

const mockStory5: Story = {
  story_id: 'story-5',
  title: 'Fifth Story',
  description: 'Description 5',
  image_url: 'https://example.com/story5.jpg',
  chapters: [],
  place: 5,
};

describe('StoryOrSeriesDetailsSlider', () => {
  const mockOnStoryClick = vi.fn();
  const mockOnShowMoreClick = vi.fn();
  const mockSetDeleted = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering for Story', () => {
    it('should render slider for story', () => {
      const { container } = render(
        <StoryOrSeriesDetailsSlider
          id="story-1"
          visible={true}
          isSeries={false}
          title="Test Story"
          description="Story description"
          setDeleted={mockSetDeleted}
        />
      );

      const slider = container.querySelector('[class*="detailsSlider"]');
      expect(slider).toBeInTheDocument();
    });

    it('should display story description', () => {
      render(
        <StoryOrSeriesDetailsSlider
          id="story-1"
          visible={true}
          isSeries={false}
          title="Test Story"
          description="My story description"
          setDeleted={mockSetDeleted}
        />
      );

      expect(screen.getByText('My story description')).toBeInTheDocument();
    });

    it('should not show series-specific content for story', () => {
      render(
        <StoryOrSeriesDetailsSlider
          id="story-1"
          visible={true}
          isSeries={false}
          title="Test Story"
          description="Description"
          setDeleted={mockSetDeleted}
        />
      );

      expect(screen.queryByText('Stories in this series:')).not.toBeInTheDocument();
    });
  });

  describe('Rendering for Series', () => {
    it('should render slider for series', () => {
      const { container } = render(
        <StoryOrSeriesDetailsSlider
          id="series-1"
          visible={true}
          isSeries={true}
          title="Test Series"
          description="Series description"
          stories={[mockStory1]}
          setDeleted={mockSetDeleted}
        />
      );

      const slider = container.querySelector('[class*="detailsSlider"]');
      expect(slider).toBeInTheDocument();
    });

    it('should display series description', () => {
      render(
        <StoryOrSeriesDetailsSlider
          id="series-1"
          visible={true}
          isSeries={true}
          title="Test Series"
          description="My series description"
          stories={[mockStory1]}
          setDeleted={mockSetDeleted}
        />
      );

      expect(screen.getByText('My series description')).toBeInTheDocument();
    });

    it('should show "Stories in this series:" label when has stories', () => {
      render(
        <StoryOrSeriesDetailsSlider
          id="series-1"
          visible={true}
          isSeries={true}
          title="Test Series"
          description="Description"
          stories={[mockStory1, mockStory2]}
          setDeleted={mockSetDeleted}
        />
      );

      expect(screen.getByText('Stories in this series:')).toBeInTheDocument();
    });

    it('should show separator when series has stories', () => {
      const { container } = render(
        <StoryOrSeriesDetailsSlider
          id="series-1"
          visible={true}
          isSeries={true}
          title="Test Series"
          description="Description"
          stories={[mockStory1]}
          setDeleted={mockSetDeleted}
        />
      );

      const separator = container.querySelector('hr');
      expect(separator).toBeInTheDocument();
    });

    it('should not show separator when series has no stories', () => {
      const { container } = render(
        <StoryOrSeriesDetailsSlider
          id="series-1"
          visible={true}
          isSeries={true}
          title="Test Series"
          description="Description"
          stories={[]}
          setDeleted={mockSetDeleted}
        />
      );

      const separator = container.querySelector('hr');
      expect(separator).not.toBeInTheDocument();
    });
  });

  describe('Description Handling', () => {
    it('should show "No description" when description is empty', () => {
      render(
        <StoryOrSeriesDetailsSlider
          id="story-1"
          visible={true}
          isSeries={false}
          title="Test Story"
          description=""
          setDeleted={mockSetDeleted}
        />
      );

      expect(screen.getByText('No description')).toBeInTheDocument();
    });

    it('should update description when prop changes', () => {
      const { rerender } = render(
        <StoryOrSeriesDetailsSlider
          id="story-1"
          visible={true}
          isSeries={false}
          title="Test Story"
          description="Initial description"
          setDeleted={mockSetDeleted}
        />
      );

      expect(screen.getByText('Initial description')).toBeInTheDocument();

      rerender(
        <StoryOrSeriesDetailsSlider
          id="story-1"
          visible={true}
          isSeries={false}
          title="Test Story"
          description="Updated description"
          setDeleted={mockSetDeleted}
        />
      );

      expect(screen.getByText('Updated description')).toBeInTheDocument();
    });
  });

  describe('Visibility', () => {
    it('should apply visible class when visible prop is true', () => {
      const { container } = render(
        <StoryOrSeriesDetailsSlider
          id="story-1"
          visible={true}
          isSeries={false}
          title="Test Story"
          description="Description"
          setDeleted={mockSetDeleted}
        />
      );

      const slider = container.querySelector('[class*="visible"]');
      expect(slider).toBeInTheDocument();
    });

    it('should not apply visible class when visible prop is false', () => {
      const { container } = render(
        <StoryOrSeriesDetailsSlider
          id="story-1"
          visible={false}
          isSeries={false}
          title="Test Story"
          description="Description"
          setDeleted={mockSetDeleted}
        />
      );

      const slider = container.querySelector('[class*="detailsSlider"]');
      expect(slider?.className).not.toContain('visible');
    });
  });

  describe('Story Avatars', () => {
    it('should render story avatars for series', () => {
      render(
        <StoryOrSeriesDetailsSlider
          id="series-1"
          visible={true}
          isSeries={true}
          title="Test Series"
          description="Description"
          stories={[mockStory1, mockStory2]}
          setDeleted={mockSetDeleted}
        />
      );

      const avatar1 = screen.getByAltText('First Story');
      const avatar2 = screen.getByAltText('Second Story');

      expect(avatar1).toBeInTheDocument();
      expect(avatar2).toBeInTheDocument();
    });

    it('should render story images in avatars', () => {
      render(
        <StoryOrSeriesDetailsSlider
          id="series-1"
          visible={true}
          isSeries={true}
          title="Test Series"
          description="Description"
          stories={[mockStory1]}
          setDeleted={mockSetDeleted}
        />
      );

      const avatar = screen.getByAltText('First Story');
      expect(avatar).toHaveAttribute('src', 'https://example.com/story1.jpg');
    });

    it('should call onStoryClick when avatar is clicked', () => {
      render(
        <StoryOrSeriesDetailsSlider
          id="series-1"
          visible={true}
          isSeries={true}
          title="Test Series"
          description="Description"
          stories={[mockStory1]}
          onStoryClick={mockOnStoryClick}
          setDeleted={mockSetDeleted}
        />
      );

      const avatar = screen.getByAltText('First Story');
      fireEvent.click(avatar);

      expect(mockOnStoryClick).toHaveBeenCalledWith(expect.any(Object), 'story-1');
    });

    it('should render all story avatars', () => {
      render(
        <StoryOrSeriesDetailsSlider
          id="series-1"
          visible={true}
          isSeries={true}
          title="Test Series"
          description="Description"
          stories={[mockStory1, mockStory2, mockStory3]}
          setDeleted={mockSetDeleted}
        />
      );

      const avatars = screen.getAllByRole('img');
      expect(avatars.length).toBe(3);
    });
  });

  describe('Avatar Group Surplus', () => {
    it('should show surplus button when more than 4 stories', () => {
      render(
        <StoryOrSeriesDetailsSlider
          id="series-1"
          visible={true}
          isSeries={true}
          title="Test Series"
          description="Description"
          stories={[mockStory1, mockStory2, mockStory3, mockStory4, mockStory5]}
          setDeleted={mockSetDeleted}
        />
      );

      const surplusButton = screen.getByTitle('Click for more');
      expect(surplusButton).toBeInTheDocument();
    });

    it('should call onShowMoreClick when surplus button is clicked', () => {
      render(
        <StoryOrSeriesDetailsSlider
          id="series-1"
          visible={true}
          isSeries={true}
          title="Test Series"
          description="Description"
          stories={[mockStory1, mockStory2, mockStory3, mockStory4, mockStory5]}
          onShowMoreClick={mockOnShowMoreClick}
          setDeleted={mockSetDeleted}
        />
      );

      const surplusButton = screen.getByTitle('Click for more');
      fireEvent.click(surplusButton);

      expect(mockOnShowMoreClick).toHaveBeenCalled();
    });

    it('should limit avatars to max 4', () => {
      render(
        <StoryOrSeriesDetailsSlider
          id="series-1"
          visible={true}
          isSeries={true}
          title="Test Series"
          description="Description"
          stories={[mockStory1, mockStory2, mockStory3, mockStory4, mockStory5]}
          setDeleted={mockSetDeleted}
        />
      );

      const avatars = screen.getAllByRole('img');
      // Should show 4 avatars, not 5
      expect(avatars.length).toBeLessThanOrEqual(4);
    });
  });

  describe('Empty States', () => {
    it('should show Create Story button when series has no stories', () => {
      render(
        <StoryOrSeriesDetailsSlider
          id="series-1"
          visible={true}
          isSeries={true}
          title="Test Series"
          description="Description"
          stories={[]}
          setDeleted={mockSetDeleted}
        />
      );

      expect(screen.getByText('Create Story')).toBeInTheDocument();
    });

    it('should show Create Story button when stories is undefined', () => {
      render(
        <StoryOrSeriesDetailsSlider
          id="series-1"
          visible={true}
          isSeries={true}
          title="Test Series"
          description="Description"
          setDeleted={mockSetDeleted}
        />
      );

      expect(screen.getByText('Create Story')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long descriptions', () => {
      const longDescription = 'A'.repeat(1000);
      render(
        <StoryOrSeriesDetailsSlider
          id="story-1"
          visible={true}
          isSeries={false}
          title="Test Story"
          description={longDescription}
          setDeleted={mockSetDeleted}
        />
      );

      expect(screen.getByText(longDescription)).toBeInTheDocument();
    });

    it('should handle special characters in description', () => {
      const specialDescription = 'Test & Description <script>alert("xss")</script>';
      render(
        <StoryOrSeriesDetailsSlider
          id="story-1"
          visible={true}
          isSeries={false}
          title="Test Story"
          description={specialDescription}
          setDeleted={mockSetDeleted}
        />
      );

      expect(screen.getByText(specialDescription)).toBeInTheDocument();
    });

    it('should handle stories without place property', () => {
      const storyWithoutPlace = { ...mockStory1, place: undefined };
      expect(() =>
        render(
          <StoryOrSeriesDetailsSlider
            id="series-1"
            visible={true}
            isSeries={true}
            title="Test Series"
            description="Description"
            stories={[storyWithoutPlace]}
            setDeleted={mockSetDeleted}
          />
        )
      ).not.toThrow();
    });

    it('should update when isSeries prop changes', () => {
      const { rerender } = render(
        <StoryOrSeriesDetailsSlider
          id="item-1"
          visible={true}
          isSeries={false}
          title="Test Item"
          description="Description"
          setDeleted={mockSetDeleted}
        />
      );

      expect(screen.queryByText('Stories in this series:')).not.toBeInTheDocument();

      rerender(
        <StoryOrSeriesDetailsSlider
          id="item-1"
          visible={true}
          isSeries={true}
          title="Test Item"
          description="Description"
          stories={[mockStory1]}
          setDeleted={mockSetDeleted}
        />
      );

      expect(screen.getByText('Stories in this series:')).toBeInTheDocument();
    });

    it('should handle undefined onStoryClick', () => {
      render(
        <StoryOrSeriesDetailsSlider
          id="series-1"
          visible={true}
          isSeries={true}
          title="Test Series"
          description="Description"
          stories={[mockStory1]}
          setDeleted={mockSetDeleted}
        />
      );

      const avatar = screen.getByAltText('First Story');
      expect(() => fireEvent.click(avatar)).not.toThrow();
    });

    it('should handle undefined onShowMoreClick', () => {
      render(
        <StoryOrSeriesDetailsSlider
          id="series-1"
          visible={true}
          isSeries={true}
          title="Test Series"
          description="Description"
          stories={[mockStory1, mockStory2, mockStory3, mockStory4, mockStory5]}
          setDeleted={mockSetDeleted}
        />
      );

      const surplusButton = screen.getByTitle('Click for more');
      expect(() => fireEvent.click(surplusButton)).not.toThrow();
    });
  });

  describe('Accessibility', () => {
    it('should have alt text on story avatars', () => {
      render(
        <StoryOrSeriesDetailsSlider
          id="series-1"
          visible={true}
          isSeries={true}
          title="Test Series"
          description="Description"
          stories={[mockStory1, mockStory2]}
          setDeleted={mockSetDeleted}
        />
      );

      expect(screen.getByAltText('First Story')).toBeInTheDocument();
      expect(screen.getByAltText('Second Story')).toBeInTheDocument();
    });

    it('should have title on surplus button', () => {
      render(
        <StoryOrSeriesDetailsSlider
          id="series-1"
          visible={true}
          isSeries={true}
          title="Test Series"
          description="Description"
          stories={[mockStory1, mockStory2, mockStory3, mockStory4, mockStory5]}
          setDeleted={mockSetDeleted}
        />
      );

      const surplusButton = screen.getByTitle('Click for more');
      expect(surplusButton).toHaveAttribute('title', 'Click for more');
    });

    it('should have proper button type for surplus button', () => {
      render(
        <StoryOrSeriesDetailsSlider
          id="series-1"
          visible={true}
          isSeries={true}
          title="Test Series"
          description="Description"
          stories={[mockStory1, mockStory2, mockStory3, mockStory4, mockStory5]}
          setDeleted={mockSetDeleted}
        />
      );

      const surplusButton = screen.getByTitle('Click for more');
      expect(surplusButton).toHaveAttribute('type', 'button');
    });
  });
});
