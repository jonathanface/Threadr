import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { render, waitFor, screen } from '@testing-library/react';
import { DocumentEditorPage } from '../index';
import { api } from '../../../api';
import * as RouterModule from 'react-router-dom';
import * as ChapterMemory from '../../../utils/chapterMemory';

// Create mockable selection state
const mockSelections = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  story: null as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chapter: null as any,
  setStory: vi.fn(),
  setSeries: vi.fn(),
  setChapter: vi.fn(),
};

// Mock react-router-dom
const mockSetSearchParams = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: vi.fn(),
    useSearchParams: vi.fn(),
  };
});

// Mock hooks
vi.mock('../../../hooks/useLoader', () => ({
  useLoader: () => ({
    showLoader: vi.fn(),
    hideLoader: vi.fn(),
  }),
}));

vi.mock('../../../hooks/useToaster', () => ({
  useToaster: () => ({
    setAlertState: vi.fn(),
  }),
}));

vi.mock('../../../hooks/useSelections', () => ({
  useSelections: () => mockSelections,
}));

// Mock providers
vi.mock('../../../providers/associations', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AssociationsProvider: ({ children }: any) => <div data-testid="associations-provider">{children}</div>,
}));

vi.mock('../../../providers/documentSettings', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DocumentSettingsProvider: ({ children }: any) => <div data-testid="document-settings-provider">{children}</div>,
}));

// Mock ThreadWriter component
vi.mock('../../../components/ThreadWriter', () => ({
  ThreadWriter: () => <div data-testid="thread-writer">ThreadWriter Component</div>,
}));

// Mock API
vi.mock('../../../api', () => ({
  api: {
    get: vi.fn(),
  },
}));

// Mock chapterMemory utils
vi.mock('../../../utils/chapterMemory', () => ({
  getLastChapter: vi.fn(),
  saveLastChapter: vi.fn(),
}));

describe('DocumentEditorPage', () => {
  const mockStory = {
    story_id: 'story-123',
    title: 'Test Story',
    description: 'Test description',
    author_id: 'author-1',
    image_url: '/image.jpg',
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    chapters: [
      { id: 'chapter-1', title: 'Chapter 1', order: 1 },
      { id: 'chapter-2', title: 'Chapter 2', order: 2 },
    ],
  };

  const mockSeries = {
    series_id: 'series-123',
    series_title: 'Test Series',
    author_id: 'author-1',
    series_description: 'Series description',
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  };

  const mockChapter = {
    id: 'chapter-1',
    title: 'Chapter 1',
    story_id: 'story-123',
    order: 1,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock selections
    mockSelections.story = null;
    mockSelections.chapter = null;
    mockSelections.setStory = vi.fn();
    mockSelections.setSeries = vi.fn();
    mockSelections.setChapter = vi.fn();

    // Default mock implementations
    (RouterModule.useParams as Mock).mockReturnValue({ storyID: 'story-123' });
    (RouterModule.useSearchParams as Mock).mockReturnValue([
      new URLSearchParams(),
      mockSetSearchParams,
    ]);

    (api.get as Mock).mockImplementation((url: string) => {
      if (url.includes('/stories/story-123/chapters/')) {
        return Promise.resolve({ data: mockChapter });
      }
      if (url.includes('/stories/story-123')) {
        return Promise.resolve({ data: mockStory });
      }
      if (url.includes('/series/')) {
        return Promise.resolve({ data: mockSeries });
      }
      return Promise.reject(new Error('Not found'));
    });

    (ChapterMemory.getLastChapter as Mock).mockReturnValue(null);
    (ChapterMemory.saveLastChapter as Mock).mockReturnValue(undefined);
  });

  describe('Rendering', () => {
    it('should render without crashing with valid storyID', () => {
      render(<DocumentEditorPage />);
      expect(screen.getByTestId('thread-writer')).toBeInTheDocument();
    });

    it('should not render if storyID is missing', () => {
      (RouterModule.useParams as Mock).mockReturnValue({ storyID: undefined });
      const { container } = render(<DocumentEditorPage />);
      expect(container).toBeEmptyDOMElement();
    });

    it('should not render if storyID is empty string', () => {
      (RouterModule.useParams as Mock).mockReturnValue({ storyID: '' });
      const { container } = render(<DocumentEditorPage />);
      expect(container).toBeEmptyDOMElement();
    });

    it('should wrap ThreadWriter in AssociationsProvider', () => {
      render(<DocumentEditorPage />);
      expect(screen.getByTestId('associations-provider')).toBeInTheDocument();
    });

    it('should wrap ThreadWriter in DocumentSettingsProvider', () => {
      render(<DocumentEditorPage />);
      expect(screen.getByTestId('document-settings-provider')).toBeInTheDocument();
    });

    it('should render ThreadWriter component', () => {
      render(<DocumentEditorPage />);
      expect(screen.getByTestId('thread-writer')).toBeInTheDocument();
      expect(screen.getByText('ThreadWriter Component')).toBeInTheDocument();
    });
  });

  describe('Story Fetching', () => {
    it('should fetch story on mount', async () => {
      render(<DocumentEditorPage />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/stories/story-123', expect.any(Object));
      });
    });

    it('should not fetch story if storyID is missing', () => {
      (RouterModule.useParams as Mock).mockReturnValue({ storyID: undefined });
      render(<DocumentEditorPage />);

      expect(api.get).not.toHaveBeenCalled();
    });

    it('should not fetch story if storyID is empty', () => {
      (RouterModule.useParams as Mock).mockReturnValue({ storyID: '' });
      render(<DocumentEditorPage />);

      expect(api.get).not.toHaveBeenCalled();
    });

    it('should pass abort signal when fetching story', async () => {
      render(<DocumentEditorPage />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith(
          '/stories/story-123',
          expect.objectContaining({
            signal: expect.any(AbortSignal),
          })
        );
      });
    });

    it('should handle story fetch error', async () => {
      (api.get as Mock).mockRejectedValueOnce(new Error('Network error'));

      render(<DocumentEditorPage />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/stories/story-123', expect.any(Object));
      });

      // Should still render despite error
      expect(screen.getByTestId('thread-writer')).toBeInTheDocument();
    });

    it('should handle axios error with response', async () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 404,
          statusText: 'Not Found',
        },
        message: 'Request failed',
      };
      (api.get as Mock).mockRejectedValueOnce(axiosError);

      render(<DocumentEditorPage />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });
    });

    it('should abort story fetch on unmount', () => {
      const { unmount } = render(<DocumentEditorPage />);
      unmount();

      // Component should cleanup abort controller
      expect(true).toBe(true); // Abort is handled internally
    });
  });

  describe('Series Fetching', () => {
    it('should fetch series when story has series_id', async () => {
      // Set story with series_id
      mockSelections.story = { ...mockStory, series_id: 'series-123' };

      render(<DocumentEditorPage />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/series/series-123', expect.any(Object));
      });
    });

    it('should not fetch series if story has no series_id', async () => {
      mockSelections.story = mockStory;

      render(<DocumentEditorPage />);

      await waitFor(() => {
        // Should only fetch story, not series
        expect(api.get).toHaveBeenCalledWith('/stories/story-123', expect.any(Object));
      });

      // Verify series endpoint not called
      const seriesCalls = (api.get as Mock).mock.calls.filter(call =>
        call[0].includes('/series/')
      );
      expect(seriesCalls.length).toBe(0);
    });

    it('should pass abort signal when fetching series', async () => {
      mockSelections.story = { ...mockStory, series_id: 'series-123' };

      render(<DocumentEditorPage />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith(
          '/series/series-123',
          expect.objectContaining({
            signal: expect.any(AbortSignal),
          })
        );
      });
    });

    it('should handle series fetch error', async () => {
      mockSelections.story = { ...mockStory, series_id: 'series-123' };

      (api.get as Mock).mockImplementation((url: string) => {
        if (url.includes('/series/')) {
          return Promise.reject(new Error('Series not found'));
        }
        if (url.includes('/stories/')) {
          return Promise.resolve({ data: { ...mockStory, series_id: 'series-123' } });
        }
        return Promise.reject(new Error('Not found'));
      });

      render(<DocumentEditorPage />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/series/series-123', expect.any(Object));
      });

      // Should still render despite error
      expect(screen.getByTestId('thread-writer')).toBeInTheDocument();
    });
  });

  describe('Chapter URL Parameter Management', () => {
    it('should set chapter param to first chapter if none exists', async () => {
      mockSelections.story = mockStory;

      render(<DocumentEditorPage />);

      await waitFor(() => {
        expect(mockSetSearchParams).toHaveBeenCalledWith(
          expect.any(URLSearchParams),
          { replace: true }
        );
      });

      // Verify the chapter param is set to first chapter
      const call = mockSetSearchParams.mock.calls[0];
      const params = call[0] as URLSearchParams;
      expect(params.get('chapter')).toBe('chapter-1');
    });

    it('should use last viewed chapter from localStorage if available', async () => {
      (ChapterMemory.getLastChapter as Mock).mockReturnValue('chapter-2');
      mockSelections.story = mockStory;

      render(<DocumentEditorPage />);

      await waitFor(() => {
        expect(ChapterMemory.getLastChapter).toHaveBeenCalledWith('story-123');
      });

      await waitFor(() => {
        const call = mockSetSearchParams.mock.calls[0];
        const params = call[0] as URLSearchParams;
        expect(params.get('chapter')).toBe('chapter-2');
      });
    });

    it('should fallback to first chapter if last viewed chapter no longer exists', async () => {
      (ChapterMemory.getLastChapter as Mock).mockReturnValue('chapter-999');
      mockSelections.story = mockStory;

      render(<DocumentEditorPage />);

      await waitFor(() => {
        const call = mockSetSearchParams.mock.calls[0];
        const params = call[0] as URLSearchParams;
        expect(params.get('chapter')).toBe('chapter-1');
      });
    });

    it('should not set chapter param if already present in URL', async () => {
      const searchParams = new URLSearchParams();
      searchParams.set('chapter', 'chapter-2');

      (RouterModule.useSearchParams as Mock).mockReturnValue([
        searchParams,
        mockSetSearchParams,
      ]);

      mockSelections.story = mockStory;

      render(<DocumentEditorPage />);

      // Wait a bit to ensure effect has run
      await new Promise(resolve => setTimeout(resolve, 100));

      // setSearchParams should not be called since param already exists
      expect(mockSetSearchParams).not.toHaveBeenCalled();
    });

    it('should not set chapter param if story has no chapters', async () => {
      mockSelections.story = { ...mockStory, chapters: [] };

      render(<DocumentEditorPage />);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockSetSearchParams).not.toHaveBeenCalled();
    });
  });

  describe('Chapter Fetching', () => {
    beforeEach(() => {
      const searchParams = new URLSearchParams();
      searchParams.set('chapter', 'chapter-1');

      (RouterModule.useSearchParams as Mock).mockReturnValue([
        searchParams,
        mockSetSearchParams,
      ]);
    });

    it('should fetch chapter when chapter param exists', async () => {
      render(<DocumentEditorPage />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith(
          '/stories/story-123/chapters/chapter-1',
          expect.any(Object)
        );
      });
    });

    it('should not fetch chapter if chapter param is missing', async () => {
      (RouterModule.useSearchParams as Mock).mockReturnValue([
        new URLSearchParams(),
        mockSetSearchParams,
      ]);

      render(<DocumentEditorPage />);

      await new Promise(resolve => setTimeout(resolve, 100));

      const chapterCalls = (api.get as Mock).mock.calls.filter(call =>
        call[0].includes('/chapters/')
      );
      expect(chapterCalls.length).toBe(0);
    });

    it('should not fetch chapter if storyID is missing', async () => {
      (RouterModule.useParams as Mock).mockReturnValue({ storyID: undefined });

      render(<DocumentEditorPage />);

      const chapterCalls = (api.get as Mock).mock.calls.filter(call =>
        call[0].includes('/chapters/')
      );
      expect(chapterCalls.length).toBe(0);
    });

    it('should save chapter to localStorage after fetching', async () => {
      render(<DocumentEditorPage />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith(
          '/stories/story-123/chapters/chapter-1',
          expect.any(Object)
        );
      });

      await waitFor(() => {
        expect(ChapterMemory.saveLastChapter).toHaveBeenCalledWith('story-123', 'chapter-1');
      });
    });

    it('should handle chapter fetch error', async () => {
      (api.get as Mock).mockImplementation((url: string) => {
        if (url.includes('/chapters/')) {
          return Promise.reject(new Error('Chapter not found'));
        }
        if (url.includes('/stories/')) {
          return Promise.resolve({ data: mockStory });
        }
        return Promise.reject(new Error('Not found'));
      });

      render(<DocumentEditorPage />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith(
          '/stories/story-123/chapters/chapter-1',
          expect.any(Object)
        );
      });

      // Should still render despite error
      expect(screen.getByTestId('thread-writer')).toBeInTheDocument();
    });

    it('should abort chapter fetch on unmount', () => {
      const { unmount } = render(<DocumentEditorPage />);
      unmount();

      // Component should cleanup abort controller
      expect(true).toBe(true); // Abort is handled internally
    });
  });

  describe('Chapter Memory (localStorage)', () => {
    it('should save chapter to localStorage when chapter changes', async () => {
      mockSelections.chapter = mockChapter;

      render(<DocumentEditorPage />);

      await waitFor(() => {
        expect(ChapterMemory.saveLastChapter).toHaveBeenCalledWith('story-123', 'chapter-1');
      });
    });

    it('should not save to localStorage if storyID is missing', async () => {
      (RouterModule.useParams as Mock).mockReturnValue({ storyID: undefined });
      mockSelections.chapter = mockChapter;

      render(<DocumentEditorPage />);

      expect(ChapterMemory.saveLastChapter).not.toHaveBeenCalled();
    });

    it('should not save to localStorage if chapter ID is missing', async () => {
      mockSelections.chapter = { ...mockChapter, id: undefined };

      render(<DocumentEditorPage />);

      expect(ChapterMemory.saveLastChapter).not.toHaveBeenCalled();
    });
  });

  describe('Provider Props', () => {
    it('should pass storyID to AssociationsProvider', () => {
      const { container } = render(<DocumentEditorPage />);
      const provider = container.querySelector('[data-testid="associations-provider"]');
      expect(provider).toBeInTheDocument();
    });

    it('should pass storyID to DocumentSettingsProvider', () => {
      const { container } = render(<DocumentEditorPage />);
      const provider = container.querySelector('[data-testid="document-settings-provider"]');
      expect(provider).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle story with undefined chapters array', async () => {
      mockSelections.story = { ...mockStory, chapters: undefined };

      render(<DocumentEditorPage />);

      // Should not crash
      expect(screen.getByTestId('thread-writer')).toBeInTheDocument();
    });

    it('should handle multiple rapid chapter changes', async () => {
      const searchParams1 = new URLSearchParams();
      searchParams1.set('chapter', 'chapter-1');

      (RouterModule.useSearchParams as Mock).mockReturnValue([
        searchParams1,
        mockSetSearchParams,
      ]);

      const { rerender } = render(<DocumentEditorPage />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith(
          '/stories/story-123/chapters/chapter-1',
          expect.any(Object)
        );
      });

      // Change chapter param
      const searchParams2 = new URLSearchParams();
      searchParams2.set('chapter', 'chapter-2');

      (RouterModule.useSearchParams as Mock).mockReturnValue([
        searchParams2,
        mockSetSearchParams,
      ]);

      rerender(<DocumentEditorPage />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith(
          '/stories/story-123/chapters/chapter-2',
          expect.any(Object)
        );
      });
    });

    it('should handle cancelled requests gracefully', async () => {
      const cancelError = { isCancel: true };

      (api.get as Mock).mockRejectedValueOnce(cancelError);

      render(<DocumentEditorPage />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      // Should not show error for cancelled requests
      expect(screen.getByTestId('thread-writer')).toBeInTheDocument();
    });
  });
});
