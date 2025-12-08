import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AddStoryModal } from '../index';
import type { Story } from '../../../types/Story';

// Mock dependencies
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const mockStory1: Story = {
  story_id: 'story-1',
  title: 'First Story',
  description: 'Description of first story',
  image_url: 'https://example.com/story1.jpg',
  chapters: [],
  inactive: false,
};

const mockStory2: Story = {
  story_id: 'story-2',
  title: 'Second Story',
  description: 'Description of second story',
  image_url: 'https://example.com/story2.jpg',
  chapters: [],
  inactive: false,
};

describe('AddStoryModal', () => {
  const mockOnSelectStory = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render Add Story button when seriesID is provided', () => {
      render(
        <AddStoryModal
          availableStories={[]}
          onSelectStory={mockOnSelectStory}
          seriesID="series-123"
        />
      );

      expect(screen.getByText('Add Story')).toBeInTheDocument();
    });

    it('should not render anything when seriesID is undefined', () => {
      const { container } = render(
        <AddStoryModal
          availableStories={[]}
          onSelectStory={mockOnSelectStory}
          seriesID={undefined}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should not show dialog initially', () => {
      render(
        <AddStoryModal
          availableStories={[mockStory1]}
          onSelectStory={mockOnSelectStory}
          seriesID="series-123"
        />
      );

      expect(screen.queryByText('Select a Story to Add')).not.toBeInTheDocument();
    });
  });

  describe('Modal Open/Close', () => {
    it('should open dialog when Add Story button is clicked', async () => {
      render(
        <AddStoryModal
          availableStories={[mockStory1]}
          onSelectStory={mockOnSelectStory}
          seriesID="series-123"
        />
      );

      const button = screen.getByText('Add Story');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Select a Story to Add')).toBeInTheDocument();
      });
    });

    it('should close dialog when clicking outside', async () => {
      render(
        <AddStoryModal
          availableStories={[mockStory1]}
          onSelectStory={mockOnSelectStory}
          seriesID="series-123"
        />
      );

      const button = screen.getByText('Add Story');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Select a Story to Add')).toBeInTheDocument();
      });

      // Find the backdrop and click it
      const backdrop = document.querySelector('.MuiBackdrop-root');
      if (backdrop) {
        fireEvent.click(backdrop);
      }

      await waitFor(() => {
        expect(screen.queryByText('Select a Story to Add')).not.toBeInTheDocument();
      });
    });
  });

  describe('With Available Stories', () => {
    it('should display list of available stories', async () => {
      render(
        <AddStoryModal
          availableStories={[mockStory1, mockStory2]}
          onSelectStory={mockOnSelectStory}
          seriesID="series-123"
        />
      );

      const button = screen.getByText('Add Story');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('First Story')).toBeInTheDocument();
        expect(screen.getByText('Description of first story')).toBeInTheDocument();
        expect(screen.getByText('Second Story')).toBeInTheDocument();
        expect(screen.getByText('Description of second story')).toBeInTheDocument();
      });
    });

    it('should display story avatars', async () => {
      render(
        <AddStoryModal
          availableStories={[mockStory1]}
          onSelectStory={mockOnSelectStory}
          seriesID="series-123"
        />
      );

      const button = screen.getByText('Add Story');
      fireEvent.click(button);

      await waitFor(() => {
        const avatar = screen.getByAltText('First Story');
        expect(avatar).toBeInTheDocument();
        expect(avatar).toHaveAttribute('src', 'https://example.com/story1.jpg');
      });
    });

    it('should call onSelectStory when a story is clicked', async () => {
      render(
        <AddStoryModal
          availableStories={[mockStory1, mockStory2]}
          onSelectStory={mockOnSelectStory}
          seriesID="series-123"
        />
      );

      const button = screen.getByText('Add Story');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('First Story')).toBeInTheDocument();
      });

      const storyItem = screen.getByText('First Story');
      fireEvent.click(storyItem);

      expect(mockOnSelectStory).toHaveBeenCalledWith(mockStory1);
    });

    it('should close modal after selecting a story', async () => {
      render(
        <AddStoryModal
          availableStories={[mockStory1]}
          onSelectStory={mockOnSelectStory}
          seriesID="series-123"
        />
      );

      const button = screen.getByText('Add Story');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('First Story')).toBeInTheDocument();
      });

      const storyItem = screen.getByText('First Story');
      fireEvent.click(storyItem);

      await waitFor(() => {
        expect(screen.queryByText('Select a Story to Add')).not.toBeInTheDocument();
      });
    });

    it('should show Create New option when stories are available', async () => {
      render(
        <AddStoryModal
          availableStories={[mockStory1]}
          onSelectStory={mockOnSelectStory}
          seriesID="series-123"
        />
      );

      const button = screen.getByText('Add Story');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Create New')).toBeInTheDocument();
        expect(screen.getByText('Click here to create a new story for this series')).toBeInTheDocument();
      });
    });

    it('should navigate to series add page when Create New is clicked', async () => {
      render(
        <AddStoryModal
          availableStories={[mockStory1]}
          onSelectStory={mockOnSelectStory}
          seriesID="series-123"
        />
      );

      const button = screen.getByText('Add Story');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Create New')).toBeInTheDocument();
      });

      const createNewButton = screen.getByText('Create New');
      fireEvent.click(createNewButton);

      expect(mockNavigate).toHaveBeenCalledWith('/series/series-123/add');
    });

    it('should close modal after clicking Create New', async () => {
      render(
        <AddStoryModal
          availableStories={[mockStory1]}
          onSelectStory={mockOnSelectStory}
          seriesID="series-123"
        />
      );

      const button = screen.getByText('Add Story');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Create New')).toBeInTheDocument();
      });

      const createNewButton = screen.getByText('Create New');
      fireEvent.click(createNewButton);

      await waitFor(() => {
        expect(screen.queryByText('Select a Story to Add')).not.toBeInTheDocument();
      });
    });
  });

  describe('With No Available Stories', () => {
    it('should show no stories message when list is empty', async () => {
      render(
        <AddStoryModal
          availableStories={[]}
          onSelectStory={mockOnSelectStory}
          seriesID="series-123"
        />
      );

      const button = screen.getByText('Add Story');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('No existing stories available to add.')).toBeInTheDocument();
      });
    });

    it('should show Create New Story button when no stories available', async () => {
      render(
        <AddStoryModal
          availableStories={[]}
          onSelectStory={mockOnSelectStory}
          seriesID="series-123"
        />
      );

      const button = screen.getByText('Add Story');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Create New Story')).toBeInTheDocument();
      });
    });

    it('should navigate to new story page when Create New Story is clicked', async () => {
      render(
        <AddStoryModal
          availableStories={[]}
          onSelectStory={mockOnSelectStory}
          seriesID="series-123"
        />
      );

      const button = screen.getByText('Add Story');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Create New Story')).toBeInTheDocument();
      });

      const createButton = screen.getByText('Create New Story');
      fireEvent.click(createButton);

      expect(mockNavigate).toHaveBeenCalledWith('/stories/new');
    });

    it('should close modal after clicking Create New Story', async () => {
      render(
        <AddStoryModal
          availableStories={[]}
          onSelectStory={mockOnSelectStory}
          seriesID="series-123"
        />
      );

      const button = screen.getByText('Add Story');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Create New Story')).toBeInTheDocument();
      });

      const createButton = screen.getByText('Create New Story');
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(screen.queryByText('Select a Story to Add')).not.toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle story without image_url', async () => {
      const storyWithoutImage = { ...mockStory1, image_url: '' };

      render(
        <AddStoryModal
          availableStories={[storyWithoutImage]}
          onSelectStory={mockOnSelectStory}
          seriesID="series-123"
        />
      );

      const button = screen.getByText('Add Story');
      fireEvent.click(button);

      await waitFor(() => {
        // When no image, MUI Avatar shows a fallback PersonIcon
        expect(screen.getByTestId('PersonIcon')).toBeInTheDocument();
        expect(screen.getByText('First Story')).toBeInTheDocument();
      });
    });

    it('should handle story without description', async () => {
      const storyWithoutDesc = { ...mockStory1, description: '' };

      render(
        <AddStoryModal
          availableStories={[storyWithoutDesc]}
          onSelectStory={mockOnSelectStory}
          seriesID="series-123"
        />
      );

      const button = screen.getByText('Add Story');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('First Story')).toBeInTheDocument();
      });
    });

    it('should handle very long story titles', async () => {
      const longTitle = 'A'.repeat(200);
      const storyWithLongTitle = { ...mockStory1, title: longTitle };

      render(
        <AddStoryModal
          availableStories={[storyWithLongTitle]}
          onSelectStory={mockOnSelectStory}
          seriesID="series-123"
        />
      );

      const button = screen.getByText('Add Story');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText(longTitle)).toBeInTheDocument();
      });
    });

    it('should handle multiple rapid clicks on Add Story button', async () => {
      render(
        <AddStoryModal
          availableStories={[mockStory1]}
          onSelectStory={mockOnSelectStory}
          seriesID="series-123"
        />
      );

      const button = screen.getByText('Add Story');
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);

      // Should not crash
      await waitFor(() => {
        expect(screen.getByText('Select a Story to Add')).toBeInTheDocument();
      });
    });

    it('should handle seriesID as empty string', () => {
      const { container } = render(
        <AddStoryModal
          availableStories={[mockStory1]}
          onSelectStory={mockOnSelectStory}
          seriesID=""
        />
      );

      // Empty string is falsy, so should not render
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Accessibility', () => {
    it('should have proper dialog title', async () => {
      render(
        <AddStoryModal
          availableStories={[mockStory1]}
          onSelectStory={mockOnSelectStory}
          seriesID="series-123"
        />
      );

      const button = screen.getByText('Add Story');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Select a Story to Add')).toBeInTheDocument();
      });
    });

    it('should have alt text for story avatars', async () => {
      render(
        <AddStoryModal
          availableStories={[mockStory1, mockStory2]}
          onSelectStory={mockOnSelectStory}
          seriesID="series-123"
        />
      );

      const button = screen.getByText('Add Story');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByAltText('First Story')).toBeInTheDocument();
        expect(screen.getByAltText('Second Story')).toBeInTheDocument();
      });
    });

    it('should have clickable list items', async () => {
      render(
        <AddStoryModal
          availableStories={[mockStory1]}
          onSelectStory={mockOnSelectStory}
          seriesID="series-123"
        />
      );

      const button = screen.getByText('Add Story');
      fireEvent.click(button);

      await waitFor(() => {
        const storyItem = screen.getByText('First Story').closest('div[role="button"]');
        expect(storyItem).toBeInTheDocument();
      });
    });
  });
});
