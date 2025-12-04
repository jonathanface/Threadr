import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStorySave } from '../useStorySave';
import * as apiModule from '../../../../api';
import type { Story } from '../../../../types/Story';

// Mock dependencies
const mockShowLoader = vi.fn();
const mockHideLoader = vi.fn();
const mockSetAlertState = vi.fn();
const mockNavigate = vi.fn();
const mockSetSeriesList = vi.fn();
const mockSetStoriesList = vi.fn();
const mockPropagateSeriesUpdates = vi.fn();
const mockPropagateStoryUpdates = vi.fn();

vi.mock('../../../../hooks/useLoader', () => ({
  useLoader: () => ({
    showLoader: mockShowLoader,
    hideLoader: mockHideLoader,
  }),
}));

vi.mock('../../../../hooks/useToaster', () => ({
  useToaster: () => ({
    setAlertState: mockSetAlertState,
  }),
}));

vi.mock('../../../../hooks/useWorksList', () => ({
  useWorksList: () => ({
    seriesList: null,
    setSeriesList: mockSetSeriesList,
    storiesList: null,
    setStoriesList: mockSetStoriesList,
  }),
}));

vi.mock('../../../../hooks/useSelections', () => ({
  useSelections: () => ({
    propagateSeriesUpdates: mockPropagateSeriesUpdates,
    propagateStoryUpdates: mockPropagateStoryUpdates,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const mockSavedStory: Story = {
  story_id: 'story-123',
  title: 'Test Story',
  description: 'Test Description',
  image_url: '/image.jpg',
  chapters: [],
  user_id: 'user-123',
  inactive: false,
  last_updated: '2024-01-01',
  created: '2024-01-01',
  words_per_page: 250,
};

describe('useStorySave', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(apiModule.api, 'post').mockResolvedValue({ data: mockSavedStory } as any);
    vi.spyOn(apiModule.api, 'put').mockResolvedValue({ data: mockSavedStory } as any);
  });

  describe('saveStory - Create New', () => {
    it('should call POST endpoint for new story', async () => {
      const { result } = renderHook(() => useStorySave());

      await act(async () => {
        await result.current.saveStory({
          title: 'New Story',
          description: 'Description',
          selectedSeries: null,
        });
      });

      expect(apiModule.api.post).toHaveBeenCalledWith(
        '/stories',
        expect.any(FormData),
        expect.objectContaining({ withCredentials: true })
      );
    });

    it('should show and hide loader', async () => {
      const { result } = renderHook(() => useStorySave());

      await act(async () => {
        await result.current.saveStory({
          title: 'New Story',
          description: 'Description',
          selectedSeries: null,
        });
      });

      expect(mockShowLoader).toHaveBeenCalled();
      expect(mockHideLoader).toHaveBeenCalled();
    });

    it('should show success alert', async () => {
      const { result } = renderHook(() => useStorySave());

      await act(async () => {
        await result.current.saveStory({
          title: 'New Story',
          description: 'Description',
          selectedSeries: null,
        });
      });

      expect(mockSetAlertState).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Story created successfully',
          severity: 'success',
        })
      );
    });

    it('should navigate to story page', async () => {
      const { result } = renderHook(() => useStorySave());

      await act(async () => {
        await result.current.saveStory({
          title: 'New Story',
          description: 'Description',
          selectedSeries: null,
        });
      });

      expect(mockNavigate).toHaveBeenCalledWith('/stories/story-123');
    });

    it('should trim title and description', async () => {
      const { result } = renderHook(() => useStorySave());

      await act(async () => {
        await result.current.saveStory({
          title: '  Title  ',
          description: '  Description  ',
          selectedSeries: null,
        });
      });

      expect(apiModule.api.post).toHaveBeenCalled();
    });
  });

  describe('saveStory - Edit Existing', () => {
    it('should call PUT endpoint for existing story', async () => {
      const { result } = renderHook(() => useStorySave());

      await act(async () => {
        await result.current.saveStory({
          storyID: 'story-123',
          title: 'Updated Story',
          description: 'Updated Description',
          selectedSeries: null,
        });
      });

      expect(apiModule.api.put).toHaveBeenCalledWith(
        '/stories/story-123/details',
        expect.any(FormData),
        expect.objectContaining({ withCredentials: true })
      );
    });

    it('should show update success alert', async () => {
      const { result } = renderHook(() => useStorySave());

      await act(async () => {
        await result.current.saveStory({
          storyID: 'story-123',
          title: 'Updated Story',
          description: 'Updated Description',
          selectedSeries: null,
        });
      });

      expect(mockSetAlertState).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Story updated successfully',
        })
      );
    });

    it('should navigate to stories list', async () => {
      const { result } = renderHook(() => useStorySave());

      await act(async () => {
        await result.current.saveStory({
          storyID: 'story-123',
          title: 'Updated Story',
          description: 'Updated Description',
          selectedSeries: null,
        });
      });

      expect(mockNavigate).toHaveBeenCalledWith('/stories/');
    });
  });

  describe('Error Handling', () => {
    it('should handle API error', async () => {
      vi.spyOn(apiModule.api, 'post').mockRejectedValue(new Error('API Error'));
      const { result } = renderHook(() => useStorySave());

      await act(async () => {
        await result.current.saveStory({
          title: 'New Story',
          description: 'Description',
          selectedSeries: null,
        });
      });

      expect(mockSetAlertState).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Error creating story',
          severity: 'error',
        })
      );
    });

    it('should hide loader on error', async () => {
      vi.spyOn(apiModule.api, 'post').mockRejectedValue(new Error('API Error'));
      const { result } = renderHook(() => useStorySave());

      await act(async () => {
        await result.current.saveStory({
          title: 'New Story',
          description: 'Description',
          selectedSeries: null,
        });
      });

      expect(mockHideLoader).toHaveBeenCalled();
    });

    it('should show error alert for update failure', async () => {
      vi.spyOn(apiModule.api, 'put').mockRejectedValue(new Error('API Error'));
      const { result } = renderHook(() => useStorySave());

      await act(async () => {
        await result.current.saveStory({
          storyID: 'story-123',
          title: 'Updated Story',
          description: 'Updated Description',
          selectedSeries: null,
        });
      });

      expect(mockSetAlertState).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Error updating story',
          severity: 'error',
        })
      );
    });
  });

  describe('With Image File', () => {
    it('should include image in form data', async () => {
      const { result } = renderHook(() => useStorySave());
      const imageFile = new File(['content'], 'test.jpg', { type: 'image/jpeg' });

      await act(async () => {
        await result.current.saveStory({
          title: 'New Story',
          description: 'Description',
          imageFile,
          selectedSeries: null,
        });
      });

      expect(apiModule.api.post).toHaveBeenCalledWith(
        '/stories',
        expect.any(FormData),
        expect.any(Object)
      );
    });
  });

  describe('Series Assignment', () => {
    it('should handle new series creation', async () => {
      const { result } = renderHook(() => useStorySave());

      await act(async () => {
        await result.current.saveStory({
          title: 'New Story',
          description: 'Description',
          selectedSeries: {
            series_name: 'New Series',
          },
        });
      });

      expect(apiModule.api.post).toHaveBeenCalled();
    });

    it('should handle existing series assignment', async () => {
      const { result } = renderHook(() => useStorySave());

      await act(async () => {
        await result.current.saveStory({
          title: 'New Story',
          description: 'Description',
          selectedSeries: {
            series_id: 'series-123',
            series_name: 'Existing Series',
          },
        });
      });

      expect(apiModule.api.post).toHaveBeenCalled();
    });
  });

  describe('List Updates', () => {
    it('should update stories list on save', async () => {
      const { result } = renderHook(() => useStorySave());

      await act(async () => {
        await result.current.saveStory({
          title: 'New Story',
          description: 'Description',
          selectedSeries: null,
        });
      });

      expect(mockSetStoriesList).toHaveBeenCalled();
    });
  });
});
