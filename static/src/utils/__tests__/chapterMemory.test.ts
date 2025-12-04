import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  saveLastChapter,
  getLastChapter,
  saveCursorPosition,
  getCursorPosition,
  clearStoryMemory,
  CursorPosition,
} from '../chapterMemory';

describe('chapterMemory', () => {
  let localStorageMock: { [key: string]: string };
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Create a mock localStorage
    localStorageMock = {};

    // Mock localStorage methods
    global.localStorage = {
      getItem: vi.fn((key: string) => localStorageMock[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        localStorageMock[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete localStorageMock[key];
      }),
      clear: vi.fn(() => {
        localStorageMock = {};
      }),
      key: vi.fn(),
      length: 0,
    };

    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    vi.clearAllMocks();
  });

  describe('saveLastChapter', () => {
    it('should save last chapter to localStorage', () => {
      saveLastChapter('story-123', 'chapter-456');

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'lastChapter_story-123',
        'chapter-456'
      );
      expect(localStorageMock['lastChapter_story-123']).toBe('chapter-456');
    });

    it('should handle localStorage errors gracefully', () => {
      vi.mocked(localStorage.setItem).mockImplementation(() => {
        throw new Error('Storage full');
      });

      saveLastChapter('story-123', 'chapter-456');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to save last chapter to localStorage:',
        expect.any(Error)
      );
    });

    it('should save multiple chapters for different stories', () => {
      saveLastChapter('story-1', 'chapter-a');
      saveLastChapter('story-2', 'chapter-b');

      expect(localStorageMock['lastChapter_story-1']).toBe('chapter-a');
      expect(localStorageMock['lastChapter_story-2']).toBe('chapter-b');
    });

    it('should overwrite existing chapter', () => {
      saveLastChapter('story-123', 'chapter-old');
      saveLastChapter('story-123', 'chapter-new');

      expect(localStorageMock['lastChapter_story-123']).toBe('chapter-new');
    });
  });

  describe('getLastChapter', () => {
    it('should retrieve last chapter from localStorage', () => {
      localStorageMock['lastChapter_story-123'] = 'chapter-456';

      const result = getLastChapter('story-123');

      expect(localStorage.getItem).toHaveBeenCalledWith('lastChapter_story-123');
      expect(result).toBe('chapter-456');
    });

    it('should return null if no chapter is saved', () => {
      const result = getLastChapter('story-999');

      expect(result).toBeNull();
    });

    it('should handle localStorage errors gracefully', () => {
      vi.mocked(localStorage.getItem).mockImplementation(() => {
        throw new Error('Storage unavailable');
      });

      const result = getLastChapter('story-123');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to read last chapter from localStorage:',
        expect.any(Error)
      );
      expect(result).toBeNull();
    });

    it('should retrieve different chapters for different stories', () => {
      localStorageMock['lastChapter_story-1'] = 'chapter-a';
      localStorageMock['lastChapter_story-2'] = 'chapter-b';

      expect(getLastChapter('story-1')).toBe('chapter-a');
      expect(getLastChapter('story-2')).toBe('chapter-b');
    });
  });

  describe('saveCursorPosition', () => {
    it('should save cursor position to localStorage', () => {
      const position: CursorPosition = {
        paragraphKeyId: 'para-123',
        offset: 42,
      };

      saveCursorPosition('story-123', 'chapter-456', position);

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'cursorPos_story-123_chapter-456',
        JSON.stringify(position)
      );
      expect(localStorageMock['cursorPos_story-123_chapter-456']).toBe(
        JSON.stringify(position)
      );
    });

    it('should handle localStorage errors gracefully', () => {
      vi.mocked(localStorage.setItem).mockImplementation(() => {
        throw new Error('Storage full');
      });

      const position: CursorPosition = {
        paragraphKeyId: 'para-123',
        offset: 42,
      };

      saveCursorPosition('story-123', 'chapter-456', position);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to save cursor position to localStorage:',
        expect.any(Error)
      );
    });

    it('should save positions for different chapters', () => {
      const pos1: CursorPosition = { paragraphKeyId: 'para-1', offset: 10 };
      const pos2: CursorPosition = { paragraphKeyId: 'para-2', offset: 20 };

      saveCursorPosition('story-1', 'chapter-1', pos1);
      saveCursorPosition('story-1', 'chapter-2', pos2);

      expect(localStorageMock['cursorPos_story-1_chapter-1']).toBe(JSON.stringify(pos1));
      expect(localStorageMock['cursorPos_story-1_chapter-2']).toBe(JSON.stringify(pos2));
    });

    it('should overwrite existing cursor position', () => {
      const oldPos: CursorPosition = { paragraphKeyId: 'para-old', offset: 5 };
      const newPos: CursorPosition = { paragraphKeyId: 'para-new', offset: 15 };

      saveCursorPosition('story-123', 'chapter-456', oldPos);
      saveCursorPosition('story-123', 'chapter-456', newPos);

      expect(localStorageMock['cursorPos_story-123_chapter-456']).toBe(
        JSON.stringify(newPos)
      );
    });
  });

  describe('getCursorPosition', () => {
    it('should retrieve cursor position from localStorage', () => {
      const position: CursorPosition = {
        paragraphKeyId: 'para-123',
        offset: 42,
      };
      localStorageMock['cursorPos_story-123_chapter-456'] = JSON.stringify(position);

      const result = getCursorPosition('story-123', 'chapter-456');

      expect(localStorage.getItem).toHaveBeenCalledWith('cursorPos_story-123_chapter-456');
      expect(result).toEqual(position);
    });

    it('should return null if no position is saved', () => {
      const result = getCursorPosition('story-999', 'chapter-999');

      expect(result).toBeNull();
    });

    it('should handle localStorage errors gracefully', () => {
      vi.mocked(localStorage.getItem).mockImplementation(() => {
        throw new Error('Storage unavailable');
      });

      const result = getCursorPosition('story-123', 'chapter-456');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to read cursor position from localStorage:',
        expect.any(Error)
      );
      expect(result).toBeNull();
    });

    it('should handle invalid JSON gracefully', () => {
      localStorageMock['cursorPos_story-123_chapter-456'] = 'invalid json {';

      const result = getCursorPosition('story-123', 'chapter-456');

      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should retrieve positions for different chapters', () => {
      const pos1: CursorPosition = { paragraphKeyId: 'para-1', offset: 10 };
      const pos2: CursorPosition = { paragraphKeyId: 'para-2', offset: 20 };

      localStorageMock['cursorPos_story-1_chapter-1'] = JSON.stringify(pos1);
      localStorageMock['cursorPos_story-1_chapter-2'] = JSON.stringify(pos2);

      expect(getCursorPosition('story-1', 'chapter-1')).toEqual(pos1);
      expect(getCursorPosition('story-1', 'chapter-2')).toEqual(pos2);
    });
  });

  describe('clearStoryMemory', () => {
    it('should clear last chapter from localStorage', () => {
      localStorageMock['lastChapter_story-123'] = 'chapter-456';

      clearStoryMemory('story-123');

      expect(localStorage.removeItem).toHaveBeenCalledWith('lastChapter_story-123');
      expect(localStorageMock['lastChapter_story-123']).toBeUndefined();
    });

    it('should handle localStorage errors gracefully', () => {
      vi.mocked(localStorage.removeItem).mockImplementation(() => {
        throw new Error('Storage unavailable');
      });

      clearStoryMemory('story-123');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to clear story memory from localStorage:',
        expect.any(Error)
      );
    });

    it('should only clear data for specific story', () => {
      localStorageMock['lastChapter_story-1'] = 'chapter-a';
      localStorageMock['lastChapter_story-2'] = 'chapter-b';
      localStorageMock['cursorPos_story-1_chapter-1'] = '{"paragraphKeyId":"para-1","offset":10}';

      clearStoryMemory('story-1');

      expect(localStorageMock['lastChapter_story-1']).toBeUndefined();
      expect(localStorageMock['lastChapter_story-2']).toBe('chapter-b');
      // Cursor positions remain (as per comment in code)
      expect(localStorageMock['cursorPos_story-1_chapter-1']).toBeDefined();
    });

    it('should not throw error if story has no saved data', () => {
      expect(() => clearStoryMemory('nonexistent-story')).not.toThrow();
    });
  });

  describe('Integration', () => {
    it('should save and retrieve last chapter', () => {
      saveLastChapter('story-123', 'chapter-456');
      const retrieved = getLastChapter('story-123');

      expect(retrieved).toBe('chapter-456');
    });

    it('should save and retrieve cursor position', () => {
      const position: CursorPosition = {
        paragraphKeyId: 'para-123',
        offset: 42,
      };

      saveCursorPosition('story-123', 'chapter-456', position);
      const retrieved = getCursorPosition('story-123', 'chapter-456');

      expect(retrieved).toEqual(position);
    });

    it('should clear last chapter but preserve cursor positions', () => {
      const position: CursorPosition = {
        paragraphKeyId: 'para-123',
        offset: 42,
      };

      saveLastChapter('story-123', 'chapter-456');
      saveCursorPosition('story-123', 'chapter-456', position);

      clearStoryMemory('story-123');

      expect(getLastChapter('story-123')).toBeNull();
      expect(getCursorPosition('story-123', 'chapter-456')).toEqual(position);
    });
  });
});
