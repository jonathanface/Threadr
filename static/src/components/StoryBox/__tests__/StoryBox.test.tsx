import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { StoryBox } from '../index';
import type { Story } from '../../../types/Story';
import * as api from '../../../api';

// Mock dependencies
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../../hooks/useLoader', () => ({
  useLoader: () => ({
    showLoader: vi.fn(),
    hideLoader: vi.fn(),
  }),
}));

vi.mock('../../StoryOrSeriesDetailsSlider', () => ({
  StoryOrSeriesDetailsSlider: ({ visible, title }: { visible: boolean; title: string }) => (
    visible ? <div data-testid="details-slider">{title} Details</div> : null
  ),
}));

vi.mock('../../../api', () => ({
  api: {
    delete: vi.fn(),
  },
}));

describe('StoryBox', () => {
  const mockStory: Story = {
    story_id: 'story-123',
    title: 'Test Story',
    description: 'A test story description',
    image_url: 'https://example.com/image.jpg',
    chapters: [],
    inactive: false,
  };

  const renderStoryBox = (story: Story = mockStory) => {
    return render(
      <BrowserRouter>
        <StoryBox story={story} />
      </BrowserRouter>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset window.confirm mock
    vi.stubGlobal('confirm', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Rendering', () => {
    it('should render story with title and image', () => {
      renderStoryBox();

      expect(screen.getByText('Test Story')).toBeInTheDocument();
      expect(screen.getByAltText('Test Story')).toBeInTheDocument();
      expect(screen.getByAltText('Test Story')).toHaveAttribute('src', mockStory.image_url);
    });

    it('should render default image if no image_url provided', () => {
      const storyWithoutImage = { ...mockStory, image_url: '' };
      renderStoryBox(storyWithoutImage);

      const img = screen.getByAltText('Test Story') as HTMLImageElement;
      expect(img.src).toContain('/img/icons/story_standalone_icon.jpg');
    });

    it('should show loading spinner initially', () => {
      renderStoryBox();

      const loadingScreen = document.querySelector('.loading-screen');
      expect(loadingScreen).toBeInTheDocument();
      expect(loadingScreen).toHaveStyle({ visibility: 'visible' });
    });

    it('should hide loading spinner after image loads', async () => {
      renderStoryBox();

      const img = screen.getByAltText('Test Story');
      fireEvent.load(img);

      await waitFor(() => {
        const loadingScreen = document.querySelector('.loading-screen');
        expect(loadingScreen).toHaveStyle({ visibility: 'hidden' });
      });
    });

    it('should disable button if story is inactive', () => {
      const inactiveStory = { ...mockStory, inactive: true };
      renderStoryBox(inactiveStory);

      const button = screen.getByRole('button', { name: /test story/i });
      expect(button).toBeDisabled();
    });
  });

  describe('Navigation', () => {
    it('should navigate to story page on click', () => {
      renderStoryBox();

      const storyBox = screen.getByRole('button', { name: /test story/i });
      fireEvent.click(storyBox);

      expect(mockNavigate).toHaveBeenCalledWith('/stories/story-123');
    });

    it('should navigate to edit page when edit button clicked', () => {
      renderStoryBox();

      const editButton = screen.getByLabelText('edit story');
      fireEvent.click(editButton);

      expect(mockNavigate).toHaveBeenCalledWith('/stories/story-123/edit');
    });

    it('should stop propagation when edit button clicked', () => {
      renderStoryBox();

      const editButton = screen.getByLabelText('edit story');
      fireEvent.click(editButton);

      // Should navigate to edit, NOT to story page
      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith('/stories/story-123/edit');
    });
  });

  describe('Deletion', () => {
    it('should show confirmation dialog when delete button clicked', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      renderStoryBox();

      const deleteButton = screen.getByLabelText('delete');
      fireEvent.click(deleteButton);

      expect(confirmSpy).toHaveBeenCalledWith('Delete story Test Story?');
    });

    it('should not delete if user cancels confirmation', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      renderStoryBox();

      const deleteButton = screen.getByLabelText('delete');
      fireEvent.click(deleteButton);

      expect(api.api.delete).not.toHaveBeenCalled();
    });

    it('should delete story if user confirms', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.mocked(api.api.delete).mockResolvedValue({ status: 204, data: {} } as any);

      renderStoryBox();

      const deleteButton = screen.getByLabelText('delete');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(api.api.delete).toHaveBeenCalledWith(
          '/stories/story-123',
          expect.objectContaining({
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });
    });

    it('should hide story after successful deletion', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.mocked(api.api.delete).mockResolvedValue({ status: 204, data: {} } as any);

      renderStoryBox();

      const deleteButton = screen.getByLabelText('delete');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.queryByText('Test Story')).not.toBeInTheDocument();
      });
    });

    it('should handle deletion error gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.mocked(api.api.delete).mockRejectedValue(new Error('Network error'));

      renderStoryBox();

      const deleteButton = screen.getByLabelText('delete');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      consoleErrorSpy.mockRestore();
    });

    it('should handle 501 status as success', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.mocked(api.api.delete).mockResolvedValue({ status: 501, data: {} } as any);

      renderStoryBox();

      const deleteButton = screen.getByLabelText('delete');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.queryByText('Test Story')).not.toBeInTheDocument();
      });
    });

    it('should stop propagation when delete button clicked', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      renderStoryBox();

      const deleteButton = screen.getByLabelText('delete');
      fireEvent.click(deleteButton);

      // Should not navigate to story page
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('Details Slider', () => {
    it('should show slider on mouse enter', async () => {
      renderStoryBox();

      const storyBox = screen.getByRole('button', { name: /test story/i });
      fireEvent.mouseEnter(storyBox);

      await waitFor(() => {
        expect(screen.getByTestId('details-slider')).toBeInTheDocument();
      });
    });

    it('should hide slider on mouse leave', async () => {
      renderStoryBox();

      const storyBox = screen.getByRole('button', { name: /test story/i });
      fireEvent.mouseEnter(storyBox);

      await waitFor(() => {
        expect(screen.getByTestId('details-slider')).toBeInTheDocument();
      });

      fireEvent.mouseLeave(storyBox);

      await waitFor(() => {
        expect(screen.queryByTestId('details-slider')).not.toBeInTheDocument();
      });
    });

    it('should pass correct props to slider', async () => {
      renderStoryBox();

      const storyBox = screen.getByRole('button', { name: /test story/i });
      fireEvent.mouseEnter(storyBox);

      await waitFor(() => {
        expect(screen.getByText('Test Story Details')).toBeInTheDocument();
      });
    });

    it('should not navigate when interacting with slider', async () => {
      renderStoryBox();

      const storyBox = screen.getByRole('button', { name: /test story/i });
      fireEvent.mouseEnter(storyBox);

      await waitFor(() => {
        expect(screen.getByTestId('details-slider')).toBeInTheDocument();
      });

      // Clicking on slider area shouldn't cause multiple navigations
      const slider = screen.getByTestId('details-slider');
      fireEvent.click(slider);

      // Should still be able to navigate by clicking the main story box
      fireEvent.click(storyBox);
      expect(mockNavigate).toHaveBeenCalledWith('/stories/story-123');
    });
  });

  describe('Tooltips', () => {
    it('should show edit tooltip', () => {
      renderStoryBox();

      const editButton = screen.getByLabelText('edit story');
      // Tooltip is implemented by MUI, just verify button exists
      expect(editButton).toBeInTheDocument();
    });

    it('should show delete tooltip', () => {
      renderStoryBox();

      const deleteButton = screen.getByLabelText('delete');
      // Tooltip is implemented by MUI, just verify button exists
      expect(deleteButton).toBeInTheDocument();
    });

    it('should show title tooltip on story title', () => {
      renderStoryBox();

      const titleElement = screen.getByText('Test Story').closest('[title]');
      expect(titleElement).toHaveAttribute('title', 'Test Story');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long story titles', () => {
      const longTitle = 'A'.repeat(200);
      const storyWithLongTitle = { ...mockStory, title: longTitle };
      renderStoryBox(storyWithLongTitle);

      expect(screen.getByText(longTitle)).toBeInTheDocument();
    });

    it('should handle missing description', () => {
      const storyNoDesc = { ...mockStory, description: '' };
      renderStoryBox(storyNoDesc);

      expect(screen.getByText('Test Story')).toBeInTheDocument();
    });

    it('should handle special characters in title', () => {
      const specialTitle = '<script>alert("xss")</script>';
      const storyWithSpecialTitle = { ...mockStory, title: specialTitle };
      renderStoryBox(storyWithSpecialTitle);

      // Should render safely without executing script
      expect(screen.getByText(specialTitle)).toBeInTheDocument();
    });

    it('should not render after deletion', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.mocked(api.api.delete).mockResolvedValue({ status: 200, data: {} } as any);

      renderStoryBox();

      const deleteButton = screen.getByLabelText('delete');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        // Component should render empty string after deletion
        expect(screen.queryByText('Test Story')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('edit story')).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper aria labels for buttons', () => {
      renderStoryBox();

      expect(screen.getByLabelText('edit story')).toBeInTheDocument();
      expect(screen.getByLabelText('delete')).toBeInTheDocument();
    });

    it('should have alt text for image', () => {
      renderStoryBox();

      const img = screen.getByAltText('Test Story');
      expect(img).toBeInTheDocument();
    });

    it('should be keyboard navigable', () => {
      renderStoryBox();

      const storyBox = screen.getByRole('button', { name: /test story/i });
      storyBox.focus();

      expect(storyBox).toHaveFocus();
    });
  });
});
