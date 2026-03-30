import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { SeriesBox } from '../index';
import type { Series } from '../../../types/Series';
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

const mockSetStoriesList = vi.fn();
const mockSetSeriesList = vi.fn();
vi.mock('../../../hooks/useWorksList', () => ({
  useWorksList: () => ({
    storiesList: [],
    seriesList: [mockSeries],
    setStoriesList: mockSetStoriesList,
    setSeriesList: mockSetSeriesList,
  }),
}));

vi.mock('../../StoryOrSeriesDetailsSlider', () => ({
  StoryOrSeriesDetailsSlider: ({
    visible,
    title,
    onShowMoreClick
  }: {
    visible: boolean;
    title: string;
    onShowMoreClick?: (e: React.MouseEvent) => void;
  }) => (
    visible ? (
      <div data-testid="details-slider">
        {title} Details
        {onShowMoreClick && (
          <button onClick={onShowMoreClick}>Show More</button>
        )}
      </div>
    ) : null
  ),
}));

vi.mock('../../StoryListSlider', () => ({
  StoryListSlider: ({
    visible,
    onClose
  }: {
    visible: boolean;
    onClose: () => void;
  }) => (
    visible ? (
      <div data-testid="list-slider">
        Story List
        <button onClick={onClose}>Close</button>
      </div>
    ) : null
  ),
}));

vi.mock('../../SeriesCompositeImage', () => ({
  SeriesCompositeImage: ({
    series,
    onLoad
  }: {
    series: Series;
    onLoad: () => void;
  }) => (
    <div data-testid="composite-image" onClick={onLoad}>
      {series.series_title} Image
    </div>
  ),
}));

vi.mock('../../../api', () => ({
  api: {
    delete: vi.fn(),
  },
}));

const mockStory1: Story = {
  story_id: 'story-1',
  title: 'Story One',
  description: 'First story',
  image_url: '',
  chapters: [],
  inactive: false,
  series_id: 'series-123',
};

const mockStory2: Story = {
  story_id: 'story-2',
  title: 'Story Two',
  description: 'Second story',
  image_url: '',
  chapters: [],
  inactive: false,
  series_id: 'series-123',
};

const mockSeries: Series = {
  series_id: 'series-123',
  series_title: 'Test Series',
  series_description: 'A test series',
  image_url: 'https://example.com/series.jpg',
  stories: [mockStory1, mockStory2],
};

describe('SeriesBox', () => {
  const renderSeriesBox = (series: Series = mockSeries) => {
    return render(
      <BrowserRouter>
        <SeriesBox series={series} />
      </BrowserRouter>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Rendering', () => {
    it('should render series with title and composite image', () => {
      renderSeriesBox();
      expect(screen.getByText('Test Series')).toBeInTheDocument();
      expect(screen.getByTestId('composite-image')).toBeInTheDocument();
    });

    it('should show loading spinner initially', () => {
      renderSeriesBox();
      const loadingScreen = document.querySelector('.loading-screen');
      expect(loadingScreen).toBeInTheDocument();
    });

    it('should hide loading spinner after image loads', async () => {
      renderSeriesBox();
      const compositeImage = screen.getByTestId('composite-image');
      fireEvent.click(compositeImage); // Triggers onLoad

      await waitFor(() => {
        const loadingScreen = document.querySelector('.loading-screen');
        expect(loadingScreen).toHaveStyle({ visibility: 'hidden' });
      });
    });

    it('should render edit and delete buttons', () => {
      renderSeriesBox();
      expect(screen.getByLabelText('edit series')).toBeInTheDocument();
      expect(screen.getByLabelText('delete')).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should navigate to edit page when edit button clicked', () => {
      renderSeriesBox();
      const editButton = screen.getByLabelText('edit series');
      fireEvent.click(editButton);

      expect(mockNavigate).toHaveBeenCalledWith('/series/series-123/edit');
    });

    it('should stop propagation when edit button clicked', () => {
      renderSeriesBox();
      const editButton = screen.getByLabelText('edit series');
      fireEvent.click(editButton);

      expect(mockNavigate).toHaveBeenCalledTimes(1);
    });
  });

  describe('Deletion', () => {
    it('should show confirmation dialog with conversion warning', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      renderSeriesBox();
      const deleteButton = screen.getByLabelText('delete');
      fireEvent.click(deleteButton);

      expect(confirmSpy).toHaveBeenCalledWith(
        'Delete series Test Series? Any volumes assigned to it will be converted to standalone stories.'
      );
    });

    it('should not delete if user cancels', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      renderSeriesBox();
      const deleteButton = screen.getByLabelText('delete');
      fireEvent.click(deleteButton);

      expect(api.api.delete).not.toHaveBeenCalled();
    });

    it('should delete series if user confirms', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(api.api.delete).mockResolvedValue({ status: 200, data: {} } as any);


      renderSeriesBox();
      const deleteButton = screen.getByLabelText('delete');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(api.api.delete).toHaveBeenCalledWith(
          '/series/series-123',
          expect.objectContaining({
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });
    });

    it('should hide series after successful deletion', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(api.api.delete).mockResolvedValue({ status: 200, data: {} } as any);

      renderSeriesBox();
      const deleteButton = screen.getByLabelText('delete');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.queryByText('Test Series')).not.toBeInTheDocument();
      });
    });

    it('should convert series stories to standalone on deletion', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(api.api.delete).mockResolvedValue({ status: 200, data: {} } as any);


      renderSeriesBox();
      const deleteButton = screen.getByLabelText('delete');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(mockSetStoriesList).toHaveBeenCalled();
        const call = mockSetStoriesList.mock.calls[0][0];
        // Should contain the stories from the series
        expect(call).toHaveLength(2);
      });
    });

    it('should remove series from series list on deletion', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(api.api.delete).mockResolvedValue({ status: 200, data: {} } as any);


      renderSeriesBox();
      const deleteButton = screen.getByLabelText('delete');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(mockSetSeriesList).toHaveBeenCalled();
        const call = mockSetSeriesList.mock.calls[0][0];
        // Should be empty after removing the series
        expect(call).toHaveLength(0);
      });
    });

    it('should handle deletion error gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.mocked(api.api.delete).mockRejectedValue(new Error('Network error'));


      renderSeriesBox();
      const deleteButton = screen.getByLabelText('delete');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      consoleErrorSpy.mockRestore();
    });

    it('should handle 501 status as success', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(api.api.delete).mockResolvedValue({ status: 501, data: {} } as any);

      renderSeriesBox();
      const deleteButton = screen.getByLabelText('delete');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.queryByText('Test Series')).not.toBeInTheDocument();
      });
    });

    it('should stop propagation when delete button clicked', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      renderSeriesBox();
      const deleteButton = screen.getByLabelText('delete');
      fireEvent.click(deleteButton);

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('Details Slider', () => {
    it('should show details slider on mouse enter', async () => {
      const { container } = renderSeriesBox();
      const seriesBox = container.firstChild as HTMLElement;
      fireEvent.mouseEnter(seriesBox);

      await waitFor(() => {
        expect(screen.getByTestId('details-slider')).toBeInTheDocument();
      });
    });

    it('should hide details slider on mouse leave', async () => {
      const { container } = renderSeriesBox();
      const seriesBox = container.firstChild as HTMLElement;
      fireEvent.mouseEnter(seriesBox);

      await waitFor(() => {
        expect(screen.getByTestId('details-slider')).toBeInTheDocument();
      });

      fireEvent.mouseLeave(seriesBox);

      await waitFor(() => {
        expect(screen.queryByTestId('details-slider')).not.toBeInTheDocument();
      });
    });

    it('should show list slider when "Show More" clicked', async () => {
      const { container } = renderSeriesBox();
      const seriesBox = container.firstChild as HTMLElement;
      fireEvent.mouseEnter(seriesBox);

      await waitFor(() => {
        expect(screen.getByTestId('details-slider')).toBeInTheDocument();
      });

      const showMoreButton = screen.getByText('Show More');
      fireEvent.click(showMoreButton);

      await waitFor(() => {
        expect(screen.getByTestId('list-slider')).toBeInTheDocument();
      });
    });

    it('should hide details slider when list slider opens', async () => {
      const { container } = renderSeriesBox();
      const seriesBox = container.firstChild as HTMLElement;
      fireEvent.mouseEnter(seriesBox);

      await waitFor(() => {
        expect(screen.getByTestId('details-slider')).toBeInTheDocument();
      });

      const showMoreButton = screen.getByText('Show More');
      fireEvent.click(showMoreButton);

      await waitFor(() => {
        expect(screen.getByTestId('list-slider')).toBeInTheDocument();
        expect(screen.queryByTestId('details-slider')).not.toBeInTheDocument();
      });
    });

    it('should close list slider when close button clicked', async () => {
      const { container } = renderSeriesBox();
      const seriesBox = container.firstChild as HTMLElement;
      fireEvent.mouseEnter(seriesBox);

      const showMoreButton = await screen.findByText('Show More');
      fireEvent.click(showMoreButton);

      const listSlider = await screen.findByTestId('list-slider');
      expect(listSlider).toBeInTheDocument();

      const closeButton = screen.getByText('Close');
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByTestId('list-slider')).not.toBeInTheDocument();
      });
    });

    it('should not show details slider if list slider is already visible', async () => {
      const { container } = renderSeriesBox();
      const seriesBox = container.firstChild as HTMLElement;
      fireEvent.mouseEnter(seriesBox);

      const showMoreButton = await screen.findByText('Show More');
      fireEvent.click(showMoreButton);

      await waitFor(() => {
        expect(screen.getByTestId('list-slider')).toBeInTheDocument();
      });

      // Try to show details slider again
      fireEvent.mouseEnter(seriesBox);

      // Details slider should not appear
      expect(screen.queryByTestId('details-slider')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle series with no stories', () => {
      const emptySeriesStories: Series = {
        ...mockSeries,
        stories: [],
      };
      renderSeriesBox(emptySeriesStories);

      expect(screen.getByText('Test Series')).toBeInTheDocument();
    });

    it('should handle very long series titles', () => {
      const longTitle = 'A'.repeat(200);
      const longTitleSeries = { ...mockSeries, series_title: longTitle };
      renderSeriesBox(longTitleSeries);

      expect(screen.getByText(longTitle)).toBeInTheDocument();
    });

    it('should handle missing description', () => {
      const noDescSeries = { ...mockSeries, series_description: '' };
      renderSeriesBox(noDescSeries);

      expect(screen.getByText('Test Series')).toBeInTheDocument();
    });

    it('should handle special characters in title', () => {
      const specialTitle = '<script>alert("xss")</script>';
      const specialTitleSeries = { ...mockSeries, series_title: specialTitle };
      renderSeriesBox(specialTitleSeries);

      expect(screen.getByText(specialTitle)).toBeInTheDocument();
    });

    it('should not render after deletion', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(api.api.delete).mockResolvedValue({ status: 200, data: {} } as any);

      renderSeriesBox();
      const deleteButton = screen.getByLabelText('delete');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.queryByText('Test Series')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('edit series')).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper aria labels for buttons', () => {
      renderSeriesBox();
      expect(screen.getByLabelText('edit series')).toBeInTheDocument();
      expect(screen.getByLabelText('delete')).toBeInTheDocument();
    });

    it('should have meaningful text content', () => {
      renderSeriesBox();
      // Series title should be visible
      expect(screen.getByText('Test Series')).toBeInTheDocument();
    });
  });
});
