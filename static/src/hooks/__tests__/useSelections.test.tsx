import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSelections } from '../useSelections';
import { SelectionsContext } from '../../contexts/selections';
import * as useWorksListModule from '../useWorksList';
import type { Story } from '../../types/Story';
import type { Series } from '../../types/Series';
import type { Chapter } from '../../types/Chapter';
import type { SimplifiedAssociation } from '../../types/Associations';
import { ReactNode } from 'react';

// Mock useWorksList
vi.mock('../useWorksList');

const mockChapter: Chapter = {
  id: 'chapter-1',
  story_id: 'story-1',
  place: 1,
  title: 'Chapter 1',
  tableNotReady: false,
};

const mockStory: Story = {
  story_id: 'story-1',
  title: 'Test Story',
  description: 'Description',
  image_url: 'https://example.com/image.jpg',
  chapters: [mockChapter],
  inactive: false,
};

const mockSeries: Series = {
  series_id: 'series-1',
  series_title: 'Test Series',
  series_description: 'Description',
  image_url: 'https://example.com/series.jpg',
  stories: [mockStory],
};

const mockAssociation: SimplifiedAssociation = {
  association_id: 'assoc-1',
  association_name: 'Test Association',
  association_type: 'character',
  short_description: '',
  portrait: '',
  aliases: '',
  case_sensitive: false,
};

describe('useSelections', () => {
  let mockSetStoriesList: ReturnType<typeof vi.fn>;
  let mockSetSeriesList: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSetStoriesList = vi.fn();
    mockSetSeriesList = vi.fn();

    vi.spyOn(useWorksListModule, 'useWorksList').mockReturnValue({
      storiesList: [mockStory],
      setStoriesList: mockSetStoriesList,
      seriesList: [mockSeries],
      setSeriesList: mockSetSeriesList,
    });
  });

  describe('Context Provider', () => {
    it('should throw error when used outside provider', () => {
      expect(() => {
        renderHook(() => useSelections());
      }).toThrow('useSelectionsContext must be used within a SelectionsProvider');
    });

    it('should return selections context values when used within provider', () => {
      const mockSetStory = vi.fn();
      const mockDeselectStory = vi.fn();
      const mockSetSeries = vi.fn();
      const mockDeselectSeries = vi.fn();
      const mockSetChapter = vi.fn();
      const mockDeselectChapter = vi.fn();
      const mockSetAssociation = vi.fn();
      const mockDeselectAssociation = vi.fn();
      const mockDeselectAll = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <SelectionsContext.Provider
          value={{
            story: mockStory,
            setStory: mockSetStory,
            deselectStory: mockDeselectStory,
            series: mockSeries,
            setSeries: mockSetSeries,
            deselectSeries: mockDeselectSeries,
            chapter: mockChapter,
            setChapter: mockSetChapter,
            deselectChapter: mockDeselectChapter,
            association: mockAssociation,
            setAssociation: mockSetAssociation,
            deselectAssociation: mockDeselectAssociation,
            deselectAll: mockDeselectAll,
          }}
        >
          {children}
        </SelectionsContext.Provider>
      );

      const { result } = renderHook(() => useSelections(), { wrapper });

      expect(result.current.story).toEqual(mockStory);
      expect(result.current.series).toEqual(mockSeries);
      expect(result.current.chapter).toEqual(mockChapter);
      expect(result.current.association).toEqual(mockAssociation);
    });
  });

  describe('Story Selection', () => {
    it('should return story when selected', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <SelectionsContext.Provider
          value={{
            story: mockStory,
            setStory: vi.fn(),
            deselectStory: vi.fn(),
            series: undefined,
            setSeries: vi.fn(),
            deselectSeries: vi.fn(),
            chapter: undefined,
            setChapter: vi.fn(),
            deselectChapter: vi.fn(),
            association: undefined,
            setAssociation: vi.fn(),
            deselectAssociation: vi.fn(),
            deselectAll: vi.fn(),
          }}
        >
          {children}
        </SelectionsContext.Provider>
      );

      const { result } = renderHook(() => useSelections(), { wrapper });

      expect(result.current.story).toEqual(mockStory);
    });

    it('should call setStory when setting story', () => {
      const mockSetStory = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <SelectionsContext.Provider
          value={{
            story: undefined,
            setStory: mockSetStory,
            deselectStory: vi.fn(),
            series: undefined,
            setSeries: vi.fn(),
            deselectSeries: vi.fn(),
            chapter: undefined,
            setChapter: vi.fn(),
            deselectChapter: vi.fn(),
            association: undefined,
            setAssociation: vi.fn(),
            deselectAssociation: vi.fn(),
            deselectAll: vi.fn(),
          }}
        >
          {children}
        </SelectionsContext.Provider>
      );

      const { result } = renderHook(() => useSelections(), { wrapper });

      act(() => {
        result.current.setStory(mockStory);
      });

      expect(mockSetStory).toHaveBeenCalledWith(mockStory);
    });

    it('should call deselectStory when deselecting', () => {
      const mockDeselectStory = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <SelectionsContext.Provider
          value={{
            story: mockStory,
            setStory: vi.fn(),
            deselectStory: mockDeselectStory,
            series: undefined,
            setSeries: vi.fn(),
            deselectSeries: vi.fn(),
            chapter: undefined,
            setChapter: vi.fn(),
            deselectChapter: vi.fn(),
            association: undefined,
            setAssociation: vi.fn(),
            deselectAssociation: vi.fn(),
            deselectAll: vi.fn(),
          }}
        >
          {children}
        </SelectionsContext.Provider>
      );

      const { result } = renderHook(() => useSelections(), { wrapper });

      act(() => {
        result.current.deselectStory();
      });

      expect(mockDeselectStory).toHaveBeenCalled();
    });
  });

  describe('Series Selection', () => {
    it('should return series when selected', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <SelectionsContext.Provider
          value={{
            story: undefined,
            setStory: vi.fn(),
            deselectStory: vi.fn(),
            series: mockSeries,
            setSeries: vi.fn(),
            deselectSeries: vi.fn(),
            chapter: undefined,
            setChapter: vi.fn(),
            deselectChapter: vi.fn(),
            association: undefined,
            setAssociation: vi.fn(),
            deselectAssociation: vi.fn(),
            deselectAll: vi.fn(),
          }}
        >
          {children}
        </SelectionsContext.Provider>
      );

      const { result } = renderHook(() => useSelections(), { wrapper });

      expect(result.current.series).toEqual(mockSeries);
    });

    it('should call setSeries when setting series', () => {
      const mockSetSeries = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <SelectionsContext.Provider
          value={{
            story: undefined,
            setStory: vi.fn(),
            deselectStory: vi.fn(),
            series: undefined,
            setSeries: mockSetSeries,
            deselectSeries: vi.fn(),
            chapter: undefined,
            setChapter: vi.fn(),
            deselectChapter: vi.fn(),
            association: undefined,
            setAssociation: vi.fn(),
            deselectAssociation: vi.fn(),
            deselectAll: vi.fn(),
          }}
        >
          {children}
        </SelectionsContext.Provider>
      );

      const { result } = renderHook(() => useSelections(), { wrapper });

      act(() => {
        result.current.setSeries(mockSeries);
      });

      expect(mockSetSeries).toHaveBeenCalledWith(mockSeries);
    });

    it('should call deselectSeries when deselecting', () => {
      const mockDeselectSeries = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <SelectionsContext.Provider
          value={{
            story: undefined,
            setStory: vi.fn(),
            deselectStory: vi.fn(),
            series: mockSeries,
            setSeries: vi.fn(),
            deselectSeries: mockDeselectSeries,
            chapter: undefined,
            setChapter: vi.fn(),
            deselectChapter: vi.fn(),
            association: undefined,
            setAssociation: vi.fn(),
            deselectAssociation: vi.fn(),
            deselectAll: vi.fn(),
          }}
        >
          {children}
        </SelectionsContext.Provider>
      );

      const { result } = renderHook(() => useSelections(), { wrapper });

      act(() => {
        result.current.deselectSeries();
      });

      expect(mockDeselectSeries).toHaveBeenCalled();
    });
  });

  describe('Chapter Selection', () => {
    it('should return chapter when selected', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <SelectionsContext.Provider
          value={{
            story: undefined,
            setStory: vi.fn(),
            deselectStory: vi.fn(),
            series: undefined,
            setSeries: vi.fn(),
            deselectSeries: vi.fn(),
            chapter: mockChapter,
            setChapter: vi.fn(),
            deselectChapter: vi.fn(),
            association: undefined,
            setAssociation: vi.fn(),
            deselectAssociation: vi.fn(),
            deselectAll: vi.fn(),
          }}
        >
          {children}
        </SelectionsContext.Provider>
      );

      const { result } = renderHook(() => useSelections(), { wrapper });

      expect(result.current.chapter).toEqual(mockChapter);
    });

    it('should call setChapter when setting chapter', () => {
      const mockSetChapter = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <SelectionsContext.Provider
          value={{
            story: undefined,
            setStory: vi.fn(),
            deselectStory: vi.fn(),
            series: undefined,
            setSeries: vi.fn(),
            deselectSeries: vi.fn(),
            chapter: undefined,
            setChapter: mockSetChapter,
            deselectChapter: vi.fn(),
            association: undefined,
            setAssociation: vi.fn(),
            deselectAssociation: vi.fn(),
            deselectAll: vi.fn(),
          }}
        >
          {children}
        </SelectionsContext.Provider>
      );

      const { result } = renderHook(() => useSelections(), { wrapper });

      act(() => {
        result.current.setChapter(mockChapter);
      });

      expect(mockSetChapter).toHaveBeenCalledWith(mockChapter);
    });

    it('should call deselectChapter when deselecting', () => {
      const mockDeselectChapter = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <SelectionsContext.Provider
          value={{
            story: undefined,
            setStory: vi.fn(),
            deselectStory: vi.fn(),
            series: undefined,
            setSeries: vi.fn(),
            deselectSeries: vi.fn(),
            chapter: mockChapter,
            setChapter: vi.fn(),
            deselectChapter: mockDeselectChapter,
            association: undefined,
            setAssociation: vi.fn(),
            deselectAssociation: vi.fn(),
            deselectAll: vi.fn(),
          }}
        >
          {children}
        </SelectionsContext.Provider>
      );

      const { result } = renderHook(() => useSelections(), { wrapper });

      act(() => {
        result.current.deselectChapter();
      });

      expect(mockDeselectChapter).toHaveBeenCalled();
    });
  });

  describe('Association Selection', () => {
    it('should return association when selected', () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <SelectionsContext.Provider
          value={{
            story: undefined,
            setStory: vi.fn(),
            deselectStory: vi.fn(),
            series: undefined,
            setSeries: vi.fn(),
            deselectSeries: vi.fn(),
            chapter: undefined,
            setChapter: vi.fn(),
            deselectChapter: vi.fn(),
            association: mockAssociation,
            setAssociation: vi.fn(),
            deselectAssociation: vi.fn(),
            deselectAll: vi.fn(),
          }}
        >
          {children}
        </SelectionsContext.Provider>
      );

      const { result } = renderHook(() => useSelections(), { wrapper });

      expect(result.current.association).toEqual(mockAssociation);
    });

    it('should call setAssociation when setting association', () => {
      const mockSetAssociation = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <SelectionsContext.Provider
          value={{
            story: undefined,
            setStory: vi.fn(),
            deselectStory: vi.fn(),
            series: undefined,
            setSeries: vi.fn(),
            deselectSeries: vi.fn(),
            chapter: undefined,
            setChapter: vi.fn(),
            deselectChapter: vi.fn(),
            association: undefined,
            setAssociation: mockSetAssociation,
            deselectAssociation: vi.fn(),
            deselectAll: vi.fn(),
          }}
        >
          {children}
        </SelectionsContext.Provider>
      );

      const { result } = renderHook(() => useSelections(), { wrapper });

      act(() => {
        result.current.setAssociation(mockAssociation);
      });

      expect(mockSetAssociation).toHaveBeenCalledWith(mockAssociation);
    });

    it('should call deselectAssociation when deselecting', () => {
      const mockDeselectAssociation = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <SelectionsContext.Provider
          value={{
            story: undefined,
            setStory: vi.fn(),
            deselectStory: vi.fn(),
            series: undefined,
            setSeries: vi.fn(),
            deselectSeries: vi.fn(),
            chapter: undefined,
            setChapter: vi.fn(),
            deselectChapter: vi.fn(),
            association: mockAssociation,
            setAssociation: vi.fn(),
            deselectAssociation: mockDeselectAssociation,
            deselectAll: vi.fn(),
          }}
        >
          {children}
        </SelectionsContext.Provider>
      );

      const { result } = renderHook(() => useSelections(), { wrapper });

      act(() => {
        result.current.deselectAssociation();
      });

      expect(mockDeselectAssociation).toHaveBeenCalled();
    });
  });

  describe('Deselect All', () => {
    it('should call deselectAll when deselecting all', () => {
      const mockDeselectAll = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <SelectionsContext.Provider
          value={{
            story: mockStory,
            setStory: vi.fn(),
            deselectStory: vi.fn(),
            series: mockSeries,
            setSeries: vi.fn(),
            deselectSeries: vi.fn(),
            chapter: mockChapter,
            setChapter: vi.fn(),
            deselectChapter: vi.fn(),
            association: mockAssociation,
            setAssociation: vi.fn(),
            deselectAssociation: vi.fn(),
            deselectAll: mockDeselectAll,
          }}
        >
          {children}
        </SelectionsContext.Provider>
      );

      const { result } = renderHook(() => useSelections(), { wrapper });

      act(() => {
        result.current.deselectAll();
      });

      expect(mockDeselectAll).toHaveBeenCalled();
    });
  });

  describe('propagateChapterUpdates', () => {
    it('should update chapter in story and propagate to story updates', () => {
      const mockSetStory = vi.fn();
      const updatedChapter: Chapter = {
        ...mockChapter,
        title: 'Updated Chapter 1',
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <SelectionsContext.Provider
          value={{
            story: mockStory,
            setStory: mockSetStory,
            deselectStory: vi.fn(),
            series: undefined,
            setSeries: vi.fn(),
            deselectSeries: vi.fn(),
            chapter: mockChapter,
            setChapter: vi.fn(),
            deselectChapter: vi.fn(),
            association: undefined,
            setAssociation: vi.fn(),
            deselectAssociation: vi.fn(),
            deselectAll: vi.fn(),
          }}
        >
          {children}
        </SelectionsContext.Provider>
      );

      const { result } = renderHook(() => useSelections(), { wrapper });

      act(() => {
        result.current.propagateChapterUpdates(updatedChapter);
      });

      expect(mockSetStory).toHaveBeenCalled();
      expect(mockSetStoriesList).toHaveBeenCalled();
    });

    it('should not update if chapter not found in story', () => {
      const mockSetStory = vi.fn();
      const differentChapter: Chapter = {
        id: 'chapter-999',
        story_id: 'story-1',
        place: 2,
        title: 'Different Chapter',
        tableNotReady: false,
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <SelectionsContext.Provider
          value={{
            story: mockStory,
            setStory: mockSetStory,
            deselectStory: vi.fn(),
            series: undefined,
            setSeries: vi.fn(),
            deselectSeries: vi.fn(),
            chapter: mockChapter,
            setChapter: vi.fn(),
            deselectChapter: vi.fn(),
            association: undefined,
            setAssociation: vi.fn(),
            deselectAssociation: vi.fn(),
            deselectAll: vi.fn(),
          }}
        >
          {children}
        </SelectionsContext.Provider>
      );

      const { result } = renderHook(() => useSelections(), { wrapper });

      act(() => {
        result.current.propagateChapterUpdates(differentChapter);
      });

      expect(mockSetStory).not.toHaveBeenCalled();
    });

    it('should not update if no story is selected', () => {
      const mockSetStory = vi.fn();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <SelectionsContext.Provider
          value={{
            story: undefined,
            setStory: mockSetStory,
            deselectStory: vi.fn(),
            series: undefined,
            setSeries: vi.fn(),
            deselectSeries: vi.fn(),
            chapter: mockChapter,
            setChapter: vi.fn(),
            deselectChapter: vi.fn(),
            association: undefined,
            setAssociation: vi.fn(),
            deselectAssociation: vi.fn(),
            deselectAll: vi.fn(),
          }}
        >
          {children}
        </SelectionsContext.Provider>
      );

      const { result } = renderHook(() => useSelections(), { wrapper });

      act(() => {
        result.current.propagateChapterUpdates(mockChapter);
      });

      expect(mockSetStory).not.toHaveBeenCalled();
    });
  });

  describe('propagateStoryUpdates', () => {
    it('should update story in storiesList', () => {
      const updatedStory: Story = {
        ...mockStory,
        title: 'Updated Story',
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <SelectionsContext.Provider
          value={{
            story: mockStory,
            setStory: vi.fn(),
            deselectStory: vi.fn(),
            series: undefined,
            setSeries: vi.fn(),
            deselectSeries: vi.fn(),
            chapter: undefined,
            setChapter: vi.fn(),
            deselectChapter: vi.fn(),
            association: undefined,
            setAssociation: vi.fn(),
            deselectAssociation: vi.fn(),
            deselectAll: vi.fn(),
          }}
        >
          {children}
        </SelectionsContext.Provider>
      );

      const { result } = renderHook(() => useSelections(), { wrapper });

      act(() => {
        result.current.propagateStoryUpdates(updatedStory);
      });

      expect(mockSetStoriesList).toHaveBeenCalled();
    });

    it('should create new storiesList if none exists', () => {
      const updatedStory: Story = {
        ...mockStory,
        title: 'Updated Story',
      };

      vi.spyOn(useWorksListModule, 'useWorksList').mockReturnValue({
        storiesList: null,
        setStoriesList: mockSetStoriesList,
        seriesList: null,
        setSeriesList: mockSetSeriesList,
      });

      const wrapper = ({ children }: { children: ReactNode }) => (
        <SelectionsContext.Provider
          value={{
            story: mockStory,
            setStory: vi.fn(),
            deselectStory: vi.fn(),
            series: undefined,
            setSeries: vi.fn(),
            deselectSeries: vi.fn(),
            chapter: undefined,
            setChapter: vi.fn(),
            deselectChapter: vi.fn(),
            association: undefined,
            setAssociation: vi.fn(),
            deselectAssociation: vi.fn(),
            deselectAll: vi.fn(),
          }}
        >
          {children}
        </SelectionsContext.Provider>
      );

      const { result } = renderHook(() => useSelections(), { wrapper });

      act(() => {
        result.current.propagateStoryUpdates(updatedStory);
      });

      expect(mockSetStoriesList).toHaveBeenCalledWith([updatedStory]);
    });

    it('should update story in series if story is in series', () => {
      const mockSetSeries = vi.fn();
      const updatedStory: Story = {
        ...mockStory,
        title: 'Updated Story',
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <SelectionsContext.Provider
          value={{
            story: mockStory,
            setStory: vi.fn(),
            deselectStory: vi.fn(),
            series: mockSeries,
            setSeries: mockSetSeries,
            deselectSeries: vi.fn(),
            chapter: undefined,
            setChapter: vi.fn(),
            deselectChapter: vi.fn(),
            association: undefined,
            setAssociation: vi.fn(),
            deselectAssociation: vi.fn(),
            deselectAll: vi.fn(),
          }}
        >
          {children}
        </SelectionsContext.Provider>
      );

      const { result } = renderHook(() => useSelections(), { wrapper });

      act(() => {
        result.current.propagateStoryUpdates(updatedStory);
      });

      expect(mockSetSeries).toHaveBeenCalled();
      expect(mockSetSeriesList).toHaveBeenCalled();
    });
  });

  describe('propagateSeriesUpdates', () => {
    it('should update series in seriesList', () => {
      const updatedSeries: Series = {
        ...mockSeries,
        series_title: 'Updated Series',
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <SelectionsContext.Provider
          value={{
            story: undefined,
            setStory: vi.fn(),
            deselectStory: vi.fn(),
            series: mockSeries,
            setSeries: vi.fn(),
            deselectSeries: vi.fn(),
            chapter: undefined,
            setChapter: vi.fn(),
            deselectChapter: vi.fn(),
            association: undefined,
            setAssociation: vi.fn(),
            deselectAssociation: vi.fn(),
            deselectAll: vi.fn(),
          }}
        >
          {children}
        </SelectionsContext.Provider>
      );

      const { result } = renderHook(() => useSelections(), { wrapper });

      act(() => {
        result.current.propagateSeriesUpdates(updatedSeries);
      });

      expect(mockSetSeriesList).toHaveBeenCalled();
    });

    it('should update series with updated story', () => {
      const updatedSeries: Series = {
        ...mockSeries,
        series_title: 'Updated Series',
      };
      const updatedStory: Story = {
        ...mockStory,
        title: 'Updated Story',
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <SelectionsContext.Provider
          value={{
            story: undefined,
            setStory: vi.fn(),
            deselectStory: vi.fn(),
            series: mockSeries,
            setSeries: vi.fn(),
            deselectSeries: vi.fn(),
            chapter: undefined,
            setChapter: vi.fn(),
            deselectChapter: vi.fn(),
            association: undefined,
            setAssociation: vi.fn(),
            deselectAssociation: vi.fn(),
            deselectAll: vi.fn(),
          }}
        >
          {children}
        </SelectionsContext.Provider>
      );

      const { result } = renderHook(() => useSelections(), { wrapper });

      act(() => {
        result.current.propagateSeriesUpdates(updatedSeries, updatedStory);
      });

      expect(mockSetSeriesList).toHaveBeenCalled();
    });

    it('should not update if seriesList is null', () => {
      vi.spyOn(useWorksListModule, 'useWorksList').mockReturnValue({
        storiesList: null,
        setStoriesList: mockSetStoriesList,
        seriesList: null,
        setSeriesList: mockSetSeriesList,
      });

      const updatedSeries: Series = {
        ...mockSeries,
        series_title: 'Updated Series',
      };

      const wrapper = ({ children }: { children: ReactNode }) => (
        <SelectionsContext.Provider
          value={{
            story: undefined,
            setStory: vi.fn(),
            deselectStory: vi.fn(),
            series: mockSeries,
            setSeries: vi.fn(),
            deselectSeries: vi.fn(),
            chapter: undefined,
            setChapter: vi.fn(),
            deselectChapter: vi.fn(),
            association: undefined,
            setAssociation: vi.fn(),
            deselectAssociation: vi.fn(),
            deselectAll: vi.fn(),
          }}
        >
          {children}
        </SelectionsContext.Provider>
      );

      const { result } = renderHook(() => useSelections(), { wrapper });

      act(() => {
        result.current.propagateSeriesUpdates(updatedSeries);
      });

      expect(mockSetSeriesList).not.toHaveBeenCalled();
    });
  });
});
