import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorksList } from '../useWorksList';
import { WorksListContext } from '../../contexts/worksList';
import type { Story } from '../../types/Story';
import type { Series } from '../../types/Series';
import { ReactNode } from 'react';

const mockStory1: Story = {
  story_id: 'story-1',
  title: 'First Story',
  description: 'Description 1',
  image_url: 'https://example.com/story1.jpg',
  chapters: [],
  user_id: 'user-123',
  inactive: false,
  last_updated: '2024-01-01',
  created: '2024-01-01',
  words_per_page: 250,
};

const mockStory2: Story = {
  story_id: 'story-2',
  title: 'Second Story',
  description: 'Description 2',
  image_url: 'https://example.com/story2.jpg',
  chapters: [],
  user_id: 'user-123',
  inactive: false,
  last_updated: '2024-01-01',
  created: '2024-01-01',
  words_per_page: 250,
};

const mockSeries1: Series = {
  series_id: 'series-1',
  series_title: 'First Series',
  series_description: 'Description 1',
  image_url: 'https://example.com/series1.jpg',
  stories: [mockStory1],
};

const mockSeries2: Series = {
  series_id: 'series-2',
  series_title: 'Second Series',
  series_description: 'Description 2',
  image_url: 'https://example.com/series2.jpg',
  stories: [mockStory2],
};

describe('useWorksList', () => {
  describe('Context Provider', () => {
    it('should throw error when used outside provider', () => {
      expect(() => {
        renderHook(() => useWorksList());
      }).toThrow('WorksListContext must be used within a WorksListProvider');
    });

    it('should return worksList context values when used within provider', () => {
      const mockSetSeriesList = vi.fn();
      const mockSetStoriesList = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WorksListContext.Provider
          value={{
            seriesList: [mockSeries1],
            storiesList: [mockStory1],
            setSeriesList: mockSetSeriesList,
            setStoriesList: mockSetStoriesList,
          }}
        >
          {children}
        </WorksListContext.Provider>
      );

      const { result } = renderHook(() => useWorksList(), { wrapper });

      expect(result.current.seriesList).toEqual([mockSeries1]);
      expect(result.current.storiesList).toEqual([mockStory1]);
      expect(result.current.setSeriesList).toBe(mockSetSeriesList);
      expect(result.current.setStoriesList).toBe(mockSetStoriesList);
    });
  });

  describe('seriesList', () => {
    it('should return null when no series exist', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <WorksListContext.Provider
          value={{
            seriesList: null,
            storiesList: null,
            setSeriesList: vi.fn(),
            setStoriesList: vi.fn(),
          }}
        >
          {children}
        </WorksListContext.Provider>
      );

      const { result } = renderHook(() => useWorksList(), { wrapper });

      expect(result.current.seriesList).toBeNull();
    });

    it('should return empty array when no series exist', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <WorksListContext.Provider
          value={{
            seriesList: [],
            storiesList: [],
            setSeriesList: vi.fn(),
            setStoriesList: vi.fn(),
          }}
        >
          {children}
        </WorksListContext.Provider>
      );

      const { result } = renderHook(() => useWorksList(), { wrapper });

      expect(result.current.seriesList).toEqual([]);
    });

    it('should return single series', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <WorksListContext.Provider
          value={{
            seriesList: [mockSeries1],
            storiesList: null,
            setSeriesList: vi.fn(),
            setStoriesList: vi.fn(),
          }}
        >
          {children}
        </WorksListContext.Provider>
      );

      const { result } = renderHook(() => useWorksList(), { wrapper });

      expect(result.current.seriesList).toHaveLength(1);
      expect(result.current.seriesList?.[0]).toEqual(mockSeries1);
    });

    it('should return multiple series', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <WorksListContext.Provider
          value={{
            seriesList: [mockSeries1, mockSeries2],
            storiesList: null,
            setSeriesList: vi.fn(),
            setStoriesList: vi.fn(),
          }}
        >
          {children}
        </WorksListContext.Provider>
      );

      const { result } = renderHook(() => useWorksList(), { wrapper });

      expect(result.current.seriesList).toHaveLength(2);
      expect(result.current.seriesList).toEqual([mockSeries1, mockSeries2]);
    });
  });

  describe('storiesList', () => {
    it('should return null when no stories exist', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <WorksListContext.Provider
          value={{
            seriesList: null,
            storiesList: null,
            setSeriesList: vi.fn(),
            setStoriesList: vi.fn(),
          }}
        >
          {children}
        </WorksListContext.Provider>
      );

      const { result } = renderHook(() => useWorksList(), { wrapper });

      expect(result.current.storiesList).toBeNull();
    });

    it('should return empty array when no stories exist', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <WorksListContext.Provider
          value={{
            seriesList: null,
            storiesList: [],
            setSeriesList: vi.fn(),
            setStoriesList: vi.fn(),
          }}
        >
          {children}
        </WorksListContext.Provider>
      );

      const { result } = renderHook(() => useWorksList(), { wrapper });

      expect(result.current.storiesList).toEqual([]);
    });

    it('should return single story', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <WorksListContext.Provider
          value={{
            seriesList: null,
            storiesList: [mockStory1],
            setSeriesList: vi.fn(),
            setStoriesList: vi.fn(),
          }}
        >
          {children}
        </WorksListContext.Provider>
      );

      const { result } = renderHook(() => useWorksList(), { wrapper });

      expect(result.current.storiesList).toHaveLength(1);
      expect(result.current.storiesList?.[0]).toEqual(mockStory1);
    });

    it('should return multiple stories', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <WorksListContext.Provider
          value={{
            seriesList: null,
            storiesList: [mockStory1, mockStory2],
            setSeriesList: vi.fn(),
            setStoriesList: vi.fn(),
          }}
        >
          {children}
        </WorksListContext.Provider>
      );

      const { result } = renderHook(() => useWorksList(), { wrapper });

      expect(result.current.storiesList).toHaveLength(2);
      expect(result.current.storiesList).toEqual([mockStory1, mockStory2]);
    });
  });

  describe('setSeriesList', () => {
    it('should call setSeriesList when invoked', () => {
      const mockSetSeriesList = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WorksListContext.Provider
          value={{
            seriesList: null,
            storiesList: null,
            setSeriesList: mockSetSeriesList,
            setStoriesList: vi.fn(),
          }}
        >
          {children}
        </WorksListContext.Provider>
      );

      const { result } = renderHook(() => useWorksList(), { wrapper });

      act(() => {
        result.current.setSeriesList([mockSeries1]);
      });

      expect(mockSetSeriesList).toHaveBeenCalledWith([mockSeries1]);
    });

    it('should allow setting to null', () => {
      const mockSetSeriesList = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WorksListContext.Provider
          value={{
            seriesList: [mockSeries1],
            storiesList: null,
            setSeriesList: mockSetSeriesList,
            setStoriesList: vi.fn(),
          }}
        >
          {children}
        </WorksListContext.Provider>
      );

      const { result } = renderHook(() => useWorksList(), { wrapper });

      act(() => {
        result.current.setSeriesList(null);
      });

      expect(mockSetSeriesList).toHaveBeenCalledWith(null);
    });

    it('should allow setting to empty array', () => {
      const mockSetSeriesList = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WorksListContext.Provider
          value={{
            seriesList: [mockSeries1],
            storiesList: null,
            setSeriesList: mockSetSeriesList,
            setStoriesList: vi.fn(),
          }}
        >
          {children}
        </WorksListContext.Provider>
      );

      const { result } = renderHook(() => useWorksList(), { wrapper });

      act(() => {
        result.current.setSeriesList([]);
      });

      expect(mockSetSeriesList).toHaveBeenCalledWith([]);
    });

    it('should allow updating to multiple series', () => {
      const mockSetSeriesList = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WorksListContext.Provider
          value={{
            seriesList: [mockSeries1],
            storiesList: null,
            setSeriesList: mockSetSeriesList,
            setStoriesList: vi.fn(),
          }}
        >
          {children}
        </WorksListContext.Provider>
      );

      const { result } = renderHook(() => useWorksList(), { wrapper });

      act(() => {
        result.current.setSeriesList([mockSeries1, mockSeries2]);
      });

      expect(mockSetSeriesList).toHaveBeenCalledWith([mockSeries1, mockSeries2]);
    });
  });

  describe('setStoriesList', () => {
    it('should call setStoriesList when invoked', () => {
      const mockSetStoriesList = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WorksListContext.Provider
          value={{
            seriesList: null,
            storiesList: null,
            setSeriesList: vi.fn(),
            setStoriesList: mockSetStoriesList,
          }}
        >
          {children}
        </WorksListContext.Provider>
      );

      const { result } = renderHook(() => useWorksList(), { wrapper });

      act(() => {
        result.current.setStoriesList([mockStory1]);
      });

      expect(mockSetStoriesList).toHaveBeenCalledWith([mockStory1]);
    });

    it('should allow setting to null', () => {
      const mockSetStoriesList = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WorksListContext.Provider
          value={{
            seriesList: null,
            storiesList: [mockStory1],
            setSeriesList: vi.fn(),
            setStoriesList: mockSetStoriesList,
          }}
        >
          {children}
        </WorksListContext.Provider>
      );

      const { result } = renderHook(() => useWorksList(), { wrapper });

      act(() => {
        result.current.setStoriesList(null);
      });

      expect(mockSetStoriesList).toHaveBeenCalledWith(null);
    });

    it('should allow setting to empty array', () => {
      const mockSetStoriesList = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WorksListContext.Provider
          value={{
            seriesList: null,
            storiesList: [mockStory1],
            setSeriesList: vi.fn(),
            setStoriesList: mockSetStoriesList,
          }}
        >
          {children}
        </WorksListContext.Provider>
      );

      const { result } = renderHook(() => useWorksList(), { wrapper });

      act(() => {
        result.current.setStoriesList([]);
      });

      expect(mockSetStoriesList).toHaveBeenCalledWith([]);
    });

    it('should allow updating to multiple stories', () => {
      const mockSetStoriesList = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WorksListContext.Provider
          value={{
            seriesList: null,
            storiesList: [mockStory1],
            setSeriesList: vi.fn(),
            setStoriesList: mockSetStoriesList,
          }}
        >
          {children}
        </WorksListContext.Provider>
      );

      const { result } = renderHook(() => useWorksList(), { wrapper });

      act(() => {
        result.current.setStoriesList([mockStory1, mockStory2]);
      });

      expect(mockSetStoriesList).toHaveBeenCalledWith([mockStory1, mockStory2]);
    });
  });

  describe('Combined Lists', () => {
    it('should handle both series and stories lists', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <WorksListContext.Provider
          value={{
            seriesList: [mockSeries1, mockSeries2],
            storiesList: [mockStory1, mockStory2],
            setSeriesList: vi.fn(),
            setStoriesList: vi.fn(),
          }}
        >
          {children}
        </WorksListContext.Provider>
      );

      const { result } = renderHook(() => useWorksList(), { wrapper });

      expect(result.current.seriesList).toHaveLength(2);
      expect(result.current.storiesList).toHaveLength(2);
    });

    it('should allow independent updates to series and stories', () => {
      const mockSetSeriesList = vi.fn();
      const mockSetStoriesList = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WorksListContext.Provider
          value={{
            seriesList: [mockSeries1],
            storiesList: [mockStory1],
            setSeriesList: mockSetSeriesList,
            setStoriesList: mockSetStoriesList,
          }}
        >
          {children}
        </WorksListContext.Provider>
      );

      const { result } = renderHook(() => useWorksList(), { wrapper });

      act(() => {
        result.current.setSeriesList([mockSeries2]);
      });

      expect(mockSetSeriesList).toHaveBeenCalledWith([mockSeries2]);
      expect(mockSetStoriesList).not.toHaveBeenCalled();

      act(() => {
        result.current.setStoriesList([mockStory2]);
      });

      expect(mockSetStoriesList).toHaveBeenCalledWith([mockStory2]);
    });
  });

  describe('Context Updates', () => {
    it('should handle context updates correctly', () => {
      const mockSetSeriesList = vi.fn();
      const mockSetStoriesList = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WorksListContext.Provider
          value={{
            seriesList: [mockSeries1],
            storiesList: [mockStory1],
            setSeriesList: mockSetSeriesList,
            setStoriesList: mockSetStoriesList,
          }}
        >
          {children}
        </WorksListContext.Provider>
      );

      const { result, rerender } = renderHook(() => useWorksList(), { wrapper });

      expect(result.current.seriesList).toEqual([mockSeries1]);
      expect(result.current.storiesList).toEqual([mockStory1]);

      // Rerender should maintain values
      rerender();

      expect(result.current.seriesList).toEqual([mockSeries1]);
      expect(result.current.storiesList).toEqual([mockStory1]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle series with nested stories', () => {
      const seriesWithStories: Series = {
        ...mockSeries1,
        stories: [mockStory1, mockStory2],
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WorksListContext.Provider
          value={{
            seriesList: [seriesWithStories],
            storiesList: null,
            setSeriesList: vi.fn(),
            setStoriesList: vi.fn(),
          }}
        >
          {children}
        </WorksListContext.Provider>
      );

      const { result } = renderHook(() => useWorksList(), { wrapper });

      expect(result.current.seriesList?.[0].stories).toHaveLength(2);
    });

    it('should handle empty nested stories in series', () => {
      const seriesWithoutStories: Series = {
        ...mockSeries1,
        stories: [],
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WorksListContext.Provider
          value={{
            seriesList: [seriesWithoutStories],
            storiesList: null,
            setSeriesList: vi.fn(),
            setStoriesList: vi.fn(),
          }}
        >
          {children}
        </WorksListContext.Provider>
      );

      const { result } = renderHook(() => useWorksList(), { wrapper });

      expect(result.current.seriesList?.[0].stories).toEqual([]);
    });

    it('should handle stories with empty chapters', () => {
      const storyWithoutChapters: Story = {
        ...mockStory1,
        chapters: [],
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <WorksListContext.Provider
          value={{
            seriesList: null,
            storiesList: [storyWithoutChapters],
            setSeriesList: vi.fn(),
            setStoriesList: vi.fn(),
          }}
        >
          {children}
        </WorksListContext.Provider>
      );

      const { result } = renderHook(() => useWorksList(), { wrapper });

      expect(result.current.storiesList?.[0].chapters).toEqual([]);
    });
  });

  describe('Type Safety', () => {
    it('should have all required properties', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <WorksListContext.Provider
          value={{
            seriesList: null,
            storiesList: null,
            setSeriesList: vi.fn(),
            setStoriesList: vi.fn(),
          }}
        >
          {children}
        </WorksListContext.Provider>
      );

      const { result } = renderHook(() => useWorksList(), { wrapper });

      expect(result.current).toHaveProperty('seriesList');
      expect(result.current).toHaveProperty('storiesList');
      expect(result.current).toHaveProperty('setSeriesList');
      expect(result.current).toHaveProperty('setStoriesList');
    });

    it('should have exactly four properties', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <WorksListContext.Provider
          value={{
            seriesList: null,
            storiesList: null,
            setSeriesList: vi.fn(),
            setStoriesList: vi.fn(),
          }}
        >
          {children}
        </WorksListContext.Provider>
      );

      const { result } = renderHook(() => useWorksList(), { wrapper });

      expect(Object.keys(result.current)).toHaveLength(4);
    });
  });
});
